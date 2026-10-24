// Division templates.
// Operand ranges:
//   div-exact:   exact quotients built as divisor x quotient.
//                b0: d 3-9, q 4-15; b1: d 4-12, q 11-30;
//                b2: d 11-25, q 21-60; b3: d 13-49, q 31-99.
//   div-decimal: divisor is a decimal; quotient exact.
//                b0: divisor 0.2-0.9 (1 dp), q 2-12;
//                b1: divisor 0.2-9.9 (1 dp), q 4-60;
//                b2: divisor 1.1-9.9 (1 dp), q 11-99;
//                b3: divisor 0.05-9.95 (2 dp), q 6-199 (halves allowed).
//   div-estimate: approximate division, tolerance 10% of the true quotient.
//                b0: d 3-9, D 50-999; b1: d 11-99, D 500-9,999;
//                b2: d 101-999, D 5,000-99,999; b3: d 1,001-9,999, D 10,000-999,999.

import { div as rdiv, mul as rmul, rat, type Rational } from '../../math/rational';
import { formatNumber } from '../../math/format';
import type { Rng } from '../../math/rng';
import type { Question, Step, Template } from '../types';
import { D, fi, placeParts, R, roundSig, step } from './common';

type Gen = Omit<Question, 'templateId' | 'seed' | 'band'>;

// Smallest factorization of d into two factors both in [2, 12], or null.
function factorPair(d: number): [number, number] | null {
  for (let f = 2; f <= Math.min(12, d - 1); f++) {
    const g = d / f;
    if (Number.isInteger(g) && g >= 2 && g <= 12) return [f, g];
  }
  return null;
}

export const divExact: Template = {
  id: 'div-exact',
  skill: 'div-reverse',
  smallSpace: true,
  skills: ['div-factor-cancel'],
  generate(rng: Rng, band): Gen {
    const d =
      band === 0
        ? rng.int(3, 9)
        : band === 1
          ? rng.int(4, 12)
          : band === 2
            ? rng.int(11, 25)
            : rng.int(13, 49);
    const q =
      band === 0
        ? rng.int(4, 15)
        : band === 1
          ? rng.int(11, 30)
          : band === 2
            ? rng.int(21, 60)
            : rng.int(31, 99);
    const D = d * q;
    let route: Step[];
    let strategies: string[];
    if (q <= 12 && d <= 15) {
      route = [
        step(`Think of the reverse: ${d} × ${q} = ${fi(D)}`, R(D)),
        step(`${fi(D)} ÷ ${d} = ${fi(q)}`, R(q)),
      ];
      strategies = ['div-reverse'];
    } else {
      const pair = factorPair(d);
      if (pair !== null) {
        const [f, g] = pair;
        const m1 = D / f;
        route = [
          step(`${d} = ${f} × ${g}`, R(d)),
          step(`${fi(D)} ÷ ${f} = ${fi(m1)}`, R(m1)),
          step(`${fi(m1)} ÷ ${g} = ${fi(q)}`, R(q)),
        ];
        strategies = ['div-factor-cancel', 'div-reverse'];
      } else {
        // Quotient decomposition by place parts.
        route = [step(`Build the quotient place by place with divisor ${d}`, R(d))];
        let rem = D;
        const parts = placeParts(q);
        for (const p of parts) {
          const chunk = d * p;
          route.push(step(`${d} × ${fi(p)} = ${fi(chunk)}`, R(chunk)));
          rem -= chunk;
          if (rem > 0) {
            route.push(step(`Remainder: ${fi(rem + chunk)} − ${fi(chunk)} = ${fi(rem)}`, R(rem)));
          }
        }
        route.push(step(`Quotient parts ${parts.map(fi).join(' + ')} = ${fi(q)}`, R(q)));
        strategies = ['div-reverse'];
      }
    }
    return {
      prompt: `${fi(D)} ÷ ${d}`,
      answer: { kind: 'exact', value: rat(q), unit: 'number' },
      params: { d, D },
      structure: `exact quotient, ${String(d).length}-digit divisor`,
      strategies,
      route,
      inputMode: 'decimal',
    };
  },
};

