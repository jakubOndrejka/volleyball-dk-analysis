import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {readPdf, parseRoster, parseScorecard, checkSanctions} from '../lib/pdf-parser.js';
import {validateMatch} from '../analysis-engine.js';

const read = name => fs.readFile(new URL(`fixtures/${name}`, import.meta.url));
const fixture = {matchId:'76143', matchNumber:'148905', leagueId:4125,
  home:'Rosenlund Volley', away:'DTU Volley', date:'2026-10-01', score:'1-3', bestOf:5};
const pdf = await read('76143-scorecard.pdf');
const items = await readPdf(pdf);
const coach = items.find(i => i.s === 'C' && i.x < 18 && i.y < 175 && i.y > 20);

test('coach warning at 16:16: all 196 rallies match independent public history', async () => {
  assert.ok(coach);
  const roster = await parseRoster(await read('76143-roster.pdf'), fixture);
  const match = await parseScorecard(pdf, fixture, roster);
  assert.deepEqual(match.sets.map(s => s.score), [[28,26],[22,25],[22,25],[23,25]]);
  const history = JSON.parse(await read('76143-history.json'));
  for (const set of match.sets)
    assert.equal(set.rallies.map(r => r.winner === 'home' ? 'H' : 'A').join(''), history.winners[set.number]);
  assert.equal(validateMatch(match), true);
});

test('penalty, expulsion and disqualification entries still require review', () => {
  for (const x of [24, 37, 51]) {
    const changed = items.map(i => i === coach ? {...i, x} : i);
    assert.throws(() => checkSanctions(changed), /Sanctions entered/);
  }
});

test('incomplete warning rows and an additional penalty are not ignored', () => {
  assert.throws(() => checkSanctions(items.filter(i => i !== coach)), /Sanctions entered/);
  const penaltyRow = items.filter(i => Math.abs(i.y - coach.y) < 1 && i.x < 135)
    .map(i => ({...i, y:i.y - 10, x:i === coach ? 24 : i.x}));
  assert.throws(() => checkSanctions([...items, ...penaltyRow]), /Sanctions entered/);
});

test('empty sanctions table and player warnings are accepted', () => {
  assert.doesNotThrow(() => checkSanctions(items.filter(i => i.y > 175 || i.x >= 135)));
  assert.doesNotThrow(() => checkSanctions(items.map(i => i === coach ? {...i, s:'7'} : i)));
});
