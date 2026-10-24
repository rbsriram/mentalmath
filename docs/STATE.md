# STATE — mentalmath

_A living snapshot of where this project is. Update it as things change, or via wind-down.
Goal: a new session reads this and continues immediately, without re-reading the codebase._

Last updated: 2026-10-24 (evening)

## Where it is

Built on 2026-10-24 from `docs/mental-math-devin-brief.md`. The app runs, builds, and installs as a PWA. The full loop works end to end in a production build driven by headless Chrome: the diagnostic (4 parts of about 5 minutes; a plan appears after part 1), a 30-minute session as five stoppable blocks or a 10-minute short session, the lesson card, the Today summary, Knowledge detail pages, and Progress. A subtle corner countdown shows the time left in the current block. The default look is light with the user's three pastel illustrations (`docs/media/bg-*.png`, shipped as small WebP files in `public/bg/`) behind translucent surfaces; dark theme stays plain (`docs/DECISIONS.md` #7). The state document is at version 2. Keys: Enter submits and continues, Space on an empty box skips, r shows the route, Esc pauses or stops, Option+1 to 4 switch tabs, ? lists the keys. 369 Vitest tests pass, including a template sweep of about 90,000 seeded questions against independent oracles and a scripted-learner simulation of a diagnostic plus three sessions.

Not yet done by a human: a real 30-minute session on a phone, and a monthly benchmark run (the code path is tested in isolation, not in the browser).

Remote: https://github.com/rbsriram/mentalmath (public, Apache-2.0). The Pages workflow deploys green, but the account-level custom domain `rbsriram.com` (a stale `CNAME` file in the `rbsriram.github.io` repo, last touched 2024-08) maps every project site to `rbsriram.com/<repo>/`, and that apex now forwards to nullvelocity.com. So `https://rbsriram.com/mentalmath/` returns 404 until that CNAME is removed. Removing it restores `https://rbsriram.github.io/mentalmath/`.

## How it is built (one breath)

A static PWA. Svelte 5 + TypeScript + Vite 8, runtime dependency `svelte` only (`docs/DECISIONS.md` #1). Pure TypeScript under `src/lib`: exact rational arithmetic with BigInt, a seeded RNG with namespaced seeds, 45 question templates with worked routes, a 58-node skill graph, 41 method cards whose examples are generated rather than typed, an inspectable mastery model with spaced review, a five-bucket scheduler, a 30-minute session machine, the diagnostic staircase, and the equated monthly benchmark. Learner data is one versioned JSON document plus an append-only attempt log in IndexedDB, with JSON export and import (#2). A hand-written service worker gives offline use (#3). Four views on a runes store with hash routing. Rules are written up in `docs/algorithm.md`; sources in `docs/content-sources.md`.

## Run and test

- `fnm use` then `pnpm install`
- `pnpm dev` : dev server on http://localhost:5173
- `pnpm test` : Vitest (360 tests, about 3 s)
- `pnpm check` : svelte-check
- `pnpm build` then `pnpm preview --port 4173` : production build
- Browser harness used for verification: `node /tmp/mm-cdp.mjs 'http://localhost:4173/?harness=1' full` (headless Chrome over CDP, screenshots in `/tmp/mm-shots/`). It lives in `/tmp`, so it is lost on reboot. `?harness=1` exposes `window.__mm` with `currentAnswer`, `session`, `state`, and `fastForward`.

## Known limitations

- A browser engine is the memory floor. A terminal UI would be lighter, but the brief requires mobile use (#1).
- Real file writes are not portable from Safari or iOS. Flat data lives in IndexedDB; export produces the file (#2).
- TypeScript 7 is not supported by svelte-check 4.7.x, so the project uses TypeScript 6 (#4).
- The diagnostic staircase ends most probes on a wrong answer, so freshly probed skills show as "learning" and are drilled as fragile prerequisites in the first sessions. This washes out after a few days.
- The bundle is about 58 KB gzipped. Most of it is content and templates; no code splitting yet.
- Only `^2` and `^3` in method text use Unicode superscripts; other exponents print as `2^10`.
- Pending diagnostic parts are offered on Today ("Continue diagnostic"); they are not folded into sessions automatically.

## Next / in flight

1. Unblock the Pages URL: delete `CNAME` from `rbsriram/rbsriram.github.io` (needs the user's go; it changes where `rbsriram.github.io` itself points).
2. Use it for real for a week. Watch the speed targets in `src/lib/learn/targets.ts` and the bucket weights in `src/lib/learn/scheduler.ts`; both are constants meant to be tuned from experience.
3. Run one monthly benchmark in the browser when it comes due (30 days after first use) and check the Progress table.

## Open threads / decisions needed

- Hosting for daily use: `pnpm preview` locally or GitHub Pages. The build supports both with the `BASE_PATH` variable.
- If the user drops the mobile requirement, a terminal UI becomes the lighter stack (#1).
- Whether to split the bundle (content and templates) if load time on a phone ever matters.
