// Fraction templates.
// Operand ranges:
//   frac-to-dec-pct: fractions from the base-load equivalence set
//                    (includes non-terminating 1/3, 1/6, 1/9). Asks for the
//                    decimal or the percent. b0: denominators to 10;
//                    b1: denominators to 20; b2-3: the whole set to 50.
//   frac-of:         n/d of W where W = d x k.
//                    b0: d in {2,4,5,10}, k 2-20; b1: d in {2..12,16}, k 3-40;
//                    b2: d in {2..16,20,25}, k 10-80; b3: k up to 400.
//   frac-ops:        add/sub/mul of fractions with denominators 2-12.
//                    Answer is a fraction; inputMode 'text'.

import {
  isTerminating,
  mul as rmul,
  rat,
  toDecimal,
  toDisplay,
  type Rational,
} from '../../math/rational';
import { FRACTION_EQUIVALENTS } from '../../content/facts';
import type { Rng } from '../../math/rng';
import type { Question, Step, Template } from '../types';
import { fi, longDivision, R, step } from './common';

type Gen = Omit<Question, 'templateId' | 'seed' | 'band'>;

const EASY_DENOMS = [2, 4, 5, 10];
const MID_DENOMS = [2, 3, 4, 5, 6, 8, 9, 10, 12, 16];
const HARD_DENOMS = [2, 3, 4, 5, 6, 8, 9, 10, 12, 15, 16, 20, 25];

function gcdN(a: number, b: number): number {
  return b === 0 ? a : gcdN(b, a % b);
}

// Long-division route for n/d rendered as decimal or percent steps.
function conversionRoute(n: number, d: number, ask: 'decimal' | 'percent'): Step[] {
  const value = ask === 'percent' ? rat(100 * n, d) : rat(n, d);
  const scaled = ask === 'percent' ? BigInt(100 * n) : BigInt(n);
  const dd = BigInt(d);
  const steps: Step[] = [];
  const intPart = scaled / dd;
  const firstRem = scaled % dd;
  if (ask === 'percent') {
    steps.push(
      step(
        `${n}/${d} of 100: ${fi(scaled)} ÷ ${d} = ${fi(intPart)} remainder ${fi(firstRem)}`,
        R(intPart),
      ),
    );
  } else {
    steps.push(
      step(`${n} ÷ ${d} = ${fi(intPart)} remainder ${fi(firstRem)}`, R(intPart)),
    );
  }
  if (firstRem !== 0n) {
    let count = 0;
    for (const { dividend, digit, rem } of longDivision(scaled, dd, 4)) {
      steps.push(
        step(`${fi(dividend)} ÷ ${d} = ${fi(digit)} remainder ${fi(rem)}`, R(digit)),
      );
      count++;
      if (rem !== 0n && count >= 3) break; // show the repetition starting
    }
  }
  const shown = toDisplay(value);
  if (isTerminating(value)) {
    steps.push(
      step(
        ask === 'percent' ? `So ${n}/${d} = ${shown}%` : `So ${n}/${d} = ${shown}`,
        value,
      ),
    );
  } else {
    const approx = toDecimal(value, 3);
    steps.push(
      step(
        ask === 'percent'
          ? `So ${n}/${d} = ${approx}%… repeating, exactly ${shown}%`
          : `So ${n}/${d} = ${approx}… repeating, exactly ${shown}`,
        value,
      ),
    );
  }
  return steps;
}

export const fracToDecPct: Template = {
  id: 'frac-to-dec-pct',
  skill: 'frac-to-dec-pct',
  skills: ['fraction-equivalents'],
  smallSpace: true,
  generate(rng: Rng, band): Gen {
    const maxDenom = band === 0 ? 10 : band === 1 ? 20 : 50;
    const pool = FRACTION_EQUIVALENTS.filter(([, d]) => d <= maxDenom);
    const [n, d] = rng.pick(pool);
    const ask: 'decimal' | 'percent' = rng.chance(0.5) ? 'decimal' : 'percent';
    const value = ask === 'percent' ? rat(100 * n, d) : rat(n, d);
    return {
      prompt: `Write ${n}/${d} as ${ask === 'percent' ? 'a percent' : 'a decimal'}`,
      answer: {
        kind: 'exact',
        value,
        unit: ask === 'percent' ? 'percent' : 'number',
      },
      params: { n, d, ask },
      structure: `fraction to ${ask}`,
      strategies: ['frac-to-dec-pct'],
      route: conversionRoute(n, d, ask),
      inputMode: 'text',
    };
  },
};

