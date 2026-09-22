import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import {
  SharedCoaches,
  validateEndpoint,
  readJsonp,
} from "../shared-coaches.js";
import { backend, saveRequest } from "./helpers/apps-script-harness.js";

const endpoint = "https://script.google.com/macros/s/test-deployment/exec";
const empty = () => ({ version: 1, teams: {} });
function client(server, options = {}) {
  return new SharedCoaches(endpoint, {
    read: async (_, params) => server.get(params),
    send: async (_, options) => {
      server.post(JSON.parse(options.body));
      return { type: "opaque" };
    },
    delay: async () => {},
    ...options,
  });
}

test("setup preserves records; public reads never expose the password or request IDs", () => {
  const server = backend();
  const request = saveRequest();
  const result = server.post(request);
  assert.equal(result.ok, true);
  assert.equal(result.record.revision, 1);
  server.context.setup();
  assert.equal(server.rows.length, 2);
  const read = server.get({ action: "read" });
  assert.equal(read.records.length, 1);
  assert.ok(!JSON.stringify(read).includes(request.password));
  assert.ok(!JSON.stringify(read).includes(request.requestId));
});

test("wrong passwords, malformed choices and busy locks cannot write", () => {
  const server = backend();
  const wrong = saveRequest({ password: "wrong" });
  assert.equal(server.post(wrong).code, "PASSWORD");
  assert.equal(
    server.get({ action: "receipt", requestId: wrong.requestId }).receipt.code,
    "PASSWORD",
  );
  for (const choices of [
    { setters: ["<script>"] },
    { setters: ["5"], fallbacks: ["5"] },
    { system: "guess" },
    { sets: { 6: {} } },
    { sets: { 1: { sets: {} } } },
  ]) {
    assert.equal(server.post(saveRequest({ choices })).code, "INVALID");
  }
  assert.equal(server.post(saveRequest({ updatedBy: "" })).code, "INVALID");
  server.holdLock(true);
  assert.equal(server.post(saveRequest()).code, "BUSY");
  assert.equal(server.rows.length, 1);
});

test("two teams, leagues and matches are independent; stale edits conflict and repeats are idempotent", () => {
  const server = backend(),
    original = saveRequest();
  assert.equal(server.post(original).record.revision, 1);
  assert.equal(server.post(original).record.revision, 1);
  const stale = server.post(saveRequest({ choices: { setters: ["8"] } }));
  assert.equal(stale.code, "CONFLICT");
  assert.deepEqual(stale.current.choices.setters, ["10"]);
  for (const delta of [
    { team: "VLI.2" },
    { leagueId: "9999" },
    { matchId: "76142" },
  ])
    assert.equal(server.post(saveRequest(delta)).ok, true);
  assert.equal(server.get({ action: "read" }).records.length, 4);
  assert.equal(
    server.post(saveRequest({ expectedRevision: 1 })).record.revision,
    2,
  );
  assert.deepEqual(
    server.get({ action: "read" }).records.map((r) => r.revision),
    [2, 1, 1, 1],
  );
});

test("overrides persist, clearing is a tombstone, formula-like names remain literal, receipts survive cache loss", () => {
  const server = backend();
  const choices = {
    setters: ["8", "5"],
    fallbacks: ["6"],
    system: "back-row",
    sets: { 2: { setters: [], fallbacks: [], system: "single" } },
  };
  const first = saveRequest({ choices, updatedBy: "=not-a-formula" });
  server.post(first);
  server.cache.clear();
  const receipt = server.get({
    action: "receipt",
    requestId: first.requestId,
  }).receipt;
  assert.equal(receipt.ok, true);
  assert.equal(receipt.record.updatedBy, "=not-a-formula");
  assert.deepEqual(receipt.record.choices, choices);
  const cleared = server.post(
    saveRequest({
      expectedRevision: 1,
      choices: { setters: [], fallbacks: [], system: "single" },
    }),
  );
  assert.equal(cleared.record.revision, 2);
  assert.deepEqual(cleared.record.choices.setters, []);
  assert.equal(server.rows.length, 2);
});

test("only tightly constrained read-only JSONP callbacks are allowed", () => {
  const server = backend();
  assert.equal(
    server.context.doGet({
      parameter: { action: "read", callback: "alert(1)//" },
    }).text,
    "Invalid callback",
  );
  const callback = "ksv_cb_" + "a".repeat(32);
  const output = server.context.doGet({
    parameter: { action: "read", callback },
  });
  assert.ok(output.text.startsWith(callback + "("));
  assert.equal(output.type, "javascript");
  assert.equal(server.get({ action: "save" }).ok, false);
});

