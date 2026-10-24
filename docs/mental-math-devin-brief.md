# Mental Math: Devin Build Specification

## Objective
Build a fast, local-first application that develops exceptional mental arithmetic fluency through structured instruction, efficient general-purpose techniques, cumulative practice, and adaptive progression. The intended daily commitment is 30 minutes, indefinitely.

**Primary outcome:** Solve unfamiliar arithmetic problems mentally, quickly, accurately, and flexibly. Learn when to use a method, rather than memorizing isolated shortcuts.

## Product principles
- Diagnose before teaching. Do not assume existing knowledge or make users repeat mastered material.
- Organize learning as a **dependency graph** of facts, concepts, strategies, and applications. Each new technique must connect to existing knowledge.
- Prioritize methods that generalize to many problems. Introduce specialized methods only when they produce a meaningful advantage.
- Mix new and old material continuously, including unfamiliar combinations and realistic problems.
- Accuracy and understanding precede time pressure. Introduce speed challenges gradually.
- Each session starts automatically with a sensible plan. No browsing through a course to choose what to do.
- No gamification, streak pressure, leaderboards, chatbots, decorative dashboards, or unnecessary interface elements.
- No network requirement, account, or subscription. Keep performance immediate.

## Benchmark capabilities
The application must train and assess these classes of problems with generated, unseen variants:

| Capability | Sample | Result |
|---|---|---|
| Multi-term addition | 23 + 146 + 12 + 9 + 80 | 270 |
| Multi-term multiplication | 12 × 23 × 45 | 12,420 |
| Subtraction | 10,000 − 6,785 | 3,215 |
| Decimal division | 7.2 ÷ 0.6 | 12 |
| Squares | 47² | 2,209 |
| Near-base multiplication | 98 × 97 | 9,506 |
| Three-digit multiplication | 125 × 384 | 48,000 |
| Percentages | 18% of 240 | 43.2 |
| Reverse percentages | 680 / 0.85 | 800 |
| Fraction conversion | 7/16 | 0.4375 = 43.75% |
| Decimal multiplication | 3.75 × 2.4 | 9 |
| Discounts | 20% off AED 312.50 | AED 250 |
| Compound percentage | 800 × 1.2 × 0.85 | 816 |
| Ratios | Split 3,600 in ratio 2:3:4 | 800, 1,200, 1,600 |
| Estimation | 19,850 ÷ 397 | approximately 50 |

Also cover integer and decimal arithmetic, fractions, proportions, powers, roots, unit prices, gross margin vs markup, interest, taxes, currency arithmetic, and mental multi-step calculations. For non-exact tasks, specify the accepted tolerance clearly.

**Target:** Within approximately 90 days of consistent use, aim for reliable performance across these representative classes; thereafter improve speed, retention, flexibility, and complexity. This is a goal to measure, not a guarantee. Establish baseline first.

## Foundational knowledge map
Use the accompanying `mental-math-base-load-cheatsheet.pdf` as a *source* for the initial foundation (do not merely reprint it). It includes:

**Recall facts**
- Multiplication tables 1–15 (expand as warranted by demonstrated need).
- Complements to 10, 100, 1,000.
- Doubles, halves, common scaling factors such as 5 and 25.
- Squares 1–25 (expand progressively).
- Common fraction ↔ decimal ↔ percentage equivalences.
- Percentage anchors: 5%, 10%, 20%, 25%, 50%, 75%.

**Conceptual prerequisites**
- Place value, number magnitude, decomposition and recombination.
- Commutative, associative, distributive properties.
- Compensation, rounding, factorization, cancellation, doubling/halving.
- Fractions, percentages, ratios, signs, decimal positioning, estimation.
- Divisibility and common factors where needed.

**Precision note:** Represent recurring decimal equivalents such as 1/3 as repeating or approximate, not exact finite decimals. For any decimal arithmetic engine, use exact integer-scaled or rational representations where appropriate; do not compare answers with naive floating-point equality.

Track fact recall separately from conceptual skill and method application. A visible foundation view should show what is known, what needs practice, and what is prerequisite for upcoming techniques.

## Instructional sources and selection policy
Study and draw *candidate strategies* from:
1. Arthur Benjamin and Michael Shermer, *Secrets of Mental Math*: left-to-right arithmetic, multiplication, squares, division.
2. Bharati Krishna Tirthaji, *Vedic Mathematics*: selectively use mathematically valid near-base and multiplication methods.
3. Bill Handley, *Speed Mathematics*: practical decomposition and arithmetic patterns.
4. Scott Flansburg, *Math Magic*: number relationships and mental fluency ideas.
5. Trachtenberg system: consider structured multiplication methods where they outperform simpler techniques.
6. Traditional arithmetic: place value, factorization, distributive law, compensation, and estimation.

Do not copy proprietary textbook content or build a course around one book. Verify every technique algebraically and against generated test cases. Do not treat branding or historical claims as evidence of effectiveness. Prefer the **simplest broadly useful approach**; retain a specialized method only if its performance can be demonstrated.

For each method, store: name, general rule, algebraic rationale, prerequisites, applicable problem patterns, counterexamples or limitations, worked examples, exercises, and recommended next skills.

**Critical example:** `25 × 17` and `25 × 16` should use the same general identity `n × 25 = (n × 100) / 4`. Teach the relationship, not a rule for every individual number pair. Likewise, `98 × 97` should be understood using distributivity around 100, not taught as an isolated trick.

