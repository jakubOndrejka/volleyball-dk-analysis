# Volleyball Danmark — results + team analysis

The original standings and fixtures website from [sidiropoulos/volleyball-dk](https://github.com/sidiropoulos/volleyball-dk), extended with automatic PDF-based serving analysis and setter-based rotation analysis.

**Start with [START-HERE.md](START-HERE.md).** This is a complete project, including the original club logos, league navigation, standings, fixtures, language toggle and light/dark mode.

## What you get

- A **Team analysis** panel alongside Results. Select league, team, match and set, or combine all available matches in that league.
- Your requested serving table: serving turns, first rallies won, first-rally win %, zero-point turns, 1 / 2 / 3–4 / 5+ point bins, 3+ run %, and best point run.
- Additional playing-time context: sets, matches, serves, serve win %, serves per set and points per turn. Rates use pooled counts; percentages are not averaged across matches.
- Your requested rotation table: S1–S6 and **Unconfirmed**, rallies, points won/lost, net points per 100, serves/wins/%, received/side-outs/%.
- Per-match setters, backup setters, optional per-set overrides, and explicit back-row/front-row rules for teams using two setters.
- CSV downloads, local setter persistence, and configuration import/export for sharing.
- Optional shared coach editing through a Google Sheet and Apps Script: one coach code, no coach accounts, per-match saves and conflict checks. See [shared coach setup](docs/SHARED-COACHES.md).
- Clickable player and rotation names open match histories, progress charts and CSV downloads. Filter rotation analysis by the actual setter. See [player and rotation details](docs/PLAYER-ROTATION-DETAILS.md).
- Automatic discovery of published scorecard and roster PDF links on official result pages. No Kampskema API, AI service, API key or paid OCR service is needed.
- A GitHub Actions workflow that refreshes results, collects PDFs, validates them and publishes GitHub Pages.

No setter selection means **Unconfirmed** for every rally. Selecting two setters without a rule does not force a guessed rotation. The serving analysis remains available.

## Run locally

Use **Node.js 24+** and npm.

```bash
npm ci
npm run serve
```

Visit [the included KSV example](http://localhost:3000/?league=4125#analysis). Serve over HTTP; opening `index.html` directly cannot load its JSON files reliably.

The included results are a **22 September 2026 snapshot of the current 2026/27 leagues**, not the previous season discussed in the earlier analysis. All numerical examples in the app come from real published PDFs. Setter choices are deliberately empty. The original league's team name `KSV.3` is used for both a women's and a men's team in different leagues; configurations are separated by league ID.

## Commands

| Command | Purpose |
|---|---|
| `npm run serve` | Start the local website on port 3000; `PORT` can change it. |
| `npm run refresh` | Refresh standings/fixtures, collect scorecard PDFs, build saved reports. |
| `npm run scrape` | Update the original league results and fixtures, including official match IDs. |
| `npm run collect` | Discover and parse PDFs for due completed matches. |
| `node collect-analysis.js --match=76141 --force` | Recheck one known fixture immediately. |
| `node collect-analysis.js --match=76141 --force --cached` | Reparse its locally cached HTML/PDFs without contacting the source. |
| `npm run analyze` | Rebuild shared team reports using the published setter configuration. |
| `npm test` | Run deterministic calculation, PDF and interface tests. |
| `npm run build` | Copy only the website files into `dist/`. |

## What is where

| File / folder | What it does |
|---|---|
| `index.html` | Original results/standings application and navigation into analysis. |
| `analysis-panel.js`, `analysis.css` | Team analysis interface, filters, setter controls and downloads. |
| `analysis-details.js` | Player/rotation detail windows, per-match charts, scope selection and history downloads. |
| `analysis-engine.js` | Shared serving/rotation calculations and configuration validation, used by browser and Node. |
| `shared-coaches.js`, `shared-coaches-config.json` | Google shared-choice client and public web app URL. Never store the coach code here. |
| `apps-script/Code.gs` | Paste into the Sheet's Apps Script project. The coach code lives in private Script properties. |
| `scraper.js` | Original official league scraper, extended to preserve match IDs/links and handle source failures. |
| `collect-analysis.js` | PDF discovery, retry timing, parsing, validation and coverage status. |
| `lib/pdf-parser.js` | Reads PDF text coordinates and reconstructs individual rallies. |
| `lib/results-source.js` | Public source downloads, PDF link discovery and optional public point-history validation. |
| `build-analysis.js` | Generates team reports for integrations and inspection. |
| `project-config.json` | League IDs, best-of-three formats, optional team prefixes, retry timing and per-run collection limit. |
| `data/data-*.json` | Standings and fixtures from the original app. |
| `data/analysis/index.json` | Available matches and ready / queued / pending / review status. |
| `data/analysis/matches/` | Validated roster, lineup, substitution and rally data for each physical match. |
| `data/analysis/summary.json` | Reports using the committed, shared setter choices. |
| `data/analysis-config.json` | Legacy committed setter choices; fallback when a match has no Google record. |
| `logos/` | Original club logos, including KSV. |
| `tests/` | Calculation/UI tests and real PDF regression fixtures. |
| `.github/workflows/` | Scheduled refresh + Pages publishing and pull-request tests. |
| `docs/` | Metric definitions, validation notes and original README. |

The browser recalculates the tables immediately. With Google sharing enabled, shared matches take priority over old browser and committed choices. Coaches click **Save for all coaches**, without exporting or committing a file. Other open pages pick up changes with **Refresh shared choices**; newly opened pages load them automatically. Conflicting edits to the same team's match are rejected until the coach refreshes. Different teams and matches are independent.

Without a configured endpoint, the original browser-only and export workflow still works. The generated `data/analysis/summary.json` continues to use only committed `data/analysis-config.json`; it does not fetch Google choices. The website's displayed rotation tables do use Google choices. Read [shared coach setup](docs/SHARED-COACHES.md) for installation, migration and privacy limits.

## Publish on GitHub Pages

Follow [START-HERE.md](START-HERE.md). Use a new repository with **main** as the default branch, and select **GitHub Actions** as the Pages publishing source. The workflow deploys a Pages artifact directly in the same run that refreshes the data. It does not rely on a bot's data commit triggering a second deployment.

The workflow runs at minutes **17 and 47 of every hour, UTC**, and can be started manually. GitHub may delay scheduled runs. Schedules run from the default branch; GitHub can disable schedules in inactive public repositories after 60 days. See [GitHub's scheduling documentation](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule) and [Pages workflow documentation](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages).

Existing recent PDFs are checked again every 6 hours for corrections; older ones every 30 days. Failed or unpublished PDFs retry with a 1–24 hour backoff. At most 16 matches are parsed per run, so the first season import may take several runs. A late PDF can therefore appear after the next retry, rather than within 30 minutes. The status panel shows what was actually processed.

No personal access token is required. The workflow uses GitHub's repository-scoped `GITHUB_TOKEN`. Repository or organisation rules that block bot commits must be adjusted by the repository owner, or the data can be refreshed and committed locally instead. A protected branch that requires a pull request for every change will block automatic direct commits.

## Source and PDF support

The collector follows the **public PDF links displayed on each official match page**. Some public document URLs are hosted under `api.volleyball.dk/api/pdf/`; these are PDF downloads, not a dependency on an undocumented JSON service or the Kampskema app.

The parser supports the electronic, text-based, one-page landscape scoresheet template observed in the included real matches. It handles starting service order, substitutions and re-entry at score pairs, home/away changes, service endpoint grids, deuce, and the fifth-set change of ends. It obtains full player names and stable, hashed player identifiers from the companion roster PDF.

It is intentionally conservative:

- Scanned/handwritten PDFs, unsupported templates, unreadable cells and sanctions requiring point attribution are marked **review**. This version does not implement OCR or a manual scoresheet editor.
- A missing PDF or network failure is **pending**, with retries. Missing data is never presented as zero performance.
- Reconstructed scores must match the PDF and published match result. All observed serving endpoints must be accounted for. Players must match the roster. If the match page displays a complete point history, every reconstructed rally is compared against it.
- A changed sheet that fails validation is excluded. A temporary download failure can retain the previously validated report, with a visible refresh warning.
- PDFs omit libero exchanges. Rotation positions follow the six regular lineup slots; libero appearances cannot be counted. Select setters who remain in those regular rotation slots. A libero cannot be selected as setter in this version.
- The sheet records team outcomes during a server's turn. It cannot separate aces, service errors, passing quality or attacking performance.

Details: [metric definitions](docs/METRICS.md) and [validation notes](docs/VALIDATION.md).

## Change teams or season

The imported site includes the original nine league IDs. Change `leagueIds` in `project-config.json` to collect different pools, and update the corresponding `LEAGUES` labels/IDs in `index.html` so those pools appear in the navigation. A season's official pool and team IDs can change; do not infer the season from the club name alone. The `bestOfThreeLeagueIds` setting identifies pools needing two set wins rather than three; the imported mix pools use this setting. Only a completed set result is queued for analysis. An empty `trackedTeamPrefixes` array processes all teams in those pools. Set it to `["KSV"]` to collect only matches involving KSV teams and reduce downloads.

For a fresh season archive, use a separate repository or copy of the project. Match IDs prevent duplicate game imports, and setter configuration keys include both league and team, but the UI does not have a separate season picker.

## Attribution

Original application by **sidiropoulos**, imported from [sidiropoulos/volleyball-dk](https://github.com/sidiropoulos/volleyball-dk) at commit **e4dcbbcbf54832f8c79fe815ad679bdd8b8561ad**. Its original README is preserved in [docs/UPSTREAM-README.md](docs/UPSTREAM-README.md). This extension adds PDF analysis, setter configuration, tests and the publishing workflow. The upstream repository did not include a license file at that commit; no new license is asserted over its code or club logos. Results and scoresheet documents originate from Volleyball Danmark.
