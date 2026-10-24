# STATE — mentalmath

_A living snapshot of where this project is. Update it as things change, or via wind-down.
Goal: a new session reads this and continues immediately, without re-reading the codebase._

Last updated: 2026-10-24

## Where it is

Project started 2026-10-24. The spec is `docs/mental-math-devin-brief.md`. The foundation source is `docs/mental-math-base-load-cheatsheet.pdf`. The stack review is done (see `docs/DECISIONS.md` #1 to #4). Implementation is in progress. Nothing runs yet.

No git remote exists. The state lives on one machine only until a remote is added.

## How it is built (one breath)

A static PWA. Svelte 5 + TypeScript + Vite 8, runtime dependency `svelte` only. Pure TypeScript modules do the work: exact rational arithmetic (BigInt), a seeded RNG, parameterized question templates with worked routes, a skill graph with a method catalog, an inspectable mastery model with a spaced scheduler, a 30-minute session state machine, a first-run diagnostic, and a monthly equated benchmark. Learner data is one versioned JSON document plus an append-only attempt log in IndexedDB, with JSON export and import. A hand-written service worker gives offline use.

## Run and test

Planned commands (confirm once the scaffold lands):

- `fnm use` then `pnpm install`
- `pnpm dev` : local dev server
- `pnpm test` : Vitest
- `pnpm check` : svelte-check
- `pnpm build` then `pnpm preview` : production build

## Known limitations

- A browser engine is the memory floor. A terminal UI would be lighter, but the brief requires mobile use (#1).
- Real file writes are not portable from Safari or iOS. Flat data lives in IndexedDB; export produces the file (#2).
- TypeScript 7 is not supported by svelte-check 4.7.x, so the project uses TypeScript 6 (#4).

## Next / in flight

1. Scaffold the project with pinned versions and build the math core, content, templates, and tests.
2. Build the learning layer (model, scheduler, session, diagnostic, benchmark) and the storage layer.
3. Build the four views, the service worker, the README, and the algorithm and content-source docs.

## Open threads / decisions needed

- Add a git remote (GitHub) so state is not single-machine. Needs the user.
- Hosting for daily use: `pnpm preview` locally or GitHub Pages. The build supports both with a base-path variable.
- If the user drops the mobile requirement, a terminal UI becomes the lighter stack (#1).
