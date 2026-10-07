# Season setters, playing time and libero analysis

Update prepared 7 October 2026. Built against jakubOndrejka/volleyball-dk-analysis, commit 6f9884f. This extends the existing results page and analysis; it does not require a new paid service or coach accounts.

## Install into your existing project

1. Unzip the update. Upload the contents of **github-files/** into the root of your existing GitHub repository, preserving the subfolders and replacing matching files. Do not upload the github-files folder itself. The update does not include or replace your endpoint configuration, match data, league settings or workflow.
2. Commit the files to your publishing branch. The existing **Refresh and publish volleyball** workflow runs tests, refreshes data and publishes the site.
3. Open your existing Google Sheet → **Extensions → Apps Script**. Replace the contents of **Code.gs** with **github-files/apps-script/Code.gs** from this update. Save.
4. Choose **Deploy → Manage deployments**, select your existing web app, click the pencil/Edit button, choose **New version**, then **Deploy**. Saving the editor alone does not update the running web app. Keep the existing deployment URL. [Google's deployment instructions](https://developers.google.com/apps-script/concepts/deployments#edit_a_versioned_deployment).
5. Keep your current **COACH_PASSWORD**, **SPREADSHEET_ID**, Sheet tab, column headings and saved rows. No new Sheet, new endpoint, trigger or `setup()` run is required for an already-working installation.
6. Once GitHub deployment finishes, hard refresh the website, then click **Refresh shared choices**. The old-script upgrade notice should disappear. If it remains, check that a new version was deployed, not just saved.

The new frontend detects an old Google script and explains the upgrade before submitting season choices. If saving fails, the page does not claim that the change was shared. Live Google save/deploy actions have not been performed by this download; the Google service was tested with an in-memory harness.

## Use it

- Select the league/competition and team. Open **Who was setting? → Season defaults**. Select setters and backups, check the two-setter rule and service order, then **Save for all coaches**. Players are followed by their roster identity even when shirt numbers change. Defaults apply only to this team in the selected league ID; a new season/competition needs its own choices.
- For an exception, choose **Match / set override**, then the match and optionally one set. Save normally. Set overrides take priority over match overrides; match overrides take priority over season defaults.
- Existing match choices are kept. To make an old match follow the season, click **Use season defaults for this match**. This removes that match's set overrides too. **Leave this match Unconfirmed** deliberately prevents inheritance. At set level, **Use whole-match choices** removes just that set's override.
- **How do we start?** shows the setter's starting position and counts of sets starting on serve or receive. Expand **Every set** for the actual starts, scores and source of setter choices.
- **Who played where?** shows inferred roles, sets/matches involved and confirmed court rallies. Roles use service order: setter → outside → middle → opposite → outside → middle. Reverse outside/middle in settings if your team uses the opposite order. This is a formation inference, not an observation of every attack or defensive action.
- **With our liberos on court** lets you choose a named libero, all recorded liberos, confirmed no libero, or unknown presence. The table uses the same metrics as the setter rotation table. Click a rotation for a filtered match history and progress chart.

Court time is counted in rallies, not minutes. Regular-player role counts follow rotation slots, including libero replacements; the separate confirmed court count excludes those replacement rallies. ≥ marks a confirmed minimum where part of the history is unknown. Compare the sample sizes alongside the rates.

S1–S6 still means the setter's position before the rally. Libero presence can be known while the setter is Unconfirmed. Selecting a libero shows the team's results while that player was recorded on court; it does not rate passing technique or credit individual points.

## When libero data appears

The PDF collector processes at most 16 matches per run. Libero history for already-readable matches is now refreshed separately from public HTML, with up to 100 matches per run and three concurrent downloads. It does not wait for the PDF retry date or PDF batch limit. Unprocessed history is labelled **awaiting refresh**, separately from genuinely unknown source events. No extra Google setup is needed for match events. See [the libero refresh correction](LIBERO-REFRESH-FIX.md).

If you use the project locally, one match can be refreshed with:

```bash
npm ci
node collect-analysis.js --match=76192 --force
npm run analyze
npm run build
```

The event page may lack exchanges or contain contradictions. A complete matching point sequence is required before its exchanges are used. Missing initial presence stays unknown until an explicit entry/exit establishes it; contradictions return presence to unknown. The app never treats missing history as zero libero usage.

## Verification

The regression suite covers season identity matching across shirt-number changes, match/set precedence, explicit clears and inheritance, isolated Google records and stale-edit conflicts, fresh-browser persistence, set starts before receiving rotation, role inference and substitutions, libero event order, unknown-history handling, count reconciliation and filtered detail windows.

The collector was also run against the official PDFs and event page for [match 76192](https://resultater.volleyball.dk/tms/Turneringer-og-resultater/Kamp-Information.aspx?KampId=76192). All 116 rallies matched. The supplied record confirms KSV.3 with a libero for 90 rallies and without one for 26: #15 Lara Philine Buechler appears for 19 rallies in one set; #16 Mariana Villar appears for 71 rallies in two sets. Confirmed player court counts sum to 6 × 116. These describe recorded presence, not individual performance.

The existing serving metrics and totals are unchanged by adding libero presence. The sample data and tests do not set or publish your real season setter choices.
