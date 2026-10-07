import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {analyseTeam, resolveSelection, validateConfig, matchHistory} from '../analysis-engine.js';
import {extraAnalysis} from '../analysis-extras.js';
import {addLiberoTracking, historyEvents} from '../lib/libero-events.js';
import {backend, saveRequest} from './helpers/apps-script-harness.js';
import {SharedCoaches} from '../shared-coaches.js';
const fixture = file => fs.readFileSync(new URL(`fixtures/${file}`,import.meta.url),'utf8');
const raw = JSON.parse(fixture('76192-match.json'));
const html = fixture('76192-events.html');
const match = addLiberoTracking(structuredClone(raw),html);
const team='KSV.3', side=match.home===team?'home':'away';
const roster=match.rosters[side], setter=roster.find(p=>p.number==='5');
const config=records=>({version:1,teams:{[`${match.leagueId}:${team}`]:{matches:records}}});
const season={playerIds:true,setters:[setter.id],fallbacks:[],system:'single',roleOrder:'outside-next'};
const choice=config({season});
const sum=(xs,key)=>xs.reduce((n,x)=>n+x[key],0);

test('season choices follow roster IDs through number changes; match and set overrides have precedence',()=>{
  const copy=structuredClone(match);copy.id='99999';copy.rosters[side].find(p=>p.id===setter.id).number='42';
  assert.deepEqual(resolveSelection(copy,team,choice,1).setters,['42']);
  const choices=config({season,[match.id]:{setters:['6'],sets:{2:{setters:[]}}}});
  assert.deepEqual(resolveSelection(match,team,choices,1).setters,['6']);
  assert.deepEqual(resolveSelection(match,team,choices,2).setters,[]);
  choices.teams[`${match.leagueId}:${team}`].matches[match.id].inheritSeason=true;
  assert.deepEqual(resolveSelection(match,team,choices,1).setters,['5']);
  assert.deepEqual(resolveSelection(match,team,choices,2).setters,[]);
  const nextSeason=structuredClone(copy); nextSeason.leagueId='999999';
  assert.deepEqual(resolveSelection(nextSeason,team,choice,1).setters,[]);
  assert.equal(validateConfig(choice).teams[`${match.leagueId}:${team}`].matches.season.playerIds,true);
  assert.throws(()=>validateConfig(config({season:{setters:['5']}})),/Season/);
  assert.throws(()=>validateConfig(config({season:{...season,playerIds:'yes'}})),/mode/);
});

test('libero tracking agrees with every official point and preserves the original serve statistics',()=>{
  assert.equal(match.liberoTracking.totalRallies,116);
  assert.deepEqual(match.liberoTracking.knownRallies,{home:116,away:116});
  assert.deepEqual(match.liberoTracking.warnings,[]);
  assert.deepEqual(analyseTeam([raw],team).serving,analyseTeam([match],team).serving);
  const x=extraAnalysis([match],team,choice);
  assert.deepEqual(x.coverage,{total:116,active:90,none:26,unknown:0});
  const lib15=x.players.find(p=>p.number==='15'),lib16=x.players.find(p=>p.number==='16');
  assert.equal(lib15.courtRallies,19);assert.equal(lib15.sets,1);
  assert.equal(lib16.courtRallies,71);assert.equal(lib16.sets,2);
  assert.equal(sum(x.players,'courtRallies'),116*6);
  for(const set of match.sets)for(const rally of set.rallies)for(const s of ['home','away']) {
    assert.equal(new Set(rally.onCourt[s]).size,6);
    const lib=rally.libero[s];
    if(lib.status==='active') {assert.ok(rally.onCourt[s].includes(lib.number));assert.ok(!rally.onCourt[s].includes(lib.replaces));}
  }
});

test('libero-filtered rotation counts partition team totals with no overlap; history keeps its filter',()=>{
  const all=analyseTeam([match],team,choice);
  const groups=['active','none','unknown'].map(liberoId=>analyseTeam([match],team,choice,null,{liberoId}));
  for(const key of ['rallies','serves','received','sideOuts','serveWins']) {
    assert.equal(sum(groups.map(r=>r.total),key),all.total[key]);
    const individuals=roster.filter(p=>p.libero).map(p=>analyseTeam([match],team,choice,null,{liberoId:p.id}).total);
    assert.equal(sum(individuals,key),groups[0].total[key]);
  }
  const id=roster.find(p=>p.number==='15').id;
  const filtered=analyseTeam([match],team,choice,null,{liberoId:id});
  const rows=filtered.rotation.flatMap(r=>matchHistory([match],team,choice,{rotation:r.rotation,liberoId:id}));
  assert.equal(sum(rows,'rallies'),19);
  assert.equal(analyseTeam([match],team,{},null,{liberoId:id}).rotation.at(-1).rallies,19);
});

test('exchanges are applied before the next point, in displayed chronological order',()=>{
  const log=historyEvents(html), starts=log.filter(e=>/^\d+\. sæt startet/.test(e.text));
  assert.equal(starts.length,3);
  const e=log.find(e=>e.text.startsWith('KSV.3 skifter libero') && e.text.includes(' ind '));
  assert.deepEqual(e.score,[0,0]);
  const first=match.sets[0].rallies[0];
  assert.equal(first.libero[side].status,'active');
  assert.equal(first.libero[side].number,'15');
  assert.equal(match.sets[0].rallies[1].libero[side].status,'none'); // exit at 1–0
  assert.equal(match.sets[0].rallies[2].libero[side].status,'none');
  assert.equal(match.sets[0].rallies[3].libero[side].replaces,'11'); // enter at 2–1
  for(const set of match.sets)for(let i=1;i<set.rallies.length;i++) {
    const now=set.rallies[i],before=set.rallies[i-1];
    if(before.libero[side].status==='active'&&now.libero[side].status==='none') assert.ok(now.onCourt[side].includes(before.libero[side].replaces));
  }
});

