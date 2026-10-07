import {ROTATIONS, percentage, resolveSelection, rallySetter, analyseTeam} from './analysis-engine.js';

export function teamPlayers(matches, team) {
  const players = new Map();
  for (const match of [...matches].sort((a,b) => a.date.localeCompare(b.date))) {
    if (![match.home,match.away].includes(team)) continue;
    const side = match.home === team ? 'home' : 'away';
    for (const p of match.rosters[side]) {
      const previous = players.get(p.id);
      players.set(p.id, {...p, numbers:[...new Set([...(previous?.numbers || []),p.number])],
        // A player can be designated libero in one match and a regular in another.
        alwaysLibero: (previous?.alwaysLibero ?? true) && p.libero});
    }
  }
  return [...players.values()].sort((a,b) => a.name.localeCompare(b.name));
}

export function extraAnalysis(matches, team, config, setFilter = null) {
  const pool = teamPlayers(matches,team), players = new Map(pool.map(p => [p.id, {...p,
    sets:new Set(), matches:new Set(), slotRallies:0, courtRallies:0, uncertainRallies:0,
    roles:{Setter:0,Outside:0,Middle:0,Opposite:0,Libero:0,Unconfirmed:0}}]));
  const starts = [], summary = ROTATIONS.map(rotation => ({label:rotation, serving:0, receiving:0, sets:0, wins:0}));
  const coverage = {total:0, active:0, none:0, unknown:0};
  const liberoCoverage = [];
  const seen = new Set();
  for (const match of matches) {
    if (seen.has(match.id) || ![match.home,match.away].includes(team)) continue;
    seen.add(match.id);
    const side = match.home === team ? 'home' : 'away', own = side === 'home' ? 0 : 1;
    const roster = new Map(match.rosters[side].map(p => [p.number,p]));
    const audit = {date:match.date, opponent:match[side === 'home' ? 'away' : 'home'], matchId:String(match.id), total:0, active:0, none:0, unknown:0, pending:0};
    liberoCoverage.push(audit);
    for (const set of match.sets) {
      if (setFilter && set.number !== +setFilter) continue;
      const selection = resolveSelection(match,team,config,set.number);
      const first = set.rallies[0], start = rallySetter(first,side,selection);
      const mode = first.serving === side ? 'Serving' : 'Receiving';
      const won = set.score[own] > set.score[1-own];
      starts.push({date:match.date, opponent:match[side === 'home' ? 'away' : 'home'], set:set.number,
        start:mode, label:start.rotation, setter:roster.get(start.number)?.name || 'Unconfirmed',
        score:`${set.score[own]}–${set.score[1-own]}`, result:won ? 'Won' : 'Lost', source:selection.source});
      const bucket = summary.find(s => s.label === start.rotation);
      bucket[mode.toLowerCase()]++; bucket.sets++; bucket.wins += Number(won);
      for (const rally of set.rallies) {
        coverage.total++;
        const status = rally.libero?.[side]?.status;
        coverage[status || 'unknown']++;
        audit.total++; audit[status || 'pending']++;
        const active = rallySetter(rally,side,selection), lineup = rally.lineups?.[side] || [];
        const setterIndex = lineup.indexOf(active.number), court = rally.onCourt?.[side];
        const roleOrder = selection.roleOrder === 'middle-next'
          ? ['Setter','Middle','Outside','Opposite','Middle','Outside']
          : ['Setter','Outside','Middle','Opposite','Outside','Middle'];
        for (const [i, number] of lineup.entries()) {
          const p = players.get(roster.get(number)?.id); if (!p) continue;
          p.slotRallies++;
          p.roles[setterIndex < 0 ? 'Unconfirmed' : roleOrder[(i-setterIndex+6)%6]]++;
          p.sets.add(`${match.id}:${set.number}`); p.matches.add(match.id);
          if (!court) p.uncertainRallies++;
        }
        if (court) for (const number of court) {
          const p = players.get(roster.get(number)?.id); if (!p) continue;
          p.courtRallies++; p.sets.add(`${match.id}:${set.number}`); p.matches.add(match.id);
          if (roster.get(number).libero) p.roles.Libero++;
        }
        // When history is unavailable, any roster libero may have been on court.
        if (!court) for (const p of match.rosters[side].filter(p => p.libero)) players.get(p.id).uncertainRallies++;
      }
    }
  }
  return {starts, liberoCoverage:liberoCoverage.filter(m=>m.total), summary:summary.map(s => ({...s,winPct:percentage(s.wins,s.sets)})), coverage,
    players:[...players.values()].map(p => ({...p, sets:p.sets.size,matches:p.matches.size,
      courtPct:percentage(p.courtRallies,coverage.total),
      roleMix:Object.entries(p.roles).filter(([,n])=>n).map(([role,n])=>`${role}: ${n}`).join(' · ') || 'No recorded appearance'}))
      .sort((a,b)=>b.courtRallies-a.courtRallies || b.slotRallies-a.slotRallies || a.name.localeCompare(b.name)),
    liberos:pool.filter(p => matches.some(m => [m.home,m.away].includes(team) &&
      m.rosters[m.home === team ? 'home' : 'away'].some(q => q.id === p.id && q.libero)))};
}

