// Addition templates.
// Operand ranges (unbiased uniform sampling inside each band):
//   add-two:          b0: 11-99 + 11-99; b1: 100-999 + 11-99;
//                     b2: 100-999 + 100-999; b3: 100-9,999 + 100-9,999.
//   add-multi-term:   b0: 3 terms of 5-30; b1: 3 terms of 10-99;
//                     b2: 5 terms, each 1-9, 10-99, or 100-999 (mixed);
//                     b3: 6 terms of 10-9,999.
//   add-compensation: one operand within k of a round base:
//                     b0: base 10-90, k 1-9, other 11-99;
//                     b1: base 100-900, k 1-19, other 21-499;
//                     b2: base 1,000-9,000, k 1-49, other 101-4,999;
//                     b3: base 1,000-90,000, k 1-99, other 501-49,999.

import { rat } from '../../math/rational';
import type { Rng } from '../../math/rng';
import type { Question, Template } from '../types';
import { addPartsRoute, chainAddRoute, fi, R, step } from './common';

type Gen = Omit<Question, 'templateId' | 'seed' | 'band'>;

export const addTwo: Template = {
  id: 'add-two',
  skill: 'add-left-to-right',
  skills: ['add-grouping'],
  generate(rng: Rng, band): Gen {
    const ranges: [number, number][] = [
      [11, 99],
      [100, 999],
      [100, 999],
      [100, 9999],
    ];
    const [aLo, aHi] = ranges[band]!;
    const bLo = band === 0 ? 11 : band === 1 ? 11 : 100;
    const a = rng.int(aLo, aHi);
    const b = rng.int(bLo, bLo === 11 ? 99 : aHi);
    const route = addPartsRoute(a, b);
    return {
      prompt: `${fi(a)} + ${fi(b)}`,
      answer: { kind: 'exact', value: R(a + b), unit: 'number' },
      params: { a, b },
      structure: `sum of 2 terms, ${String(a).length} and ${String(b).length} digits`,
      strategies: ['add-left-to-right', 'add-compensation'],
      route,
      inputMode: 'decimal',
    };
  },
};

export const addMultiTerm: Template = {
  id: 'add-multi-term',
  skill: 'add-multi-term',
  skills: ['add-grouping', 'add-left-to-right'],
  generate(rng: Rng, band): Gen {
    let terms: number[];
    if (band === 0) {
      terms = Array.from({ length: 3 }, () => rng.int(5, 30));
    } else if (band === 1) {
      terms = Array.from({ length: 3 }, () => rng.int(10, 99));
    } else if (band === 2) {
      terms = Array.from({ length: 5 }, () => {
        const size = rng.int(1, 3);
        return size === 1 ? rng.int(1, 9) : size === 2 ? rng.int(10, 99) : rng.int(100, 999);
      });
    } else {
      terms = Array.from({ length: 6 }, () => rng.int(10, 9999));
    }
    const total = terms.reduce((x, y) => x + y, 0);
    const params: Record<string, number> = {};
    terms.forEach((t, i) => {
      params[`t${i}`] = t;
    });
    const maxDigits = Math.max(...terms.map((t) => String(t).length));
    const minDigits = Math.min(...terms.map((t) => String(t).length));
    return {
      prompt: terms.map(fi).join(' + '),
      answer: { kind: 'exact', value: R(total), unit: 'number' },
      params,
      structure: `sum of ${terms.length} terms, ${minDigits} to ${maxDigits} digits`,
      strategies: ['add-grouping', 'add-left-to-right'],
      route: chainAddRoute(terms),
      inputMode: 'decimal',
    };
  },
};

export const addCompensation: Template = {
  id: 'add-compensation',
  skill: 'add-compensation',
  skills: ['add-left-to-right'],
  generate(rng: Rng, band): Gen {
    const cfg = [
      { baseUnit: 10, kHi: 9, bLo: 11, bHi: 99 },
      { baseUnit: 100, kHi: 19, bLo: 21, bHi: 499 },
      { baseUnit: 1000, kHi: 49, bLo: 101, bHi: 4999 },
      { baseUnit: 1000, kHi: 99, bLo: 501, bHi: 49999 },
    ][band]!;
    const maxMult = band === 3 ? 90 : 9;
    const base = cfg.baseUnit * rng.int(1, maxMult);
    const k = rng.int(1, cfg.kHi);
    const over = rng.chance(0.4); // usually below the round number
    const a = over ? base + k : base - k;
    const b = rng.int(cfg.bLo, cfg.bHi);
    const total = a + b;
    const route = over
      ? [
          step(`${fi(a)} is ${fi(k)} more than ${fi(base)}`, R(a)),
          step(`${fi(b)} + ${fi(base)} = ${fi(b + base)}`, R(b + base)),
          step(`${fi(b + base)} + ${fi(k)} = ${fi(total)}`, R(total)),
        ]
      : [
          step(`${fi(a)} is ${fi(k)} less than ${fi(base)}`, R(a)),
          step(`${fi(b)} + ${fi(base)} = ${fi(b + base)}`, R(b + base)),
          step(`${fi(b + base)} − ${fi(k)} = ${fi(total)}`, R(total)),
        ];
    return {
      prompt: `${fi(a)} + ${fi(b)}`,
      answer: { kind: 'exact', value: rat(total), unit: 'number' },
      params: { a, b },
      structure: 'sum of 2 terms, one within ' + cfg.kHi + ' of a round number',
      strategies: ['add-compensation'],
      route,
      inputMode: 'decimal',
    };
  },
};

export const ADDITION_TEMPLATES: Template[] = [addTwo, addMultiTerm, addCompensation];
