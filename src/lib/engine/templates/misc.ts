// Miscellaneous templates: doubles/halves, powers, roots, estimation,
// signed numbers, and chained calculations.
// Operand ranges:
//   double-halve:  b0: n 11-99; b1: n 101-999; b2-3: n 1,001-99,999 with
//                  doubling or halving (odd halves give a .5 tail).
//   powers:        b0: 2^n n 2-8, cubes 2-6, 10^n n 2-4;
//                  b1: 2^n to 2^10, cubes to 9, 10^n to 10^5;
//                  b2: 2^n to 2^12, cubes to 12, 10^n to 10^6;
//                  b3: as b2 plus 3^n n 3-6.
//   roots:         b0: sqrt of n^2, n 2-12; b1: n 13-20; b2: n 21-30;
//                  b3: approximate sqrt of non-squares 50-2,000, tol 0.1.
//   estimate-product: round both factors to 1 significant digit.
//                  b0: 2-digit x 2-digit; b1: 2-3 digit x 3-digit;
//                  b2: 2-3 digit x 3-digit; b3: 3-digit x 3-4 digit.
//                  Tolerance 5% of the true product.
//   signed:        b0: a - b and a + (-b) on 1-20;
//                  b1-3: adds -a x b, -a x -b, -a - (-b) on 1-50.
//   mixed-chain:   2 ops (b0-1) or 3 ops (b2-3) chained on one value.

import {
  div as rdiv,
  isInteger,
  mul as rmul,
  rat,
  type Rational,
} from '../../math/rational';
import { formatNumber } from '../../math/format';
import type { Rng } from '../../math/rng';
import type { Question, Step, Template } from '../types';
import { fi, placeParts, R, roundSig, step } from './common';

type Gen = Omit<Question, 'templateId' | 'seed' | 'band' | 'skill' | 'skills'>;

export const doubleHalve: Template = {
  id: 'double-halve',
  skill: 'doubles-halves',
  smallSpace: true,
  generate(rng: Rng, band): Gen {
    const hi = band === 0 ? 99 : band === 1 ? 999 : 99999;
    const n = rng.int(11, hi);
    const isDouble = band <= 1 ? true : rng.chance(0.5);
    const route: Step[] = [];
    if (isDouble) {
      const parts = placeParts(n);
      const halves = parts.map((p) => p * 2);
      for (let i = 0; i < parts.length; i++) {
        route.push(step(`${fi(parts[i]!)} × 2 = ${fi(halves[i]!)}`, R(halves[i]!)));
      }
      const total = n * 2;
      if (parts.length > 1) {
        route.push(step(`${halves.map(fi).join(' + ')} = ${fi(total)}`, R(total)));
      }
      return {
        prompt: `Double ${fi(n)}`,
        answer: { kind: 'exact', value: R(total), unit: 'number' },
        params: { n, op: 'Double' },
        structure: 'double by place-value split',
        strategies: ['place-value-split'],
        route,
        inputMode: 'decimal',
      };
    }
    if (n % 2 === 0) {
      const parts = placeParts(n);
      const halves = parts.map((p) => p / 2); // every place part is even
      for (let i = 0; i < parts.length; i++) {
        route.push(step(`${fi(parts[i]!)} ÷ 2 = ${fi(halves[i]!)}`, R(halves[i]!)));
      }
      const total = n / 2;
      if (parts.length > 1) {
        route.push(step(`${halves.map(fi).join(' + ')} = ${fi(total)}`, R(total)));
      }
      return {
        prompt: `Halve ${fi(n)}`,
        answer: { kind: 'exact', value: R(total), unit: 'number' },
        params: { n, op: 'Halve' },
        structure: 'halve by place-value split',
        strategies: ['place-value-split'],
        route,
        inputMode: 'decimal',
      };
    }
    // Odd n: split into (n - 1) + 1.
    const evenPart = n - 1;
    const h = evenPart / 2;
    const result = rat(n, 2);
    route.push(step(`Split ${fi(n)} into ${fi(evenPart)} + 1`, R(n)));
    route.push(step(`${fi(evenPart)} ÷ 2 = ${fi(h)}`, R(h)));
    route.push(step(`1 ÷ 2 = 0.5`, rat(1, 2)));
    route.push(step(`${fi(h)} + 0.5 = ${formatNumber(result)}`, result));
    return {
      prompt: `Halve ${fi(n)}`,
      answer: { kind: 'exact', value: result, unit: 'number' },
      params: { n, op: 'Halve' },
      structure: 'halve an odd number',
      strategies: ['place-value-split'],
      route,
      inputMode: 'decimal',
    };
  },
};

