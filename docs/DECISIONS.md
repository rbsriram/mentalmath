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

<!-- copy the block above for each new decision; never edit or delete past entries -->
