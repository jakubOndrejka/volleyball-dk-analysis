import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { JSDOM } from 'jsdom';
import { refreshLiberoHistory } from '../lib/libero-refresh.js';
import { addLiberoTracking } from '../lib/libero-events.js';
import { extraAnalysis, renderExtras } from '../analysis-extras.js';
import { analyseTeam } from '../analysis-engine.js';
const fixture = name => fs.readFile(new URL(`fixtures/${name}`, import.meta.url), 'utf8');
const raw = JSON.parse(await fixture('76192-match.json'));
const html = await fixture('76192-events.html');
const now = new Date('2026-10-07T08:30:00Z');
const quiet = () => {};
async function setup(t, count = 1, enriched = false) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'libero-refresh-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  await fs.mkdir(path.join(dir, 'matches'));
  const entries = [];
  for (let i = 0; i < count; i++) {
    const match = structuredClone(raw); match.id = String(88000 + i);
    if (enriched) addLiberoTracking(match, html);
    await fs.writeFile(path.join(dir, 'matches', `${match.id}.json`), JSON.stringify(match));
    entries.push({ id: match.id, status: 'ready', parserVersion: 4,
      date: match.date, matchUrl: `https://resultater.volleyball.dk/match?id=${match.id}`,
      nextCheckAt: '2099-01-01T00:00:00Z' });
  }
  return { dir, entries, options: { analysisDir: dir, now, log: quiet } };
}

test('libero migration processes more than 16 old matches despite future PDF retry dates and current parser tags', async t => {
  const { dir, entries, options } = await setup(t, 32);
  let calls = 0, active = 0, peak = 0;
  const result = await refreshLiberoHistory(entries, { ...options, getHistory: async () => {
    calls++; active++; peak = Math.max(peak, active);
    await new Promise(resolve => setTimeout(resolve, 1)); active--; return html;
  } });
  assert.equal(result.updated, 32); assert.equal(result.failed, 0); assert.equal(calls, 32);
  assert.ok(peak > 1 && peak <= 3);
  for (const entry of entries) {
    assert.equal(entry.nextCheckAt, '2099-01-01T00:00:00Z');
    assert.equal(entry.parserVersion, 4);
    const m = JSON.parse(await fs.readFile(path.join(dir, 'matches', `${entry.id}.json`)));
    assert.equal(m.liberoTracking.knownRallies.home, 116);
    assert.equal(m.sets.flatMap(s => s.rallies).length, 116);
  }
});

test('completed histories are skipped; bounded batches continue where they left off', async t => {
  const { entries, options } = await setup(t, 5);
  const calls = [];
  const getHistory = async entry => { calls.push(entry.id); return html; };
  let r = await refreshLiberoHistory(entries, { ...options, maxMatches: 2, getHistory });
  assert.equal(r.updated, 2); assert.equal(r.remaining, 3);
  r = await refreshLiberoHistory(entries, { ...options, getHistory });
  assert.equal(r.updated, 3); assert.equal(r.remaining, 0);
  r = await refreshLiberoHistory(entries, { ...options, getHistory });
  assert.equal(r.updated, 0); assert.equal(calls.length, 5);
});

test('failed HTML fetch preserves the saved match and retries independently of the PDF schedule', async t => {
  const { dir, entries, options } = await setup(t);
  const file = path.join(dir, 'matches', '88000.json'), before = await fs.readFile(file, 'utf8');
  const failed = await refreshLiberoHistory(entries, { ...options, getHistory: async () => { throw new Error('HTTP 503'); } });
  assert.equal(failed.failed, 1); assert.equal(entries[0].status, 'ready');
  assert.equal(await fs.readFile(file, 'utf8'), before);
  assert.equal(entries[0].liberoNextCheckAt, '2026-10-07T14:30:00.000Z');
  const waiting = await refreshLiberoHistory(entries, { ...options, getHistory: async () => assert.fail('too early') });
  assert.equal(waiting.checked, 0);
  const recovered = await refreshLiberoHistory(entries, { ...options, now: new Date('2026-10-07T14:31:00Z'), getHistory: async () => html });
  assert.equal(recovered.updated, 1); assert.equal(entries[0].liberoRefreshWarning, undefined);
  assert.equal(entries[0].liberoNextCheckAt, null);
});

