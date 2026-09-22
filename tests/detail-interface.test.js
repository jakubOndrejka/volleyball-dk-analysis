import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { JSDOM, VirtualConsole } from "jsdom";
import { analyseTeam } from "../analysis-engine.js";

const real = JSON.parse(
  await fs.readFile(
    new URL("fixtures/76141-match.json", import.meta.url),
    "utf8",
  ),
);
const second = structuredClone(real);
second.id = "80000";
second.date = "2026-09-27";
const html = await fs.readFile(
  new URL("../index.html", import.meta.url),
  "utf8",
);
const config = {
  version: 1,
  teams: {
    "4125:KSV.3": {
      matches: { 76141: { setters: ["10"] }, 80000: { setters: ["8"] } },
    },
  },
};
const tick = () => new Promise((resolve) => setTimeout(resolve, 15));
async function until(fn) {
  for (let i = 0; i < 120; i++) {
    if (fn()) return;
    await tick();
  }
  assert.fail("Detail interface did not finish rendering.");
}

test("clickable player/rotation histories, graph metrics, scopes, setter filtering, exports and keyboard close", async () => {
  const errors = [],
    vc = new VirtualConsole();
  vc.on("jsdomError", (e) => errors.push(e.message));
  const dom = new JSDOM(html, {
      url: "http://localhost/volleyball/?league=4125#analysis",
      runScripts: "outside-only",
      virtualConsole: vc,
    }),
    w = dom.window;
  for (const key of [
    "window",
    "document",
    "location",
    "history",
    "localStorage",
    "CustomEvent",
  ])
    globalThis[key] = key === "window" ? w : w[key];
  const files = {
    "./shared-coaches-config.json": { endpoint: "" },
    "./data/analysis-config.json": config,
    "./data/analysis/index.json": {
      version: 1,
      matches: [second, real].map((m) => ({
        ...m,
        status: "ready",
        file: `matches/${m.id}.json`,
      })),
    },
    "./data/analysis/matches/76141.json": real,
    "./data/analysis/matches/80000.json": second,
    "./data/data-4125.json": {
      teams: [{ name: "KSV.3" }, { name: "VLI.2" }],
      fixtures: [real, second].map((m) => ({
        ...m,
        matchId: m.id,
        completed: true,
      })),
    },
  };
  w.fetch = globalThis.fetch = async (url) =>
    new Response(JSON.stringify(files[url] || {}), {
      status: files[url] ? 200 : 404,
    });
  w.structuredClone = structuredClone;
  w.eval(
    [...w.document.querySelectorAll("script")].find((s) => !s.src).textContent,
  );
  await import("../analysis-panel.js?detail-interface");
  const $ = (s) => w.document.querySelector(s),
    change = (s, value) => {
      const el = $(s);
      assert.ok(el, s);
      el.value = value;
      el.dispatchEvent(new w.Event("change", { bubbles: true }));
    };
  await until(() => $("#a-rotation-setter"));
  const id = real.rosters.away.find((p) => p.number === "10").id;
  const opener = $(`[data-player-id="${id}"]`);
  assert.ok(opener);
  change("#a-match", "76141");
  $(`[data-player-id="${id}"]`).click();
  assert.equal($("#a-detail").hasAttribute("open"), true);
  assert.match($("#a-detail-title").textContent, /Matilde Sofia Nielsen/);
  assert.equal(
    $("#a-detail .a-table tbody").rows.length,
    2,
    "default detail includes full match history",
  );
  assert.equal(
    $("#a-detail .a-table tbody").rows[0].cells[2].textContent,
    "76141",
  );
  assert.equal(
    w.document.querySelectorAll("#a-detail .a-chart-point").length,
    2,
  );
  $('#a-detail [data-point="0"]').dispatchEvent(new w.Event("focus"));
  assert.match($("#a-chart-point-note").textContent, /76141/);
  assert.match($("#a-chart-point-note").textContent, /first rallies won/);
  change("#a-detail-metric", "servesPerSet");
  assert.match($("#a-detail svg").getAttribute("aria-label"), /Serves \/ set/);
  change("#a-detail-scope", "current");
  assert.equal($("#a-detail .a-table tbody").rows.length, 1);
  assert.match($("#a-detail").textContent, /One recorded match/);
  const blobs = [],
    downloads = [];
  const originalCreate = URL.createObjectURL,
    originalRevoke = URL.revokeObjectURL;
  URL.createObjectURL = (blob) => {
    blobs.push(blob);
    return "blob:test";
  };
  URL.revokeObjectURL = () => {};
  w.HTMLAnchorElement.prototype.click = function () {
    downloads.push(this.download);
  };
  $("#a-detail-csv").click();
  const csv = await blobs.at(-1).text();
  assert.match(csv, /Opponent/);
  assert.match(csv, /First-rally win %/);
  assert.match(csv, /76141/);
  assert.ok(!csv.includes("80000"));
  $("#a-detail").dispatchEvent(
    new w.KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
  );
  assert.equal($("#a-detail"), null);
  assert.equal(w.document.activeElement.dataset.playerId, id);
  change("#a-match", "all");
  const playersBefore = $("#a-report .a-table").textContent,
    overviewBefore = $("#a-report .a-metrics").textContent;
  change("#a-rotation-setter", id);
  assert.equal($("#a-report .a-table").textContent, playersBefore);
  assert.equal($("#a-report .a-metrics").textContent, overviewBefore);
  const expected = analyseTeam([real, second], "KSV.3", config, null, {
    setterId: id,
  });
  const tableRows = [...$("#a-rotation-section .a-table tbody").rows];
  assert.equal(
    tableRows.reduce((sum, row) => sum + Number(row.cells[1].textContent), 0),
    expected.total.rallies,
  );
  $('#a-rotation-section .a-table [data-rotation="S1"]').click();
  assert.match($("#a-detail").textContent, /Matilde Sofia Nielsen/);
  assert.equal(
    $("#a-detail .a-table tbody").rows.length,
    1,
    "rotation history honors the selected setter",
  );
  change("#a-detail-metric", "netPointsPer100");
  assert.match($("#a-detail svg").getAttribute("aria-label"), /Net points/);
  $("#a-detail-close").click();
  $("#a-rotation-csv").click();
  assert.ok(downloads.at(-1).includes("-setter-" + id));
  const exported = (await blobs.at(-1).text()).trim().split("\r\n").slice(1);
  assert.equal(
    exported.reduce(
      (sum, line) => sum + Number(line.split(",")[1].replaceAll('"', "")),
      0,
    ),
    expected.total.rallies,
  );
  change("#a-match", "80000");
  assert.match(
    $("#a-rotation-section").textContent,
    /No rallies are attributed/,
  );
  change("#a-rotation-setter", "");
  $('#a-rotation-section .a-table [data-rotation="Unconfirmed"]').click();
  assert.ok(
    $("#a-detail .a-table tbody").rows.length > 0,
    "Unconfirmed has its own history",
  );
  $("#a-detail-close").click();
  change("#a-team", "VLI.2");
  await until(() => $("#a-rotation-setter"));
  assert.equal($("#a-rotation-setter").value, "");
  assert.equal($("#a-detail"), null);
  assert.deepEqual(errors, []);
  URL.createObjectURL = originalCreate;
  URL.revokeObjectURL = originalRevoke;
  dom.window.close();
});
