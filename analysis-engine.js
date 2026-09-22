/** Shared by the browser and Node. Rates use pooled counts, never averages of percentages. */
export const ROTATIONS = ["S1", "S2", "S3", "S4", "S5", "S6", "Unconfirmed"];
export const percentage = (n, d) => (d ? (100 * n) / d : null);
export const teamKey = (leagueId, team) => `${leagueId}:${team}`;
export function rotationSetter(lineup, selection = {}) {
  const unknown = { rotation: "Unconfirmed", number: null };
  if (
    !Array.isArray(lineup) ||
    lineup.length !== 6 ||
    new Set(lineup.map(String)).size !== 6
  )
    return unknown;
  if (Array.isArray(selection)) selection = { setters: selection };
  const candidates = (numbers) =>
    lineup
      .map((p, i) => (numbers?.map(String).includes(String(p)) ? i + 1 : null))
      .filter(Boolean);
  let positions = candidates(selection.setters);
  if (!positions.length) positions = candidates(selection.fallbacks);
  if (positions.length > 1 && selection.system === "back-row")
    positions = positions.filter((p) => [1, 5, 6].includes(p));
  if (positions.length > 1 && selection.system === "front-row")
    positions = positions.filter((p) => [2, 3, 4].includes(p));
  return positions.length === 1
    ? { rotation: `S${positions[0]}`, number: String(lineup[positions[0] - 1]) }
    : unknown;
}
export function rotationLabel(lineup, selection = {}) {
  return rotationSetter(lineup, selection).rotation;
}
const emptyRotation = (rotation) => ({
  rotation,
  rallies: 0,
  pointsWon: 0,
  pointsLost: 0,
  serves: 0,
  serveWins: 0,
  received: 0,
  sideOuts: 0,
  longestReceivingRun: 0,
  receivingStalls: 0,
});
const emptyPlayer = (p) => ({
  id: p.id,
  name: p.name,
  numbers: new Set(),
  matches: new Set(),
  sets: new Set(),
  serves: 0,
  serveWins: 0,
  servingTurns: 0,
  firstRalliesWon: 0,
  zeroPointTurns: 0,
  onePointTurns: 0,
  twoPointTurns: 0,
  threeToFourPointTurns: 0,
  fivePlusPointTurns: 0,
  threePlusRuns: 0,
  bestPointRun: 0,
  setEndingTurns: 0,
});

export function validateMatch(match) {
  if (
    match?.schemaVersion !== 1 ||
    !match.id ||
    !match.home ||
    !match.away ||
    !match.sets?.length
  )
    throw new Error("Invalid match format.");
  const wins = [0, 0];
  for (const set of match.sets) {
    const score = [0, 0];
    let prior = null;
    for (const r of set.rallies || []) {
      if (
        !["home", "away"].includes(r.serving) ||
        !["home", "away"].includes(r.winner)
      )
        throw new Error("Invalid rally side.");
      if (prior && r.serving !== prior.winner)
        throw new Error("Serving does not follow the previous point.");
      if (
        r.lineups?.[r.serving] &&
        String(r.lineups[r.serving][0]) !== String(r.server)
      )
        throw new Error("Server does not occupy position 1.");
      if (
        !match.rosters?.[r.serving]?.some(
          (p) => String(p.number) === String(r.server),
        )
      )
        throw new Error("Unknown server.");
      score[r.winner === "home" ? 0 : 1]++;
      prior = r;
    }
    if (JSON.stringify(score) !== JSON.stringify(set.score))
      throw new Error("Rally totals differ from the set score.");
    wins[score[0] > score[1] ? 0 : 1]++;
  }
  if (wins.join("-") !== match.score)
    throw new Error("Set totals differ from the match score.");
  return true;
}

