import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { parseRoster, parseScorecard, readPdf, checkSignatureContinuation, PARSER_VERSION } from '../lib/pdf-parser.js';
import { validateMatch, analyseTeam } from '../analysis-engine.js';
const read = name => fs.readFile(new URL(`fixtures/${name}`, import.meta.url));
const cases = JSON.parse(await read('multipage-history.json'));
const expected = {
  '76149': [[21,25],[25,15],[14,25],[20,25]],
  '76146': [[25,20],[10,25],[25,22],[25,15]],
  '77391': [[15,25],[19,25],[21,25]],
};

for (const {fixture, winners} of cases) {
  test(`two-page match ${fixture.matchId}: every rally agrees with the independent public event log`, async () => {
    const bytes = await read(`${fixture.matchId}-scorecard.pdf`);
    const doc = await getDocument({data:new Uint8Array(bytes),useSystemFonts:true,isEvalSupported:false}).promise;
    assert.equal(doc.numPages,2); await doc.destroy();
    const roster = await parseRoster(await read(`${fixture.matchId}-roster.pdf`),fixture);
    const match = await parseScorecard(bytes,fixture,roster);
    assert.equal(match.parserVersion,PARSER_VERSION);
    assert.deepEqual(match.sets.map(s=>s.score),expected[fixture.matchId]);
    for (const set of match.sets) assert.equal(set.rallies.map(r=>r.winner==='home'?'H':'A').join(''),winners[set.number]);
    assert.equal(validateMatch(match),true);
    const home = analyseTeam([match],fixture.home), away = analyseTeam([match],fixture.away);
    const rallies = Object.values(winners).reduce((n,s)=>n+s.length,0);
    assert.equal(home.total.rallies,rallies); assert.equal(away.total.rallies,rallies);
    assert.equal(home.total.serves+away.total.serves,rallies);
    for (const report of [home,away]) for (const player of report.serving)
      assert.equal(player.serves,player.serveWins+player.servingTurns-player.setEndingTurns);
  });
}

test('signature continuation support is explicit and does not merge page coordinates',async()=>{
  const bytes=await read('76149-scorecard.pdf');
  await assert.rejects(readPdf(bytes),/multi-page/);
  await assert.rejects(parseRoster(bytes,cases[0].fixture),/multi-page/);
  const first=await readPdf(bytes,{allowSignatureContinuation:true});
  assert.ok(first.some(i=>i.s.startsWith('Match no.')));
  assert.ok(first.some(i=>i.s==='RESULT'));
  // This label is only on page two in this fixture.
  assert.ok(!first.some(i=>i.s==='Judges'));
});

test('extra scores, sanctions, substitutions, remarks, unknown text and image pages are not discarded',()=>{
  const footer=[
    {s:'11-10-2026 kl. 13.59.48 - A',x:172.63,y:571.82,w:84.826,h:7},
    {s:'Team',x:270.39,y:571.82,w:17.892,h:7},
    {s:'B - 11-10-2026 kl. 13.59.31',x:301.21,y:571.82,w:84.826,h:7},
    {s:'11-10-2026 kl. 9.01.39',x:593.33,y:581.11,w:73.934,h:7},
  ];
  assert.doesNotThrow(()=>checkSignatureContinuation(footer));
  for(const s of ['RESULT','Service Rounds','25','14:11','P','REMARKS','Player name'])
    assert.throws(()=>checkSignatureContinuation([...footer,{s,x:180,y:560,w:60,h:7}]),/second scoresheet page/);
  assert.throws(()=>checkSignatureContinuation(footer,true),/second scoresheet page/);
  assert.throws(()=>checkSignatureContinuation([]),/second scoresheet page/);
  assert.throws(()=>checkSignatureContinuation(footer.map(i=>({...i,y:400}))),/second scoresheet page/);
  assert.throws(()=>checkSignatureContinuation(footer.map(i=>({...i,x:20}))),/second scoresheet page/);
});

test('allowing a signature page does not bypass fixture or result validation',async()=>{
  const fixture=cases[0].fixture, bytes=await read('76149-scorecard.pdf');
  const roster=await parseRoster(await read('76149-roster.pdf'),fixture);
  await assert.rejects(parseScorecard(bytes,{...fixture,matchNumber:'999999'},roster),/match number/);
  await assert.rejects(parseScorecard(bytes,{...fixture,away:'Wrong team'},roster),/headers/);
  await assert.rejects(parseScorecard(bytes,{...fixture,score:'3-1'},roster),/set result/);
});
