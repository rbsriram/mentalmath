Purpose: Helps one learner build fast and accurate mental arithmetic through short rounds of 10 questions that work offline.
Goal: Ship the app from `docs/mental-math-devin-brief.md` on the stack in `docs/DECISIONS.md` #1 to #4.
Status: Rounds replace sessions: exactly 10 questions, no clocks, topic interleaving, days summary, state v4. Complements to 100/1,000 are a rule, not facts. Start/Stop with focus mode, key map, light illustrated theme, mental routes, fact-family lessons, Base knowledge sheet with drills. Tests pass. Not yet used by a human.
Next: Use it daily for a week at https://rbsriram.com/mentalmath and tune `src/lib/learn/targets.ts` and the scheduler weights from experience.
Blockers: None. The host (Vercel) strips the trailing slash from `/mentalmath/`, which keeps the service worker from controlling the page at `/mentalmath`; offline use at that URL needs the host to stop that redirect.
Decisions: `docs/DECISIONS.md` #1 to #11.
Verify: `pnpm test`, `pnpm check`, `pnpm build`; then `pnpm preview --port 4173` and run through a session in the browser.
