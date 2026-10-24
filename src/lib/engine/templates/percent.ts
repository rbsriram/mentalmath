// Percent templates.
// Operand ranges:
//   pct-anchor:    p in {5,10,20,25,50,75}; N round: b0 multiples of 20 up
//                  to 200; b1 multiples of 20 up to 1,000; b2 multiples of
//                  40 up to 5,000; b3 multiples of 40 up to 20,000.
//   pct-of:        p 1-99; N: b0 20-200 step 10, b1 40-2,000 step 20,
//                  b2 110-9,990 step 10, b3 1,000-99,990 step 10.
//   pct-reverse:   "given is p% of what?": p in {15,...,95} step 5 plus
//                  anchors; u = 1% unit 2-99; given = p*u, answer 100u.
//   pct-discount:  p in {5,10,15,20,25,30,40,50}; price AED 10.00-4,999.75
//                  where the kept amount has at most 2 decimals.
//   pct-compound:  base 200-20,000 step 100; up and down percents in steps
//                  of 5 within 5-45, up != down; result exact.
//   pct-change:    old price multiple of 20 in 40-4,000; change multiple of
//                  5% giving an integer new price; rise or fall.

import {
  div as rdiv,
  mul as rmul,
  rat,
  type Rational,
} from '../../math/rational';
import { formatNumber } from '../../math/format';
import type { Rng } from '../../math/rng';
import type { Question, Step, Template } from '../types';
import { D, fi, fmoney, R, splitPercent, step } from './common';

type Gen = Omit<Question, 'templateId' | 'seed' | 'band'>;

const ANCHORS = [5, 10, 20, 25, 50, 75] as const;

// Anchor route for p% of N with p in ANCHORS.
function anchorSteps(p: number, N: Rational): Step[] {
  const steps: Step[] = [];
  const half = rdiv(N, R(2));
  const tenth = rdiv(N, R(10));
  const quarter = rdiv(N, R(4));
  const fifth = rdiv(N, R(5));
  if (p === 50) {
    steps.push(step(`50% is a half: ${formatNumber(N)} ÷ 2 = ${formatNumber(half)}`, half));
  } else if (p === 25) {
    steps.push(step(`25% is a quarter: ${formatNumber(N)} ÷ 4 = ${formatNumber(quarter)}`, quarter));
  } else if (p === 10) {
    steps.push(step(`10% is a tenth: ${formatNumber(N)} ÷ 10 = ${formatNumber(tenth)}`, tenth));
  } else if (p === 5) {
    steps.push(step(`10% of ${formatNumber(N)} = ${formatNumber(tenth)}`, tenth));
    steps.push(step(`5% is half of that: ${formatNumber(tenth)} ÷ 2 = ${formatNumber(rdiv(tenth, R(2)))}`, rdiv(tenth, R(2))));
  } else if (p === 20) {
    steps.push(step(`20% is a fifth: ${formatNumber(N)} ÷ 5 = ${formatNumber(fifth)}`, fifth));
  } else {
    // 75% = half + quarter
    const sum = rdiv(N, R(2));
    const q2 = rdiv(N, R(4));
    const res = rmul(R(3), quarter);
    steps.push(step(`50% of ${formatNumber(N)} = ${formatNumber(sum)}`, sum));
    steps.push(step(`25% of ${formatNumber(N)} = ${formatNumber(q2)}`, q2));
    steps.push(step(`${formatNumber(sum)} + ${formatNumber(q2)} = ${formatNumber(res)}`, res));
  }
  return steps;
}

// p% of N built from anchor parts; falls back to the 1% method when the
// split needs more than 4 parts.
export function percentOfRoute(p: number, N: Rational): Step[] {
  const parts = splitPercent(p);
  if ((ANCHORS as readonly number[]).includes(p)) {
    return anchorSteps(p, N);
  }
  if (parts.length <= 4) {
    const steps: Step[] = [];
    const partials: Rational[] = [];
    for (const part of parts) {
      const v = rmul(N, rat(part, 100));
      partials.push(v);
      steps.push(step(`${part}% of ${formatNumber(N)} = ${formatNumber(v)}`, v));
    }
    let run = partials[0]!;
    for (let i = 1; i < partials.length; i++) {
      run = radd2(run, partials[i]!);
    }
    if (partials.length > 1) {
      steps.push(
        step(
          `${partials.map(formatNumber).join(' + ')} = ${formatNumber(run)}`,
          run,
        ),
      );
    }
    return steps;
  }
  const one = rdiv(N, R(100));
  const res = rmul(one, R(p));
  return [
    step(`1% of ${formatNumber(N)} = ${formatNumber(one)}`, one),
    step(`${p} × ${formatNumber(one)} = ${formatNumber(res)}`, res),
  ];
}