export const powers: Template = {
  id: 'powers',
  skill: 'powers',
  smallSpace: true,
  generate(rng: Rng, band): Gen {
    const kind = rng.pick(
      band >= 3
        ? (['two', 'cube', 'ten', 'three'] as const)
        : (['two', 'cube', 'ten'] as const),
    );
    let base: number;
    let exp: number;
    if (kind === 'two') {
      base = 2;
      exp = rng.int(2, band === 0 ? 8 : band === 1 ? 10 : 12);
    } else if (kind === 'three') {
      base = 3;
      exp = rng.int(3, 6);
    } else if (kind === 'cube') {
      base = rng.int(2, band === 0 ? 6 : band === 1 ? 9 : 12);
      exp = 3;
    } else {
      base = 10;
      exp = rng.int(2, band === 0 ? 4 : band === 1 ? 5 : 6);
    }
    const value = Number(BigInt(base) ** BigInt(exp));
    const route: Step[] = [];
    if (kind === 'cube') {
      route.push(step(`${base}² = ${fi(base * base)}`, R(base * base)));
      route.push(step(`${fi(base * base)} × ${base} = ${fi(value)}`, R(value)));
    } else if (kind === 'ten') {
      route.push(step(`${base}^${exp} = ${fi(value)}`, R(value)));
    } else {
      // Repeated squaring for 2^e and 3^e: e = half + rest.
      const half = Math.ceil(exp / 2);
      const rest = exp - half;
      const hv = base ** half;
      if (rest === 0) {
        const h2 = Math.ceil(half / 2);
        const h2v = base ** h2;
        route.push(step(`${base}^${h2} = ${fi(h2v)}`, R(h2v)));
        route.push(step(`${fi(h2v)} × ${fi(h2v)} = ${fi(hv)} (${base}^${half})`, R(hv)));
        route.push(step(`${fi(hv)} × ${fi(hv)} = ${fi(value)} (${base}^${exp})`, R(value)));
      } else {
        route.push(step(`${base}^${half} = ${fi(hv)}`, R(hv)));
        if (rest === 1) {
          route.push(step(`${fi(hv)} × ${base} = ${fi(value)}`, R(value)));
        } else {
          const rv = base ** rest;
          route.push(step(`${base}^${rest} = ${fi(rv)}`, R(rv)));
          route.push(step(`${fi(hv)} × ${fi(rv)} = ${fi(value)}`, R(value)));
        }
      }
    }
    return {
      prompt: `${base}^${exp}`,
      answer: { kind: 'exact', value: rat(value), unit: 'number' },
      params: { base, exp },
      structure: `${base} to the power ${exp}`,
      strategies: ['repeated-squaring'],
      route,
      inputMode: 'decimal',
    };
  },
};

function isPerfectSquare(n: number): boolean {
  const r = Math.round(Math.sqrt(n));
  return r * r === n;
}

