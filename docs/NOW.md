Purpose: Helps one learner build fast and accurate mental arithmetic with a 30-minute daily plan that works offline.
Goal: Ship the app from `docs/mental-math-devin-brief.md` on the stack in `docs/DECISIONS.md` #1 to #4.
Status: Built and verified end to end in a production build. Diagnostic in 4 parts folded into sessions, Start/Stop only with focus mode, 10-minute option, in-panel timer, key map, light illustrated theme, mental routes for fraction conversion and first-time fact-family lessons, Base knowledge study sheet with drills. 388 tests pass. Not yet used by a human.
Next: Use it daily for a week at https://rbsriram.com/mentalmath and tune `src/lib/learn/targets.ts` and the scheduler weights from experience.
Blockers: None. The host (Vercel) strips the trailing slash from `/mentalmath/`, which keeps the service worker from controlling the page at `/mentalmath`; offline use at that URL needs the host to stop that redirect.
Decisions: `docs/DECISIONS.md` #1 to #9.
Verify: `pnpm test`, `pnpm check`, `pnpm build`; then `pnpm preview --port 4173` and run through a session in the browser.
