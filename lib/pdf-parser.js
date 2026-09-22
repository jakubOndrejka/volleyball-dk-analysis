import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { createHash } from 'node:crypto';

export const PARSER_VERSION = 1;
const sides = ['home', 'away'];
const other = side => side === 'home' ? 'away' : 'home';
const eq = (a, b) => Math.abs(a - b) < 1.6;
const fail = message => { throw new Error(message); };
const number = s => /^\d{1,2}$/.test(s);

export async function readPdf(bytes) {
  if (Buffer.from(bytes).subarray(0, 5).toString() !== '%PDF-') fail('The published file is not a PDF.');
  const doc = await getDocument({ data: new Uint8Array(bytes), useSystemFonts: true, isEvalSupported: false }).promise;
  try {
    if (doc.numPages !== 1) fail('Unsupported multi-page scoresheet: review required.');
    const page = await doc.getPage(1);
    if (Math.abs(page.view[2] - 842) > 3 || Math.abs(page.view[3] - 595) > 3) fail('Unsupported scoresheet page size.');
    return (await page.getTextContent()).items.filter(i => i.str?.trim()).map(i => ({
      s: i.str.trim(), x: i.transform[4], y: i.transform[5], w: i.width, h: i.height,
    }));
  } finally { await doc.destroy(); }
}

function teamAt(items, y, minX, maxX, fixture) {
  const names = items.filter(i => eq(i.y, y) && i.x >= minX && i.x < maxX).map(i => i.s);
  const found = sides.filter(s => names.includes(fixture[s]));
  if (found.length !== 1) fail('PDF team headers do not match the fixture.');
  return found[0];
}

export async function parseRoster(bytes, fixture) {
  const items = await readPdf(bytes);
  const headers = items.filter(i => i.s === 'Name of the Player').sort((a, b) => a.x - b.x);
  if (headers.length !== 2) fail('Unsupported roster PDF layout.');
  const roster = { home: [], away: [] };
  for (const header of headers) {
    const side = teamAt(items, header.y + 17.2, header.x - 55, header.x + 280, fixture);
    const rows = items.filter(i => Math.abs(i.x - header.x) < 2 && i.y < header.y && i.y > header.y - 255);
    for (const name of rows) {
      const row = items.filter(i => eq(i.y, name.y));
      const shirt = row.find(i => i.x > header.x - 47 && i.x < header.x - 25 && number(i.s));
      const card = row.find(i => i.x > header.x + 230 && i.x < header.x + 280 && /^\d+$/.test(i.s));
      if (!shirt || !card || +shirt.s < 1) continue;
      roster[side].push({ number: shirt.s, name: name.s,
        id: createHash('sha256').update(`volleyball-dk:${card.s}`).digest('hex').slice(0, 20),
        libero: row.some(i => i.s === 'L' && i.x > header.x - 22 && i.x < header.x),
      });
    }
    if (roster[side].length < 6 || new Set(roster[side].map(p => p.number)).size !== roster[side].length) fail('Incomplete or duplicate roster.');
  }
  return roster;
}

