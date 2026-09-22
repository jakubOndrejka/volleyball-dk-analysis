# Player and rotation match history

Updated 22 September 2026, 21:06 UTC.

## Use it

- Click a **player's name** in the serving table to open their analysis.
- Click **S1–S6 or Unconfirmed** in the rotation table, or a rotation card, to open its analysis.
- Each detail window contains summary totals, a progress chart, a chronological match table and a **Download match history CSV** button.
- Change **Chart metric** to explore a different rate or count. Hover, tap or focus a chart point to see the exact match and sample size; its table row is highlighted.
- Details default to **All available matches** for the current team and league, with all sets included. Choose **Current match / set selection** to use the filters from the main page instead.
- Close with **Close ×**, Escape, or a click outside the window. Keyboard focus returns to the player/rotation button.

## Setter dropdown

The rotation section has a **Setter** dropdown. **All setters** includes the team's confirmed rotations and Unconfirmed rallies. Selecting a named setter limits the rotation table, rotation cards, weakest-rotation comparison, rotation detail view and rotation CSV to rallies attributed to that player.

The player serving table and team overview remain team-wide within the main match/set selection. A note beside the rotation filter states its scope and rally count.

Setter choices come from **Who was setting?**, including Google shared choices, match-level settings, set overrides and configured backups. A player appears in the dropdown once by their existing stable player ID, even if their shirt number changes across games. The option lists the numbers they used when configured as setter or backup.

The filter identifies the active setter for each rally:

1. Start with selected primary setters in the six rotation slots.
2. Use backups only if no selected primary setter is in those slots.
3. If two candidates remain, apply the configured back-row (6–2) or front-row (4–2) rule.
4. If exactly one candidate remains, attribute that rally to them and their position before the rally. Otherwise keep it Unconfirmed.

Being present on court is not enough to count a rally under a particular setter. Unconfirmed rallies are excluded from every specific setter filter. Filtered receiving-loss runs stop when the selected setter stops being the identified setter; unrelated spells are not joined together.

## Reading progress fairly

Player charts offer first-rally win %, points per serving turn, serve win %, serves per set, total serves and best point run. Rotation charts offer side-out %, serve win %, net points per 100, longest receiving loss run and rally count.

Each point represents one match, in chronological order. Horizontal spacing is by match order, not elapsed days. Match IDs distinguish two games on the same date. There is no smoothing or invented trend. With one match, the page explicitly says more games are needed to show a trend.

Rates with no attempts are shown as a dash and a gap in the chart, never as 0%. A player who appears in a regular lineup but serves zero times still gets a match row. A roster entry with no observed appearance is omitted. Rotation histories include matches with at least one relevant rally; a rotation that never occurs does not get a fabricated zero-performance match.

Summary percentages pool the underlying attempts across the chosen matches. They are not averages of match percentages. Opponents, lineups and sample sizes can explain changes; a higher line alone does not establish improvement caused by training or a setter.

The existing PDF limitations still apply: libero exchanges are absent, so this cannot infer every libero appearance, reception quality, aces or individual serve errors. Unsupported or unavailable scoresheets are omitted from the sample. “All available matches” does not mean all matches played if PDFs are missing.

## Update files

| File | Change |
| --- | --- |
| `analysis-engine.js` | Identifies the active setter, filters rotation rallies, lists setters and builds match histories. |
| `analysis-panel.js` | Clickable names and rotations; setter dropdown. |
| `analysis-details.js` | Detail windows, charts, scope controls and history CSVs. |
| `analysis.css` | Detail-window, chart, mobile and focus styling. |
| `scripts/build-site.js` | Includes the new module in GitHub Pages output. |
| `tests/detail-analysis.test.js` | Calculations, substitutions, identity changes, histories and chart edge cases. |
| `tests/detail-interface.test.js` | Clicks, filters, chart controls, scopes, exports and keyboard close. |

No additional package, external chart service, Google Sheet column or Apps Script change is required. `shared-coaches-config.json` must retain your existing deployment URL.