export const divDecimal: Template = {
  id: 'div-decimal',
  skill: 'div-decimal-shift',
  skills: ['dec-div'],
  generate(rng: Rng, band): Gen {
    // divisor as decimal string, quotient exact (integers, halves in b3).
    let divisorStr: string;
    let q: Rational;
    if (band === 0) {
      divisorStr = `0.${rng.int(2, 9)}`;
      q = R(rng.int(2, 12));
    } else if (band === 1) {
      divisorStr = `${rng.int(0, 9)}.${rng.int(1, 9)}`;
      if (divisorStr.startsWith('0.')) divisorStr = `0.${rng.int(2, 9)}`;
      q = R(rng.int(4, 60));
    } else if (band === 2) {
      divisorStr = `${rng.int(1, 9)}.${rng.int(1, 9)}`;
      q = R(rng.int(11, 99));
    } else {
      divisorStr = `${rng.int(0, 9)}.${rng.int(1, 9)}${rng.int(1, 9)}`;
      if (divisorStr.startsWith('0.')) divisorStr = `0.${rng.int(1, 9)}${rng.int(1, 9)}`;
      const qi = rng.int(6, 199);
      q = rng.chance(0.5) ? R(qi) : rat(2 * qi + 1, 2); // halves allowed
    }
    const divisor = D(divisorStr);
    const dividend = rmul(divisor, q);
    // Shift both sides so the divisor is whole.
    const shift = divisorStr.includes('.') ? divisorStr.split('.')[1]!.length : 0;
    const pow = 10 ** shift;
    const scaledD = rmul(divisor, R(pow));
    const scaledN = rmul(dividend, R(pow));
    const route: Step[] = [
      step(`Multiply both by ${fi(pow)}: ${fiStr(divisor)} × ${fi(pow)} = ${fiStr(scaledD)}`, scaledD),
      step(`${fiStr(dividend)} × ${fi(pow)} = ${fiStr(scaledN)}`, scaledN),
      step(`${fiStr(scaledN)} ÷ ${fiStr(scaledD)} = ${fiStr(q)}`, q),
    ];
    return {
      prompt: `${fiStr(dividend)} ÷ ${fiStr(divisor)}`,
      answer: { kind: 'exact', value: q, unit: 'number' },
      params: { divisor: fiStr(divisor), dividend: fiStr(dividend) },
      structure: 'decimal division with exact quotient',
      strategies: ['div-decimal-shift'],
      route,
      inputMode: 'decimal',
    };
  },
};

// Format a Rational for prompt text: commas for integers, exact decimal else.
function fiStr(r: Rational): string {
  return formatNumber(r);
}

export const divEstimate: Template = {
  id: 'div-estimate',
  skill: 'div-estimate',
  skills: ['estimation'],
  generate(rng: Rng, band): Gen {
    const dLo = band === 0 ? 3 : band === 1 ? 11 : band === 2 ? 101 : 1001;
    const dHi = band === 0 ? 9 : band === 1 ? 99 : band === 2 ? 999 : 9999;
    const DLo = band === 0 ? 50 : band === 1 ? 500 : band === 2 ? 5000 : 10000;
    const DHi = band === 0 ? 999 : band === 1 ? 9999 : band === 2 ? 99999 : 999999;
    // Sample until the rounded estimate is within the tolerance of the true
    // quotient (keeps the taught estimate honest).
    let d = 0;
    let D = 0;
    let estimate = 0;
    for (let tries = 0; tries < 500; tries++) {
      d = rng.int(dLo, dHi);
      D = rng.int(DLo, DHi);
      const dR = roundSig(d, 2);
      estimate = Math.round(D / dR);
      const tru = D / d;
      if (estimate >= 2 && Math.abs(estimate - tru) <= tru / 10) break;
    }
    const dR = roundSig(d, 2);
    const DR = estimate * dR;
    const tru = rat(D, d);
    const tolerance = rdiv(tru, R(10));
    const route: Step[] = [
      step(`Round the divisor: ${fi(d)} ≈ ${fi(dR)}`, R(dR)),
      step(`Round the dividend to a multiple of ${fi(dR)}: ${fi(D)} ≈ ${fi(DR)}`, R(DR)),
      step(`${fi(DR)} ÷ ${fi(dR)} = ${fi(estimate)}`, R(estimate)),
    ];
    return {
      prompt: `Estimate ${fi(D)} ÷ ${fi(d)}`,
      answer: { kind: 'approx', value: R(estimate), tolerance, unit: 'number' },
      params: { D, d },
      structure: 'estimated division, tolerance 10% of the true quotient',
      strategies: ['estimation-rounding'],
      route,
      inputMode: 'decimal',
    };
  },
};

export const DIVISION_TEMPLATES: Template[] = [divExact, divDecimal, divEstimate];