export const fracOf: Template = {
  id: 'frac-of',
  skill: 'frac-of',
  generate(rng: Rng, band): Gen {
    const denoms = band === 0 ? EASY_DENOMS : band === 1 ? MID_DENOMS : HARD_DENOMS;
    const d = rng.pick(denoms);
    const n = rng.int(1, d - 1);
    const kMax = band === 0 ? 20 : band === 1 ? 40 : band === 3 ? 400 : 80;
    const k = rng.int(band === 0 ? 2 : 3, kMax);
    const W = d * k;
    const part = W / d;
    const result = part * n;
    const route: Step[] = [
      step(`${fi(W)} ÷ ${d} = ${fi(part)}`, R(part)),
      step(`${fi(part)} × ${n} = ${fi(result)}`, R(result)),
    ];
    return {
      prompt: `${n}/${d} of ${fi(W)}`,
      answer: { kind: 'exact', value: rat(result), unit: 'number' },
      params: { n, d, w: W },
      structure: `fraction of a quantity, denominator ${d}`,
      strategies: ['frac-of', 'div-reverse'],
      route,
      inputMode: 'decimal',
    };
  },
};

export const fracOps: Template = {
  id: 'frac-ops',
  skill: 'frac-ops',
  smallSpace: true,
  generate(rng: Rng, band): Gen {
    const denoms =
      band === 0 ? [2, 3, 4, 5] : band === 1 ? [2, 3, 4, 5, 6, 8] : [2, 3, 4, 5, 6, 8, 9, 10, 12];
    let d1 = rng.pick(denoms);
    let d2 = rng.pick(denoms);
    let n1 = rng.int(1, d1 - 1);
    let n2 = rng.int(1, d2 - 1);
    const op = rng.pick(band === 0 ? ['+', '−'] : ['+', '−', '×']);
    // Avoid a zero result: redraw the second fraction if it equals the first.
    for (let t = 0; t < 20 && n1 * d2 === n2 * d1 && op !== '×'; t++) {
      d2 = rng.pick(denoms);
      n2 = rng.int(1, d2 - 1);
    }
    if (op === '−' && rat(n1, d1).n * BigInt(d2) < rat(n2, d2).n * BigInt(d1)) {
      // Keep the difference non-negative: prompt the larger fraction first.
      [n1, n2] = [n2, n1];
      [d1, d2] = [d2, d1];
    }
    let result: Rational;
    let route: Step[];
    const show = (r: Rational) => (r.d === 1n ? r.n.toString() : `${r.n}/${r.d}`);
    if (op === '×') {
      result = rmul(rat(n1, d1), rat(n2, d2));
      route = [
        step(`${n1} × ${n2} = ${n1 * n2}`, R(n1 * n2)),
        step(`${d1} × ${d2} = ${d1 * d2}`, R(d1 * d2)),
        step(`${n1}/${d1} × ${n2}/${d2} = ${show(result)}`, result),
      ];
    } else {
      const g = gcdN(d1, d2);
      const comm = (d1 * d2) / g;
      const an = n1 * (comm / d1);
      const bn = n2 * (comm / d2);
      const rn = op === '+' ? an + bn : an - bn;
      result = rat(rn, comm);
      route = [
        step(
          `Common denominator ${fi(comm)}: ${n1}/${d1} = ${an}/${comm} and ${n2}/${d2} = ${bn}/${comm}`,
          R(comm),
        ),
        step(`${an} ${op} ${bn} = ${rn}`, R(rn)),
        step(`${n1}/${d1} ${op} ${n2}/${d2} = ${show(result)}`, result),
      ];
    }
    return {
      prompt: `${n1}/${d1} ${op} ${n2}/${d2}`,
      answer: { kind: 'exact', value: result, unit: 'number' },
      params: { n1, d1, n2, d2, op },
      structure: `fraction ${op === '×' ? 'product' : op === '+' ? 'sum' : 'difference'}`,
      strategies: ['frac-common-denominator'],
      route,
      inputMode: 'text',
    };
  },
};

export const FRACTION_TEMPLATES: Template[] = [fracToDecPct, fracOf, fracOps];
