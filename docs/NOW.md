Purpose: Helps one learner build fast and accurate mental arithmetic with a 30-minute daily plan that works offline.
Goal: Ship the app from `docs/mental-math-devin-brief.md` on the stack in `docs/DECISIONS.md` #1 to #4.
Status: Built and verified end to end in a production build. Diagnostic in 4 parts, sessions as stoppable blocks plus a 10-minute option, corner timer, full key map. 366 tests pass. Not yet used by a human.
Next: Unblock the Pages URL (stale `CNAME` in `rbsriram.github.io`), then use it daily for a week and tune `src/lib/learn/targets.ts` and the scheduler weights from experience.
Blockers: `https://rbsriram.com/mentalmath/` is 404 because of the account-level custom domain. Needs the user's go to remove it.
Decisions: `docs/DECISIONS.md` #1 to #6.
Verify: `pnpm test`, `pnpm check`, `pnpm build`; then `pnpm preview --port 4173` and run through a session in the browser.