export const roots: Template = {
  id: 'roots',
  skill: 'roots',
  smallSpace: true,
  generate(rng: Rng, band): Gen {
    if (band <= 2) {
      // Exact roots of perfect squares up to 900.
      const lo = band === 0 ? 2 : band === 1 ? 13 : 21;
      const hi = band === 0 ? 12 : band === 1 ? 20 : 30;
      const n = rng.int(lo, hi);
      const sq = n * n;
      const route: Step[] = [
        step(`Check: ${n} × ${n} = ${fi(sq)}`, R(sq)),
        step(`So √${fi(sq)} = ${n}`, R(n)),
      ];
      return {
        prompt: `√${fi(sq)}`,
        answer: { kind: 'exact', value: R(n), unit: 'number' },
        params: { n: sq },
        structure: 'exact square root of a perfect square',
        strategies: ['root-bracketing'],
        route,
        inputMode: 'decimal',
      };
    }
    // Approximate square root, tolerance 0.1. Value is the estimate made by
    // bracketing between consecutive squares and taking the linear step,
    // rounded to one decimal.
    let n = 200;
    for (let t = 0; t < 500; t++) {
      n = rng.int(50, 2000);
      if (!isPerfectSquare(n)) break;
    }
    const lo = Math.floor(Math.sqrt(n));
    const loSq = lo * lo;
    const hiSq = (lo + 1) * (lo + 1);
    const gap = hiSq - loSq;
    const off = n - loSq;
    const estRounded = rat(Math.round(((lo * gap + off) / gap) * 10), 10);
    // The accepted value is the true root rounded to 3 decimals (error < 5e-4,
    // negligible next to the 0.1 tolerance).
    const trueRoot = rat(Math.round(Math.sqrt(n) * 1000), 1000);
    const route: Step[] = [
      step(`${lo}² = ${fi(loSq)} and ${lo + 1}² = ${fi(hiSq)}`, R(loSq)),
      step(`${fi(n)} − ${fi(loSq)} = ${fi(off)}; the gap is ${fi(gap)}`, R(off)),
      step(`${lo} + ${off}/${gap} ≈ ${formatNumber(estRounded)}`, estRounded),
    ];
    return {
      prompt: `Estimate √${fi(n)} to within 0.1`,
      answer: {
        kind: 'approx',
        value: trueRoot,
        tolerance: rat(1, 10),
        unit: 'number',
      },
      params: { n },
      structure: 'approximate square root by bracketing, tolerance 0.1',
      strategies: ['root-bracketing'],
      route,
      inputMode: 'decimal',
    };
  },
};

export const estimateProduct: Template = {
  id: 'estimate-product',
  skill: 'estimation',
  generate(rng: Rng, band): Gen {
    const aHi = band === 0 ? 99 : band === 1 ? 99 : band === 2 ? 999 : 999;
    const bHi = band === 0 ? 99 : band === 1 ? 999 : band === 2 ? 999 : 9999;
    const aLo = band === 0 ? 12 : band === 1 ? 21 : 101;
    let a = 0;
    let b = 0;
    let estimate = 0;
    // Resample until the rounded estimate is within 5% of the true product.
    for (let t = 0; t < 500; t++) {
      a = rng.int(aLo, aHi);
      b = rng.int(11, bHi);
      estimate = roundSig(a, 1) * roundSig(b, 1);
      const tru = a * b;
      if (Math.abs(estimate - tru) <= tru / 20) break;
    }
    const aR = roundSig(a, 1);
    const bR = roundSig(b, 1);
    const tru = a * b;
    const route: Step[] = [
      step(`Round ${fi(a)} to ${fi(aR)} and ${fi(b)} to ${fi(bR)}`, R(aR)),
      step(`${fi(aR)} × ${fi(bR)} = ${fi(estimate)}`, R(estimate)),
    ];
    return {
      prompt: `Estimate ${fi(a)} × ${fi(b)} (within 5%)`,
      answer: {
        kind: 'approx',
        // The accepted value is the TRUE product; the tolerance is 5% of it.
        value: rat(tru),
        tolerance: rat(tru, 20),
        unit: 'number',
      },
      params: { a, b },
      structure: 'estimated product, tolerance 5% of the true product',
      strategies: ['estimation-rounding'],
      route,
      inputMode: 'decimal',
    };
  },
};

