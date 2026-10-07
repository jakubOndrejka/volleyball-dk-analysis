import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { JSDOM, VirtualConsole } from "jsdom";
import {addLiberoTracking} from "../lib/libero-events.js";
import {analyseTeam} from "../analysis-engine.js";
import { backend, saveRequest } from "./helpers/apps-script-harness.js";

const endpoint = "https://script.google.com/macros/s/test-deployment/exec";
const html = await fs.readFile(
  new URL("../index.html", import.meta.url),
  "utf8",
);
const match = JSON.parse(
  await fs.readFile(
    new URL("fixtures/76141-match.json", import.meta.url),
    "utf8",
  ),
);
const tick = () => new Promise((resolve) => setTimeout(resolve, 15));
async function until(fn) {
  for (let i = 0; i < 400; i++) {
    if (fn()) return;
    await tick();
  }
  assert.fail("Shared interface did not settle.");
}
let count = 0;
async function openPage(server, { personal, failRead = false, game = match } = {}) {
  const errors = [],
    vc = new VirtualConsole();
  vc.on("jsdomError", (e) => errors.push(e.message));
  const dom = new JSDOM(html, {
    url: "https://example.github.io/volleyball/?league=4125#analysis",
    runScripts: "outside-only",
    virtualConsole: vc,
  });
  const w = dom.window;
  for (const key of [
    "window",
    "document",
    "location",
    "history",
    "localStorage",
    "CustomEvent",
  ])
    globalThis[key] = key === "window" ? w : w[key];
  if (personal)
    w.localStorage.setItem(
      "volleyball-analysis:setters:v1",
      JSON.stringify(personal),
    );
  const entry = { ...game, status: "ready", file: `matches/${game.id}.json` };
  const files = {
    "./shared-coaches-config.json": { endpoint },
    "./data/analysis-config.json": { version: 1, teams: {} },
    "./data/analysis/index.json": { version: 1, matches: [entry] },
    [`./data/analysis/matches/${game.id}.json`]: game,
    "./data/data-4125.json": {
      teams: [{ name: "KSV.3" }, { name: "VLI.2" }],
      fixtures: [{ ...entry, matchId: game.id, completed: true }],
    },
  };
  w.structuredClone = structuredClone;
  w.fetch = globalThis.fetch = async (url, options) => {
    if (url === endpoint) {
      server.post(JSON.parse(options.body));
      return { type: "opaque" };
    }
    return new Response(JSON.stringify(files[url] || {}), {
      status: files[url] ? 200 : 404,
    });
  };
  const append = w.document.head.appendChild.bind(w.document.head);
  w.document.head.appendChild = (element) => {
    const result = append(element);
    if (element.tagName === "SCRIPT" && element.src.startsWith(endpoint)) {
      const params = Object.fromEntries(new URL(element.src).searchParams);
      setTimeout(() => {
        if (failRead) element.onerror();
        else w.eval(server.context.doGet({ parameter: params }).text);
      }, 1);
    }
    return result;
  };
  w.eval(
    [...w.document.querySelectorAll("script")].find((s) => !s.src).textContent,
  );
  await import(`../analysis-panel.js?shared-interface-${++count}`);
  const $ = (selector) => w.document.querySelector(selector);
  await until(() => $("#a-report .a-table"));
  return {
    w,
    dom,
    $,
    errors,
    text: () => $("#analysis-panel").textContent,
    input(selector, value) {
      const element = $(selector);
      element.value = value;
      element.dispatchEvent(
        new w.Event(element.tagName === "INPUT" ? "input" : "change", {
          bubbles: true,
        }),
      );
    },
  };
}

