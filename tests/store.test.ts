import { describe, expect, it } from 'vitest';
import { MemoryStorage } from '../src/lib/store/storage';
import { exportData, exportFilename, importData } from '../src/lib/store/export';
import { newState } from '../src/lib/learn/state';
import type { Attempt } from '../src/lib/learn/attempt';

const T0 = new Date(2025, 0, 10, 9, 0, 0).getTime();

const att = (n: number): Attempt => ({
  ts: T0 + n,
  templateId: 'add-two',
  seed: n,
  band: 1,
  skill: 'add-left-to-right',
  correct: n % 2 === 0,
  ms: 1000 + n,
  given: '12',
  prompt: '5 + 7',
  answer: '12',
  phase: 'practice',
});

describe('MemoryStorage', () => {
  it('round-trips state and attempts', async () => {
    const store = new MemoryStorage();
    expect(await store.loadState()).toBeNull();
    const s = newState(T0);
    await store.saveState(s);
    expect(await store.loadState()).toEqual(s);
    await store.addAttempt(att(1));
    await store.addAttempt(att(2));
    expect((await store.allAttempts()).length).toBe(2);
  });

  it('replaceAll swaps the whole dataset', async () => {
    const store = new MemoryStorage();
    await store.saveState(newState(T0));
    await store.addAttempt(att(1));
    const s2 = newState(T0 + 999);
    await store.replaceAll(s2, [att(9), att(10), att(11)]);
    expect((await store.loadState())!.createdAt).toBe(T0 + 999);
    expect((await store.allAttempts()).length).toBe(3);
    await store.clear();
    expect(await store.loadState()).toBeNull();
    expect(await store.allAttempts()).toEqual([]);
  });

  it('returns clones, not live references', async () => {
    const store = new MemoryStorage();
    const s = newState(T0);
    await store.saveState(s);
    const loaded = await store.loadState();
    loaded!.skills['x'] = { ...newState(T0).settings } as never;
    expect((await store.loadState())!.skills['x']).toBeUndefined();
  });
});

describe('export/import', () => {
  it('round-trips through exportData/importData', () => {
    const state = newState(T0);
    const attempts = [att(1), att(2)];
    const doc = exportData(state, attempts);
    expect(doc.format).toBe('mentalmath-export');
    expect(doc.version).toBe(4);
    const back = importData(JSON.parse(JSON.stringify(doc)));
    expect(back.state.createdAt).toBe(T0);
    expect(back.attempts.length).toBe(2);
  });

  it('rejects bad envelopes and malformed attempts', () => {
    expect(() => importData({})).toThrow('unsupported export');
    expect(() => importData({ format: 'other', state: newState(T0), attempts: [] })).toThrow(
      'unsupported export',
    );
    expect(() =>
      importData({ format: 'mentalmath-export', state: newState(T0), attempts: [{ ts: 'x' }] }),
    ).toThrow('unsupported export');
    expect(() =>
      importData({ format: 'mentalmath-export', state: { version: 9 }, attempts: [] }),
    ).toThrow('unsupported export');
  });

  it('names exports by local date', () => {
    expect(exportFilename(T0)).toMatch(/^mentalmath-\d{4}-\d{2}-\d{2}\.json$/);
  });
});
