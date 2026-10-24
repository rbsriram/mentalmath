// Recall-fact families with deterministic ids. The learning model tracks
// each fact by id, so ids must be stable and canonical.

export const FACT_FAMILIES = [
  'tables',
  'squares',
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

export function complementFactId(base: 100 | 1000, n: number): string {
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