test("shared UI: migration, wrong code, confirmed saves, stale conflict, override, reset and a new browser", async () => {
  const server = backend();
  server.post(saveRequest({ choices: { setters: ["10"] } }));
  const personal = {
    version: 1,
    teams: { "4125:KSV.3": { matches: { 76141: { setters: ["8"] } } } },
  };
  const page = await openPage(server, { personal });
  const { $, input, text } = page;
  input("#a-setup-scope", "match");
  assert.equal($('[data-shirt="10"]').value, "setter");
  assert.equal($('[data-shirt="8"]').value, "");
  assert.match(text(), /0 rallies Unconfirmed/);
  assert.match(text(), /Save for all coaches/);
  $("#a-previous-local").click();
  assert.equal($('[data-shirt="8"]').value, "setter");
  assert.match(text(), /Nothing has been shared yet/);
  assert.equal(server.rows.length, 2);
  $("#a-refresh-shared").click();
  await until(() => $('[data-shirt="10"]').value === "setter");
  input("#a-coach-name", "Alex");
  input("#a-coach-code", "wrong");
  $("#a-save").click();
  assert.match($("#a-save-message").textContent, /waiting for confirmation/);
  await until(() => $("#a-save-message").textContent.includes("not correct"));
  assert.equal(server.get({ action: "read" }).records[0].revision, 1);
  assert.equal($("#a-coach-code").value, "");
  input("#a-coach-code", "test-only-code");
  $("#a-save").click();
  await until(() =>
    $("#a-save-message").textContent.includes("Saved for everyone"),
  );
  assert.equal(server.get({ action: "read" }).records[0].revision, 2);
  assert.ok(!JSON.stringify(page.w.localStorage).includes("test-only-code"));
  assert.ok(
    !JSON.parse(page.w.localStorage.getItem("volleyball-analysis:setters:v1"))
      .teams["4125:KSV.3"].matches["76141"],
  );
  // A second coach writes after this form captured revision 2.
  server.post(
    saveRequest({
      expectedRevision: 2,
      choices: { setters: ["8"] },
      updatedBy: "Other coach",
    }),
  );
  $("#a-save").click();
  await until(() => $("#a-save-message").textContent.includes("Another coach"));
  assert.equal($("#a-save").disabled, true);
  assert.equal($("#a-load-latest").hidden, false);
  assert.deepEqual(server.get({ action: "read" }).records[0].choices.setters, [
    "8",
  ]);
  $("#a-load-latest").click();
  await until(
    () => $('[data-shirt="8"]').value === "setter" && !$("#a-save").disabled,
  );
  assert.match(text(), /Other coach/);
  input('[data-shirt="8"]', "");
  input('[data-shirt="10"]', "setter");
  $("#a-save").click();
  await until(() =>
    $("#a-save-message").textContent.includes("Saved for everyone"),
  );
  input("#a-setup-set", "1");
  input('[data-shirt="10"]', "");
  $("#a-save").click();
  await until(() =>
    $("#a-save-message").textContent.includes("Saved for everyone"),
  );
  assert.match(text(), /47 rallies Unconfirmed/);
  $("#a-inherit").click();
  await until(() =>
    $("#a-save-message").textContent.includes("Saved for everyone"),
  );
  assert.match(text(), /0 rallies Unconfirmed/);
  input("#a-setup-set", "");
  $("#a-clear").click();
  await until(() =>
    $("#a-save-message").textContent.includes("Saved for everyone"),
  );
  assert.match(text(), /175 rallies Unconfirmed/);
  assert.equal(server.get({ action: "read" }).records[0].revision, 7);
  assert.deepEqual(page.errors, []);
  page.dom.window.close();
  // A fresh browser with an old local setter still sees the shared reset.
  const fresh = await openPage(server, { personal });
  assert.match(fresh.text(), /175 rallies Unconfirmed/);
  assert.equal(fresh.$("#a-coach-code").value, "");
  fresh.input("#a-setup-scope", "match");
  assert.equal(fresh.$('[data-shirt="8"]').value, "");
  assert.deepEqual(fresh.errors, []);
  fresh.dom.window.close();
});

test("failed initial Google read leaves stats visible but disables shared saving", async () => {
  const page = await openPage(backend(), { failRead: true });
  assert.match(page.text(), /Shared choices unavailable/);
  assert.match(page.text(), /175 rallies Unconfirmed/);
  assert.equal(page.$("#a-save").disabled, true);
  assert.equal(page.$("#a-clear").disabled, true);
  assert.ok(page.$("#a-refresh-shared"));
  assert.deepEqual(page.errors, []);
  page.dom.window.close();
});

test('season UI saves identities, resolves overrides, and keeps libero histories filtered', async()=>{
  const game=addLiberoTracking(JSON.parse(await fs.readFile(new URL('fixtures/76192-match.json',import.meta.url),'utf8')),
    await fs.readFile(new URL('fixtures/76192-events.html',import.meta.url),'utf8'));
  const server=backend(),page=await openPage(server,{game}),{$,input,text}=page;
  assert.equal($('#a-setup-scope').value,'season');
  assert.equal($('#a-setup-match').parentElement.parentElement.hidden,true);
  const setter=game.rosters.home.find(p=>p.number==='5');
  input(`[data-shirt="${setter.id}"]`,'setter');
  input('#a-coach-name','Season coach');input('#a-coach-code','test-only-code');$('#a-save').click();
  await until(()=>$('#a-save-message').textContent.includes('Saved for everyone'));
  const seasonRecord=server.get({action:'read'}).records[0];
  assert.equal(seasonRecord.matchId,'season');
  assert.deepEqual(seasonRecord.choices.setters,[setter.id]);
  assert.equal(seasonRecord.choices.playerIds,true);
  assert.match(text(),/0 rallies Unconfirmed/);
  input('#a-setup-scope','match');
  assert.equal($('[data-shirt="5"]').value,'setter');
  assert.match(text(),/Using: Season default/);
  input('#a-setup-set','1');input('[data-shirt="5"]','');$('#a-save').click();
  await until(()=>$('#a-save-message').textContent.includes('Saved for everyone'));
  assert.match(text(),/30 rallies Unconfirmed/);
  input('#a-setup-set','');$('#a-use-season').click();
  await until(()=>$('#a-save-message').textContent.includes('Saved for everyone'));
  assert.match(text(),/0 rallies Unconfirmed/);
  assert.equal(server.get({action:'read'}).records.find(r=>r.matchId===game.id).choices.inheritSeason,true);
  const libero=game.rosters.home.find(p=>p.number==='15');
  input('#a-libero-filter',libero.id);
  assert.match($('#a-libero-section').textContent,/19 rallies in this filter/);
  const button=$('#a-libero-section [data-rotation="S1"]');
  button.click();
  assert.match($('#a-detail').textContent,/Lara Philine Buechler/);
  const config={version:1,teams:{'4125:KSV.3':{matches:{season:seasonRecord.choices}}}};
  const expected=analyseTeam([game],'KSV.3',config,null,{liberoId:libero.id}).rotation[0].rallies;
  assert.equal(Number($('#a-detail .a-metrics').children[1].querySelector('strong').textContent),expected);
  $('#a-detail-close').click();assert.equal($('#a-detail'),null);
  assert.deepEqual(page.errors,[]);page.dom.window.close();
  const fresh=await openPage(server,{game});
  assert.equal(fresh.$(`[data-shirt="${setter.id}"]`).value,'setter');
  assert.match(fresh.text(),/0 rallies Unconfirmed/);
  fresh.dom.window.close();
});
