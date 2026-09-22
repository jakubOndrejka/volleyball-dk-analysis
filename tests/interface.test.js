import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import {JSDOM,VirtualConsole} from 'jsdom';
const match=JSON.parse(await fs.readFile(new URL('fixtures/76141-match.json',import.meta.url),'utf8'));
const entry={...match,status:'ready',file:'matches/76141.json'};delete entry.sets;delete entry.rosters;
const league={updatedAt:'2026-09-22T12:00:00Z',teams:[{name:'KSV.3',pos:1,k:1,v:1,t:0,sets:'3-1',pts:3},{name:'VLI.2',pos:2,k:1,v:0,t:1,sets:'1-3',pts:0}],fixtures:[{matchId:'76141',date:match.date,time:'11:30',home:match.home,away:match.away,score:match.score,venue:'Kedelhallen'}]};
const html=await fs.readFile(new URL('../index.html',import.meta.url),'utf8');
const tick=()=>new Promise(resolve=>setTimeout(resolve,15));
async function until(fn){for(let i=0;i<100;i++){if(fn())return;await tick();}assert.fail('Interface did not finish rendering.');}
test('team panel, setter persistence, overrides, filters, exports, import rejection and original results',async()=>{
  const errors=[];const vc=new VirtualConsole();vc.on('jsdomError',e=>errors.push(e.message));const dom=new JSDOM(html,{url:'http://localhost/my-volleyball/?league=4125#analysis',runScripts:'outside-only',virtualConsole:vc});const w=dom.window;
  for(const key of ['window','document','location','history','localStorage','CustomEvent'])globalThis[key]=key==='window'?w:w[key];
  const files={'./data/data-4125.json':league,'./data/analysis/index.json':{version:1,lastCheckedAt:'2026-09-22T12:00:00Z',matches:[entry]},'./data/analysis-config.json':{version:1,teams:{}},'./data/analysis/matches/76141.json':match};
  w.fetch=globalThis.fetch=async url=>new Response(JSON.stringify(files[url]||{}),{status:files[url]?200:404});w.structuredClone=structuredClone;
  const inline=[...w.document.querySelectorAll('script')].find(s=>!s.src).textContent;w.eval(inline);await import('../analysis-panel.js?interface-test');
  const $=s=>w.document.querySelector(s), text=()=>$('#analysis-panel').textContent;const change=(selector,value)=>{const el=$(selector);assert.ok(el,selector);el.value=value;el.dispatchEvent(new w.Event('change',{bubbles:true}));};
  await until(()=>$('#a-report .a-table'));assert.equal($('#results-view').hidden,true);assert.match(text(),/175 rallies Unconfirmed/);assert.match(text(),/Serving turns/);assert.match(text(),/Net points \/ 100/);assert.match(text(),/Matilde Sofia Nielsen/);
  change('#a-match','76141');change('[data-shirt="10"]','setter');$('#a-save').click();assert.match(text(),/100\.0%/);assert.match(text(),/0 rallies Unconfirmed/);const saved=JSON.parse(localStorage.getItem('volleyball-analysis:setters:v1'));assert.deepEqual(saved.teams['4125:KSV.3'].matches['76141'].setters,['10']);
  change('#a-setup-set','1');assert.equal($('[data-shirt="10"]').value,'setter');change('[data-shirt="10"]','');$('#a-save').click();assert.match(text(),/47 rallies Unconfirmed/);$('#a-inherit').click();assert.match(text(),/0 rallies Unconfirmed/);
  change('#a-set','1');assert.match(text(),/47 rallies/);change('#a-min-turns','3');assert.equal($('#a-report .a-table tbody').rows.length,1);change('#a-min-turns','0');
  const blobs=[];const original=URL.createObjectURL;URL.createObjectURL=blob=>{blobs.push(blob);return 'blob:test';};URL.revokeObjectURL=()=>{};w.HTMLAnchorElement.prototype.click=function(){};
  $('#a-serving-csv').click();assert.match(await blobs.at(-1).text(),/First-rally win %/);assert.match(await blobs.at(-1).text(),/Matilde Sofia Nielsen/);$('#a-rotation-csv').click();assert.match(await blobs.at(-1).text(),/Longest receiving loss run/);$('#a-export').click();assert.equal(JSON.parse(await blobs.at(-1).text()).teams['4125:KSV.3'].matches['76141'].setters[0],'10');URL.createObjectURL=original;
  Object.defineProperty($('#a-import-file'),'files',{value:[{size:20,text:async()=>'not json'}],configurable:true});$('#a-import-file').dispatchEvent(new w.Event('change'));await until(()=>$('#a-import-message').textContent.includes('Import failed'));assert.match(text(),/Import failed/);
  change('#a-setup-set','');$('#a-clear').click();assert.match(text(),/47 rallies Unconfirmed/);change('#a-set','');assert.match(text(),/175 rallies Unconfirmed/);
  $('[data-view="results"]').click();assert.equal($('#results-view').hidden,false);assert.equal($('#analysis-panel').hidden,true);assert.match($('#standings-body').textContent,/KSV\.3/);assert.equal($('#standings-body').rows.length,2);assert.match($('#fixture-list').textContent,/1-3/);assert.deepEqual(errors,[]);dom.window.close();
});
