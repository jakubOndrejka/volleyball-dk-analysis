import fs from "node:fs";
import vm from "node:vm";

// In-memory substitutes for Google's services. No live Sheet is modified.
export function backend() {
  const properties = new Map([["COACH_PASSWORD", "test-only-code"]]);
  const cache = new Map(),
    rows = [];
  let locked = false;
  const sheet = {
    getLastRow: () => rows.length,
    setFrozenRows() {},
    setColumnWidths() {},
    setColumnWidth() {},
    getRange(row, col, height, width) {
      return {
        getValues: () =>
          Array.from({ length: height }, (_, i) =>
            Array.from(
              { length: width },
              (_, j) => rows[row - 1 + i]?.[col - 1 + j] ?? "",
            ),
          ),
        setValues(values) {
          values.forEach((line, i) => {
            rows[row - 1 + i] ??= [];
            line.forEach((value, j) => {
              // Sheets treats the leading apostrophe as a literal-text escape.
              rows[row - 1 + i][col - 1 + j] =
                typeof value === "string" && value.startsWith("'")
                  ? value.slice(1)
                  : value;
            });
          });
          return this;
        },
        setNumberFormat() {
          return this;
        },
        setFontWeight() {
          return this;
        },
        setBackground() {
          return this;
        },
      };
    },
  };
  const book = {
    getId: () => "test-book",
    getSheetByName: () => sheet,
    insertSheet: () => sheet,
  };
  const context = vm.createContext({
    console: { log() {} },
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (name) => properties.get(name),
        setProperty: (name, value) => properties.set(name, value),
      }),
    },
    CacheService: {
      getScriptCache: () => ({
        get: (key) => cache.get(key) || null,
        put: (key, value) => cache.set(key, value),
      }),
    },
    LockService: {
      getScriptLock: () => ({
        tryLock: () => {
          if (locked) return false;
          locked = true;
          return true;
        },
        releaseLock: () => {
          locked = false;
        },
      }),
    },
    SpreadsheetApp: {
      getActiveSpreadsheet: () => book,
      openById: () => book,
      flush() {},
    },
    ContentService: {
      MimeType: { JSON: "json", JAVASCRIPT: "javascript" },
      createTextOutput: (text) => ({
        text,
        setMimeType(type) {
          this.type = type;
          return this;
        },
      }),
    },
  });
  vm.runInContext(
    fs.readFileSync(
      new URL("../../apps-script/Code.gs", import.meta.url),
      "utf8",
    ),
    context,
  );
  context.setup();
  return {
    rows,
    cache,
    properties,
    context,
    get: (parameters) =>
      JSON.parse(context.doGet({ parameter: parameters }).text),
    post: (data) =>
      JSON.parse(
        context.doPost({ postData: { contents: JSON.stringify(data) } }).text,
      ),
    holdLock: (value) => {
      locked = value;
    },
  };
}

let serial = 0;
export function saveRequest(extra = {}) {
  return {
    action: "save",
    requestId: (++serial).toString(16).padStart(32, "0"),
    leagueId: "4125",
    team: "KSV.3",
    matchId: "76141",
    expectedRevision: 0,
    choices: { setters: ["10"], fallbacks: ["6"], system: "single" },
    password: "test-only-code",
    updatedBy: "Test coach",
    ...extra,
  };
}