export const signed: Template = {
  id: 'signed',
  skill: 'signed-numbers',
  generate(rng: Rng, band): Gen {
    const hi = band === 0 ? 20 : 50;
    const pattern = rng.pick(
      band === 0
        ? (['sub', 'addNeg'] as const)
        : (['sub', 'addNeg', 'mul', 'mulNegNeg', 'subNeg'] as const),
    );
    let a = rng.int(1, hi);
    let b = rng.int(1, hi);
    let prompt: string;
    let pa: number;
    let pb: number;
    let result: number;
    let route: Step[];
    if (pattern === 'sub') {
      // a - b with a < b so the result is negative.
      if (a >= b) [a, b] = [b, a + 1];
      result = a - b;
      pa = a;
      pb = b;
      route = [
        step(`Go to zero first: ${a} − ${a} = 0`, R(0)),
        step(`Still need ${b - a} more: 0 − ${b - a} = −${b - a}`, R(result)),
      ];
      prompt = `${a} − ${b}`;
    } else if (pattern === 'addNeg') {
      result = a - b;
      pa = a;
      pb = -b;
      const m = Math.abs(result);
      route = [
        step(`${a} + (−${b}) is ${a} − ${b}`, R(b)),
        step(
          result >= 0
            ? `${a} − ${b} = ${result}`
            : `${b} − ${a} = ${b - a}, then flip the sign: −${m}`,
          R(result),
        ),
      ];
      prompt = `${a} + (−${b})`;
    } else if (pattern === 'mul') {
      result = -a * b;
      pa = -a;
      pb = b;
      route = [
        step(`Magnitudes: ${a} × ${b} = ${a * b}`, R(a * b)),
        step(`A negative times a positive is negative: −${fi(a * b)}`, R(result)),
      ];
      prompt = `−${a} × ${b}`;
    } else if (pattern === 'mulNegNeg') {
      result = a * b;
      pa = -a;
      pb = -b;
      route = [
        step(`Magnitudes: ${a} × ${b} = ${a * b}`, R(a * b)),
        step(`A negative times a negative is positive: ${fi(result)}`, R(result)),
      ];
      prompt = `−${a} × −${b}`;
    } else {
      // subNeg: (−a) − (−b) = b − a.
      result = b - a;
      pa = -a;
      pb = -b;
      route = [
        step(`−${a} − (−${b}) is ${b} − ${a}`, R(b)),
        step(
          result >= 0
            ? `${b} − ${a} = ${result}`
            : `${a} − ${b} = ${a - b}, then flip the sign: −${a - b}`,
          R(result),
        ),
      ];
      prompt = `−${a} − (−${b})`;
    }
    const opChar = pattern === 'mul' || pattern === 'mulNegNeg' ? '×' : pattern === 'addNeg' ? '+' : '−';
    return {
      prompt,
      answer: { kind: 'exact', value: rat(result), unit: 'number' },
      params: { a: pa, b: pb, op: opChar },
      structure: `signed ${pattern}`,
      strategies: ['signed-rules'],
      route,
      inputMode: 'decimal',
    };
  },
};

// Chain ops for mixed-chain. `frag` is the exact substring recorded in
// params and shown in the prompt.
type ChainOp =
  | { kind: 'pct'; p: number; frag: string }
  | { kind: 'add' | 'sub' | 'mul'; k: number; frag: string }
  | { kind: 'halve' | 'double' | 'square'; frag: string };

function applyOp(v: Rational, op: ChainOp): Rational {
  switch (op.kind) {
    case 'pct':
      return rmul(v, rat(op.p, 100));
    case 'add':
      return rat(v.n + BigInt(op.k) * v.d, v.d);
    case 'sub':
      return rat(v.n - BigInt(op.k) * v.d, v.d);
    case 'mul':
      return rmul(v, R(op.k));
    case 'halve':
      return rdiv(v, R(2));
    case 'double':
      return rmul(v, R(2));
    case 'square':
      return rmul(v, v);
  }
}

function opValid(v: Rational, op: ChainOp): boolean {
  if (!isInteger(v)) return false;
  if (op.kind === 'pct') return isInteger(rmul(v, rat(op.p, 100)));
  if (op.kind === 'halve') return v.n % 2n === 0n;
  if (op.kind === 'square') return v.n <= 40n && v.n >= 0n;
  return true;
}

