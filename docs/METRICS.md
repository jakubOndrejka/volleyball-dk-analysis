# How the statistics are calculated

## Reconstructing rallies

For each set, the PDF identifies the six starting service slots and which team receives first (the crossed-out first service box). A service-box number is the **team's cumulative score at the end of that service turn**.

Example: the team reaches 10 points by winning a receiving rally. The next server's box ends at 13. That player wins three rallies while serving. If the set continues and their team loses the next rally, they made **four serves**, producing a **three-point run**. The side-out point that brought the score to 10 is excluded. If the set ends at 13 on their last winning serve, the parser does not invent a fourth serve or a loss.

The parser alternates the two teams' service endpoints, inserts the recorded winning serving rallies and the service-losing rally, and rotates a receiving team only after a side-out. Substitutions apply at the listed score, before the next rally. A new player serving after a substitution starts a new individual serving turn.

## Player table

| Metric | Definition |
|---|---|
| Serving turns | Consecutive serving rallies by that player, terminated by a loss, server change or set boundary. |
| First rallies won | Turns in which the player's team wins the first served rally. |
| First-rally win % | First rallies won / serving turns × 100. |
| Zero-point turns | Turns with no team rally won while that player serves. |
| 1 point / 2 points / 3–4 points / 5+ points | Mutually exclusive bins for the number of team points won during a turn. |
| 3+ run % | (3–4 point turns + 5+ point turns) / serving turns × 100. |
| Best point run | Largest observed number of points won in one individual serving turn. |
| Serves | Number of rallies started by that player's serve. Includes the final losing serve, unless the set ends first. |
| Serve win % | Team rallies won while that player serves / their serves × 100. |
| Sets played | Sets where a player is in the six starting slots or appears in a rally lineup after a substitution. Does not infer libero appearances. |
| Matches played | Distinct matches where the player appears in those counted sets. |
| Serves / set | Serves / counted sets played. |
| Points / turn | Team points won on that player's serves / serving turns. |

To compare unequal playing time, read **first-rally win %** and **points / turn**, with the sample size beside them. **Serves / set** measures workload, not serving quality. A player with one excellent turn cannot be confidently ranked ahead of a season's regular server. The interface labels fewer than 10 turns as a small sample; this is a simple visibility rule, not a statistical confidence test.

The rate denominator includes observed set-ending turns. Their run length is capped by the end of the set, so their full run potential is unobserved. `setEndingTurns` is retained in the underlying report. No aces or errors are inferred.

Players aggregate by a stable hash of the identifier printed in the roster PDF, rather than shirt number. A shirt number changing between games does not create a second player. These IDs are scoped by league/team in reports, so men's KSV.3 and women's KSV.3 are separate.

## Rotation table

S1–S6 mean the selected setter's physical position **before the rally starts**: 1 = right back, 2 = right front, 3 = middle front, 4 = left front, 5 = left back, 6 = middle back.

A team that wins while receiving rotates before its next serve. The side-out just won is counted in the previous, receiving rotation. That avoids moving the successful side-out into the wrong row.

| Metric | Definition |
|---|---|
| Rallies | All serving and receiving rallies in that rotation. |
| Points won / lost | Team rallies won / lost in that rotation. |
| Net points / 100 | (Points won − points lost) / rallies × 100. |
| Serves / serve wins | Serving rallies / team wins in those rallies. |
| Serve win % | Serve wins / serves × 100. |
| Received / side-outs | Receiving rallies / team wins while receiving. |
| Side-out % | Side-outs / received × 100. |
| Longest receiving loss run | Largest consecutive run of receiving points lost while that rotation label remains unchanged. Included in CSV. |
| Receiving spells losing 3+ | Count of receiving spells losing at least three consecutive points. Included in CSV. |

For each row, `rallies = serves + received = pointsWon + pointsLost`. All rates are calculated from summed underlying counts. Empty denominators display a dash, not 0%.

## Setters and Unconfirmed

1. Look for the match's selected setters in that rally's six rotation slots.
2. If no primary setter is present, look for the selected backups.
3. With one matching player, use their position.
4. If two match, apply the explicitly selected system: back-row setter (positions 1/5/6) or front-row setter (2/3/4). This must leave exactly one player.
5. If zero or multiple players remain, or the lineup is missing, use **Unconfirmed**.

An optional per-set override replaces the whole-match selection for that set. An empty override deliberately leaves the set Unconfirmed. Removing the override restores whole-match choices. Clearing the whole match also removes its set overrides.

Libero exchanges are not available in this PDF. The model follows regular rotation slots; it cannot verify whether a backup setter has temporarily been replaced by a libero. Use this version for setters who remain in the regular rotation lineup. This limitation is displayed in the selection panel.