function parseBlock(items, anchor, fixture, repeatedSide = null) {
  const romans = ['I', 'II', 'III', 'IV', 'V', 'VI'];
  const labels = items.filter(i => eq(i.y, anchor.y) && i.x >= anchor.x - 1 && i.x < anchor.x + 120 && romans.includes(i.s)).sort((a,b) => a.x-b.x).slice(0,6);
  if (labels.map(i => i.s).join() !== romans.join()) fail('Unrecognised service-order grid.');
  const cx = labels.map(i => i.x + i.w / 2);
  const half = (cx[1] - cx[0]) / 2;
  const side = repeatedSide || teamAt(items, anchor.y + 12.5, cx[0] - half, cx[5] + 45, fixture);
  const columns = cx.map(x => items.filter(i => i.x + i.w / 2 > x-half && i.x + i.w / 2 < x+half));
  const lineup = columns.map(col => {
    const values = col.filter(i => i.y < anchor.y-6 && i.y > anchor.y-14 && number(i.s));
    if (values.length !== 1) fail('A starting player is missing or unreadable.');
    return values[0].s;
  });
  if (new Set(lineup).size !== 6) fail('Duplicate starting player.');
  const entries = [];
  const substitutions = [];
  let receiving = false;
  columns.forEach((col, slot) => {
    const area = col.filter(i => i.y < anchor.y-16 && i.y > anchor.y-43 && i.s !== 'x');
    if (area.length) {
      const incoming = area.filter(i => number(i.s));
      const scores = area.filter(i => /^\d+:\d+$/.test(i.s)).sort((a,b) => b.y-a.y);
      if (incoming.length !== 1 || scores.length < 1 || scores.length > 2 || area.length !== incoming.length+scores.length) fail('Unsupported substitution entry.');
      scores.forEach((score, n) => {
        const pair = score.s.split(':').map(Number);
        substitutions.push({ side, slot, player: n ? lineup[slot] : incoming[0].s, score: side === 'home' ? pair : pair.toReversed() });
      });
    }
    const areaTurns = col.filter(i => i.y < anchor.y-43 && i.y > anchor.y-84);
    for (const entry of areaTurns) {
      if (entry.s === 'x') continue;
      const round = Math.round((anchor.y - entry.y - 49) / 9.5);
      if (round < 0 || round > 3) fail('Unrecognised service-round row.');
      if (entry.s === 'X') {
        if (round !== 0 || slot !== 0) fail('Unexpected receiving marker.');
        receiving = true;
      } else if (number(entry.s)) entries.push({ slot, round, end: +entry.s });
      else fail('Unrecognised service-round value.');
    }
  });
  entries.sort((a,b) => a.round-b.round || a.slot-b.slot);
  return { side, lineup, entries, substitutions, receiving };
}

/** Reconstruct each scored rally from alternating cumulative service endpoints.
 * A side-out point belongs to the preceding server's lost rally, not their successor.
 * The last serve of a set is not followed by an invented loss.
 */
export function reconstructSet(blocks, finalScore, setNumber) {
  const bySide = Object.fromEntries(blocks.map(b => [b.side, b]));
  if (!bySide.home || !bySide.away || blocks.filter(b => b.receiving).length !== 1) fail('Cannot confirm who served first.');
  const slots = { home: [...bySide.home.lineup], away: [...bySide.away.lineup] };
  const cursor = { home: 0, away: 0 };
  const position = { home: 0, away: 0 }; // slot currently in position 1
  let serving = blocks.find(b => !b.receiving).side;
  const score = [0, 0], rallies = [], applied = new Set();
  const subs = blocks.flatMap(b => b.substitutions);
  const scoreEqual = (a,b) => a[0] === b[0] && a[1] === b[1];
  const applySubs = () => {
    subs.forEach((sub, i) => {
      if (!applied.has(i) && scoreEqual(sub.score, score)) {
        slots[sub.side][sub.slot] = sub.player;
        if (new Set(slots[sub.side]).size !== 6) fail('Substitution creates a duplicate player.');
        applied.add(i);
      }
    });
  };
  const point = winner => {
    applySubs();
    const lineups = Object.fromEntries(sides.map(side => [side, Array.from({length:6}, (_,i) => slots[side][(position[side]+i)%6])]));
    rallies.push({ serving, server: lineups[serving][0], winner, lineups });
    score[sides.indexOf(winner)]++;
    if (score.some((n,i) => n > finalScore[i])) fail('Service endpoints exceed the final score.');
  };
  let finished = false;
  for (let guard=0; guard<200 && !finished; guard++) {
    const block = bySide[serving];
    const entry = block.entries[cursor[serving]++];
    if (!entry || entry.slot !== position[serving]) fail('Missing or out-of-order service endpoint.');
    const index = sides.indexOf(serving);
    if (entry.end < score[index]) fail('Service endpoint moves backwards.');
    while (score[index] < entry.end) {
      point(serving);
      if (scoreEqual(score,finalScore)) { finished = true; break; }
    }
    if (finished) break;
    point(other(serving));
    if (scoreEqual(score,finalScore)) { finished = true; break; }
    serving = other(serving);
    position[serving] = (position[serving]+1)%6;
  }
  if (!finished || !scoreEqual(score,finalScore)) fail('Reconstructed score does not match the PDF result.');
  applySubs();
  if (applied.size !== subs.length) fail('A substitution score does not occur in the reconstructed match.');
  for (const side of sides) {
    const remaining = bySide[side].entries.slice(cursor[side]);
    // Some electronic sheets circle the winning receiving team's final score in
    // its next box although it never served. This is only a final-score marker.
    if (remaining.length && !(remaining.length === 1 && remaining[0].end === finalScore[sides.indexOf(side)] && rallies.at(-1).winner === side && rallies.at(-1).serving !== side)) fail('Unused service endpoints remain.');
  }
  return { number: setNumber, score: finalScore, startingLineups: {home: bySide.home.lineup, away: bySide.away.lineup}, substitutions: subs, rallies };
}

