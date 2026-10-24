Purpose: Helps one learner build fast and accurate mental arithmetic with a 30-minute daily plan that works offline.
Goal: Ship the app from `docs/mental-math-devin-brief.md` on the stack in `docs/DECISIONS.md` #1 to #4.
Status: Built and verified end to end in a production build (diagnostic, full session, Knowledge, Progress). 360 tests pass. Not yet used by a human.
Next: Add a GitHub remote, enable Pages, then use it daily for a week and tune `src/lib/learn/targets.ts` and the scheduler weights from experience.
Blockers: No git remote. Needs the user.
Decisions: `docs/DECISIONS.md` #1 to #6.
Verify: `pnpm test`, `pnpm check`, `pnpm build`; then `pnpm preview --port 4173` and run through a session in the browser.
