// App-level runes store: the loaded state document, lazy attempt log,
// current view, and the storage boundary. Views read `app`; mutations go
// through `commit` (debounced persist) and `logAttempt`.

import type { Attempt } from './learn/attempt';
import type { RoundKind } from './learn/round';
import type { Band } from './engine/types';
import { migrate, newState, type State } from './learn/state';
import { IdbStorage } from './store/idb';
import type { Storage } from './store/storage';

export type View = 'today' | 'practice' | 'knowledge' | 'progress';
export type PracticeMode = 'round' | 'diagnostic' | 'benchmark';

export const app = $state({
  ready: false,
  error: null as string | null,
  state: null as State | null,
  attempts: [] as Attempt[],
  attemptsLoaded: false,
  view: 'today' as View,
  detail: null as string | null,
  keysOpen: false,
  updateReady: false,
  practiceMode: 'round' as PracticeMode,
  // Options handed to the next round run (kind/topic/skills/band).
  roundOpts: {} as {
    kind?: RoundKind;
    topic?: string;
    skills?: string[];
    band?: Band | null;
  },
  // One-shot intent set by startPractice and consumed by the Practice
  // view; cleared whenever the view changes away from practice.
  practiceExplicit: false,
  // Focus mode: a run owns the screen (nav hidden) until it ends or
  // Stop takes the user back to runOrigin.
  running: false,
  runOrigin: 'today' as 'today' | 'practice' | 'knowledge',
});

let storage: Storage | null = null;
let saveTimer: ReturnType<typeof setTimeout> | null = null;

export function getStorage(): Storage {
  storage ??= new IdbStorage();
  return storage;
}

// Loads the state document once. Safe to call more than once.
export async function init(store: Storage = getStorage()): Promise<void> {
  try {
    let s = await store.loadState();
    if (s === null) {
      s = newState(Date.now());
      void navigator.storage?.persist?.();
    } else {
      s = migrate(s);
    }
    app.state = s;
    app.ready = true;
    syncFromHash();
  } catch (e) {
    app.error = e instanceof Error ? e.message : String(e);
    app.ready = true;
  }
}

// Loads the attempt log on first use (Progress, diagnostic/benchmark
// finish).
export async function loadAttempts(): Promise<Attempt[]> {
  if (!app.attemptsLoaded) {
    app.attempts = await getStorage().allAttempts();
    app.attemptsLoaded = true;
  }
  return app.attempts;
}

export function commit(next: State): void {
  app.state = next;
  scheduleSave(next);
}

export function logAttempt(a: Attempt): void {
  void getStorage().addAttempt(a);
  if (app.attemptsLoaded) {
    app.attempts = [...app.attempts, a];
  }
}

function scheduleSave(s: State): void {
  if (saveTimer !== null) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    void getStorage().saveState($state.snapshot(s));
  }, 300);
}

// Writes any pending save immediately; called on page hide.
export function flush(): void {
  if (saveTimer !== null) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  if (app.state !== null) {
    void getStorage().saveState($state.snapshot(app.state));
  }
}

// Hash routing: #today #practice #knowledge #knowledge/<id> #progress.
export function syncFromHash(): void {
  const hash = location.hash.replace(/^#/, '');
  const [head, ...rest] = hash.split('/');
  const before = app.view;
  if (head === 'practice' || head === 'knowledge' || head === 'progress' || head === 'today') {
    app.view = head;
    app.detail = head === 'knowledge' && rest.length > 0 ? rest.join('/') : null;
  } else {
    app.view = 'today';
    app.detail = null;
  }
  if (app.view !== 'practice') app.practiceExplicit = false;
  if (app.view !== before) window.scrollTo(0, 0);
}

export function go(view: View, detail: string | null = null): void {
  const hash =
    view === 'knowledge' && detail !== null
      ? `#knowledge/${detail}`
      : `#${view}`;
  if (location.hash === hash) syncFromHash();
  else location.hash = hash;
}

export function startPractice(
  mode: PracticeMode,
  opts: {
    kind?: RoundKind;
    topic?: string;
    skills?: string[];
    band?: Band | null;
  } = {},
  runOrigin: 'today' | 'practice' | 'knowledge' = 'today',
): void {
  app.practiceMode = mode;
  app.practiceExplicit = true;
  app.roundOpts = opts;
  app.runOrigin = runOrigin;
  app.running = true;
  go('practice');
}

// Test-harness hook: dev builds and ?harness=1 only. Practice.svelte
// extends the same object with question helpers.
const HARNESS =
  import.meta.env.MODE !== 'production' ||
  (typeof location !== 'undefined' &&
    new URLSearchParams(location.search).has('harness'));
if (HARNESS) {
  (window as unknown as { __mm: Record<string, unknown> }).__mm = {
    state: () => (app.state ? $state.snapshot(app.state) : null),
    showUpdate: () => (app.updateReady = true),
  };
}

export function harnessHook(): Record<string, unknown> | null {
  return HARNESS
    ? ((window as unknown as { __mm: Record<string, unknown> }).__mm ?? null)
    : null;
}
