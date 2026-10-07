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

1. Resolve season defaults, then any whole-match override, then any set override. Look for selected setters in that rally’s six rotation slots. A player known to be replaced by a libero is excluded from setter candidates.
2. If no primary setter is present, look for the selected backups.
3. With one matching player, use their position.
4. If two match, apply the explicitly selected system: back-row setter (positions 1/5/6) or front-row setter (2/3/4). This must leave exactly one player.
5. If zero or multiple players remain, or the lineup is missing, use **Unconfirmed**.

An optional per-set override replaces the whole-match selection for that set. An empty override deliberately leaves the set Unconfirmed. Removing the override restores whole-match choices. Clearing the whole match also removes its set overrides.

## Season defaults and set starts

Season choices use stable roster player IDs and are scoped to the selected league ID + team. Match/set overrides retain shirt numbers for that particular match. Precedence: set override → explicit match override → season defaults. An empty match override means deliberately Unconfirmed. **Use season defaults for this match** clears its match/set overrides and follows subsequent season edits. Existing overrides are preserved when a season choice changes.

The first rally of a set supplies the starting setter position and serving/receiving mode, before any side-out rotation. The summary counts sets by S1–S6/Unconfirmed and first-rally mode. Set win % uses completed sets starting in that row; it is descriptive, not evidence that a starting position caused a win. The per-set table includes the effective choice source.

## Inferred roles and playing time

Default service-order offsets from the active setter are Setter, Outside, Middle, Opposite, Outside, Middle. Coaches may reverse Outside/Middle order. These are inferred rotation roles, not observed attacking or defensive assignments. When the setter is ambiguous, roles are Unconfirmed. Substitutions inherit the replaced rotation slot; the inference is recomputed each rally.

**Slot rallies** count the regular player assigned to a rotation slot, including rallies when a libero replaces them. Role counts for regular players sum to slot rallies. **Confirmed court rallies** use the six players actually recorded on court, replacing the regular player with the active libero. Across complete history these counts sum to six times team rallies, never seven. Libero role counts use confirmed court appearances. This does not measure minutes.

**Sets/matches involved** count a regular player’s recorded lineup appearances, or a libero’s known actual appearances, once per set/match. Bench-only roster entries remain zero. These counts may include a regular player named in a lineup who is replaced by a libero for all observed rallies. Unknown libero presence can undercount libero sets.

**Court share** = confirmed court rallies / all selected team rallies. When presence is uncertain for that player, the displayed ≥ percentage is a confirmed minimum. **Uncertain court rallies** count rallies for which that player’s presence cannot be determined; these are not counted as confirmed appearances.

## Libero rotation analysis

The collector reads the public match page’s event table chronologically. Every point winner and running score must agree with the reconstructed PDF rallies for that set. An exchange at score X–Y is applied before the next rally. The named libero and replaced player must belong to the roster; the replaced slot must be in the back row, and cannot serve while the libero is present. Invalid events leave presence unknown until a later valid exchange can establish it again. Without an initial entry/exit, initial presence remains unknown. A team with no designated libero has known no-libero presence.

Each team rally belongs to one of: named active libero, confirmed no libero, or unknown. Multiple liberos are never double-counted in **All recorded liberos**. Each filter uses the same team rotation metrics above. S1–S6 is still the setter position; no configured setter means Unconfirmed even if the libero is known. A filtered rotation history/chart keeps its libero filter. The main setter dropdown affects the main rotation table; the libero section uses all setters.

These are team outcomes while a libero is recorded on court, not reception quality, individual points won or a causal player rating. Event recording can be incomplete; the tool reports only what the source supports. Older JSON files lacking event enrichment display unknown until collection refreshes them.
