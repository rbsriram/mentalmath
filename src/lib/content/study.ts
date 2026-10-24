// The base-knowledge sheet: everything meant to be memorized, in one
// deterministic structure for the Knowledge view. Pure and seeded so the
// examples stay stable between sessions.

import {
  FRACTION_EQUIVALENTS,
  fractionFactId,
  PERCENT_ANCHORS,
  percentAnchorFactId,
  squareFactId,
  tableFactId,
} from './facts';
import { isTerminating, rat, toDecimal, toDisplay } from '../math/rational';
import { createRng, seedFor } from '../math/rng';

export interface StudyTable {
  rows: number[];
  cols: number[];
  cells: { product: number; factId: string }[][];
}

export interface StudyComplement {
  base: 10 | 100 | 1000;
  rule: string;
  examples: { n: number; complement: number }[];
}

export interface StudySheet {
  tables: StudyTable;
  complements: StudyComplement[];
  squares: { n: number; sq: number; factId: string }[];
  fractions: { fraction: string; decimal: string; percent: string; factId: string }[];
  anchors: { percent: number; method: string; example: string; factId: string }[];
}

const ANCHOR_METHOD: Record<number, string> = {
  5: 'Half of 10%',
  10: 'Divide by 10',
  20: 'Two tenths (divide by 5)',
  25: 'Divide by 4',
  50: 'Divide by 2',
  75: 'Half plus a quarter',
};

const COMPLEMENT_RULE: Record<number, string> = {
  10: 'The digit you add to reach 10.',
  100: 'First digit goes to 9, the last goes to 10.',
  1000: 'Every digit goes to 9 except the last, which goes to 10.',
};

function decOf(n: number, d: number): string {
  const v = rat(n, d);
  if (isTerminating(v)) return toDisplay(v);
  // Show enough decimals for three significant digits so the printed
  // value is a valid typed answer (0.083 needs four places).
  for (const p of [3, 4, 5]) {
    const dec = toDecimal(v, p);
    if (dec.replace(/[^0-9]/g, '').replace(/^0+/, '').length >= 3) {
      return `${dec}…`;
    }
  }
  return `${toDecimal(v, 5)}…`;
}

export function studySheet(): StudySheet {
  const range = Array.from({ length: 15 }, (_, i) => i + 1);
  const cells = range.map((a) =>
    range.map((b) => ({ product: a * b, factId: tableFactId(a, b) })),
  );

  const bases = [10, 100, 1000] as const;
  const complements: StudyComplement[] = bases.map((base) => {
    const examples = Array.from({ length: 6 }, (_, i) => {
      const n = createRng(seedFor('study', base, i)).int(1, base - 1);
      return { n, complement: base - n };
    });
    return { base, rule: COMPLEMENT_RULE[base]!, examples };
  });

  const squares = Array.from({ length: 30 }, (_, i) => {
    const n = i + 1;
    return { n, sq: n * n, factId: squareFactId(n) };
  });

  const fractions = FRACTION_EQUIVALENTS.map(([n, d]) => ({
    fraction: `${n}/${d}`,
    decimal: decOf(n, d),
    percent: `${decOf(100 * n, d)}%`,
    factId: fractionFactId(n, d),
  }));

  // 80 divides cleanly by every anchor percent, keeping examples honest.
  const anchors = PERCENT_ANCHORS.map((p) => ({
    percent: p,
    method: ANCHOR_METHOD[p]!,
    example: `${p}% of 80 = ${(80 * p) / 100}`,
    factId: percentAnchorFactId(p),
  }));

  return {
    tables: { rows: range, cols: range, cells },
    complements,
    squares,
    fractions,
    anchors,
  };
}