## Curriculum architecture
Organize modules by connected competencies rather than arbitrary calendar weeks:
1. Number sense and basic recall: place value, complements, fact families, doubles/halves.
2. Efficient addition/subtraction: grouping, compensation, left-to-right processing, multi-term chains.
3. Multiplication: decomposition, distributivity, factoring, scaling; then near-base techniques and squaring.
4. Division: reverse multiplication, factor cancellation, quotient decomposition, remainder estimation.
5. Fractions, decimals, percentages: conversions, operations, anchors, reverse percentages, compound changes.
6. Ratios, proportions, estimation, powers/roots, and applications.
7. Mixed multi-step mental calculations and real-world decisions.

These are overlapping skill families, **not sequential locked chapters**. Start mixed practice on day one. Gate only the specific prerequisite that a technique requires. Continually review prior skills.

## Daily session: 30 minutes
Default allocation, adjustable by the adaptive planner:
- **3 min:** recall facts based on due reviews and weak spots.
- **7 min:** one connected new technique or deliberate reinforcement, with concise explanation and examples.
- **12 min:** adaptive mixed practice across prerequisites, target skill, and transfer problems.
- **5 min:** short timed rounds at appropriate accuracy level.
- **3 min:** analyze errors, retry missed patterns, schedule review.

If no new technique is needed, use the instruction time for harder application. The session should be pause/resume capable, and usable without a timer in custom practice.

## Adaptive algorithm
Maintain skill-level and individual fact-level records including:
- correctness; response duration; difficulty and operand structure; date/time; repeated error patterns;
- technique introduced/used where known; number of successful independent applications;
- due date for retention review; stability/confidence estimate; performance on novel mixed problems.

Use a simple, inspectable mastery model and spaced review scheduler; avoid an opaque AI model. Prioritize a mix of (a) due recall, (b) fragile prerequisites, (c) current learning target, (d) novel transfer, and (e) broader maintenance. Do not let a few fast answers imply mastery. Avoid teaching to the exact benchmark examples.

If the answer is wrong, show the correct answer and a short, mathematically valid route; provide a similar retry later rather than instantly repeating the same numbers. If right but unusually slow, offer a technique after the round, not as a disruptive pop-up. For multiple valid methods, allow comparison and assess whether a method transfers to unfamiliar operands. Never force a special shortcut when a simpler general method works better.

## Diagnostics, measurements, and outcomes
Initial diagnostic: around 15–20 minutes, covering representative operations, foundations, and mixed applications. Identify bottlenecks without imposing an age-based level.

Every 30 days run a standardized *equated* assessment using unseen problems from fixed difficulty bands and a held-out generator seed. Track:
- Accuracy by skill and by difficulty.
- Median and 90th-percentile response time on correct responses.
- Speed-accuracy tradeoff, not speed in isolation.
- Retention after 7 and 30 days.
- Accuracy on mixed/transfer tasks, not just rehearsed drill patterns.
- Number of problem classes handled reliably without assistance.

Benchmark reports must compare like with like; increasing problem difficulty must not misleadingly look like a decline. Show the learner concrete new capabilities with sample problems. No arbitrary “under 3 seconds” goals for easy facts as the primary product metric.

## Question engine
- Generate unbounded problems using parameterized templates and difficulty controls, not a static question deck.
- Tag each question with prerequisites, skill(s), expected calculation structure, valid strategy options, exact answer and accepted formats.
- Include multi-number, chained, decimal, fraction, ratio, reverse-percent, and contextual question types.
- Verify answers and worked explanations with deterministic tests.
- Support negative numbers, fractions as `a/b`, decimals, percentages, currency, and approximate answers with explicit tolerances.
- Use unbiased operand sampling and avoid excessive duplicate structure.
- For contextual prompts, use meaningful arithmetic without requiring specialist financial knowledge.

## Interface
Four minimalist views:
1. **Today:** Start/resume 30-minute plan.
2. **Practice:** One question; keyboard-first numerical entry; submit; concise feedback; optional technique explanation.
3. **Knowledge:** Foundation map, connected techniques, prerequisites, short worked examples.
4. **Progress:** Baseline vs current performance, weak areas, retention, recent monthly benchmarks.

Large readable problem text, minimal controls, excellent mobile layout, keyboard shortcuts, no visual clutter. Preserve progress even when offline and after upgrades. Include import/export and optional reset.

## Technology
- Svelte 5 + TypeScript + Vite, packaged as an installable PWA.
- IndexedDB for local persistent data; versioned migrations; export/import JSON.
- Deterministic TypeScript calculation and question generation.
- No backend, auth, LLM inference, analytics trackers, or network calls on the learning path.
- Decimal/rational correctness using integer arithmetic or a suitable exact arithmetic utility.
- Work offline after initial installation.

## Acceptance criteria
1. First launch performs a diagnostic and creates a tailored plan.
2. The complete 30-minute daily loop works, including pause/resume.
3. At least all benchmark skill classes above are supported by independently generated problems and solutions.
4. Foundational knowledge appears explicitly, with recall assessment and links to dependent techniques.
5. Methods form a navigable prerequisite graph; no unrelated shortcut dump.
6. Correct answers, acceptable equivalent formats, and explanations pass automated validation on thousands of seeded cases.
7. Progress, adaptive selection, and spaced reviews survive reload, offline use, and app updates.
8. A monthly benchmark compares equivalent difficulty and reports accuracy, speed, and retention.
9. Usable with keyboard alone and responsive on mobile.
10. No unnecessary infrastructure or product features.

## Delivery requested from Devin
- Implement the application, not just a wireframe or architectural document.
- Include the skill graph, initial content and method catalog, generated problem templates, tests, and local persistence.
- Provide concise README instructions to install, run, build, and back up data.
- Document algorithm decisions and content sources in-repo.
- Run tests and report any incomplete acceptance criteria explicitly.

**Guiding requirement:** The system should make an increasingly broad range of mental calculations feel natural through reusable mathematical understanding, recall, transfer, and daily repetition.
