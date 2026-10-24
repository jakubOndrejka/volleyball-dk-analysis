# Two-page scorecard correction

24 October 2026 · 10:25 CEST. Based on jakubOndrejka/volleyball-dk-analysis at e442b81.

## What was wrong

Lyngby-Gladsaxe Volley.2 vs Rosenlund Volley (11 October, match 76149) was rejected because the parser required exactly one PDF page. The complete service grids, substitutions, sanctions table and set results are on page one. A few approval/signature rows overflow onto page two.

The parser now accepts this recognised two-page layout. It checks the second page contains only the expected footer labels and timestamp fields, within the footer's page positions, with no images. It reads the playing data from page one, keeping the original coordinate system. Extra scoring/substitution data, sanctions, remarks, unknown text or image content on page two still require review. This is not general support for arbitrary multi-page or scanned scoresheets. Roster parsing remains unchanged.

All existing checks remain: match identity, exact team headers, set/match scores, service endpoints, substitutions, sanctions, roster membership and comparison against the official public point history. Parser version is increased from 4 to 5 so previously rejected matches are rechecked without waiting for their normal retry date.

## Install

1. Extract the ZIP and upload the contents of **github-files/** into the root of your existing GitHub repository. Preserve the folders and replace matching files. Do not upload the github-files folder itself.
2. Commit the update. Wait for **Refresh and publish volleyball** to finish. If needed, use **Actions → Refresh and publish volleyball → Run workflow**.
3. Hard-refresh the website (Ctrl+Shift+R / Cmd+Shift+R). Match 76149 should become available in Team analysis. If its rotations are Unconfirmed, use your usual season setter choices or match override; PDF processing and setter confirmation are separate.

The essential runtime change is **lib/pdf-parser.js**. The remaining files are regression tests, real PDF fixtures, independent event-history expectations and documentation. No Google Apps Script, Sheet, coach code, endpoint, setter choices or workflow changes are needed. Existing generated data is not included, so the normal collector updates it from the official source.

In the inspected repository, all three affected matches are within the first PDF refresh batch. Other ready matches may be rechecked across later runs because of the parser version change.

## Verified results

| Match | Result (home first) | Set scores (home first) | Rallies checked |
|---|---|---|---:|
| 76149: Lyngby-Gladsaxe Volley.2 vs Rosenlund Volley | 1–3 | 21–25, 25–15, 14–25, 20–25 | 170 |
| 76146: Frederiksberg Volley vs Lyngby-Gladsaxe Volley.2 | 3–1 | 25–20, 10–25, 25–22, 25–15 | 167 |
| 77391: KSV.2 vs B1960 | 0–3 | 15–25, 19–25, 21–25 | 130 |

Every reconstructed rally in all three matches agrees with the independent official event log. The collector marks all three ready. Lyngby–Rosenlund also has complete libero-presence tracking for both teams across its 170 rallies. All 69 tests and the static-site build passed.

The tests also confirm that a signature page cannot bypass match-number, team or final-score checks, and that additional scores, penalties, remarks, unknown text and image pages are rejected rather than ignored.

Sources (retrieved 24 October 2026):
- https://resultater.volleyball.dk/tms/Turneringer-og-resultater/Kamp-Information.aspx?KampId=76149
- https://resultater.volleyball.dk/tms/Turneringer-og-resultater/Kamp-Information.aspx?KampId=76146
- https://resultater.volleyball.dk/tms/Turneringer-og-resultater/Kamp-Information.aspx?KampId=77391
