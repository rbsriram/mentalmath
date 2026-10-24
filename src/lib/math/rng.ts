// Seeded PRNG (mulberry32) and seed derivation (FNV-1a 32-bit).
// Determinism is a hard requirement: same seed gives the same sequence.

export interface Rng {
  next(): number; // in [0, 1)
  int(lo: number, hi: number): number; // inclusive
  pick<T>(arr: readonly T[]): T;
  shuffle<T>(arr: readonly T[]): T[]; // returns a new array
  chance(p: number): boolean;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function createRng(seed: number): Rng {
  const next = mulberry32(seed);
  return {
    next,
    int(lo: number, hi: number): number {
      return lo + Math.floor(next() * (hi - lo + 1));
    },
    pick<T>(arr: readonly T[]): T {
      if (arr.length === 0) throw new Error('rng: pick from empty array');
      return arr[Math.floor(next() * arr.length)]!;
    },
    shuffle<T>(arr: readonly T[]): T[] {
      const out = arr.slice();
      for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        const t = out[i]!;
        out[i] = out[j]!;
        out[j] = t;
      }
      return out;
    },
    chance(p: number): boolean {
      return next() < p;
    },
  };
}

// FNV-1a 32-bit hash of `${namespace}|${parts.join('|')}`.
// Namespaces in use: 'practice', 'diagnostic', 'benchmark', 'example'.
export function seedFor(namespace: string, ...parts: (string | number)[]): number {
  const s = `${namespace}|${parts.join('|')}`;
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}
