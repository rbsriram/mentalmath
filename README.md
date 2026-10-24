# Mental Math

A local-first web app that trains mental arithmetic. It generates problems, teaches methods, tracks what you know, and plans a 30 minute daily session. All data stays in your browser.

## Requirements

- Node.js 24 (managed with [fnm](https://github.com/Schniz/fnm), see `.node-version`).
- pnpm 11 (`corepack enable` or `npm i -g pnpm`).

## Commands

```
fnm use            # pick up the pinned Node version
pnpm install       # install dependencies
pnpm dev           # dev server on http://localhost:5173
pnpm test          # run the Vitest suite
pnpm check         # type and Svelte check
pnpm build         # production build into dist/
pnpm preview       # serve dist/ locally
```

## Keys

- Enter: submit an answer, continue after feedback, start a session.
- Space: skip an empty answer box; continue after an answer.
- r: show or hide the worked route after an answer.
- Esc: pause a session, stop on a block card, close the keys card.
- Option + 1 to 4 (Alt on Windows and Linux): Today, Practice, Knowledge, Progress.
- ?: the keys card.

## Install as an app

- Safari on macOS: File, then Add to Dock.
- iOS: Share, then Add to Home Screen.
- Chrome or Edge: the install icon in the address bar.

The app works offline after the first visit. A service worker precaches the build.

## Data

Progress lives in an IndexedDB database named `mentalmath` in the browser profile. Nothing leaves the device. Use Progress then Export to download a JSON backup, and Progress then Import to restore it. Reset erases everything on this device.

## Deploy to GitHub Pages

The repo carries `.github/workflows/pages.yml`. It only matters once a GitHub remote exists. Push to `main`, enable Pages with the GitHub Actions source, and the workflow builds with `BASE_PATH=/mentalmath/` and deploys `dist/`. For a different repo name, set `BASE_PATH` to match.

## Layout

- `src/lib/math/` exact rational arithmetic, formatting, seeded RNG.
- `src/lib/engine/` question types, answer checking, the template registry.
- `src/lib/engine/templates/` 45 problem generators across ten families.
- `src/lib/content/` skill graph, fact families, method cards.
- `src/lib/learn/` records, scheduler, session, diagnostic, benchmark, progress.
- `src/lib/store/` storage boundary, IndexedDB, export and import.
- `src/components/` question runner, route display, method cards, bars, fact grids.
- `src/views/` Today, Practice, Knowledge, Progress.
- `tests/` Vitest suite.
- `docs/` brief, decisions, state, algorithm notes, content sources.

## Docs

- `docs/mental-math-devin-brief.md`: the product brief.
- `docs/algorithm.md`: how spacing, unlocking, sessions, and benchmarks work.
- `docs/content-sources.md`: where the methods came from and what was rejected.
- `docs/DECISIONS.md`, `docs/STATE.md`: project history and status.

## License

Apache-2.0. See `LICENSE`.
