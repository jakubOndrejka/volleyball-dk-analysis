import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { parseRoster, parseScorecard, PARSER_VERSION } from './lib/pdf-parser.js';
import { fetchBytes, discoverPdfs, crossCheckHistory, BASE } from './lib/results-source.js';
import { validateMatch } from './analysis-engine.js';
const settings=JSON.parse(await fs.readFile('project-config.json','utf8'));
const force=process.argv.includes('--force'), offline=process.argv.includes('--cached');
const only=process.argv.find(a=>a.startsWith('--match='))?.split('=')[1];
const path='data/analysis/index.json';
const readJson=async (p,fallback)=>{try{return JSON.parse(await fs.readFile(p,'utf8'));}catch{return fallback;}};
const index=await readJson(path,{version:1,matches:[]});
const entries=new Map(index.matches.map(m=>[m.id,m]));
await fs.mkdir('data/analysis/matches',{recursive:true});await fs.mkdir('.cache/pdf',{recursive:true});
for(const leagueId of settings.leagueIds) {
  const league=await readJson(`data/data-${leagueId}.json`,{fixtures:[]});
  for(const f of league.fixtures) {
    if(!f.matchId || !f.score || (only && String(f.matchId)!==only))continue;
    const setsToWin=settings.bestOfThreeLeagueIds?.includes(leagueId)?2:3;
    if(Math.max(...f.score.split('-').map(Number))!==setsToWin)continue;
    if(settings.trackedTeamPrefixes.length&&!settings.trackedTeamPrefixes.some(t=>f.home.startsWith(t)||f.away.startsWith(t)))continue;
    const id=String(f.matchId), old=entries.get(id);
    const changed=old&&old.score!==f.score;
    entries.set(id,{...old,id,leagueId,home:f.home,away:f.away,date:f.date,score:f.score,matchNumber:f.matchNumber,bestOf:setsToWin*2-1,matchUrl:f.matchUrl||`${BASE}/Kamp-Information.aspx?KampId=${id}`,status:changed?'queued':old?.status||'queued',nextCheckAt:changed?null:old?.nextCheckAt||null});
  }
}
let attempted=0;
const now=new Date();
for(const entry of [...entries.values()].sort((a,b)=>(a.status==='ready')-(b.status==='ready')||b.date.localeCompare(a.date))) {
  if(only && entry.id!==only)continue;
  if(attempted>=settings.maxPdfMatchesPerRun)break;
  if(!force&&entry.parserVersion===PARSER_VERSION&&entry.nextCheckAt&&new Date(entry.nextCheckAt)>now)continue;
  attempted++;
  try {
    let html;
    if(offline)html=await fs.readFile(`.cache/pdf/${entry.id}.html`,'utf8');
    else {html=(await fetchBytes(entry.matchUrl)).toString('utf8');await fs.writeFile(`.cache/pdf/${entry.id}.html`,html);}
    const links=discoverPdfs(html,entry.matchUrl);
    entry.source={...entry.source,scorecardUrl:links.scorecard||null,rosterUrl:links.roster||null};
    if(!links.scorecard||!links.roster) {
      entry.status='pending';entry.reason='Waiting for a published scorecard and roster PDF.';entry.failures=0;
    } else {
      const get=async kind=>{
        const p=`.cache/pdf/${entry.id}-${kind}.pdf`;
        if(offline)return fs.readFile(p);
        const b=await fetchBytes(links[kind]);await fs.writeFile(p,b);return b;
      };
      const scorecard=await get('scorecard'), roster=await get('roster');
      const rosters=await parseRoster(roster,entry);
      const match=await parseScorecard(scorecard,{...entry,matchId:entry.id},rosters);
      match.source={...entry.source,matchUrl:entry.matchUrl,sha256:createHash('sha256').update(scorecard).digest('hex'),check:crossCheckHistory(html,match)};
      validateMatch(match);
      const file=`data/analysis/matches/${entry.id}.json`;
      await fs.writeFile(file+'.tmp',JSON.stringify(match)+'\n');await fs.rename(file+'.tmp',file);
      entry.file=`matches/${entry.id}.json`;entry.source=match.source;entry.status='ready';entry.reason=null;entry.failures=0;entry.sets=match.sets.length;
    }
    delete entry.refreshWarning;
  } catch(error) {
    entry.failures=(entry.failures||0)+1;
    if(entry.status==='ready' && /HTTP|fetch|timeout|timed out|network|abort/i.test(error.message)) entry.refreshWarning=`Latest refresh failed; displaying previously checked PDF: ${error.message}`;
    else {entry.status=/HTTP|fetch|timeout|network|abort|ENOENT/i.test(error.message)?'pending':'review';entry.reason=error.message;}
  }
  entry.lastCheckedAt=now.toISOString();entry.parserVersion=PARSER_VERSION;
  const recent=Date.now()-new Date(entry.date).getTime()<7*86400000;
  const hours=entry.status==='ready'?(recent?settings.recentRecheckHours:settings.olderRecheckDays*24):Math.min(24,2**Math.min(entry.failures||0,5));
  entry.nextCheckAt=new Date(now.getTime()+hours*3600000).toISOString();
  console.log(`[${entry.id}] ${entry.home} vs ${entry.away}: ${entry.status}${entry.reason?' — '+entry.reason:''}`);
}
index.matches=[...entries.values()].sort((a,b)=>b.date.localeCompare(a.date)||a.id.localeCompare(b.id));
if(attempted)index.lastCheckedAt=now.toISOString();
await fs.writeFile(path+'.tmp',JSON.stringify(index,null,2)+'\n');await fs.rename(path+'.tmp',path);
console.log(`Checked ${attempted} PDF matches. ${index.matches.filter(m=>m.status==='ready').length} available.`);
