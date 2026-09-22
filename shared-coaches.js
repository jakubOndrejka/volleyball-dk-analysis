import { validateConfig, teamKey } from "./analysis-engine.js";

const randomId = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(16)), (n) =>
    n.toString(16).padStart(2, "0"),
  ).join("");
const recordKey = (leagueId, team, matchId) =>
  JSON.stringify([String(leagueId), team, String(matchId)]);

export function validateEndpoint(value) {
  if (!value) return "";
  const url = new URL(value);
  if (
    url.origin !== "https://script.google.com" ||
    !/^\/macros\/s\/[a-zA-Z0-9_-]+\/exec$/.test(url.pathname) ||
    url.search ||
    url.hash
  ) {
    throw new Error("Use the Apps Script web app URL ending in /exec.");
  }
  return url.href;
}

/** Public, read-only JSONP handles Google's Content Service redirects. */
export function readJsonp(endpoint, parameters, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    const callback = "ksv_cb_" + randomId();
    const url = new URL(endpoint);
    for (const [key, value] of Object.entries({
      ...parameters,
      callback,
      nonce: randomId(),
    }))
      url.searchParams.set(key, value);
    const script = document.createElement("script");
    const finish = (error, value) => {
      clearTimeout(timer);
      script.remove();
      delete window[callback];
      if (error) reject(error);
      else resolve(value);
    };
    const timer = setTimeout(
      () =>
        finish(
          new Error(
            "Google did not respond. Check the web app access is Anyone, then try Refresh shared choices.",
          ),
        ),
      timeoutMs,
    );
    window[callback] = (data) => finish(null, data);
    script.onerror = () =>
      finish(
        new Error(
          "Could not reach the shared choices. Check the Apps Script deployment and your connection.",
        ),
      );
    script.src = url.href;
    document.head.appendChild(script);
  });
}

export class SharedCoaches {
  constructor(
    endpoint,
    {
      read = readJsonp,
      send = (...args) => fetch(...args),
      delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    } = {},
  ) {
    this.endpoint = validateEndpoint(endpoint);
    this.read = read;
    this.send = send;
    this.delay = delay;
    this.records = new Map();
    this.ready = false;
  }
  get enabled() {
    return Boolean(this.endpoint);
  }
  get(leagueId, team, matchId) {
    return this.records.get(recordKey(leagueId, team, matchId));
  }
  accept(record) {
    if (
      !record ||
      !/^\d+$/.test(String(record.leagueId)) ||
      !/^\d+$/.test(String(record.matchId)) ||
      !Number.isSafeInteger(record.revision) ||
      record.revision < 1
    )
      throw new Error("Google returned an invalid shared record.");
    const config = validateConfig({
      version: 1,
      teams: {
        [teamKey(record.leagueId, record.team)]: {
          matches: { [record.matchId]: record.choices },
        },
      },
    });
    const key = recordKey(record.leagueId, record.team, record.matchId);
    if ((this.records.get(key)?.revision || 0) > record.revision) return;
    this.records.set(key, {
      ...record,
      choices:
        config.teams[teamKey(record.leagueId, record.team)].matches[
          record.matchId
        ],
    });
  }
  async refresh() {
    if (!this.enabled) return;
    const result = await this.read(this.endpoint, { action: "read" });
    if (!result?.ok || result.version !== 1 || !Array.isArray(result.records))
      throw new Error(
        result?.message || "The shared choices response was not recognised.",
      );
    // Validate the whole response before changing any current choices.
    const candidate = new SharedCoaches(this.endpoint);
    candidate.records = new Map(this.records);
    for (const record of result.records) candidate.accept(record);
    this.records = candidate.records;
    this.ready = true;
  }
  merge(published, personal) {
    const result = structuredClone(published);
    // A shared match always wins over an old personal copy, including resets.
    for (const [key, value] of Object.entries(personal.teams)) {
      result.teams[key] ??= { matches: {} };
      Object.assign(result.teams[key].matches, value.matches);
    }
    for (const record of this.records.values()) {
      const key = teamKey(record.leagueId, record.team);
      result.teams[key] ??= { matches: {} };
      result.teams[key].matches[record.matchId] = structuredClone(
        record.choices,
      );
    }
    return result;
  }
  async save({
    leagueId,
    team,
    matchId,
    choices,
    expectedRevision,
    password,
    updatedBy,
  }) {
    if (!this.enabled || !this.ready)
      throw new Error("Load the shared choices before saving.");
    const requestId = randomId();
    const body = JSON.stringify({
      action: "save",
      requestId,
      leagueId,
      team,
      matchId,
      choices,
      expectedRevision,
      password,
      updatedBy,
    });
    const controller = new AbortController();
    // A simple POST avoids preflight. Its opaque response is NOT proof of saving.
    // We only report success after reading a receipt for this exact request ID.
    Promise.resolve()
      .then(() =>
        this.send(this.endpoint, {
          method: "POST",
          mode: "no-cors",
          credentials: "omit",
          redirect: "follow",
          headers: { "Content-Type": "text/plain;charset=utf-8" },
          body,
          signal: controller.signal,
        }),
      )
      .catch(() => {});
    const deadline = Date.now() + 45000;
    try {
      while (Date.now() < deadline) {
        await this.delay(1200);
        const response = await this.read(
          this.endpoint,
          { action: "receipt", requestId },
          Math.max(100, Math.min(12000, deadline - Date.now())),
        );
        if (!response?.ok)
          throw new Error(
            response?.message ||
              "Could not confirm the save. Refresh shared choices before retrying.",
          );
        const receipt = response.receipt;
        if (!receipt) continue;
        if (receipt.requestId !== requestId)
          throw new Error("The save response did not match this request.");
        if (!receipt.ok) {
          const error = new Error(receipt.message || "The shared save failed.");
          error.code = receipt.code;
          throw error;
        }
        if (
          !receipt.record ||
          recordKey(
            receipt.record.leagueId,
            receipt.record.team,
            receipt.record.matchId,
          ) !== recordKey(leagueId, team, matchId)
        )
          throw new Error("The save response referred to a different match.");
        this.accept(receipt.record);
        return this.get(leagueId, team, matchId);
      }
      throw new Error(
        "The save could not be confirmed. It may have reached Google; refresh shared choices before trying again.",
      );
    } finally {
      controller.abort();
    }
  }
}