// The arithmetic shown in the route for one op applied to value v -> next.
function opComputation(v: Rational, op: ChainOp, next: Rational): string {
  const s = formatNumber(v);
  const e = formatNumber(next);
  switch (op.kind) {
    case 'pct':
      return `${op.p}% of ${s} = ${e}`;
    case 'add':
      return `${s} + ${fi(op.k)} = ${e}`;
    case 'sub':
      return `${s} − ${fi(op.k)} = ${e}`;
    case 'mul':
      return `${s} × ${op.k} = ${e}`;
    case 'halve':
      return `${s} ÷ 2 = ${e}`;
    case 'double':
      return `${s} × 2 = ${e}`;
    case 'square':
      return `${s} × ${s} = ${e}`;
  }
}

function opPhrase(op: ChainOp): string {
  switch (op.kind) {
    case 'pct':
      return `take ${op.p}% of it`;
    case 'add':
      return `add ${fi(op.k)}`;
    case 'sub':
      return `subtract ${fi(op.k)}`;
    case 'mul':
      return `multiply by ${op.k}`;
    case 'halve':
      return 'halve it';
    case 'double':
      return 'double it';
    case 'square':
      return 'square it';
  }
}

export const mixedChain: Template = {
  id: 'mixed-chain',
  skill: 'mixed-chain',
  generate(rng: Rng, band): Gen {
    const count = band <= 1 ? 2 : 3;
    let start = 10;
    let ops: ChainOp[] = [];
    // Resample until every intermediate stays a small whole number.
    for (let t = 0; t < 500; t++) {
      start = rng.int(5, band === 0 ? 60 : 200);
      ops = [];
      let v = R(start);
      let ok = true;
      for (let i = 0; i < count; i++) {
        const kind = rng.pick(
          band >= 2
            ? (['pct', 'add', 'sub', 'mul', 'halve', 'double', 'square'] as const)
            : (['pct', 'add', 'sub', 'mul', 'halve', 'double'] as const),
        );
        let op: ChainOp;
        if (kind === 'pct') {
          const p = rng.pick([10, 20, 25, 50, 75]);
          op = { kind, p, frag: `${p}%` };
        } else if (kind === 'add' || kind === 'sub' || kind === 'mul') {
          const k = rng.int(2, kind === 'mul' ? 9 : 49);
          const frag = kind === 'add' ? 'add' : kind === 'sub' ? 'subtract' : 'multiply';
          op = { kind, k, frag };
        } else {
          op = {
            kind,
            frag: kind === 'halve' ? 'halve' : kind === 'double' ? 'double' : 'square',
          };
        }
        if (!opValid(v, op)) {
          ok = false;
          break;
        }
        v = applyOp(v, op);
        ops.push(op);
      }
      if (ok && ops.length === count && isInteger(v)) break;
    }
    // Fallback: if the resample exhausted, build a guaranteed-valid chain.
    // double -> add -> multiply keeps every intermediate a whole number.
    if (ops.length !== count) {
      start = rng.int(5, 60);
      ops = [
        { kind: 'double', frag: 'double' },
        { kind: 'add', k: rng.int(2, 49), frag: 'add' },
      ];
      if (count === 3) ops.push({ kind: 'mul', k: 2, frag: 'multiply' });
    }
    let v = R(start);
    const route: Step[] = [];
    const phrases: string[] = [];
    for (const op of ops) {
      const next = applyOp(v, op);
      route.push(step(opComputation(v, op, next), next));
      phrases.push(opPhrase(op));
      v = next;
    }
    const prompt = `Start with ${fi(start)}, then ${phrases.join(', then ')}`;
    const params: Record<string, number | string> = { start };
    ops.forEach((op, i) => {
      params[`op${i}`] = op.frag;
      if (op.kind === 'add' || op.kind === 'sub' || op.kind === 'mul') {
        params[`k${i}`] = op.k;
      }
      if (op.kind === 'pct') params[`k${i}`] = op.p;
    });
    return {
      prompt,
      answer: { kind: 'exact', value: v, unit: 'number' },
      params,
      structure: `chain of ${count} operations`,
      strategies: [],
      route,
      inputMode: 'decimal',
    };
  },
};

export const MISC_TEMPLATES: Template[] = [
  doubleHalve,
  powers,
  roots,
  estimateProduct,
  signed,
  mixedChain,
];
