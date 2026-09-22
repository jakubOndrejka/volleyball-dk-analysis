# Validation record

Checked on **22 September 2026**.

## Real source data

The delivered snapshot contains 10 successfully parsed matches, 38 sets and **1,635 rallies**. Each successful reconstruction matched the complete point sequence displayed on the official public match page, as well as the PDF set scores and the published match result.

| Match ID | Match | Sets | Rallies |
|---|---|---:|---:|
| 76140 | Enghave VK – Frederiksberg Volley | 3 | 130 |
| 76141 | VLI.2 – KSV.3 (women) | 4 | 175 |
| 76630 | Tårnfalkene – Hillerød G&I | 4 | 178 |
| 77379 | Aarby Volley – Hillerød G&I | 4 | 155 |
| 77438 | Gentofte Volley.3 – Farum-Holte.2 | 5 | 208 |
| 77563 | Gentofte Volley.4 – KSV.3 (men) | 4 | 168 |
| 77592 | VLI.4 – VK Holbæk.2 | 3 | 138 |
| 77651 | Gentofte Volley.4 – Glostrup IC.2 | 3 | 125 |
| 77682 | VLI.4 – KSV.5 | 3 | 136 |
| 77724 | Kanalbyens IF – Hvidovre VK.3 | 5 | 222 |

The index also records one sheet requiring review and five pending downloads. These matches do not contribute zeros to the statistics. Status will change as the collection workflow retries them.

The three permanent PDF regression fixtures are 76140, 76141 and 77438. Their source URLs and PDF fingerprints are retained in `tests/fixtures/manifest.json`. The fixture's expected winner sequences were extracted independently from the public HTML point history.

A manual check of KSV.3's first set in match 76141 gives **23 serves**, **13 individual serving turns**, **10 points won while serving**, and **12 side-outs**. This is asserted in a regression test. Across that whole match: **96 serves**, **48 serve wins**, **79 received rallies**, and **49 side-outs**. These are team rally outcomes, not aces.

Match 76641 is excluded because the PDF service grid is inconsistent with its final result. For example, the losing team's first-set service endpoint reaches 12, while the official final score for that team is 11. No correction is guessed.

## Automated tests

`npm test`: **17 passing tests**.

Coverage includes:

- The manually counted first set and all-rally totals.
- Serving/receiving perspective symmetry and count identities.
- Position before a side-out versus position after rotation.
- Missing/ambiguous setters, backup setters and explicit two-setter rules.
- Substitutions and per-set configuration overrides.
- Duplicate-match exclusion, pooled rates and complete run bins.
- Missing lineups retaining rallies under Unconfirmed.
- Set-ending serves and a set won on reception, without phantom serves.
- Real three-, four- and five-set PDFs, re-entry, and deuce.
- Malformed PDFs, wrong team headers and missing endpoints being rejected.
- Team panel rendering, setters saved to browser storage, set overrides, filters, CSV/config exports, bad-import rejection and the original Results view.

The interface test runs in jsdom against the real application code, including a repository subdirectory URL. It verifies DOM behavior and downloaded contents; it does not certify browser-specific visual layout. The remote browser available during development could not open the local preview address, so a live browser visual check and GitHub Pages deployment were not performed. Responsive CSS is included; check the deployed site on your phone after setup.

Both workflow files passed YAML parsing, the static build completed, and `git diff --check` passed.

## Boundaries

This validates the observed electronic PDF template, not arbitrary scanned or handwritten scoresheets. OCR, a manual correction editor, shared web accounts and complete libero tracking are not implemented. Source sheets with sanctions or inconsistencies are excluded until reviewed outside this version of the application. The scheduled workflow has been provided but is not enabled on a live repository by this download.
