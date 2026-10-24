// App-level runes store: the loaded state document, lazy attempt log,
// current view, and the storage boundary. Views read `app`; mutations go
// through `commit` (debounced persist) and `logAttempt`.

import type { Attempt } from './learn/attempt';
import { localDay } from './learn/model';
import { finishSession } from './learn/session';
import { migrate, newState, type State } from './learn/state';
import { IdbStorage } from './store/idb';
import type { Storage } from './store/storage';

export type View = 'today' | 'practice' | 'knowledge' | 'progress';
export type PracticeMode = 'session' | 'diagnostic' | 'benchmark' | 'custom';

export const app = $state({
  ready: false,
  error: null as string | null,
  state: null as State | null,
  attempts: [] as Attempt[],
  attemptsLoaded: false,
  view: 'today' as View,
  detail: null as string | null,
  practiceMode: 'session' as PracticeMode,
  customSkills: [] as string[],
  customBand: null as number | null,
});

let storage: Storage | null = null;
let saveTimer: ReturnType<typeof setTimeout> | null = null;

export function getStorage(): Storage {
  storage ??= new IdbStorage();
  return storage;
}

// Loads the state document once, finishing any leftover session from an
// earlier day. Safe to call more than once.
export async function init(store: Storage = getStorage()): Promise<void> {
  try {
    let s = await store.loadState();
    if (s === null) {
      s = newState(Date.now());
      void navigator.storage?.persist?.();
    } else {
      s = migrate(s);
      // A session from a previous day is closed out silently; a fresh plan
      // is shown today.
      if (
        s.session !== null &&
        !s.session.completed &&
        s.session.date !== localDay(Date.now())
      ) {
        s = finishSession(s, s.session, Date.now());
      }
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

// Sets the state without persisting; used for per-second session ticks so
// IndexedDB stays quiet. Any later commit or flush saves the same data.
export function commitQuiet(next: State): void {
  app.state = next;
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
  if (head === 'practice' || head === 'knowledge' || head === 'progress' || head === 'today') {
    app.view = head;
    app.detail = head === 'knowledge' && rest.length > 0 ? rest.join('/') : null;
  } else {
    app.view = 'today';
    app.detail = null;
  }
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
  customSkills: string[] = [],
  customBand: number | null = null,
): void {
  app.practiceMode = mode;
  app.customSkills = customSkills;
  app.customBand = customBand;
  go('practice');
}
