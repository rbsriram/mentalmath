import { describe, expect, it } from 'vitest';
import { createRng, seedFor } from '../src/lib/math/rng';

describe('createRng', () => {
  it('is deterministic: same seed gives the same first 50 values', () => {
    const a = createRng(42);
    const b = createRng(42);
    for (let i = 0; i < 50; i++) {
      expect(a.next()).toBe(b.next());
    }
  });

  it('differs across seeds', () => {
    const a = createRng(1);
    const b = createRng(2);
    const seqA = Array.from({ length: 10 }, () => a.next());
    const seqB = Array.from({ length: 10 }, () => b.next());
    expect(seqA).not.toEqual(seqB);
  });

  it('stays inside int() bounds over 10k draws', () => {
    const rng = createRng(7);
    let min = Infinity;
    let max = -Infinity;
    for (let i = 0; i < 10000; i++) {
      const v = rng.int(-5, 17);
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(-5);
      expect(v).toBeLessThanOrEqual(17);
      min = Math.min(min, v);
      max = Math.max(max, v);
    }
    expect(min).toBe(-5);
    expect(max).toBe(17);
  });

  it('next() stays in [0, 1)', () => {
    const rng = createRng(99);
    for (let i = 0; i < 1000; i++) {
      const v = rng.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('shuffle returns a new permutation and leaves the input alone', () => {
    const rng = createRng(3);
    const src = [1, 2, 3, 4, 5, 6, 7, 8];
    const out = rng.shuffle(src);
    expect(out).not.toBe(src);
    expect(src).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect([...out].sort()).toEqual(src);
  });

  it('pick and chance work', () => {
    const rng = createRng(11);
    const item = rng.pick(['a', 'b', 'c']);
    expect(['a', 'b', 'c']).toContain(item);
    expect(rng.chance(1)).toBe(true);
    expect(rng.chance(0)).toBe(false);
    expect(() => rng.pick([])).toThrow();
  });
});

describe('seedFor', () => {
  it('is stable and deterministic', () => {
    expect(seedFor('practice', 'add-two', 7)).toBe(seedFor('practice', 'add-two', 7));
    expect(seedFor('practice', 'add-two', 7)).not.toBe(seedFor('practice', 'add-two', 8));
    expect(seedFor('benchmark', 1)).not.toBe(seedFor('practice', 1));
  });

  it('returns a 32-bit unsigned int', () => {
    const s = seedFor('example', 'mul-by-5', 0);
    expect(Number.isInteger(s)).toBe(true);
    expect(s).toBeGreaterThanOrEqual(0);
    expect(s).toBeLessThan(2 ** 32);
  });
});
