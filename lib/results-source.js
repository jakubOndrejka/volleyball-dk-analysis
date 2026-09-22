import * as cheerio from 'cheerio';
export const BASE='https://resultater.volleyball.dk/tms/Turneringer-og-resultater';
export function officialUrl(raw, base=BASE) {
  const url=new URL(raw,base);
  if(url.protocol!=='https:' || !(url.hostname==='volleyball.dk'||url.hostname.endsWith('.volleyball.dk'))) throw new Error('Unsupported source host.');
  return url.href;
}
export async function fetchBytes(url) {
  officialUrl(url);
  const response=await fetch(url,{signal:AbortSignal.timeout(45000),headers:{'User-Agent':'VolleyballClubAnalysis/1.0 (public results and PDF reader)'},redirect:'error'});
  if(!response.ok)throw new Error(`Source returned HTTP ${response.status}.`);
  if(+(response.headers.get('content-length')||0)>15000000)throw new Error('Source exceeds the 15 MB limit.');
  const bytes=Buffer.from(await response.arrayBuffer());
  if(bytes.length>15000000)throw new Error('Source exceeds the 15 MB limit.');
  return bytes;
}
export function discoverPdfs(html, matchUrl) {
  const $=cheerio.load(html), links={};
  for(const a of $('a[href]').toArray()) {
    const href=$(a).attr('href'), label=$(a).text();
    if(/\/pdf\/scorecard\//i.test(href)||(/kampskema|scoresheet|scorecard/i.test(label)&&/pdf/i.test(href))) links.scorecard=officialUrl(href,matchUrl);
    if(/\/pdf\/roster\//i.test(href)||(/holdskema|roster/i.test(label)&&/pdf/i.test(href))) links.roster=officialUrl(href,matchUrl);
  }
  return links;
}
/** Optional independent check against the publicly displayed event table.
 * PDFs remain sufficient input; no API or event feed is required.
 */
export function crossCheckHistory(html, match) {
  const $=cheerio.load(html);
  const rows=$('table.srMatchInformation tr').toArray().map(row=>({text:$(row).find('.c02').text().trim(),score:$(row).find('.c01').text().trim()})).reverse();
  let current=null; const found=new Map();
  for(const row of rows) {
    const start=row.text.match(/^(\d+)\. sæt startet/);
    if(start){current=+start[1];found.set(current,[]);continue;}
    if(!row.text.startsWith('Point til ')||!current)continue;
    const team=row.text.replace(/^Point til /,'').trim();
    if(![match.home,match.away].includes(team))throw new Error('Unknown team in public point history.');
    found.get(current).push(team===match.home?'home':'away');
  }
  if(!found.size)return 'PDF score and lineup checks';
  for(const set of match.sets) {
    const history=found.get(set.number);
    if(!history || JSON.stringify(history)!==JSON.stringify(set.rallies.map(r=>r.winner)))throw new Error(`PDF reconstruction differs from the public point history in set ${set.number}.`);
  }
  return 'PDF checks + public point-history comparison';
}
