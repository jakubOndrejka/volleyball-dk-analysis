import * as cheerio from 'cheerio';

export const LIBERO_TRACKING_VERSION = 1;
export function historyEvents(html) {
  const $ = cheerio.load(html);
  return $('table.srMatchInformation tr').toArray().reverse().map(row => ({
    text: $(row).find('.c02').text().trim().replace(/\s+/g, ' '),
    score: $(row).find('.c01').text().trim().match(/^(\d+)\s*-\s*(\d+)$/)?.slice(1).map(Number),
  })).filter(e => e.text);
}

// Exchanges are applied between rallies, preserving the official event order.
// Missing or contradictory history leaves court presence unknown, never guessed.
export function addLiberoTracking(match, html) {
  const events = historyEvents(html), bySet = new Map();
  let current;
  for (const event of events) {
    const start = event.text.match(/^(\d+)\. sæt startet/);
    if (start) { current = +start[1]; bySet.set(current, []); }
    else if (current) bySet.get(current).push(event);
  }
  const sides = ['home','away'], known = {home:0, away:0}, warnings = [];
  const normalize = s => s.replace(/\s+/g, ' ').trim();
  let total = 0;
  for (const set of match.sets) {
    const log = bySet.get(set.number) || [], points = log.filter(e => e.text.startsWith('Point til '));
    let score = [0,0];
    const complete = points.length === set.rallies.length && points.every((e,i) => {
      const r = set.rallies[i]; score[r.winner === 'home' ? 0 : 1]++;
      return e.text.slice(10) === normalize(match[r.winner]) && JSON.stringify(e.score) === JSON.stringify(score);
    });
    const state = Object.fromEntries(sides.map(side => [side,
      match.rosters[side].some(p => p.libero) ? {status:'unknown'} : {status:'none'}]));
    let cursor = 0;
    score = [0,0];
    if (!complete) warnings.push(`Set ${set.number}: complete matching point history is unavailable.`);
    for (const rally of set.rallies) {
      total++;
      if (complete) {
        while (cursor < log.length && !log[cursor].text.startsWith('Point til ')) {
          const event = log[cursor++], marker = ' skifter libero ';
          const split = event.text.indexOf(marker);
          if (split < 0) continue;
          const side = sides.find(s => normalize(match[s]) === event.text.slice(0,split));
          if (!side) { sides.forEach(s => state[s] = {status:'unknown'}); continue; }
          const exchange = event.text.slice(split + marker.length).match(/^.+\((\d+)\) (ind|ud) istedet for .+\((\d+)\)$/);
          if (!exchange || JSON.stringify(event.score) !== JSON.stringify(score) ||
              !match.rosters[side].some(p => p.number === exchange[1] && p.libero) ||
              !match.rosters[side].some(p => p.number === exchange[3] && !p.libero)) {
            state[side] = {status:'unknown'}; continue;
          }
          const prior = state[side];
          if (exchange[2] === 'ud' && prior.status === 'active' &&
              (prior.number !== exchange[1] || prior.replaces !== exchange[3])) {
            state[side] = {status:'unknown'}; continue;
          }
          state[side] = exchange[2] === 'ind'
            ? {status:'active', number:exchange[1], replaces:exchange[3]}
            : {status:'none'};
        }
        cursor++; // the point ending this rally
      }
      rally.libero = {};
      rally.onCourt = {};
      for (const side of sides) {
        const lineup = rally.lineups?.[side];
        let presence = state[side];
        if (presence.status === 'active') {
          const position = lineup?.indexOf(presence.replaces);
          if (![0,4,5].includes(position) || (rally.serving === side && position === 0)) {
            presence = state[side] = {status:'unknown'};
          }
        }
        rally.libero[side] = {...presence};
        rally.onCourt[side] = presence.status === 'unknown' || !lineup ? null
          : lineup.map(n => presence.status === 'active' && n === presence.replaces ? presence.number : n);
        if (rally.onCourt[side]) known[side]++;
      }
      score[rally.winner === 'home' ? 0 : 1]++;
    }
  }
  match.liberoTracking = {version:LIBERO_TRACKING_VERSION, totalRallies:total, knownRallies:known, warnings};
  return match;
}
