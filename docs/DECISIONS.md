# DECISIONS — mentalmath

Append-only log of notable decisions and divergences. Newest at the bottom.
Each entry is numbered so STATE.md and code comments can reference it (e.g. "see #12").

## #1 — Keep the web stack, strip it to the floor (2026-10-24)

**Decision:** Build the app as a static PWA with Svelte 5, TypeScript, and Vite 8. Runtime dependency: `svelte` only. No CSS framework, no router library, no chart library, no IndexedDB wrapper, no Workbox or PWA plugin, no state library. Package manager: pnpm. Node pinned with `.node-version`.

**Why:** The brief requires offline use, an installable app, and a good mobile layout. That requires a browser engine. The browser process is the memory floor (tens of MB). No web framework choice moves that floor. Svelte 5 compiles to direct DOM code with a runtime of about 5 KB gzipped, so it is already the lightest mainstream option. A vanilla-JS rewrite would save a few KB and cost correctness. The real savings come from removing libraries, so the app ships with zero runtime dependencies beyond Svelte.

**Rejected:**
- Terminal UI in Go or Rust (about 10 MB RSS, real JSON files). Lightest option, but it drops the mobile requirement. Revisit only if mobile is dropped.
- Tauri or Electron desktop shell. Tauri uses the same WKWebView that a Safari "Add to Dock" web app uses, so it adds a toolchain without saving memory. Electron is far heavier.
- Native SwiftUI. Lowest memory on Mac and iPhone, but needs Xcode, signing, and a much longer build.

## #2 — Flat document persistence (2026-10-24)

**Decision:** Store all learner data as one versioned JSON state document plus one append-only attempt log. Both live in IndexedDB (`kv` store with key `state`, and an `attempts` store). Export writes the same data as one JSON file. Import reads it back and runs migrations. Migrations are a list of pure functions keyed by `state.version`.

**Why:** The user asked for flat files. A browser cannot write real files portably: Safari and iOS do not support `createWritable`, OPFS writes need a worker, and a PWA cannot run from `file://`. IndexedDB is the portable container. The data model stays flat: no normalized tables, no query layer, no ORM. The export file is the flat file.

## #3 — Hand-written service worker (2026-10-24)

**Decision:** A small in-repo Vite plugin emits `sw.js` with the list of built assets. The worker precaches those assets, serves same-origin requests cache-first, and falls back to `index.html` for navigations. New versions use `skipWaiting` and `clients.claim`. No auto-reload.

**Why:** Workbox and `vite-plugin-pwa` add many dev dependencies to produce the same 60 lines. Learner data lives in IndexedDB, so an update never touches progress.

## #4 — Pinned versions with the 15-day cooldown (2026-10-24)

**Decision:** svelte 5.57.2, vite 8.3.4, @sveltejs/vite-plugin-svelte 7.3.1, vitest 5.0.3, typescript 6.0.3, svelte-check 4.7.6. Node 24.22.0. pnpm 11.5.0.

**Why:** Each version is at least 15 days old on 2026-10-24. TypeScript 7 (the Go port) is the npm `latest`, but svelte-check 4.7.x declares a peer range of `^5 || ^6`, so TypeScript 6 is the newest supported line.

## #5 — Knowledge propagates from dependents to prerequisites (2026-10-24)

**Decision:** A skill is unlocked when every prerequisite is known directly or implied. A prerequisite is implied when any skill that depends on it is known. Concepts with no exercises (such as place value) never gate. Implied skills are not teaching targets. The Knowledge view shows them as "implied".

**Why:** The diagnostic probes 20 skills. The first rule ("every prerequisite must be practiced and known") left most of the graph locked forever, because basic skills such as left-to-right addition were never probed and place value has no exercise at all. A learner who multiplies 47 × 23 correctly has shown the distributive split and left-to-right addition. The rule is one sentence and stays inspectable. Details: `docs/algorithm.md`.

## #6 — Assessments give no per-item feedback (2026-10-24)

**Decision:** The diagnostic and the monthly benchmark record each answer and move on. Only practice sessions show the correct answer and the worked route.

**Why:** An assessment measures. Showing answers during it teaches to the test and slows a 40-item run. It also removes a failure mode where the last item has no next question to continue to.

## #7 — Light illustrated theme by default (2026-10-24)

**Decision:** The default theme is light, with the user's three pastel illustrations as page backgrounds (WebP, 1600 and 900 px, under `public/bg/`). Cards and the nav are translucent white over the images. Dark stays plain with no image. The state document moved to version 2; a v1 `system` theme migrates to `light`.

**Why:** The light illustrated look is the intended default. Versioning the theme default instead of re-reading user settings keeps a stored `dark` or `system` choice intact and only moves the v1 `system` default.

## #8 — Start and Stop are the only run controls (2026-10-24)

**Decision:** No pause. A run (diagnostic part, session, benchmark, custom drill) has one Stop button, also on Esc. Stop keeps everything answered and returns to the page the run started from. Runs hide the tabs (focus mode). Parts 2 to 4 of the diagnostic run as the first block of the daily session, so Today has one card and one Start.

**Why:** Every answer is saved the moment it is given, so "pause" and "stop" were the same thing with two names and two buttons. A separate "Continue diagnostic" card next to the session plan made the user ask what to do first.

## #9 — Base facts are memorized, not derived (2026-10-24)

**Decision:** Knowledge opens with a study sheet of the base facts (full 15 × 15 table, complements, squares to 30, fraction equivalents, percent anchors), each block with a Drill button. Cells tint amber while a fact is shaky and green once known. Methods are taught; facts are studied and tested.

**Why:** The user's point: base knowledge is rote. Show the sheet, let the learner study it, then test it, instead of inferring from a placement item whether a fact is known.

## #10 — Rounds of 10 replace timed sessions; the app does not count time (2026-10-25)

**Decision:** The 30-minute session machine is gone. Practice happens in rounds of exactly 10 questions that end by themselves. No clocks, minutes, phases, Pause, or Resume anywhere; per-answer response time still feeds the spaced model. Mixed rounds interleave topics from weighted buckets (due, target, learning, new facts, maintenance) with a hard rule against repeating a topic twice in a row.

**Why:** The user will not sit through a 30-minute plan with long single-topic blocks; two minutes of one topic already bores them. Short varied rounds keep momentum, and interleaving is better pedagogy anyway. Everything still records per answer, so stopping loses nothing.

## #11 — Complements to 100/1000 are a method with the nines rule; only pairs to 10 are facts (2026-10-25)

**Decision:** The complements-100 and complements-1000 fact families (1,107 stored facts) are deleted. Complements to 10 stay facts (5 pairs). Larger complements are taught as a method: work from the right, keep trailing zeros, subtract the first non-zero digit from 10 and every digit to its left from 9. The skills `complements-100` and `complements-1000` changed kind from `fact` to `method`.

**Why:** 1,107 complement facts are not memorization, they are one rule applied digit by digit. Modeling them as facts would waste review effort on a skill that should be derived once and practiced as a method.

<!-- copy the block above for each new decision; never edit or delete past entries -->
