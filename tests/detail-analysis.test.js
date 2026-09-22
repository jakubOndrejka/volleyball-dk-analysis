import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  analyseTeam,
  rotationSetter,
  listSetters,
  matchHistory,
} from "../analysis-engine.js";
import {
  progressChart,
  PLAYER_METRICS,
  ROTATION_METRICS,
} from "../analysis-details.js";

const real = JSON.parse(
  fs.readFileSync(new URL("fixtures/76141-match.json", import.meta.url)),
);
const pid = (number) => real.rosters.away.find((p) => p.number === number).id;
const config = (selection) => ({
  version: 1,
  teams: { "4125:KSV.3": { matches: { 76141: selection } } },
});

test("the actual setter follows primary, backup and two-setter rules", () => {
  const lineup = ["5", "1", "2", "8", "4", "6"];
  assert.deepEqual(
    rotationSetter(lineup, { setters: ["5", "8"], system: "back-row" }),
    { rotation: "S1", number: "5" },
  );
  assert.deepEqual(
    rotationSetter(lineup, { setters: ["5", "8"], system: "front-row" }),
    { rotation: "S4", number: "8" },
  );
  assert.deepEqual(
    rotationSetter(lineup, { setters: ["7"], fallbacks: ["8"] }),
    { rotation: "S4", number: "8" },
  );
  assert.deepEqual(
    rotationSetter(lineup, { setters: ["5"], fallbacks: ["8"] }),
    { rotation: "S1", number: "5" },
  );
  assert.deepEqual(rotationSetter(lineup, { setters: ["5", "8"] }), {
    rotation: "Unconfirmed",
    number: null,
  });
  assert.equal(
    rotationSetter(["5", 5, "2", "8", "4", "6"], { setters: ["5"] }).rotation,
    "Unconfirmed",
  );
});

test("substituted primary and backup setter splits exactly partition real rally totals", () => {
  const c = config({ setters: ["7"], fallbacks: ["14"] });
  const all = analyseTeam([real], "KSV.3", c, 3);
  const primary = analyseTeam([real], "KSV.3", c, 3, { setterId: pid("7") });
  const backup = analyseTeam([real], "KSV.3", c, 3, { setterId: pid("14") });
  assert.ok(primary.total.rallies > 0 && backup.total.rallies > 0);
  assert.equal(
    primary.total.rallies,
    real.sets[2].rallies.filter((r) => r.lineups.away.includes("7")).length,
  );
  for (const key of ["rallies", "serves", "serveWins", "received", "sideOuts"])
    assert.equal(primary.total[key] + backup.total[key], all.total[key]);
  for (let i = 0; i < 7; i++)
    for (const key of [
      "rallies",
      "pointsWon",
      "pointsLost",
      "serves",
      "serveWins",
      "received",
      "sideOuts",
    ]) {
      assert.equal(
        primary.rotation[i][key] + backup.rotation[i][key],
        all.rotation[i][key],
      );
    }
  assert.deepEqual(
    primary.serving,
    all.serving,
    "rotation filtering must not alter player serving stats",
  );
});

test("a player on court is excluded when someone else is the setter; ambiguous rallies remain all-only", () => {
  const c = config({ setters: ["10"], fallbacks: ["8"] });
  const backup = analyseTeam([real], "KSV.3", c, 1, { setterId: pid("8") });
  assert.equal(backup.total.rallies, 0);
  const ambiguous = config({ setters: ["10", "8"] });
  assert.equal(
    analyseTeam([real], "KSV.3", ambiguous, 1).rotation.at(-1).rallies,
    47,
  );
  for (const n of ["10", "8"])
    assert.equal(
      analyseTeam([real], "KSV.3", ambiguous, 1, { setterId: pid(n) }).total
        .rallies,
      0,
    );
  assert.equal(
    analyseTeam([real], "KSV.3", {}, null, { setterId: pid("10") }).total
      .rallies,
    0,
  );
});

test("two setters on court with a back-row rule partition the first set, without overlap", () => {
  const c = config({ setters: ["10", "1"], system: "back-row" });
  const a = analyseTeam([real], "KSV.3", c, 1, { setterId: pid("10") });
  const b = analyseTeam([real], "KSV.3", c, 1, { setterId: pid("1") });
  assert.ok(a.total.rallies > 0 && b.total.rallies > 0);
  assert.equal(a.total.rallies + b.total.rallies, 47);
  for (const r of [...a.rotation, ...b.rotation].filter((r) =>
    ["S2", "S3", "S4"].includes(r.rotation),
  ))
    assert.equal(r.rallies, 0);
});

test("set overrides and libero exclusions also apply to setter filters and the options list", () => {
  const c = config({
    setters: ["10", "15"],
    sets: { 1: { setters: ["8"] }, 2: { setters: [] } },
  });
  const first = analyseTeam([real], "KSV.3", c, null, { setterId: pid("8") });
  const main = analyseTeam([real], "KSV.3", c, null, { setterId: pid("10") });
  assert.equal(first.total.rallies, 47);
  assert.equal(main.total.rallies, 84);
  assert.deepEqual(
    listSetters([real], "KSV.3", c)
      .map((p) => p.id)
      .sort(),
    [pid("8"), pid("10")].sort(),
  );
});

