# Libero history refresh correction

7 October 2026 · 10:34 CEST. Based on the deployed repository at e2115e0.

## What caused the screenshots

The new interface was already deployed, but most saved match JSON files had not been migrated. The first refresh attempted 16 PDF matches; 12 were still unreadable/pending, leaving just four newly enriched ready matches. This left both KSV.3 matches and one DTU match in the old format. The interface labelled all unprocessed history "unknown", which made a migration backlog look like a source failure or zero usage.

- KSV.3: 175 + 116 = 291 rallies had no saved libero fields yet.
- DTU Volley: its updated match had 125 rallies with a libero and 17 without. Its other 196 rallies still lacked the new fields.

## What this correction does

1. Adds an independent HTML-only migration for already-validated matches. It reads the public match event page and enriches existing rally records without downloading/reparsing their PDFs. Neither the 16-PDF batch limit nor a future PDF retry date blocks it.
2. Processes up to 100 eligible matches per run, with at most three simultaneous downloads. The optional project setting `maxLiberoMatchesPerRun` can lower this limit. Completed histories are skipped; incomplete histories or failed downloads retry after six hours.
3. Preserves a valid saved match if a history download fails. A failed migration does not mark a valid PDF as review or erase the existing rally data.
4. Distinguishes **awaiting refresh** from **unknown in source**, adds **Coverage by match**, and replaces an entirely unprocessed zero-filled table with a waiting message. Empty libero exports are disabled.

The completed-match, point, serving and setter calculations are unchanged. There is no Google Apps Script, Google Sheet, coach code or endpoint change.

## Verified counts for the two reported teams

| Team | Total rallies | With libero | Without libero | Unknown in source | Awaiting refresh |
|---|---:|---:|---:|---:|---:|
| KSV.3 | 291 | 221 | 66 | 4 | 0 |
| DTU Volley | 338 | 284 | 54 | 0 | 0 |

The **All recorded liberos** table includes only rallies with a recorded libero, so its correct count is 221 for KSV and 284 for DTU. The no-libero and unknown filters show the other groups. The groups together account for every rally.

KSV's four unknown rallies occur in set 1 against VLI.2 (match 76141), starting at the home-away score 14–11. The official log names #15 entering for #14 earlier, then #16 leaving for #14, without a matching switch between the two liberos. The interval remains unknown until a reliable new entry at 15–14. This correction does not guess away that inconsistency.

Official sources checked:
- https://resultater.volleyball.dk/tms/Turneringer-og-resultater/Kamp-Information.aspx?KampId=76141
- https://resultater.volleyball.dk/tms/Turneringer-og-resultater/Kamp-Information.aspx?KampId=76192
- https://resultater.volleyball.dk/tms/Turneringer-og-resultater/Kamp-Information.aspx?KampId=76143
- DTU match 76147 already had working tracking in the deployed data.

## Install

1. Extract the ZIP. Upload the contents of **github-files/** into your existing repository root, preserving the folders and replacing matching files. Upload its contents, not the github-files directory itself.
2. Commit. The existing **Refresh and publish volleyball** workflow will run the new migration and publish the update. If needed, open GitHub **Actions → Refresh and publish volleyball → Run workflow**.
3. After the deployment succeeds, hard refresh the website (Ctrl+Shift+R / Cmd+Shift+R). Select the league and team, then expand **Coverage by match** in the libero section.

The bundle includes refreshed data for matches 76141, 76143 and 76192, plus the correction and tests. It does not replace your analysis index, shared endpoint configuration or setter choices. The normal collector handles the other existing matches.

**You do not need to change anything in Google for this correction.** Keep the Apps Script version installed for season defaults.

## Validation

All 63 tests pass. New regressions reproduce the unprocessed KSV/DTU matches, migrate more than 16 matches despite future PDF dates/current parser tags, verify bounded continuation and concurrency, preserve data on network failure, exercise source-history retry timing and cached HTML, and check the pending/unknown interface states. Serving statistics before and after enrichment are identical. All 50 currently-ready matches were also enriched locally to check the full migration; incomplete official records retain unknown intervals.