export function analyseTeam(
  matches,
  team,
  config = {},
  setFilter = null,
  { setterId = null } = {},
) {
  const players = new Map(),
    buckets = new Map(ROTATIONS.map((label) => [label, emptyRotation(label)]));
  const seen = new Set();
  let matchCount = 0,
    setCount = 0;
  const finishTurn = (turn, atSetEnd = false) => {
    if (!turn) return;
    const p = players.get(turn.id);
    p.servingTurns++;
    p.firstRalliesWon += Number(turn.firstWon);
    p.bestPointRun = Math.max(p.bestPointRun, turn.points);
    p.threePlusRuns += Number(turn.points >= 3);
    p.setEndingTurns += Number(atSetEnd && turn.lastWon);
    p[
      turn.points === 0
        ? "zeroPointTurns"
        : turn.points === 1
          ? "onePointTurns"
          : turn.points === 2
            ? "twoPointTurns"
            : turn.points < 5
              ? "threeToFourPointTurns"
              : "fivePlusPointTurns"
    ]++;
  };
  for (const match of matches) {
    if (seen.has(String(match.id)) || ![match.home, match.away].includes(team))
      continue;
    validateMatch(match);
    seen.add(String(match.id));
    matchCount++;
    const side = match.home === team ? "home" : "away";
    const setting =
      config.teams?.[teamKey(match.leagueId, team)]?.matches?.[match.id] || {};
    const roster = new Map(
      match.rosters[side].map((p) => [String(p.number), p]),
    );
    for (const set of match.sets) {
      if (setFilter && set.number !== +setFilter) continue;
      setCount++;
      let turn = null,
        receivingRun = 0,
        runLabel = null;
      const chosen = setting.sets?.[set.number] || setting;
      const eligible = {
        ...chosen,
        setters: chosen.setters?.filter((n) => !roster.get(String(n))?.libero),
        fallbacks: chosen.fallbacks?.filter(
          (n) => !roster.get(String(n))?.libero,
        ),
      };
      const finishReceive = () => {
        if (runLabel) {
          const b = buckets.get(runLabel);
          b.longestReceivingRun = Math.max(b.longestReceivingRun, receivingRun);
          b.receivingStalls += Number(receivingRun >= 3);
        }
        receivingRun = 0;
        runLabel = null;
      };
      for (const r of set.rallies) {
        for (const shirt of r.lineups?.[side] || []) {
          const p = roster.get(String(shirt));
          if (!p) continue;
          if (!players.has(p.id)) players.set(p.id, emptyPlayer(p));
          const row = players.get(p.id);
          row.numbers.add(p.number);
          row.matches.add(String(match.id));
          row.sets.add(`${match.id}:${set.number}`);
        }
        const active = rotationSetter(r.lineups?.[side], eligible),
          label = active.rotation,
          includeRotation =
            !setterId ||
            (active.number !== null &&
              roster.get(active.number)?.id === setterId),
          b = buckets.get(label),
          won = r.winner === side,
          serving = r.serving === side;
        if (includeRotation) {
          b.rallies++;
          b[won ? "pointsWon" : "pointsLost"]++;
        } else finishReceive();
        if (serving) {
          finishReceive();
          if (includeRotation) {
            b.serves++;
            b.serveWins += Number(won);
          }
          const p = roster.get(String(r.server));
          if (!players.has(p.id)) players.set(p.id, emptyPlayer(p));
          const row = players.get(p.id);
          row.serves++;
          row.serveWins += Number(won);
          row.numbers.add(p.number);
          row.matches.add(String(match.id));
          row.sets.add(`${match.id}:${set.number}`);
          if (!turn || turn.id !== p.id) {
            finishTurn(turn);
            turn = { id: p.id, firstWon: won, points: 0, lastWon: won };
          }
          turn.points += Number(won);
          turn.lastWon = won;
          if (!won) {
            finishTurn(turn);
            turn = null;
          }
        } else {
          finishTurn(turn);
          turn = null;
          if (includeRotation) {
            b.received++;
            b.sideOuts += Number(won);
            if (runLabel !== label) {
              finishReceive();
              runLabel = label;
            }
            if (!won) receivingRun++;
            else finishReceive();
          }
        }
      }
      finishTurn(turn, true);
      finishReceive();
    }
  }
  const serving = [...players.values()]
    .map((p) => ({
      ...p,
      numbers: [...p.numbers].sort((a, b) => +a - +b),
      matches: p.matches.size,
      sets: p.sets.size,
      firstRallyWinPct: percentage(p.firstRalliesWon, p.servingTurns),
      threePlusRunPct: percentage(p.threePlusRuns, p.servingTurns),
      serveWinPct: percentage(p.serveWins, p.serves),
      servesPerSet: p.sets.size ? p.serves / p.sets.size : null,
      pointsPerTurn: p.servingTurns ? p.serveWins / p.servingTurns : null,
    }))
    .sort(
      (a, b) => b.servingTurns - a.servingTurns || a.name.localeCompare(b.name),
    );
  const rotation = [...buckets.values()].map((b) => ({
    ...b,
    netPointsPer100: b.rallies
      ? (100 * (b.pointsWon - b.pointsLost)) / b.rallies
      : null,
    serveWinPct: percentage(b.serveWins, b.serves),
    sideOutPct: percentage(b.sideOuts, b.received),
  }));
  const total = rotation.reduce(
    (a, b) => ({
      rallies: a.rallies + b.rallies,
      serves: a.serves + b.serves,
      serveWins: a.serveWins + b.serveWins,
      received: a.received + b.received,
      sideOuts: a.sideOuts + b.sideOuts,
    }),
    { rallies: 0, serves: 0, serveWins: 0, received: 0, sideOuts: 0 },
  );
  return {
    team,
    matchCount,
    setCount,
    serving,
    rotation,
    total,
    confirmedPct: percentage(
      total.rallies - buckets.get("Unconfirmed").rallies,
      total.rallies,
    ),
  };
}

