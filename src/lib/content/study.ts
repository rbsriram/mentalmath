// The base-knowledge sheet: everything meant to be memorized, in one
// deterministic structure for the Knowledge view. Pure and seeded so the
// examples stay stable between sessions.

import {
  complementFactId,
  FRACTION_EQUIVALENTS,
  fractionFactId,
  PERCENT_ANCHORS,
  percentAnchorFactId,
  squareFactId,
  tableFactId,
} from './facts';
import { isTerminating, rat, toDecimal, toDisplay } from '../math/rational';

export interface StudyTable {
  rows: number[];
  cols: number[];
  cells: { product: number; factId: string }[][];
}

export interface StudyComplement {
  // The five digit pairs to 10, the only complements to memorize.
  pairs: { a: number; b: number; factId: string }[];
  rule: string;
  examples: { base: 100 | 1000; n: number; complement: number }[];
}

export interface StudySheet {
  tables: StudyTable;
  complements: StudyComplement;
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

// Complements to 100 and 1,000 are a rule, not memorized pairs. The rule
// text is the user's wording; the worked examples are fixed, not seeded.
const COMPLEMENT_RULE =
  'Work from the right. Keep all trailing zeros. Subtract the first non-zero digit from 10, then every digit to its left from 9.';
const COMPLEMENT_EXAMPLES: StudyComplement['examples'] = [
  { base: 100, n: 68, complement: 32 },
  { base: 100, n: 40, complement: 60 },
  { base: 100, n: 7, complement: 93 },
  { base: 100, n: 25, complement: 75 },
  { base: 1000, n: 437, complement: 563 },
  { base: 1000, n: 370, complement: 630 },
  { base: 1000, n: 900, complement: 100 },
  { base: 1000, n: 55, complement: 945 },
];

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

  const pairs = [1, 2, 3, 4, 5].map((a) => ({
    a,
    b: 10 - a,
    factId: complementFactId(10, a),
  }));
  const complements: StudyComplement = {
    pairs,
    rule: COMPLEMENT_RULE,
    examples: COMPLEMENT_EXAMPLES,
  };

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