function radd2(a: Rational, b: Rational): Rational {
  return rat(a.n * b.d + b.n * a.d, a.d * b.d);
}

export const pctAnchor: Template = {
  id: 'pct-anchor',
  skill: 'percent-anchors',
  smallSpace: true,
  skills: ['pct-build'],
  generate(rng: Rng, band): Gen {
    const p = rng.pick([...ANCHORS]);
    const unit = band <= 1 ? 20 : 40;
    const nHi = band === 0 ? 200 : band === 1 ? 1000 : band === 2 ? 5000 : 20000;
    const N = unit * rng.int(2, nHi / unit);
    const value = rmul(R(N), rat(p, 100));
    return {
      prompt: `${p}% of ${fi(N)}`,
      answer: { kind: 'exact', value, unit: 'number' },
      params: { p, n: N },
      structure: `anchor percent ${p}% of a round number`,
      strategies: ['pct-anchors'],
      route: anchorSteps(p, R(N)),
      inputMode: 'decimal',
    };
  },
};

export const pctOf: Template = {
  id: 'pct-of',
  skill: 'pct-of',
  skills: ['pct-build'],
  generate(rng: Rng, band): Gen {
    const p = rng.int(1, 99);
    const unit = band === 0 ? 10 : band === 1 ? 20 : 10;
    const lo = band === 0 ? 20 : band === 1 ? 40 : band === 2 ? 110 : 1000;
    const hi = band === 0 ? 200 : band === 1 ? 2000 : band === 2 ? 9990 : 99990;
    const N = unit * rng.int(Math.ceil(lo / unit), Math.floor(hi / unit));
    const value = rmul(R(N), rat(p, 100));
    return {
      prompt: `${p}% of ${fi(N)}`,
      answer: { kind: 'exact', value, unit: 'number' },
      params: { p, n: N },
      structure: `${p}% of a whole number`,
      strategies: ['pct-build', 'pct-anchors', 'pct-swap'],
      route: percentOfRoute(p, R(N)),
      inputMode: 'decimal',
    };
  },
};

const REVERSE_PCTS = [15, 20, 25, 30, 40, 50, 60, 70, 75, 80, 85, 90, 95];

export const pctReverse: Template = {
  id: 'pct-reverse',
  skill: 'pct-reverse',
  generate(rng: Rng, band): Gen {
    const p = rng.pick(REVERSE_PCTS);
    const uHi = band === 0 ? 20 : band === 1 ? 60 : band === 2 ? 99 : 300;
    const u = rng.int(2, uHi);
    const given = p * u;
    const whole = 100 * u;
    const route: Step[] = [
      step(`1% of the whole is ${fi(given)} ÷ ${p} = ${fi(u)}`, R(u)),
      step(`100% is ${fi(u)} × 100 = ${fi(whole)}`, R(whole)),
    ];
    return {
      prompt: `${fi(given)} is ${p}% of what number?`,
      answer: { kind: 'exact', value: rat(whole), unit: 'number' },
      params: { p, given },
      structure: `reverse percent at ${p}%`,
      strategies: ['pct-reverse'],
      route,
      inputMode: 'decimal',
    };
  },
};

const DISCOUNT_PCTS = [5, 10, 15, 20, 25, 30, 40, 50];
const DISCOUNT_ITEMS = [
  'jacket',
  'phone',
  'backpack',
  'ticket',
  'chair',
  'meal set',
  'headphones',
  'watch',
];

