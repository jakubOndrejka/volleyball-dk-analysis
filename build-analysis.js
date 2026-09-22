import fs from 'node:fs/promises';
import {analyseTeam,validateConfig,teamKey} from './analysis-engine.js';
const index=JSON.parse(await fs.readFile('data/analysis/index.json','utf8'));
const config=validateConfig(JSON.parse(await fs.readFile('data/analysis-config.json','utf8')));
const matches=await Promise.all(index.matches.filter(m=>m.status==='ready').map(m=>fs.readFile(`data/analysis/${m.file}`,'utf8').then(JSON.parse)));
const teams={};
for(const match of matches)for(const team of [match.home,match.away]) {
  const key=teamKey(match.leagueId,team);
  if(!teams[key])teams[key]=analyseTeam(matches.filter(m=>m.leagueId===match.leagueId),team,config);
}
await fs.writeFile('data/analysis/summary.json',JSON.stringify({version:1,teams},null,2)+'\n');
console.log(`Built reports for ${Object.keys(teams).length} teams.`);
