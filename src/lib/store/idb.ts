// Raw IndexedDB storage. DB "mentalmath", version 1: a `kv` store holding
// the state document under the key "state", and an `attempts` store with
// auto-increment keys and a `ts` index. No library.

import type { Attempt } from '../learn/attempt';
import type { State } from '../learn/state';
import type { Storage } from './storage';

const DB_NAME = 'mentalmath';
const DB_VERSION = 1;

function req<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error ?? new Error('idb request failed'));
  });
}

// Runs requests inside one transaction and resolves with their results.
function withStore(
  db: IDBDatabase,
  stores: string[],
  mode: IDBTransactionMode,
  fn: (tx: IDBTransaction) => IDBRequest<any>[],
): Promise<unknown[]> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(stores, mode);
    const pending = fn(tx).map((r) => req<unknown>(r));
    tx.oncomplete = () => void Promise.all(pending).then(resolve);
    tx.onerror = () => reject(tx.error ?? new Error('idb transaction failed'));
    tx.onabort = () => reject(tx.error ?? new Error('idb transaction aborted'));
  });
}

export class IdbStorage implements Storage {
  private dbPromise: Promise<IDBDatabase> | null = null;

  private openDb(): Promise<IDBDatabase> {
    this.dbPromise ??= new Promise((resolve, reject) => {
      const open = indexedDB.open(DB_NAME, DB_VERSION);
      open.onupgradeneeded = () => {
        const db = open.result;
        if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv');
        if (!db.objectStoreNames.contains('attempts')) {
          const store = db.createObjectStore('attempts', { autoIncrement: true });
          store.createIndex('ts', 'ts');
        }
      };
      open.onsuccess = () => resolve(open.result);
      open.onerror = () => reject(open.error ?? new Error('idb open failed'));
    });
    return this.dbPromise;
  }

  async loadState(): Promise<State | null> {
    const db = await this.openDb();
    const [v] = await withStore(db, ['kv'], 'readonly', (tx) => [
      tx.objectStore('kv').get('state'),
    ]);
    return (v as State | undefined) ?? null;
  }

  async saveState(s: State): Promise<void> {
    const db = await this.openDb();
    await withStore(db, ['kv'], 'readwrite', (tx) => [
      tx.objectStore('kv').put(s, 'state'),
    ]);
  }

  async addAttempt(a: Attempt): Promise<void> {
    const db = await this.openDb();
    await withStore(db, ['attempts'], 'readwrite', (tx) => [
      tx.objectStore('attempts').add(a),
    ]);
  }

  async allAttempts(): Promise<Attempt[]> {
    const db = await this.openDb();
    const [all] = await withStore(db, ['attempts'], 'readonly', (tx) => [
      tx.objectStore('attempts').getAll(),
    ]);
    return all as Attempt[];
  }

  async replaceAll(state: State, attempts: Attempt[]): Promise<void> {
    const db = await this.openDb();
    await withStore(db, ['kv', 'attempts'], 'readwrite', (tx) => {
      const kv = tx.objectStore('kv');
      const att = tx.objectStore('attempts');
      return [
        kv.clear(),
        att.clear(),
        ...attempts.map((a) => att.add(a)),
        kv.put(state, 'state'),
      ];
    });
  }

  async clear(): Promise<void> {
    const db = await this.openDb();
    await withStore(db, ['kv', 'attempts'], 'readwrite', (tx) => [
      tx.objectStore('kv').clear(),
      tx.objectStore('attempts').clear(),
    ]);
  }
}
