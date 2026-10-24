// Subtraction templates.
// Operand ranges:
//   sub:        b0: a 20-99, b 11..a-1;
//               b1: a 100-999, b 11..a-1;
//               b2: half the time a is a round k x 1,000 up to 10,000
//                   with b 3-4 digits below a; otherwise a,b 3-4 digits, a > b;
//               b3: a 10,000-99,999, b 1,000..a-1.
//   complement: b0: to 10 (n 1-9); b1: to 100 (n 1-99);
//               b2: to 1,000 (n 1-999); b3: to 10,000 (n 1,000-9,999).

import { rat } from '../../math/rational';
import { complementFactId } from '../../content/facts';
import type { Rng } from '../../math/rng';
import type { Band, Question, Step, Template } from '../types';
import { fi, R, step, subPartsRoute } from './common';

type Gen = Omit<Question, 'templateId' | 'seed' | 'band' | 'skill' | 'skills'>;

// All-from-9-last-from-10 route for 10^k - n. The digit taken from 10 is the
// last NONZERO digit of n (padded to k digits); trailing zeros stay zero.
// So 1,000 - 100 = 900, and 1,000 - 120 = 880.
function complementRoute(base: number, n: number): Step[] {
  const k = String(base).length - 1;
  const digits = String(n).padStart(k, '0').split('').map(Number);
  let lastNZ = 0;
  for (let i = digits.length - 1; i >= 0; i--) {
    if (digits[i] !== 0) {
      lastNZ = i;
      break;
    }
  }
  const steps: Step[] = [
    step(
      `Take each digit of ${fi(n)} from 9 except the last nonzero, which comes from 10 (target ${fi(base)})`,
      R(base),
    ),
  ];
  for (let i = 0; i <= lastNZ; i++) {
    const from = i === lastNZ ? 10 : 9;
    const c = from - digits[i]!;
    steps.push(step(`${from} − ${digits[i]} = ${c}`, R(c)));
  }
  if (lastNZ < digits.length - 1) {
    steps.push(step('Trailing zeros stay 0', R(0)));
  }
  const result = base - n;
  steps.push(step(`Join the digits: ${fi(result)}`, R(result)));
  return steps;
}

export const sub: Template = {
  id: 'sub',
  skill: 'sub-left-to-right',
  skills: ['sub-complements', 'sub-compensation'],
  generate(rng: Rng, band): Gen {
    let a: number;
    let b: number;
    let structure: string;
    if (band === 0) {
      a = rng.int(20, 99);
      b = rng.int(11, a - 1);
      structure = 'difference of two 2-digit numbers';
    } else if (band === 1) {
      a = rng.int(100, 999);
      b = rng.int(11, a - 1);
      structure = 'difference, 3-digit minus up to 3-digit';
    } else if (band === 2) {
      if (rng.chance(0.5)) {
        // Round-minus-irregular style: 10,000 − 6,785.
        const mult = rng.pick([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
        a = mult * 1000;
        b = rng.int(101, Math.min(9999, a - 1));
        structure = 'round thousand minus 3-4 digit number';
      } else {
        a = rng.int(1000, 9999);
        b = rng.int(101, a - 1);
        structure = 'difference, 4-digit minus 3-4 digit';
      }
    } else {
      a = rng.int(10000, 99999);
      b = rng.int(1000, a - 1);
      structure = 'difference, 5-digit minus 4-5 digit';
    }
    const result = a - b;
    const isPow10 = /^10+$/.test(String(a));
    const roundish = a % 100 === 0;
    let route: Step[];
    let strategies: string[];
    if (isPow10) {
      route = complementRoute(a, b);
      strategies = ['sub-complements', 'sub-left-to-right'];
    } else if (roundish) {
      // a - b = (a - 1) - b + 1 avoids every borrow.
      const mid = a - 1 - b;
      route = [
        step(`Take 1 off ${fi(a)} to avoid borrowing: ${fi(a - 1)} − ${fi(b)}`, R(a - 1)),
        step(`${fi(a - 1)} − ${fi(b)} = ${fi(mid)}`, R(mid)),
        step(`${fi(mid)} + 1 = ${fi(result)}`, R(result)),
      ];
      strategies = ['sub-complements', 'sub-left-to-right'];
    } else {
      route = subPartsRoute(a, b);
      strategies = ['sub-left-to-right', 'sub-complements'];
    }
    return {
      prompt: `${fi(a)} − ${fi(b)}`,
      answer: { kind: 'exact', value: rat(result), unit: 'number' },
      params: { a, b },
      structure,
      strategies,
      route,
      inputMode: 'decimal',
    };
  },
};

function complementQuestion(base: number, n: number): Gen {
  const result = base - n;
  const route: Step[] =
    base === 10
      ? [step(`10 − ${n} = ${result}`, R(result))]
      : complementRoute(base, n);
  return {
    prompt: `Complement of ${fi(n)} to ${fi(base)}`,
    answer: { kind: 'exact', value: rat(result), unit: 'number' },
    params: { n, base },
    structure: `complement to ${fi(base)}`,
    strategies: ['sub-complements'],
    route,
    inputMode: 'decimal',
    // Bases 10/100/1000 are tracked fact families; base 10,000 is not.
    factId:
      base <= 1000 ? complementFactId(base as 10 | 100 | 1000, n) : undefined,
  };
}

export const complement: Template = {
  id: 'complement',
  skill: 'complements-100',
  skills: ['complements-10', 'complements-1000'],
  smallSpace: true,
  generate(rng: Rng, band): Gen {
    const base = [10, 100, 1000, 10000][band]!;
    const lo = band === 3 ? 1000 : 1;
    return complementQuestion(base, rng.int(lo, base - 1));
  },
  forFact(factId: string, _rng: Rng): Gen {
    const m = /^c(10|100|1000):(\d+)$/.exec(factId);
    if (!m) throw new Error(`complement: bad fact id "${factId}"`);
    return complementQuestion(Number(m[1]), Number(m[2]));
  },
  factBand(factId: string): Band {
    const base = Number(factId.slice(1).split(':')[0]);
    return base <= 10 ? 0 : base <= 100 ? 1 : base <= 1000 ? 2 : 3;
  },
};

export const SUBTRACTION_TEMPLATES: Template[] = [sub, complement];
