# Algorithm notes

This file documents the learning model. The source of truth is `src/lib/learn/`.

## Bands

Every skill has a working difficulty band, 0 to 3. The band selects the operand ranges and structures a template uses. A learner's band per skill is `rec.level`, the working difficulty the scheduler serves.

## Records

Each skill and each fact carries a `Rec`:

- `attempts`, `correct`, `streak`: lifetime counters and the current correct run.
- `stability`: days the memory is expected to last. 0 means never answered correctly.
- `due`: the next review timestamp (ms epoch).
- `lastSeen`, `firstSeen`: timestamps (ms epoch).
- `days`, `lastDay`: distinct local calendar days practised and the latest one.
- `recent`: last 10 outcomes, 0 or 1.
- `recentMs`: last 5 response times on correct answers.
- `level`: the working band.
- `introduced`: the lesson card was shown (methods only).
- `independent`: correct answers on transfer items.

Facts are per item: table entries, squares, complements, fraction equivalents, percent anchors. Facts share the same record type and rules.

## Base facts

Base facts are memorized, not derived. The Knowledge view opens with the whole base sheet: the 15 x 15 table, the five complement pairs to 10, squares to 30, the 25 fraction equivalents, and the six percent anchors. Cells are tinted by each fact's status so gaps are visible at a glance. Each block has a Drill button that starts a round on that family, and each family is introduced once with its method card. Complements to 100 and 1,000 are a rule, not facts: work from the right, keep trailing zeros, subtract the first non-zero digit from 10 and every digit to its left from 9. They are drilled as a method, not memorized.

## Update rules

- Correct: stability becomes `stability === 0 ? 1 : min(stability * 2.2, 120)` days, and `due = now + stability` days. The streak grows.
- Wrong: stability becomes `max(0.25, stability * 0.3)` and `due = now + 0.25` day. The streak resets.
- Promotion: when the answered band equals the working band, the streak reaches 4 after the answer, at least 6 recent outcomes show accuracy of 0.9 or better, and the median recent correct time is at or under the speed target, the level rises by 1 up to 3.
- Demotion: at least 6 recent outcomes with accuracy under 0.5, the level is above 0, and the answered band equals the working band. A missed stretch item never demotes.
- Transfer and correct adds 1 to `independent`.

## Status ladder

- `new`: no attempts.
- `learning`: attempted but not solid.
- `solid`: stability at least 3 days, recent accuracy at least 0.9, at least 8 attempts, at least 2 distinct days.
- `strong`: stability at least 21 days, recent accuracy at least 0.9, at least 12 attempts, at least 3 days, and at least 3 independent correct answers.

`known` means attempts at least 2 and recent accuracy at least 0.8, or the level is 1 or more. The level clause exists because the diagnostic staircase ends most probes with a wrong answer.

`fragile` means attempted with accuracy under 0.8 or stability under 1 day. `due` means attempted and past the due time.

## Implied knowledge and unlocking

`knownStar(id)` holds when the skill is known or any direct dependent of it is known. A learner who multiplies 2 by 2 digit products correctly has demonstrated the distributive split it rests on. `practicable(id)` holds when a template serves the skill. Untestable concepts such as place value never gate unlocking.

A skill unlocks when every practicable prerequisite is known by `knownStar`. The frontier is the unlocked method and application skills below solid, ordered by dependent count, then family, then id. Skills implied known but never attempted leave the frontier: there is nothing to teach. They still serve maintenance and due work. The effective status for display is `implied` in exactly that case.

The daily target is the current target while it stays unlocked and below solid, else the first frontier skill.

## The round

A round is exactly 10 questions and ends by itself. The app never counts time: there are no minutes, phases, or blocks. Response time is still recorded per answer and still drives speed targets and promotion. Rounds persist in `state.round`, so a reload mid-round continues it; Stop clears it and keeps every recorded answer.

A mixed round draws from five weighted buckets: due 0.45, target 0.25, learning 0.15, newfact 0.10, maintenance and transfer 0.05. Empty buckets drop out and weights renormalize. Each question has a topic, the fact family for facts and the skill id for skills, and the app never serves the same topic twice in a row while another topic exists. The interleaving is the point: variety keeps a round short and wide instead of deep on one topic. A target method's card shows once before its first target question, and each fact family's card shows once ever, before its first fact.

Round kinds: `mixed` as above, `skill` for a chosen list of skills, and `facts` for one fact family (due first, then weak, then unattempted, then random). Diagnostic parts 2 to 4 run as their own rounds between mixed rounds, alternating until the diagnostic is done. Finishing a run updates the day summary (`days`: rounds, answered, correct) and `lastRoundKind`, which drives what Start serves next.

## Speed targets

Base seconds, scaled by 1, 1, 1.5, 2 for bands 0 to 3:

| Group | Seconds |
| --- | --- |
| Fact families, doubles and halves | 3 |
| Two term addition and subtraction | 8 |
| Multi-term addition | 20 |
| Core multiplication methods | 15 |
| Structured three digit and multi-term multiplication | 25 |
| Division, decimals, fractions, percent of, discount, change | 15 |
| Applications and estimation-adjacent skills | 30 |
| Estimation, powers, roots, signed numbers | 12 |
| Mixed chains | 40 |
| Default | 20 |

## The diagnostic

Twenty probes in a fixed order. Each starts at band 1, climbs to 2 and 3 on correct answers, drops to a single band 0 item on a band 1 miss, and ends on any band 2 or 3 miss. Skips count as wrong. Finish writes the probed level per skill, seeds stability 3 days for level 1 and up, stores the baseline report, and picks the first target.

The probes run in 4 parts of 5. Part 1 always runs standalone from Today. Once it is in, the remaining parts run as diagnostic rounds that alternate with mixed rounds until part 4 completes. A completed part applies its levels right away and re-picks the target. The baseline report still waits for part 4.

## The benchmark

Thirty nine slots: the 15 benchmark classes at bands 1 and 2, six transfer slots, three fact slots. Items use `seedFor('benchmark', month, slot)`, so a month is a fixed equated form. Reports carry accuracy, accuracy by skill and band, median and p90 on correct items, transfer accuracy, classes reliable, and retention.

Retention at 7 and 30 days: for every attempt that is the first on its skill after a gap of at least that many days, the share correct. Null when no such attempts exist.

## Progress numbers

Family accuracy averages per-skill recent accuracy, or per-skill accuracy from the baseline report. Weak areas are the five practiced skills with the lowest recent accuracy, ties by lower stability. Speed numbers use correct answers in the last 7 days when no benchmark exists.

## What is deliberately simple

The model is a fixed rule set, not a fitted model. Doubling stability on success and cutting it to 0.3x on failure mirrors Leitner style spacing with smoother steps. Every quantity in a record is inspectable, and every decision the scheduler makes follows from them. That keeps the system debuggable and honest about its limits.
