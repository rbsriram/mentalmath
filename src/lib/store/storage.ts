// Storage boundary: one versioned State document plus an append-only
// attempt log. `MemoryStorage` is the test implementation; `IdbStorage`
// (idb.ts) is the browser one. Values crossing this boundary must be plain
// structured-clone-safe objects (no proxies); MemoryStorage mirrors that
// by cloning on every read and write.

import type { Attempt } from '../learn/attempt';
import type { State } from '../learn/state';

export interface Storage {
  loadState(): Promise<State | null>;
  saveState(s: State): Promise<void>;
  addAttempt(a: Attempt): Promise<void>;
  allAttempts(): Promise<Attempt[]>;
  replaceAll(state: State, attempts: Attempt[]): Promise<void>;
  clear(): Promise<void>;
}

const clone = <T>(v: T): T => structuredClone(v);

export class MemoryStorage implements Storage {
  private state: State | null = null;
  private attempts: Attempt[] = [];

  async loadState(): Promise<State | null> {
    return this.state === null ? null : clone(this.state);
  }

  async saveState(s: State): Promise<void> {
    this.state = clone(s);
  }

  async addAttempt(a: Attempt): Promise<void> {
    this.attempts.push(clone(a));
  }

  async allAttempts(): Promise<Attempt[]> {
    return clone(this.attempts);
  }

  async replaceAll(state: State, attempts: Attempt[]): Promise<void> {
    this.state = clone(state);
    this.attempts = clone(attempts);
  }

  async clear(): Promise<void> {
    this.state = null;
    this.attempts = [];
  }
}