export function renderExtras({target,matches,team,config,setFilter,table,rotationColumns,csv,download,liberoFilter,setLiberoFilter}) {
  const x = extraAnalysis(matches,team,config,setFilter);
  const esc = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const playerRows = x.players.map(p => ({...p, player:p.name, courtShare:p.courtPct === null ? '—'
    : `${p.uncertainRallies ? '≥ ' : ''}${p.courtPct.toFixed(1)}%`}));
  const startColumns = [['date','Date'],['opponent','Opponent'],['set','Set'],['start','First rally'],['label','Starting rotation'],['setter','Setter'],['score','Set score'],['result','Result'],['source','Setter choice']];
  const playerColumns = [['player','Player'],['roleMix','Inferred role · slot rallies¹'],['matches','Matches involved'],['sets','Sets involved'],['courtRallies','Confirmed court rallies'],['courtShare','Share of team rallies'],['uncertainRallies','Uncertain court rallies']];
  const summaryColumns = [['label','Starting rotation'],['serving','Started serving'],['receiving','Started receiving'],['sets','Sets'],['wins','Sets won'],['winPct','Set win %','pct']];
  const pending = x.liberoCoverage.reduce((n,m)=>n+m.pending,0), pendingMatches = x.liberoCoverage.filter(m=>m.pending).length;
  const auditColumns = [['date','Date'],['opponent','Opponent'],['matchId','Match ID'],['total','Rallies'],['active','With libero'],['none','Without libero'],['unknown','Unknown in source'],['pending','Awaiting refresh']];
  const liberos = x.liberos;
  if (!['active','none','unknown'].includes(liberoFilter) && !liberos.some(p=>p.id===liberoFilter)) liberoFilter='active';
  const libReport = analyseTeam(matches,team,config,setFilter,{liberoId:liberoFilter});
  const root = document.createElement('div'); root.id='a-extra-analysis';
  root.innerHTML = `<section class="a-card"><div class="a-card-head"><div><h3>How do we start?</h3><p>Setter rotation on the first rally of each set, before any side-out rotation.</p></div><button id="a-starts-csv">Download starts CSV ↓</button></div>${table(x.summary,summaryColumns,'Starting rotation summary')}<details><summary>Every set</summary>${table(x.starts,startColumns,'Set starting rotations')}</details></section>
<section class="a-card"><div class="a-card-head"><div><h3>Who played where?</h3><p>Playing time measured in rallies. A dash or an uncertain count means the event log cannot confirm court presence.</p></div><button id="a-roles-csv">Download playing time CSV ↓</button></div>${table(playerRows,playerColumns,'Player roles and playing time')}<p class="a-note">¹ Roles are inferred from service order relative to your chosen setter: setter → outside → middle → opposite → outside → middle. You can reverse outside/middle order in setter settings. These counts follow regular rotation slots, including rallies when a libero replaced the player; the Libero count follows recorded court presence. “Sets involved” includes starting lineups and appearances. Court share uses all ${x.coverage.total} team rallies; ≥ is a minimum where presence is uncertain. This is not minutes played.</p></section>
<section class="a-card" id="a-libero-section"><div class="a-card-head"><div><h3>With our liberos on court.</h3><p>Team results by setter rotation, filtered by the libero actually recorded on court.</p></div><button id="a-libero-csv">Download libero rotation CSV ↓</button></div><div class="a-toolbar"><label>Libero<select id="a-libero-filter"><option value="active">All recorded liberos</option>${liberos.map(p=>`<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('')}<option value="none">No libero on court (confirmed)</option><option value="unknown">Court presence unknown</option></select></label><span class="a-note">${libReport.total.rallies} rallies in this filter</span></div>${pending ? `<div class="a-notice" id="a-libero-pending">Libero history is awaiting a data refresh for <strong>${pendingMatches} ${pendingMatches === 1 ? "match" : "matches"} (${pending} rallies)</strong>. This does not mean the team played without a libero. These rallies are not included in the named-libero totals yet.</div>` : ""}<p class="a-note">Coverage: ${x.coverage.active} with a libero · ${x.coverage.none} without · ${x.coverage.unknown-pending} unknown in source${pending ? ` · ${pending} awaiting refresh` : ""}. These are team rally outcomes with the selected libero present, not individual reception ratings. Click a rotation for match history and progress. Missing or contradictory exchange history stays unknown.</p>${pending === x.coverage.total && !libReport.total.rallies ? '<div class="a-empty">Libero statistics will appear after the match history refreshes.</div>' : table(libReport.rotation,rotationColumns,'Rotation outcomes by libero')}<details id="a-libero-coverage"><summary>Coverage by match</summary>${table(x.liberoCoverage,auditColumns,'Libero data coverage by match')}</details></section>`;
  target.append(root);
  root.querySelector('#a-libero-filter').value=liberoFilter;
  root.querySelectorAll('[data-rotation]').forEach(button => {
    button.dataset.liberoId=liberoFilter;
    button.dataset.liberoName=root.querySelector('#a-libero-filter').selectedOptions[0].textContent;
  });
  root.querySelector('#a-libero-filter').onchange=e=>setLiberoFilter(e.target.value);
  root.querySelector('#a-starts-csv').onclick=()=>download(`${team}-set-starts.csv`,csv(x.starts,startColumns),'text/csv;charset=utf-8');
  root.querySelector('#a-roles-csv').onclick=()=>download(`${team}-playing-time.csv`,csv(playerRows,playerColumns),'text/csv;charset=utf-8');
  root.querySelector('#a-libero-csv').disabled = !libReport.total.rallies;
  root.querySelector('#a-libero-csv').onclick=()=>download(`${team}-libero-${liberoFilter}.csv`,csv(libReport.rotation,rotationColumns),'text/csv;charset=utf-8');
}
