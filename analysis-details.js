import { analyseTeam, matchHistory } from "./analysis-engine.js";

const esc = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const number = (value, unit = "", decimals = 1) =>
  value == null ? "—" : `${Number(value).toFixed(decimals)}${unit}`;

export const PLAYER_METRICS = [
  {
    key: "firstRallyWinPct",
    label: "First-rally win %",
    unit: "%",
    min: 0,
    max: 100,
    sample: (r) => `${r.firstRalliesWon}/${r.servingTurns} first rallies won`,
  },
  {
    key: "pointsPerTurn",
    label: "Points / serving turn",
    sample: (r) => `${r.serveWins} points in ${r.servingTurns} turns`,
  },
  {
    key: "serveWinPct",
    label: "Serve win %",
    unit: "%",
    min: 0,
    max: 100,
    sample: (r) => `${r.serveWins}/${r.serves} served rallies won`,
  },
  {
    key: "servesPerSet",
    label: "Serves / set",
    sample: (r) => `${r.serves} serves in ${r.sets} sets`,
  },
  {
    key: "serves",
    label: "Serves",
    decimals: 0,
    sample: (r) => `${r.sets} sets played`,
  },
  {
    key: "bestPointRun",
    label: "Best point run",
    decimals: 0,
    sample: (r) => `${r.servingTurns} serving turns`,
  },
];
export const ROTATION_METRICS = [
  {
    key: "sideOutPct",
    label: "Side-out %",
    unit: "%",
    min: 0,
    max: 100,
    sample: (r) => `${r.sideOuts}/${r.received} receiving rallies won`,
  },
  {
    key: "serveWinPct",
    label: "Serve win %",
    unit: "%",
    min: 0,
    max: 100,
    sample: (r) => `${r.serveWins}/${r.serves} served rallies won`,
  },
  {
    key: "netPointsPer100",
    label: "Net points / 100",
    min: -100,
    max: 100,
    sample: (r) =>
      `${r.pointsWon} won, ${r.pointsLost} lost in ${r.rallies} rallies`,
  },
  {
    key: "longestReceivingRun",
    label: "Longest receiving loss run",
    decimals: 0,
    sample: (r) => `${r.received} receiving rallies; lower is better`,
  },
  {
    key: "rallies",
    label: "Rallies",
    decimals: 0,
    sample: (r) => `${r.serves} serving + ${r.received} receiving`,
  },
];

/** Null rates stay gaps. Matches use chronological, evenly spaced positions. */
export function progressChart(rows, metric) {
  const values = rows.map((r) => r[metric.key]);
  if (!values.some((v) => typeof v === "number" && Number.isFinite(v))) {
    return '<div class="a-empty a-chart-empty">No observations for this metric. A match with no serves or receptions is not counted as 0%.</div>';
  }
  const left = 60,
    right = 730,
    top = 25,
    bottom = 225;
  const low = metric.min ?? 0,
    high =
      metric.max ??
      Math.max(
        1,
        Math.ceil(
          Math.max(
            ...values.filter(
              (v) => typeof v === "number" && Number.isFinite(v),
            ),
          ),
        ),
      );
  const x = (i) =>
    rows.length === 1
      ? (left + right) / 2
      : left + (i * (right - left)) / (rows.length - 1);
  const y = (v) => bottom - ((v - low) * (bottom - top)) / (high - low);
  let drawing = false;
  const path = values
    .map((v, i) => {
      if (v == null || !Number.isFinite(v)) {
        drawing = false;
        return "";
      }
      const segment = `${drawing ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`;
      drawing = true;
      return segment;
    })
    .join(" ");
  const ticks = Array.from(
    { length: 5 },
    (_, i) => low + ((high - low) * i) / 4,
  );
  const tickStep = Math.max(1, Math.ceil((rows.length - 1) / 6));
  return `<svg class="a-progress-chart" viewBox="0 0 770 295" role="img" aria-label="${esc(metric.label)} by match, oldest to newest. Exact values and sample sizes are in the match table below.">
    <title>${esc(metric.label)} · match-by-match</title>
    <desc>Each point is one match, evenly spaced in chronological order. Missing rates are gaps, not zeroes.</desc>
    ${ticks.map((v) => `<line class="a-chart-grid ${v === 0 ? "a-chart-zero" : ""}" x1="${left}" x2="${right}" y1="${y(v)}" y2="${y(v)}"/><text class="a-chart-label" x="${left - 10}" y="${y(v) + 4}" text-anchor="end">${esc(number(v, metric.unit || "", metric.decimals === 0 && Number.isInteger(v) ? 0 : 1))}</text>`).join("")}
    <path class="a-chart-line" d="${path}" fill="none"/>
    ${rows
      .map((row, i) => {
        const v = values[i];
        const label = `${row.date || "Undated"} · ${row.opponent} · match ${row.matchId}: ${number(v, metric.unit || "", metric.decimals ?? 1)}; ${metric.sample(row)}`;
        return `${v == null || !Number.isFinite(v) ? "" : `<circle class="a-chart-point" cx="${x(i)}" cy="${y(v)}" r="5" tabindex="0" data-point="${i}" aria-label="${esc(label)}"><title>${esc(label)}</title></circle>`}${i % tickStep === 0 || i === rows.length - 1 ? `<text class="a-chart-label" x="${x(i)}" y="250" text-anchor="middle">${esc(row.date ? row.date.slice(5) : "Undated")}</text><text class="a-chart-label a-chart-match-id" x="${x(i)}" y="267" text-anchor="middle">#${esc(row.matchId)}</text>` : ""}`;
      })
      .join("")}
    <text class="a-chart-label" x="395" y="289" text-anchor="middle">Match order · oldest → newest</text>
  </svg>`;
}