test('absent or mismatched event history never invents libero court time',()=>{
  const absent=addLiberoTracking(structuredClone(raw),'');
  const x=extraAnalysis([absent],team,choice);
  assert.equal(x.coverage.unknown,116);
  assert.equal(sum(x.players,'courtRallies'),0);
  assert.equal(x.players.find(p=>p.number==='16').uncertainRallies,116);
  // Corrupt one point in set 1; only that set loses confidence.
  const bad=html.replace('Point til KSV.3','Point til Wrong Team');
  const broken=addLiberoTracking(structuredClone(raw),bad);
  assert.equal(broken.liberoTracking.warnings.length,1);
  assert.ok(broken.liberoTracking.knownRallies[side]<116);
  assert.ok(broken.liberoTracking.knownRallies[side]>0);
  const untracked=extraAnalysis([raw],team,choice);
  assert.equal(untracked.coverage.unknown,116);
});

test('set starts use the receiving lineup before rotating and support serve/receive splits',()=>{
  const x=extraAnalysis([match],team,choice);
  assert.deepEqual(x.starts.map(s=>s.start),['Receiving','Serving','Receiving']);
  assert.deepEqual(x.starts.map(s=>s.label),match.sets.map(s=>'S'+(s.rallies[0].lineups[side].indexOf('5')+1)));
  assert.equal(sum(x.summary,'serving'),1); assert.equal(sum(x.summary,'receiving'),2);
  assert.equal(sum(x.summary,'sets'),3);
  assert.equal(extraAnalysis([match],team,{},2).starts[0].label,'Unconfirmed');
  assert.equal(extraAnalysis([match],team,choice,2).starts.length,1);
});

test('inferred roles follow service order through rotations and include substitutes without double counting actual court time',()=>{
  const x=extraAnalysis([match],team,choice);
  assert.equal(sum(x.players,'slotRallies'),116*6);
  assert.equal(x.players.find(p=>p.id===setter.id).roles.Setter,116);
  assert.equal(x.players.find(p=>p.number==='11').roles.Middle,116);
  for(const p of x.players)assert.equal(sum(Object.entries(p.roles).filter(([k])=>k!=='Libero').map(([,n])=>({n})),'n'),p.slotRallies);
  const opposite=x.players.filter(p=>p.roles.Opposite);
  assert.equal(opposite.length,2); assert.equal(sum(opposite.map(p=>({n:p.roles.Opposite})),'n'),116);
  const reversed=extraAnalysis([match],team,config({season:{...season,roleOrder:'middle-next'}}));
  assert.equal(reversed.players.find(p=>p.number==='11').roles.Outside,116);
  assert.deepEqual(extraAnalysis([match,match],team,choice),x);
});

test('Google saves season defaults separately, preserves matches and supports revision conflicts and inheritance',async()=>{
  const server=backend();server.post(saveRequest());
  const request=saveRequest({matchId:'season',choices:season});
  assert.equal(server.post(request).ok,true);
  assert.equal(server.get({action:'read'}).records.length,2);
  assert.equal(server.post(saveRequest({matchId:'season',choices:season})).code,'CONFLICT');
  assert.equal(server.post(saveRequest({expectedRevision:1,choices:{inheritSeason:true}})).ok,true);
  server.context.setup();assert.equal(server.rows.length,3);
  assert.ok(server.get({action:'read'}).features.includes('season-defaults'));
  const c=new SharedCoaches('https://script.google.com/macros/s/test/exec',{
    read:async(_,p)=>server.get(p),send:async(_,o)=>{server.post(JSON.parse(o.body));return {type:'opaque'};},delay:async()=>{}});
  await c.refresh();assert.equal(c.supportsSeason,true);
  const merged=c.merge({version:1,teams:{}},{version:1,teams:{}});
  assert.equal(merged.teams['4125:KSV.3'].matches.season.setters[0],setter.id);
  assert.equal(merged.teams['4125:KSV.3'].matches['76141'].inheritSeason,true);
  const old=new SharedCoaches('https://script.google.com/macros/s/old/exec',{
    read:async()=>({ok:true,version:1,records:[]}),send:async()=>assert.fail('Old backend must not be written')});
  await old.refresh();
  await assert.rejects(()=>old.save({...saveRequest(),matchId:'season',choices:season}),/Update Code.gs/);
});

test('contradictory libero exits make the affected interval unknown until the next reliable entry',()=>{
  const contradictory=html.replace('Lara Philine Buechler(15) ud istedet for Anais Alice Pilotti(14)',
    'Mariana Villar(16) ud istedet for Anais Alice Pilotti(14)');
  const m=addLiberoTracking(structuredClone(raw),contradictory);
  assert.equal(m.sets[0].rallies[0].libero.home.number,'15');
  assert.equal(m.sets[0].rallies[1].libero.home.status,'unknown');
  assert.equal(m.sets[0].rallies[2].libero.home.status,'unknown');
  assert.equal(m.sets[0].rallies[3].libero.home.number,'15');
  assert.equal(m.sets[0].rallies[3].libero.home.status,'active');
});

test('no designated liberos means known no-libero presence even without event history',()=>{
  const m=structuredClone(raw);m.rosters.home=m.rosters.home.filter(p=>!p.libero);
  addLiberoTracking(m,'');
  assert.equal(m.liberoTracking.knownRallies.home,116);
  assert.equal(m.liberoTracking.knownRallies.away,0);
  const x=extraAnalysis([m],team,choice);
  assert.deepEqual(x.coverage,{total:116,active:0,none:116,unknown:0});
  assert.equal(sum(x.players,'courtRallies'),696);
});
