// Recall-fact families with deterministic ids. The learning model tracks
// each fact by id, so ids must be stable and canonical.

export const FACT_FAMILIES = [
  'tables',
  'squares',
  'complements-10',
  'complements-100',
  'complements-1000',
  'fraction-equivalents',
  'percent-anchors',
] as const;

export type FactFamily = (typeof FACT_FAMILIES)[number];

// Canonical fact id for a multiplication fact. Order is normalized.
export function tableFactId(a: number, b: number): string {
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  return `t:${lo}x${hi}`;
}

export function squareFactId(n: number): string {
  return `sq:${n}`;
}

export function complementFactId(base: 10 | 100 | 1000, n: number): string {
  return `c${base}:${n}`;
}

// Numerator and denominator must already be in lowest terms.
export function fractionFactId(numerator: number, denominator: number): string {
  return `fe:${numerator}/${denominator}`;
}

export function percentAnchorFactId(p: number): string {
  return `pa:${p}`;
}

// The fraction-equivalence set from the foundation sheet, plus the
// requested extras (3/16, 5/16, 7/16, 1/12, 1/15, 1/25, 1/50).
export const FRACTION_EQUIVALENTS: ReadonlyArray<readonly [number, number]> = [
  [1, 2],
  [1, 3],
  [2, 3],
  [1, 4],
  [3, 4],
  [1, 5],
  [2, 5],
  [3, 5],
  [4, 5],
  [1, 6],
  [1, 8],
  [3, 8],
  [5, 8],
  [7, 8],
  [1, 9],
  [1, 10],
  [1, 12],
  [1, 15],
  [1, 16],
  [3, 16],
  [5, 16],
  [7, 16],
  [1, 20],
  [1, 25],
  [1, 50],
];

export const PERCENT_ANCHORS: readonly number[] = [5, 10, 20, 25, 50, 75];

// All fact ids in a finite family. Complements cover 1..base-1.
export function listFacts(family: FactFamily): string[] {
  switch (family) {
    case 'tables': {
      const out: string[] = [];
      for (let a = 1; a <= 15; a++) {
        for (let b = a; b <= 15; b++) out.push(tableFactId(a, b));
      }
      return out;
    }
    case 'squares': {
      const out: string[] = [];
      for (let n = 1; n <= 30; n++) out.push(squareFactId(n));
      return out;
    }
    case 'complements-10': {
      const out: string[] = [];
      for (let n = 1; n <= 9; n++) out.push(complementFactId(10, n));
      return out;
    }
    case 'complements-100': {
      const out: string[] = [];
      for (let n = 1; n <= 99; n++) out.push(complementFactId(100, n));
      return out;
    }
    case 'complements-1000': {
      const out: string[] = [];
      for (let n = 1; n <= 999; n++) out.push(complementFactId(1000, n));
      return out;
    }
    case 'fraction-equivalents':
      return FRACTION_EQUIVALENTS.map(([n, d]) => fractionFactId(n, d));
    case 'percent-anchors':
      return PERCENT_ANCHORS.map((p) => percentAnchorFactId(p));
  }
}

// The fact family a fact id belongs to, or null for a malformed id.
export function factFamilyOf(factId: string): FactFamily | null {
  const m = /^(t|sq|c10|c100|c1000|fe|pa):(.+)$/.exec(factId);
  if (!m) return null;
  switch (m[1]) {
    case 't':
      return /^1?[0-9]x1?[0-9]$/.test(m[2]!) ? 'tables' : null;
    case 'sq':
      return /^\d+$/.test(m[2]!) ? 'squares' : null;
    case 'c10':
      return 'complements-10';
    case 'c100':
      return 'complements-100';
    case 'c1000':
      return 'complements-1000';
    case 'fe':
      return /^\d+\/\d+$/.test(m[2]!) ? 'fraction-equivalents' : null;
    case 'pa':
      return /^\d+$/.test(m[2]!) ? 'percent-anchors' : null;
    default:
      return null;
  }
}

// The skill a fact belongs to, used for speed targets and family progress.
export function familySkillForFact(factId: string): string | null {
  const family = factFamilyOf(factId);
  if (family === null) return null;
  if (family === 'tables') {
    const m = /^t:(\d+)x(\d+)$/.exec(factId);
    if (!m) return null;
    return Math.max(Number(m[1]), Number(m[2])) <= 10 ? 'tables-1-10' : 'tables-11-15';
  }
  if (family === 'squares') {
    const n = Number(factId.slice(3));
    return n <= 25 ? 'squares-1-25' : 'squares-26-50';
  }
  if (family === 'complements-10') return 'complements-10';
  if (family === 'complements-100') return 'complements-100';
  if (family === 'complements-1000') return 'complements-1000';
  if (family === 'fraction-equivalents') return 'fraction-equivalents';
  return 'percent-anchors';
}