export async function parseScorecard(bytes, fixture, rosters) {
  const items = await readPdf(bytes);
  if (!items.some(i => i.s === 'Service Rounds') || !items.some(i => i.s === 'RESULT')) fail('Scanned or unsupported PDF: a text-based electronic scoresheet is required.');
  const matchLabel = items.find(i => /^Match no\./.test(i.s));
  if (fixture.matchNumber && matchLabel?.s.replace(/\D/g,'') !== String(fixture.matchNumber)) fail('PDF match number differs from the results page.');
  // Penalty points cannot be safely attributed to a serve using this grid alone.
  if (items.some(i => i.x < 135 && i.y < 175 && i.y > 20 && /^\d/.test(i.s))) fail('Sanctions entered on scoresheet: review required before attributing points to serves.');
  const anchors = items.filter(i => i.s === 'I' && i.y > 250).sort((a,b) => Math.abs(a.y-b.y)>2 ? b.y-a.y : a.x-b.x);
  if (anchors.length !== 11) fail('Unsupported service grid layout.');
  const result = items.find(i => i.s === 'RESULT');
  const scores = [];
  const setCount = (fixture.score || '').split('-').map(Number).reduce((a,b)=>a+b,0);
  if (setCount < 2 || setCount > 5) fail('Unsupported match result.');
  for (let set=1;set<=setCount;set++) {
    const y = result.y-28.5-(set-1)*8.17;
    const cells = items.filter(i => eq(i.y,y)).sort((a,b)=>a.x-b.x);
    const left = cells.find(i => i.x > 456 && i.x < 466 && number(i.s));
    const right = cells.find(i => i.x > 513 && i.x < 524 && number(i.s));
    if (!left || !right) fail('Cannot read set scores from the result box.');
    scores.push([+left.s,+right.s]);
  }
  const sets = [];
  for (let n=0;n<scores.length;n++) {
    const final = scores[n];
    if (final[0] === 0 && final[1] === 0) continue;
    if (sets.length !== n) fail('Missing set before a played set.');
    const target = n === (fixture.bestOf || 5)-1 ? 15 : 25;
    if (Math.max(...final)<target || Math.abs(final[0]-final[1])<2 || (Math.max(...final)>target && Math.abs(final[0]-final[1])!==2)) fail('Incomplete or unsupported set score.');
    const pair = anchors.slice(n*2,n*2+2).map(a => parseBlock(items,a,fixture));
    if (n===4) {
      const repeat = parseBlock(items,anchors[10],fixture,pair[0].side);
      // The change-of-court block repeats earlier service rounds. Merge by
      // grid slot, accepting only identical duplicates and increasing endpoints.
      for (const e of repeat.entries) {
        const old = pair[0].entries.find(t=>t.round===e.round && t.slot===e.slot);
        if (old && old.end !== e.end) fail('Conflicting duplicate endpoint in fifth-set change block.');
        else if (old) continue;
        else pair[0].entries.push(e);
      }
      pair[0].entries.sort((a,b)=>a.round-b.round||a.slot-b.slot);
      for (const sub of repeat.substitutions) if (!pair[0].substitutions.some(x=>JSON.stringify(x)===JSON.stringify(sub))) pair[0].substitutions.push(sub);
    }
    const parsed = reconstructSet(pair, final, n+1);
    for (const side of sides) for (const r of parsed.rallies) {
      if (r.lineups[side].some(number => !rosters[side].some(p => p.number===number && !p.libero))) fail('A lineup player is absent from the roster or marked as libero.');
    }
    sets.push(parsed);
  }
  const won = sides.map((_,i)=>sets.filter(s=>s.score[i]>s.score[1-i]).length);
  if (!fixture.score || won.join('-') !== fixture.score) fail('PDF set result differs from the published match result.');
  return { schemaVersion: 1, parserVersion: PARSER_VERSION, id: String(fixture.matchId), leagueId: fixture.leagueId, home: fixture.home, away: fixture.away, date: fixture.date, score: fixture.score, rosters, sets,
    warnings: ['Positions follow the six rotation slots. Libero replacements are not recorded in this PDF; a player marked as libero cannot be selected as setter.'] };
}