/** Configured setters and backups, matched by stable player ID across games. */
export function listSetters(matches, team, config = {}) {
  const result = new Map();
  for (const match of matches) {
    if (![match.home, match.away].includes(team)) continue;
    const side = match.home === team ? "home" : "away";
    const selection =
      config.teams?.[teamKey(match.leagueId, team)]?.matches?.[match.id] || {};
    for (const set of match.sets) {
      const chosen = selection.sets?.[set.number] || selection;
      const numbers = new Set(
        [...(chosen.setters || []), ...(chosen.fallbacks || [])].map(String),
      );
      for (const player of match.rosters[side]) {
        if (player.libero || !numbers.has(String(player.number))) continue;
        if (!result.has(player.id))
          result.set(player.id, {
            id: player.id,
            name: player.name,
            numbers: new Set(),
          });
        result.get(player.id).numbers.add(String(player.number));
      }
    }
  }
  return [...result.values()]
    .map((p) => ({ ...p, numbers: [...p.numbers].sort((a, b) => +a - +b) }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** One chronological row per observed match; bench-only roster entries are omitted. */
export function matchHistory(
  matches,
  team,
  config,
  { playerId = null, rotation = null, setterId = null, setFilter = null } = {},
) {
  if (Boolean(playerId) === Boolean(rotation))
    throw new Error("Choose a player or a rotation.");
  const seen = new Set(),
    rows = [];
  for (const match of matches) {
    if (seen.has(String(match.id)) || ![match.home, match.away].includes(team))
      continue;
    seen.add(String(match.id));
    const report = analyseTeam([match], team, config, setFilter, {
      setterId: playerId ? null : setterId,
    });
    const row = playerId
      ? report.serving.find((p) => p.id === playerId)
      : report.rotation.find((r) => r.rotation === rotation);
    if (!row || (playerId ? !row.sets : !row.rallies)) continue;
    const home = match.home === team;
    rows.push({
      ...row,
      matchId: String(match.id),
      date: match.date || "",
      opponent: home ? match.away : match.home,
      venueSide: home ? "Home" : "Away",
      result: home ? match.score : match.score.split("-").reverse().join("-"),
      matchUrl: match.source?.matchUrl || match.matchUrl || "",
    });
  }
  return rows.sort(
    (a, b) =>
      (a.date || "9999").localeCompare(b.date || "9999") ||
      a.matchId.localeCompare(b.matchId, undefined, { numeric: true }),
  );
}

export function validateConfig(value) {
  if (
    !value ||
    value.version !== 1 ||
    !value.teams ||
    typeof value.teams !== "object" ||
    Array.isArray(value.teams)
  )
    throw new Error("Expected a version 1 setter configuration.");
  const clean = { version: 1, teams: {} };
  const selection = (s) => {
    const out = {
      system: s.system || "single",
      setters: s.setters || [],
      fallbacks: s.fallbacks || [],
    };
    if (!["single", "back-row", "front-row"].includes(out.system))
      throw new Error("Unknown setter system.");
    for (const key of ["setters", "fallbacks"]) {
      if (
        !Array.isArray(out[key]) ||
        out[key].length > 20 ||
        out[key].some((n) => !/^\d{1,2}$/.test(String(n)))
      )
        throw new Error("Setters must be shirt numbers.");
      out[key] = [...new Set(out[key].map(String))];
    }
    return out;
  };
  for (const [key, t] of Object.entries(value.teams)) {
    if (
      !/^\d+:.{1,150}$/.test(key) ||
      !t?.matches ||
      typeof t.matches !== "object"
    )
      throw new Error("Invalid team configuration.");
    clean.teams[key] = { matches: {} };
    for (const [id, s] of Object.entries(t.matches)) {
      if (!/^\d+$/.test(id)) throw new Error("Invalid match ID.");
      const out = selection(s);
      if (s.sets) {
        out.sets = {};
        for (const [n, x] of Object.entries(s.sets)) {
          if (!/^[1-5]$/.test(n)) throw new Error("Invalid set number.");
          out.sets[n] = selection(x);
        }
      }
      clean.teams[key].matches[id] = out;
    }
  }
  return clean;
}