export function openAnalysisDetail({
  root,
  type,
  id,
  team,
  matches,
  currentMatches,
  setFilter,
  config,
  setterId,
  setterName,
  opener,
  table,
  serveColumns,
  rotationColumns,
  download,
  csv,
}) {
  root.querySelector("#a-detail")?.remove();
  const player = type === "player";
  const metrics = player ? PLAYER_METRICS : ROTATION_METRICS;
  let metricKey = metrics[0].key,
    scope = "all";
  const dialog = document.createElement("dialog");
  dialog.id = "a-detail";
  dialog.className = "a-detail";
  dialog.setAttribute("aria-labelledby", "a-detail-title");
  root.appendChild(dialog);
  const close = () => {
    if (typeof dialog.close === "function") dialog.close();
    dialog.remove();
    if (opener?.isConnected) opener.focus();
  };
  dialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    close();
  });
  dialog.addEventListener("click", (event) => {
    const rect = dialog.getBoundingClientRect();
    if (
      event.target === dialog &&
      (event.clientX < rect.left ||
        event.clientX > rect.right ||
        event.clientY < rect.top ||
        event.clientY > rect.bottom)
    )
      close();
  });
  // Also supports DOM test environments without native dialog methods.
  dialog.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      close();
    }
  });
  function render(focusId) {
    const useMatches = scope === "all" ? matches : currentMatches;
    const useSet = scope === "all" ? null : setFilter;
    const options = player
      ? { playerId: id, setFilter: useSet }
      : { rotation: id, setterId, setFilter: useSet };
    const rows = matchHistory(useMatches, team, config, options);
    const aggregate = analyseTeam(useMatches, team, config, useSet, {
      setterId: player ? null : setterId,
    });
    const total = player
      ? aggregate.serving.find((p) => p.id === id)
      : aggregate.rotation.find((r) => r.rotation === id);
    const knownPlayer = player
      ? matches
          .flatMap((m) => m.rosters[m.home === team ? "home" : "away"] || [])
          .find((p) => p.id === id)
      : null;
    const title = player ? knownPlayer?.name || "Player" : `${id} · rotation`;
    const metric = metrics.find((m) => m.key === metricKey);
    const columns = [
      ["date", "Date"],
      ["opponent", "Opponent"],
      ["matchId", "Match ID"],
      ["venueSide", "Venue"],
      ["result", "Result (our team first)"],
      ...(player
        ? serveColumns.filter(([key]) => !["name", "matches"].includes(key))
        : rotationColumns
            .filter(([key]) => key !== "rotation")
            .concat([["longestReceivingRun", "Longest receiving loss run"]])),
    ];
    const cards = player
      ? [
          ["Matches played", rows.length],
          ["Sets played", total?.sets || 0],
          ["Serving turns", total?.servingTurns || 0],
          ["First-rally win", number(total?.firstRallyWinPct, "%")],
        ]
      : [
          ["Matches observed", rows.length],
          ["Rallies", total?.rallies || 0],
          ["Side-out rate", number(total?.sideOutPct, "%")],
          ["Net points / 100", number(total?.netPointsPer100)],
        ];
    dialog.innerHTML = `<div class="a-detail-head"><div><p class="a-eyebrow">${player ? "PLAYER SPOTLIGHT" : "ROTATION SPOTLIGHT"}</p><h2 id="a-detail-title">${esc(title)}</h2><p>${esc(team)}${player ? "" : ` · ${esc(setterName || "All setters")}`}</p></div><button id="a-detail-close" aria-label="Close analysis">Close ×</button></div>
      <div class="a-toolbar a-detail-controls"><label>Match scope <select id="a-detail-scope"><option value="all" ${scope === "all" ? "selected" : ""}>All available matches</option><option value="current" ${scope === "current" ? "selected" : ""}>Current match / set selection</option></select></label><button id="a-detail-csv" class="a-small">Download match history CSV ↓</button></div>
      <p class="a-note">${scope === "all" ? "All available matches for this team in the selected league, all sets. The main match/set filter does not limit this view." : `Uses the main page’s match selection${setFilter ? `, set ${esc(setFilter)}` : ", all sets"}.`}${player ? " Only observed appearances are included; bench-only roster entries are omitted." : setterId ? " Only rallies attributed to this setter are included; ambiguous rallies are excluded." : " Each match is included only if this rotation has recorded rallies."}</p>
      <div class="a-metrics">${cards.map(([label, value]) => `<div class="a-metric"><span>${esc(label)}</span><strong>${esc(value)}</strong></div>`).join("")}</div>
      <section class="a-detail-chart"><div class="a-card-head"><div><h3>Match by match.</h3><p>${player ? "Serving progress, with playing time in view." : "Follow this rotation through the season."}</p></div><label>Chart metric <select id="a-detail-metric">${metrics.map((m) => `<option value="${m.key}" ${m.key === metricKey ? "selected" : ""}>${esc(m.label)}</option>`).join("")}</select></label></div>${progressChart(rows, metric)}<p id="a-chart-point-note" class="a-note" aria-live="polite">Hover, tap or focus a point to see its match and sample size.</p><p class="a-note">${rows.length === 1 ? "One recorded match: more games are needed to show a trend. " : ""}Match-to-match variation also reflects opponents and lineups. Rates use the actual attempts; summary percentages pool those attempts. ${metric.key === "longestReceivingRun" ? "For this metric, lower is better." : ""}</p></section>
      <section><div class="a-card-head"><div><h3>Every appearance.</h3><p>Oldest first. Scroll across for the full statistics.</p></div></div>${rows.length ? table(rows, columns, player ? "Player match history" : "Rotation match history") : '<div class="a-empty">No recorded appearances in this selection.</div>'}</section>`;
    dialog.querySelector("#a-detail-close").onclick = close;
    dialog.querySelector("#a-detail-scope").onchange = (event) => {
      scope = event.target.value;
      render("a-detail-scope");
    };
    dialog.querySelector("#a-detail-metric").onchange = (event) => {
      metricKey = event.target.value;
      render("a-detail-metric");
    };
    dialog.querySelector("#a-detail-csv").onclick = () =>
      download(
        `${team}-${player ? "player" : "rotation"}-${id}${!player && setterId ? "-setter-" + setterId : ""}-${scope}-history.csv`,
        csv(rows, columns),
        "text/csv;charset=utf-8",
      );
    dialog.querySelectorAll("[data-point]").forEach((point) => {
      const show = () => {
        const index = +point.dataset.point,
          row = rows[index];
        dialog.querySelector("#a-chart-point-note").textContent =
          `${row.date || "Undated"} · ${row.opponent} · match ${row.matchId}: ${number(row[metric.key], metric.unit || "", metric.decimals ?? 1)} · ${metric.sample(row)}`;
        dialog
          .querySelectorAll(".a-table tbody tr")
          .forEach((tr, i) =>
            tr.classList.toggle("a-highlight-row", i === index),
          );
      };
      point.addEventListener("pointerenter", show);
      point.addEventListener("focus", show);
      point.addEventListener("click", show);
    });
    if (focusId) dialog.querySelector(`#${focusId}`)?.focus();
  }
  render();
  if (typeof dialog.showModal === "function") dialog.showModal();
  else dialog.setAttribute("open", "");
  dialog.querySelector("#a-detail-close").focus();
  return dialog;
}