test("history sorts dates, deduplicates match IDs and follows player identity across shirt changes", () => {
  const later = structuredClone(real);
  later.id = "80000";
  later.date = "2026-09-27";
  later.rosters.away.find((p) => p.number === "10").number = "22";
  for (const set of later.sets)
    for (const r of set.rallies) {
      r.lineups.away = r.lineups.away.map((n) => (n === "10" ? "22" : n));
      if (r.serving === "away" && r.server === "10") r.server = "22";
    }
  const c = config({ setters: ["10"] });
  c.teams["4125:KSV.3"].matches["80000"] = { setters: ["22"] };
  const history = matchHistory([later, real, real], "KSV.3", c, {
    playerId: pid("10"),
  });
  assert.deepEqual(
    history.map((r) => r.matchId),
    ["76141", "80000"],
  );
  assert.deepEqual(
    history.map((r) => r.numbers),
    [["10"], ["22"]],
  );
  assert.equal(history[0].result, "3-1");
  assert.equal(history[0].opponent, "VLI.2");
  assert.deepEqual(listSetters([later, real], "KSV.3", c)[0].numbers, [
    "10",
    "22",
  ]);
  const rotation = matchHistory([later, real], "KSV.3", c, {
    rotation: "S1",
    setterId: pid("10"),
  });
  assert.equal(rotation.length, 2);
  const pooled = analyseTeam([later, real], "KSV.3", c).serving.find(
    (p) => p.id === pid("10"),
  );
  assert.equal(
    history.reduce((sum, r) => sum + r.serves, 0),
    pooled.serves,
  );
  assert.equal(
    history.reduce((sum, r) => sum + r.sets, 0),
    pooled.sets,
  );
});

test("participating players with zero serves stay in history; bench-only players and empty rotations do not", () => {
  const brief = structuredClone(real);
  brief.sets = [
    {
      number: 1,
      score: [0, 1],
      rallies: [
        {
          serving: "home",
          server: "3",
          winner: "away",
          lineups: {
            home: ["3", "4", "6", "13", "15", "22"],
            away: ["10", "11", "4", "1", "14", "8"],
          },
        },
      ],
    },
  ];
  brief.score = "0-1";
  const rows = matchHistory([brief], "KSV.3", {}, { playerId: pid("10") });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].sets, 1);
  assert.equal(rows[0].serves, 0);
  assert.equal(rows[0].firstRallyWinPct, null);
  assert.equal(
    matchHistory([brief], "KSV.3", {}, { playerId: pid("6") }).length,
    0,
  );
  assert.equal(
    matchHistory([brief], "KSV.3", {}, { rotation: "S1" }).length,
    0,
  );
  assert.equal(
    matchHistory([brief], "KSV.3", {}, { rotation: "Unconfirmed" })[0].rallies,
    1,
  );
  assert.equal(
    matchHistory([real], "KSV.3", {}, { playerId: pid("10"), setFilter: 5 })
      .length,
    0,
  );
});

test("unselected setter spells break receiving loss runs instead of joining them", () => {
  const copy = structuredClone(real);
  const rally = (active) => ({
    serving: "home",
    server: "3",
    winner: "home",
    lineups: {
      home: ["3", "4", "6", "13", "15", "22"],
      away: [active, "11", "4", "1", "14", "8"],
    },
  });
  copy.sets = [
    {
      number: 1,
      score: [5, 0],
      rallies: [rally("10"), rally("10"), rally("6"), rally("10"), rally("10")],
    },
  ];
  copy.score = "1-0";
  const c = config({ setters: ["10", "6"] });
  const report = analyseTeam([copy], "KSV.3", c, null, { setterId: pid("10") });
  assert.equal(report.rotation[0].rallies, 4);
  assert.equal(report.rotation[0].longestReceivingRun, 2);
  assert.equal(report.rotation[0].receivingStalls, 0);
});

test("charts keep null gaps, negative net scores and single-match points without inventing a trend", () => {
  const rows = [20, null, 40].map((value, i) => ({
    matchId: String(i + 1),
    date: "2026-09-20",
    opponent: "<team>",
    firstRallyWinPct: value,
    firstRalliesWon: 2,
    servingTurns: 10,
  }));
  const svg = progressChart(rows, PLAYER_METRICS[0]);
  assert.equal((svg.match(/class="a-chart-point"/g) || []).length, 2);
  const path = svg.match(/<path[^>]+d="([^"]+)"/)[1];
  assert.equal((path.match(/M/g) || []).length, 2);
  assert.ok(!path.includes("L"));
  assert.ok(svg.includes("&lt;team&gt;"));
  assert.ok(!svg.includes("NaN"));
  const one = progressChart([rows[0]], PLAYER_METRICS[0]);
  assert.ok(one.includes('cx="395"'));
  assert.ok(
    progressChart(
      [
        {
          ...rows[0],
          netPointsPer100: -30,
          pointsWon: 7,
          pointsLost: 13,
          rallies: 20,
        },
      ],
      ROTATION_METRICS[2],
    ).includes("-30.0"),
  );
  assert.match(progressChart([rows[1]], PLAYER_METRICS[0]), /No observations/);
});
