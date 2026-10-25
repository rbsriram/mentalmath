# STATE — mentalmath

_A living snapshot of where this project is. Update it as things change, or via wind-down.
Goal: a new session reads this and continues immediately, without re-reading the codebase._

Last updated: 2026-10-25

## Where it is

Built on 2026-10-24 from `docs/mental-math-devin-brief.md`. The app runs, builds, and installs as a PWA. Practice happens in rounds of exactly 10 questions that end by themselves; the app never counts time (no minutes, phases, or blocks). Mixed rounds interleave topics from weighted buckets with a no-repeat-topic rule; diagnostic parts 2 to 4 alternate with mixed rounds until done. Stop (button or Esc) clears the round and keeps every recorded answer; `state.round` survives a reload. The state document is at version 4 (sessions became `days` of rounds; complements to 100/1,000 became a method, not 1,107 facts; only the 5 pairs to 10 are facts). The default look is light with the user's three pastel illustrations behind translucent surfaces; dark stays plain (`docs/DECISIONS.md` #7). Fraction conversions teach mental routes, each fact family shows a one-screen method card once, and Knowledge opens with the Base knowledge sheet. Keys: Enter submits and continues, Space on an empty box skips, r shows the route, Esc stops (progress kept), Option+1 to 4 switch tabs, ? lists the keys.

Not yet done by a human: real daily rounds on a phone, and a monthly benchmark run (the code path is tested in isolation, not in the browser).

Remote: https://github.com/rbsriram/mentalmath (public, Apache-2.0). Live at https://rbsriram.com/mentalmath, hosted by the user on Vercel (server header `Vercel`); the GitHub Pages workflow now deploys only a redirect page (`redirect/index.html`) to that URL. Vercel redirects `/mentalmath/` to `/mentalmath` (no trailing slash); the app loads there, but the service worker scope is `/mentalmath/`, so offline start at that URL needs the host to keep the slash (Next.js `skipTrailingSlashRedirect`) or a `Service-Worker-Allowed` header.

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

## Next / in flight

1. Decide how to handle the trailing-slash redirect on the Vercel side so the PWA works offline at `rbsriram.com/mentalmath`.
2. Use it for real for a week. Watch the speed targets in `src/lib/learn/targets.ts` and the bucket weights in `src/lib/learn/scheduler.ts`; both are constants meant to be tuned from experience.
3. Run one monthly benchmark in the browser when it comes due (30 days after first use) and check the Progress table.

## Open threads / decisions needed

- Hosting for daily use: `pnpm preview` locally or GitHub Pages. The build supports both with the `BASE_PATH` variable.
- If the user drops the mobile requirement, a terminal UI becomes the lighter stack (#1).
- Whether to split the bundle (content and templates) if load time on a phone ever matters.