export const pctDiscount: Template = {
  id: 'pct-discount',
  skill: 'pct-discount',
  skills: ['pct-of'],
  generate(rng: Rng, band): Gen {
    const item = rng.pick(DISCOUNT_ITEMS);
    const centHi = band === 0 ? 5000 : band === 1 ? 50000 : band === 2 ? 499975 : 999975;
    let p = 10;
    let cents = 1000;
    // Resample until the kept price has at most 2 decimals
    // (cents x (100 - p) must be a multiple of 100).
    for (let t = 0; t < 500; t++) {
      p = rng.pick(DISCOUNT_PCTS);
      cents = rng.int(1000, centHi);
      if ((cents * (100 - p)) % 100 === 0) break;
    }
    if ((cents * (100 - p)) % 100 !== 0) {
      // Fallback: 25% off a multiple-of-4 price always stays in cents.
      p = 25;
      cents = Math.ceil(cents / 4) * 4;
    }
    const price = rat(cents, 100);
    const keptFinal = rmul(price, rat(100 - p, 100));
    const route: Step[] = [
      step(`You pay ${100 - p}% of ${fmoney(price)}`, R(100 - p)),
      ...percentOfRoute(100 - p, price),
    ];
    return {
      prompt: `${p}% off ${fmoney(price)}. What is the new price?`,
      context: `A ${item} goes on sale.`,
      answer: { kind: 'exact', value: keptFinal, unit: 'currency', currency: 'AED' },
      params: { p, price: fmoney(price).slice(4) },
      structure: `${p}% discount on a 2-decimal price`,
      strategies: ['pct-discount', 'pct-build'],
      route,
      inputMode: 'decimal',
    };
  },
};

export const pctCompound: Template = {
  id: 'pct-compound',
  skill: 'pct-compound',
  generate(rng: Rng, band): Gen {
    const baseHi = band === 0 ? 2000 : band === 1 ? 5000 : band === 2 ? 20000 : 50000;
    let base = 800;
    let up = 20;
    let down = 15;
    let finalV: Rational = R(816);
    // Resample until up != down and the result has at most 2 decimals.
    for (let t = 0; t < 500; t++) {
      base = 100 * rng.int(2, Math.floor(baseHi / 100));
      up = 5 * rng.int(1, band === 0 ? 4 : 9);
      down = 5 * rng.int(1, band === 0 ? 4 : 9);
      if (up === down) continue;
      const v = rmul(rmul(R(base), rat(100 + up, 100)), rat(100 - down, 100));
      if ((base * (100 + up) * (100 - down)) % 10000 === 0) {
        finalV = v;
        break;
      }
      finalV = v;
    }
    const upMult = D((1 + up / 100).toFixed(2));
    const downMult = D((1 - down / 100).toFixed(2));
    const after1 = rmul(R(base), upMult);
    const route: Step[] = [
      step(`${fi(base)} × ${toFixedStr(upMult)} = ${formatNumber(after1)}`, after1),
      step(`${formatNumber(after1)} × ${toFixedStr(downMult)} = ${formatNumber(finalV)}`, finalV),
    ];
    return {
      prompt: `A value of ${fi(base)} rises by ${up}%, then falls by ${down}%. What is the final value?`,
      answer: { kind: 'exact', value: finalV, unit: 'number' },
      params: { base, upPct: up, downPct: down },
      structure: `+${up}% then −${down}% on ${fi(base)}`,
      strategies: ['pct-compound'],
      route,
      inputMode: 'decimal',
    };
  },
};

function toFixedStr(r: Rational): string {
  return formatNumber(r);
}

export const pctChange: Template = {
  id: 'pct-change',
  skill: 'pct-change',
  generate(rng: Rng, band): Gen {
    const oldHi = band === 0 ? 400 : band === 1 ? 2000 : band === 2 ? 4000 : 20000;
    const old = 20 * rng.int(2, Math.floor(oldHi / 20));
    const maxC = band === 0 ? 50 : band === 1 ? 75 : 90;
    const c = 5 * rng.int(1, Math.floor(maxC / 5));
    const rise = rng.chance(0.5);
    const delta = (old * c) / 100;
    const nw = rise ? old + delta : old - delta;
    const signed = rise ? c : -c;
    const route: Step[] = [
      step(`Change: ${fi(nw)} − ${fi(old)} = ${fi(rise ? delta : -delta)}`, R(rise ? delta : -delta)),
      step(`${fi(delta)} ÷ ${fi(old)} = ${formatNumber(rat(delta, old))}`, rat(delta, old)),
      step(`${formatNumber(rat(delta, old))} × 100 = ${fi(signed)}%`, R(signed)),
    ];
    return {
      prompt: `A price ${rise ? 'rises' : 'falls'} from ${fi(old)} to ${fi(nw)}. What is the percent change?`,
      answer: { kind: 'exact', value: rat(signed), unit: 'percent' },
      params: { old, nw },
      structure: 'percent change between two prices',
      strategies: ['pct-change'],
      route,
      inputMode: 'decimal',
    };
  },
};

export const PERCENT_TEMPLATES: Template[] = [
  pctAnchor,
  pctOf,
  pctReverse,
  pctDiscount,
  pctCompound,
  pctChange];