test('incomplete source logs are processed unknown, then retried; cached HTML avoids duplicate downloads', async t => {
  const { dir, entries, options } = await setup(t);
  await refreshLiberoHistory(entries, { ...options, getHistory: async () => '' });
  let m = JSON.parse(await fs.readFile(path.join(dir, 'matches', '88000.json')));
  let x = extraAnalysis([m], 'KSV.3', {});
  assert.equal(x.liberoCoverage[0].pending, 0); assert.equal(x.liberoCoverage[0].unknown, 116);
  assert.equal(entries[0].liberoNextCheckAt, '2026-10-07T14:30:00.000Z');
  await refreshLiberoHistory(entries, { ...options, now: new Date('2026-10-07T14:31:00Z'),
    htmlByMatch: new Map([['88000', html]]), getHistory: async () => assert.fail('cache was supplied') });
  m = JSON.parse(await fs.readFile(path.join(dir, 'matches', '88000.json')));
  assert.equal(m.liberoTracking.knownRallies.home, 116);
});

test('the reported KSV and DTU missing matches recover coverage without changing serving statistics', async () => {
  const oldKsv = JSON.parse(await fixture('76141-match.json'));
  const oldDtu = JSON.parse(await fixture('76143-match.json'));
  const before = extraAnalysis([oldKsv, raw], 'KSV.3', {});
  assert.equal(before.coverage.unknown, 291);
  assert.equal(before.liberoCoverage.reduce((n,m) => n + m.pending, 0), 291);
  const ksv = addLiberoTracking(structuredClone(oldKsv), await fixture('76141-events.html'));
  const dtu = addLiberoTracking(structuredClone(oldDtu), await fixture('76143-events.html'));
  const ksvNew = addLiberoTracking(structuredClone(raw), html);
  assert.deepEqual(extraAnalysis([ksv, ksvNew], 'KSV.3', {}).coverage, { total:291, active:221, none:66, unknown:4 });
  assert.deepEqual(extraAnalysis([dtu], 'DTU Volley', {}).coverage, { total:196, active:159, none:37, unknown:0 });
  assert.deepEqual(analyseTeam([oldKsv], 'KSV.3').serving, analyseTeam([ksv], 'KSV.3').serving);
  assert.deepEqual(analyseTeam([oldDtu], 'DTU Volley').serving, analyseTeam([dtu], 'DTU Volley').serving);
  const audit = extraAnalysis([ksv, ksvNew], 'KSV.3', {}).liberoCoverage;
  assert.equal(audit.reduce((n,m)=>n+m.pending,0), 0);
  assert.equal(audit.find(m=>m.matchId==='76141').unknown, 4);
});

test('the interface explains pending data and separates it from actual unknown events', () => {
  const dom = new JSDOM('<div id="target"></div>'); globalThis.document = dom.window.document;
  const target = document.querySelector('#target');
  const table = (rows, columns, label) => `<table aria-label="${label}"><tbody>${rows.map(r=>'<tr>'+columns.map(([k])=>`<td>${r[k]??''}</td>`).join('')+'</tr>').join('')}</tbody></table>`;
  const render = matches => { target.innerHTML='';renderExtras({target, matches, team:'KSV.3',config:{},table,rotationColumns:[['rotation','Rotation'],['rallies','Rallies']],csv:()=>'',download:()=>{},liberoFilter:'active',setLiberoFilter:()=>{}}); };
  render([raw]);
  assert.match(target.querySelector('#a-libero-pending').textContent, /1 match \(116 rallies\)/);
  assert.match(target.querySelector('#a-libero-section').textContent, /not mean the team played without a libero/);
  assert.equal(target.querySelector('table[aria-label="Rotation outcomes by libero"]'),null);
  assert.equal(target.querySelector('#a-libero-csv').disabled,true);
  render([addLiberoTracking(structuredClone(raw),'')]);
  assert.equal(target.querySelector('#a-libero-pending'),null);
  assert.match(target.querySelector('#a-libero-section').textContent,/116 unknown in source/);
  render([addLiberoTracking(structuredClone(raw),html)]);
  assert.equal(target.querySelector('#a-libero-pending'),null);
  assert.equal(target.querySelector('#a-libero-csv').disabled,false);
  assert.match(target.querySelector('#a-libero-section').textContent,/90 with a libero · 26 without · 0 unknown in source/);
  dom.window.close();
});