test("shared matches override stale local and published choices, including a shared reset", async () => {
  const server = backend();
  server.post(saveRequest({ choices: { setters: [] } }));
  const c = client(server);
  await c.refresh();
  const local = {
    version: 1,
    teams: {
      "4125:KSV.3": {
        matches: { 76141: { setters: ["8"] }, 76142: { setters: ["5"] } },
      },
    },
  };
  const merged = c.merge(empty(), local);
  assert.deepEqual(merged.teams["4125:KSV.3"].matches["76141"].setters, []);
  assert.deepEqual(merged.teams["4125:KSV.3"].matches["76142"].setters, ["5"]);
  assert.deepEqual(local.teams["4125:KSV.3"].matches["76141"].setters, ["8"]);
});

test("client save waits for a matching receipt, uses a simple POST and keeps code out of URLs", async () => {
  const server = backend();
  let posted,
    polls = 0;
  const c = client(server, {
    send: async (url, options) => {
      posted = { url, options };
      server.post(JSON.parse(options.body));
      return { type: "opaque" };
    },
    read: async (_, parameters) => {
      if (parameters.action === "receipt" && ++polls === 1)
        return { ok: true, receipt: null };
      return server.get(parameters);
    },
  });
  await c.refresh();
  const result = await c.save(saveRequest());
  assert.equal(polls, 2);
  assert.equal(result.revision, 1);
  assert.equal(posted.options.mode, "no-cors");
  assert.equal(
    posted.options.headers["Content-Type"],
    "text/plain;charset=utf-8",
  );
  assert.ok(!posted.url.includes("test-only-code"));
  assert.equal(posted.options.signal.aborted, true);
});

test("two clients cannot silently overwrite; refresh enables an intentional later edit", async () => {
  const server = backend(),
    a = client(server),
    b = client(server);
  await a.refresh();
  await b.refresh();
  await a.save(saveRequest());
  await assert.rejects(b.save(saveRequest()), (e) => e.code === "CONFLICT");
  await b.refresh();
  const result = await b.save(
    saveRequest({ expectedRevision: 1, choices: { setters: ["8"] } }),
  );
  assert.equal(result.revision, 2);
  assert.deepEqual(result.choices.setters, ["8"]);
  await assert.rejects(
    a.save(saveRequest({ expectedRevision: 1, password: "wrong" })),
    (e) => e.code === "PASSWORD",
  );
});

test("unconfirmed or mismatched receipts never count as a successful save", async () => {
  const server = backend();
  const c = client(server, {
    read: async (_, p) =>
      p.action === "read"
        ? server.get(p)
        : { ok: true, receipt: { ok: true, requestId: "wrong" } },
  });
  await c.refresh();
  await assert.rejects(c.save(saveRequest()), /did not match/);
  const d = client(server, {
    read: async (_, p) =>
      p.action === "read"
        ? server.get(p)
        : { ok: false, message: "Receipt unavailable" },
  });
  await d.refresh();
  await assert.rejects(
    d.save(saveRequest({ expectedRevision: 1 })),
    /Receipt unavailable/,
  );
});

test("late snapshots cannot reverse a save; malformed snapshots are applied atomically", async () => {
  const server = backend();
  const first = server.post(saveRequest()).record;
  const c = client(server);
  await c.refresh();
  const second = server.post(
    saveRequest({ expectedRevision: 1, choices: { setters: ["8"] } }),
  ).record;
  c.accept(second);
  c.accept(first);
  assert.equal(c.get("4125", "KSV.3", "76141").revision, 2);
  c.read = async () => ({
    ok: true,
    version: 1,
    records: [
      { ...second, revision: 3 },
      { ...second, revision: "bad" },
    ],
  });
  await assert.rejects(c.refresh(), /invalid shared record/);
  assert.equal(c.get("4125", "KSV.3", "76141").revision, 2);
});

test("endpoint validation rejects dev URLs, foreign origins and query parameters", () => {
  assert.equal(validateEndpoint(""), "");
  assert.equal(validateEndpoint(endpoint), endpoint);
  for (const value of [
    endpoint.replace("/exec", "/dev"),
    "https://example.com/exec",
    endpoint + "?password=code",
    endpoint + "#part",
  ])
    assert.throws(() => validateEndpoint(value));
});

test("JSONP transport resolves, cleans up, and rejects network failures and timeouts", async () => {
  const dom = new JSDOM("");
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  const successful = readJsonp(endpoint, { action: "read" }, 1000);
  let script = document.querySelector("script");
  let url = new URL(script.src);
  assert.equal(url.searchParams.get("action"), "read");
  const callback = url.searchParams.get("callback");
  window[callback]({ ok: true });
  assert.deepEqual(await successful, { ok: true });
  assert.equal(document.querySelector("script"), null);
  assert.equal(window[callback], undefined);
  const failed = readJsonp(endpoint, { action: "read" }, 1000);
  document.querySelector("script").onerror();
  await assert.rejects(failed, /Could not reach/);
  await assert.rejects(
    readJsonp(endpoint, { action: "read" }, 1),
    /Google did not respond/,
  );
  assert.equal(document.querySelector("script"), null);
  dom.window.close();
});
