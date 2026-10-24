// Multiplication templates.
// Operand ranges (uniform sampling inside each band):
//   mul-table-fact:    b0: 1-10 x 1-10; b1-3: 1-15 x 1-15.
//   mul-2x1:           b0: 11-19 x 3-9; b1: 21-99 x 3-9; b2: 21-99 x 3-9
//                      (order randomized); b3: 101-999 x 4-9 (order random).
//   mul-2x2:           b0: 11-19 x 11-19; b1: 21-99 x 12-19;
//                      b2: 21-99 x 21-99; b3: 51-99 x 51-99.
//   mul-by-5-25:       multiplier in {5,15} (b0), {5,15,25} (b1),
//                      {5,15,25,50} (b2-3); n: b0-1 12-99, b2 21-999,
//                      b3 101-9,999.
//   mul-doubling-halving: even x ends-in-5:
//                      b0: 4-20 x 15-45; b1: 6-48 x 15-95;
//                      b2: 12-98 x 15-95; b3: 102-998 x 105-995.
//   mul-3-digit-structured: special in {11,12} (b0), {15,25,125} (b1),
//                      {11,12,15,25,75,125,250,375} (b2-3);
//                      n: b0-1 13-99, b2 101-999, b3 1,001-9,999.
//   mul-multi-term:    three factors: ends-in-5 (15-95) x even (12-98)
//                      x any (11-99); the first pair has a round product.
//   mul-near-base:     b0-1: base 100, both below (deficits 1-9 / 1-15);
//                      b2: one above (101-112) and one below (85-99);
//                      b3: base 1,000 both below (deficits 1-30) or
//                      base 50 both below (deficits 1-9).
//   mul-by-11:         n: b0-1 12-99, b2 102-999, b3 1,002-9,999.

import { rat } from '../../math/rational';
import { tableFactId } from '../../content/facts';
import type { Rng } from '../../math/rng';
import type { Band, Question, Step, Template } from '../types';
import { fi, MINUS, mulSplitRoute, R, step } from './common';

type Gen = Omit<Question, 'templateId' | 'seed' | 'band' | 'skill' | 'skills'>;

// a x b table fact; the prompt order is randomized.
function tableFactQuestion(a: number, b: number, rng: Rng, hi: number): Gen {
  const product = a * b;
  const big = Math.max(a, b);
  const small = Math.min(a, b);
  const [x, y] = rng.chance(0.5) ? [b, a] : [a, b];
  let route: Step[];
  if (big <= 10) {
    route = [step(`${fi(small)} × ${fi(big)} = ${fi(product)}`, R(product))];
  } else {
    // Split the larger factor: big = 10 + rest.
    const rest = big - 10;
    const p1 = small * 10;
    const p2 = small * rest;
    route = [
      step(`${fi(big)} = 10 + ${rest}`, R(big)),
      step(`${fi(small)} × 10 = ${fi(p1)}`, R(p1)),
      step(`${fi(small)} × ${rest} = ${fi(p2)}`, R(p2)),
      step(`${fi(p1)} + ${fi(p2)} = ${fi(product)}`, R(product)),
    ];
  }
  return {
    prompt: `${fi(x)} × ${fi(y)}`,
    answer: { kind: 'exact', value: rat(product), unit: 'number' },
    params: { a: x, b: y },
    structure: `table fact up to ${hi} x ${hi}`,
    strategies: ['mul-distributive-split'],
    route,
    inputMode: 'decimal',
    factId: tableFactId(a, b),
  };
}

export const mulTableFact: Template = {
  id: 'mul-table-fact',
  skill: 'tables-1-10',
  skills: ['tables-11-15'],
  smallSpace: true,
  generate(rng: Rng, band): Gen {
    const hi = band === 0 ? 10 : 15;
    return tableFactQuestion(rng.int(1, hi), rng.int(1, hi), rng, hi);
  },
  forFact(factId: string, rng: Rng): Gen {
    const m = /^t:(\d+)x(\d+)$/.exec(factId);
    if (!m) throw new Error(`mul-table-fact: bad fact id "${factId}"`);
    const a = Number(m[1]);
    const b = Number(m[2]);
    return tableFactQuestion(a, b, rng, Math.max(10, a, b));
  },
  factBand(factId: string): Band {
    const hi = Math.max(...factId.slice(2).split('x').map(Number));
    return hi <= 6 ? 0 : hi <= 10 ? 1 : hi <= 13 ? 2 : 3;
  },
};

export const mul2x1: Template = {
  id: 'mul-2x1',
  skill: 'mul-distributive',
  generate(rng: Rng, band): Gen {
    let a: number;
    let b: number;
    if (band === 0) {
      a = rng.int(11, 19);
      b = rng.int(3, 9);
    } else if (band === 1) {
      a = rng.int(21, 99);
      b = rng.int(3, 9);
    } else if (band === 2) {
      a = rng.int(21, 99);
      b = rng.int(3, 9);
    } else {
      a = rng.int(101, 999);
      b = rng.int(4, 9);
    }
    const product = a * b;
    const swapped = band >= 2 && rng.chance(0.5);
    return {
      prompt: swapped ? `${fi(b)} × ${fi(a)}` : `${fi(a)} × ${fi(b)}`,
      answer: { kind: 'exact', value: rat(product), unit: 'number' },
      params: { a, b },
      structure: `${String(a).length}-digit times 1-digit`,
      strategies: ['mul-distributive-split'],
      route: mulSplitRoute(b, a),
      inputMode: 'decimal',
    };
  },
};

export const mul2x2: Template = {
  id: 'mul-2x2',
  skill: 'mul-2x2',
  skills: ['mul-distributive'],
  generate(rng: Rng, band): Gen {
    let a: number;
    let b: number;
    if (band === 0) {
      a = rng.int(11, 19);
      b = rng.int(11, 19);
    } else if (band === 1) {
      a = rng.int(21, 99);
      b = rng.int(12, 19);
    } else if (band === 2) {
      a = rng.int(21, 99);
      b = rng.int(21, 99);
    } else {
      a = rng.int(51, 99);
      b = rng.int(51, 99);
    }
    const product = a * b;
    // Split the factor with the friendlier tens digit; default splits b.
    const route = mulSplitRoute(a, b);
    return {
      prompt: `${fi(a)} × ${fi(b)}`,
      answer: { kind: 'exact', value: rat(product), unit: 'number' },
      params: { a, b },
      structure: '2-digit times 2-digit',
      strategies: ['mul-distributive-split', 'mul-factoring'],
      route,
      inputMode: 'decimal',
    };
  },
};

const MULTIPIERS = [5, 15, 25, 50] as const;

export const mulBy525: Template = {
  id: 'mul-by-5-25',
  skill: 'mul-by-5-25',
  smallSpace: true,
  generate(rng: Rng, band): Gen {
    const set = band === 0 ? [5, 15] : band === 1 ? [5, 15, 25] : [...MULTIPIERS];
    const m = rng.pick(set);
    const n =
      band <= 1 ? rng.int(12, 99) : band === 2 ? rng.int(21, 999) : rng.int(101, 9999);
    const product = m * n;
    const route: Step[] = [];
    if (m === 5) {
      route.push(step(`${fi(n)} × 10 = ${fi(n * 10)}`, R(n * 10)));
      route.push(step(`${fi(n * 10)} ÷ 2 = ${fi(product)}`, R(product)));
    } else if (m === 15) {
      const ten = n * 10;
      const five = n * 5;
      route.push(step(`${fi(n)} × 10 = ${fi(ten)}`, R(ten)));
      route.push(step(`Half of that is the 5 part: ${fi(ten)} ÷ 2 = ${fi(five)}`, R(five)));
      route.push(step(`${fi(ten)} + ${fi(five)} = ${fi(product)}`, R(product)));
    } else if (m === 25) {
      if (n % 4 === 0) {
        const q = n / 4;
        route.push(step(`${fi(n)} ÷ 4 = ${fi(q)}`, R(q)));
        route.push(step(`${fi(q)} × 100 = ${fi(product)}`, R(product)));
      } else {
        const h = n * 100;
        route.push(step(`${fi(n)} × 100 = ${fi(h)}`, R(h)));
        route.push(step(`${fi(h)} ÷ 4 = ${fi(product)}`, R(product)));
      }
    } else {
      // m === 50: x50 = x100/2.
      if (n % 2 === 0) {
        const q = n / 2;
        route.push(step(`${fi(n)} ÷ 2 = ${fi(q)}`, R(q)));
        route.push(step(`${fi(q)} × 100 = ${fi(product)}`, R(product)));
      } else {
        const h = n * 100;
        route.push(step(`${fi(n)} × 100 = ${fi(h)}`, R(h)));
        route.push(step(`${fi(h)} ÷ 2 = ${fi(product)}`, R(product)));
      }
    }
    const first = rng.chance(0.5);
    return {
      prompt: first ? `${fi(n)} × ${m}` : `${fi(m)} × ${fi(n)}`,
      answer: { kind: 'exact', value: rat(product), unit: 'number' },
      params: { m, n },
      structure: `multiply by ${m}`,
      strategies: m === 25 || m === 50 ? ['mul-by-25', 'mul-by-5'] : ['mul-by-5'],
      route,
      inputMode: 'decimal',
    };
  },
};

export const mulDoublingHalving: Template = {
  id: 'mul-doubling-halving',
  skill: 'mul-doubling-halving',
  smallSpace: true,
  generate(rng: Rng, band): Gen {
    let even: number;
    let five: number;
    if (band === 0) {
      even = rng.int(2, 10) * 2;
      five = (2 * rng.int(1, 4) + 1) * 5; // odd multiple of 5: 15-45
    } else if (band === 1) {
      even = rng.int(3, 24) * 2;
      five = (2 * rng.int(1, 9) + 1) * 5; // 15-95
    } else if (band === 2) {
      even = rng.int(6, 49) * 2;
      five = (2 * rng.int(1, 9) + 1) * 5;
    } else {
      even = rng.int(51, 499) * 2;
      five = (2 * rng.int(10, 99) + 1) * 5; // 105-995
    }
    const product = even * five;
    const route: Step[] = [];
    let e = even;
    let f = five;
    // Halve the even factor and double the other until the 5-factor is round.
    while (e % 2 === 0 && f % 10 !== 0) {
      const ne = e / 2;
      const nf = f * 2;
      route.push(
        step(`Halve ${fi(e)} and double ${fi(f)}: ${fi(ne)} × ${fi(nf)}`, R(ne)),
      );
      e = ne;
      f = nf;
    }
    route.push(step(`${fi(e)} × ${fi(f)} = ${fi(product)}`, R(product)));
    return {
      prompt: rng.chance(0.5) ? `${fi(even)} × ${fi(five)}` : `${fi(five)} × ${fi(even)}`,
      answer: { kind: 'exact', value: rat(product), unit: 'number' },
      params: { a: even, b: five },
      structure: 'even factor times factor ending in 5',
      strategies: ['mul-doubling-halving'],
      route,
      inputMode: 'decimal',
    };
  },
};

const SPECIALS = [125, 25, 75, 15, 11, 12, 250, 375] as const;

function structuredRoute(s: number, n: number): Step[] {
  const steps: Step[] = [];
  const product = s * n;
  if (s === 125 || s === 250 || s === 375) {
    // s = top/1000 fraction: 125 = 1000/8, 250 = 1000/4, 375 = 3000/8.
    const top = s === 125 ? 1000 : s === 250 ? 1000 : 3000;
    const div = s === 250 ? 4 : 8;
    if (n % div === 0) {
      const q = n / div;
      steps.push(step(`${fi(n)} ÷ ${div} = ${fi(q)}`, R(q)));
      steps.push(step(`${fi(q)} × ${fi(top)} = ${fi(product)}`, R(product)));
    } else {
      const h = n * top;
      steps.push(step(`${fi(n)} × ${fi(top)} = ${fi(h)}`, R(h)));
      steps.push(step(`${fi(h)} ÷ ${div} = ${fi(product)}`, R(product)));
    }
  } else if (s === 25) {
    if (n % 4 === 0) {
      const q = n / 4;
      steps.push(step(`${fi(n)} ÷ 4 = ${fi(q)}`, R(q)));
      steps.push(step(`${fi(q)} × 100 = ${fi(product)}`, R(product)));
    } else {
      const h = n * 100;
      steps.push(step(`${fi(n)} × 100 = ${fi(h)}`, R(h)));
      steps.push(step(`${fi(h)} ÷ 4 = ${fi(product)}`, R(product)));
    }
  } else if (s === 75) {
    const h = n * 300;
    if (n % 4 === 0) {
      const q = n / 4;
      steps.push(step(`${fi(n)} ÷ 4 = ${fi(q)}`, R(q)));
      steps.push(step(`${fi(q)} × 300 = ${fi(product)}`, R(product)));
    } else {
      steps.push(step(`${fi(n)} × 300 = ${fi(h)}`, R(h)));
      steps.push(step(`${fi(h)} ÷ 4 = ${fi(product)}`, R(product)));
    }
  } else if (s === 15) {
    const h = n * 30;
    if (n % 2 === 0) {
      const q = n / 2;
      steps.push(step(`${fi(n)} ÷ 2 = ${fi(q)}`, R(q)));
      steps.push(step(`${fi(q)} × 30 = ${fi(product)}`, R(product)));
    } else {
      steps.push(step(`${fi(n)} × 30 = ${fi(h)}`, R(h)));
      steps.push(step(`${fi(h)} ÷ 2 = ${fi(product)}`, R(product)));
    }
  } else {
    // 11 or 12: split into 10 + rest.
    const rest = s - 10;
    const p1 = n * 10;
    const p2 = n * rest;
    steps.push(step(`${fi(n)} × 10 = ${fi(p1)}`, R(p1)));
    steps.push(step(`${fi(n)} × ${rest} = ${fi(p2)}`, R(p2)));
    steps.push(step(`${fi(p1)} + ${fi(p2)} = ${fi(product)}`, R(product)));
  }
  return steps;
}

export const mul3DigitStructured: Template = {
  id: 'mul-3-digit-structured',
  skill: 'mul-3-digit-structured',
  generate(rng: Rng, band): Gen {
    const set =
      band === 0
        ? [11, 12]
        : band === 1
          ? [15, 25, 125]
          : [...SPECIALS];
    const s = rng.pick(set);
    const n =
      band <= 1 ? rng.int(13, 99) : band === 2 ? rng.int(101, 999) : rng.int(1001, 9999);
    const product = s * n;
    return {
      prompt: rng.chance(0.5) ? `${fi(s)} × ${fi(n)}` : `${fi(n)} × ${fi(s)}`,
      answer: { kind: 'exact', value: rat(product), unit: 'number' },
      params: { s, n },
      structure: `structured factor ${s} times ${String(n).length}-digit`,
      strategies: ['mul-3-digit-structured', 'mul-distributive-split'],
      route: structuredRoute(s, n),
      inputMode: 'decimal',
    };
  },
};

export const mulMultiTerm: Template = {
  id: 'mul-multi-term',
  skill: 'mul-multi-term',
  skills: ['mul-factoring'],
  generate(rng: Rng, band): Gen {
    // A pair whose product is round: ends-in-5 (odd multiple of 5) times even.
    const evenHi = band === 0 ? 48 : band === 3 ? 498 : 98;
    const five = (2 * rng.int(1, band === 0 ? 4 : 9) + 1) * 5; // 15-45 or 15-95
    const even = rng.int(6, evenHi / 2) * 2;
    const other = band === 3 ? rng.int(101, 999) : rng.int(11, 99);
    const pair = five * even;
    const product = pair * other;
    const order = rng.shuffle([five, even, other]);
    const route: Step[] = [
      step(
        `Multiply the round pair first: ${fi(five)} × ${fi(even)} = ${fi(pair)}`,
        R(pair),
      ),
      ...mulSplitRoute(pair, other),
    ];
    const params: Record<string, number> = { f0: order[0]!, f1: order[1]!, f2: order[2]! };
    return {
      prompt: order.map(fi).join(' × '),
      answer: { kind: 'exact', value: rat(product), unit: 'number' },
      params,
      structure: 'product of 3 factors, one pair making a round number',
      strategies: ['mul-factoring'],
      route,
      inputMode: 'decimal',
    };
  },
};

export const mulNearBase: Template = {
  id: 'mul-near-base',
  skill: 'mul-near-base',
  smallSpace: true,
  generate(rng: Rng, band): Gen {
    let base: number;
    let route: Step[];
    let structure: string;
    let x: number;
    let y: number;
    if (band <= 1) {
      base = 100;
      const maxDef = band === 0 ? 9 : 15;
      const d1 = rng.int(1, maxDef);
      const d2 = rng.int(1, maxDef);
      x = base - d1;
      y = base - d2;
      const cross = base - d1 - d2;
      const tail = d1 * d2;
      const product = x * y;
      route = [
        step(`Both are below ${fi(base)}: ${fi(base)} − ${fi(x)} = ${d1}`, R(d1)),
        step(`${fi(base)} − ${fi(y)} = ${d2}`, R(d2)),
        step(`${fi(base)} − ${d1} − ${d2} = ${fi(cross)}`, R(cross)),
        step(`${d1} × ${d2} = ${fi(tail)}`, R(tail)),
        step(`${fi(cross)} × ${fi(base)} + ${fi(tail)} = ${fi(product)}`, R(product)),
      ];
      structure = 'both factors below base 100';
    } else if (band === 2) {
      base = 100;
      const u = rng.int(1, 12);
      const v = rng.int(1, 15);
      x = base + u;
      y = base - v;
      const cross = base + u - v;
      const tail = u * v;
      const product = x * y;
      route = [
        step(`${fi(x)} is ${u} above ${fi(base)}`, R(u)),
        step(`${fi(y)} is ${v} below ${fi(base)}`, R(v)),
        step(`${fi(base)} + ${u} − ${v} = ${fi(cross)}`, R(cross)),
        step(`${u} × ${v} = ${fi(tail)}`, R(tail)),
        step(
          `${fi(cross)} × ${fi(base)} ${MINUS} ${fi(tail)} = ${fi(product)}`,
          R(product),
        ),
      ];
      structure = 'one factor above and one below base 100';
    } else {
      if (rng.chance(0.5)) {
        base = 1000;
        const d1 = rng.int(1, 30);
        const d2 = rng.int(1, 30);
        x = base - d1;
        y = base - d2;
        const cross = base - d1 - d2;
        const tail = d1 * d2;
        const product = x * y;
        route = [
          step(`Both are below ${fi(base)}: ${fi(base)} − ${fi(x)} = ${d1}`, R(d1)),
          step(`${fi(base)} − ${fi(y)} = ${d2}`, R(d2)),
          step(`${fi(base)} − ${d1} − ${d2} = ${fi(cross)}`, R(cross)),
          step(`${d1} × ${d2} = ${fi(tail)}`, R(tail)),
          step(`${fi(cross)} × ${fi(base)} + ${fi(tail)} = ${fi(product)}`, R(product)),
        ];
        structure = 'both factors below base 1,000';
      } else {
        base = 50;
        const d1 = rng.int(1, 9);
        const d2 = rng.int(1, 9);
        x = base - d1;
        y = base - d2;
        const cross = base - d1 - d2;
        const tail = d1 * d2;
        const product = x * y;
        route = [
          step(`Both are below ${fi(base)}: ${fi(base)} − ${fi(x)} = ${d1}`, R(d1)),
          step(`${fi(base)} − ${fi(y)} = ${d2}`, R(d2)),
          step(`${fi(base)} − ${d1} − ${d2} = ${fi(cross)}`, R(cross)),
          step(`${d1} × ${d2} = ${fi(tail)}`, R(tail)),
          step(`${fi(cross)} × ${fi(base)} + ${fi(tail)} = ${fi(product)}`, R(product)),
        ];
        structure = 'both factors below base 50';
      }
    }
    return {
      prompt: rng.chance(0.5) ? `${fi(x)} × ${fi(y)}` : `${fi(y)} × ${fi(x)}`,
      answer: { kind: 'exact', value: rat(x * y), unit: 'number' },
      params: { x, y },
      structure,
      strategies: ['mul-near-base'],
      route,
      inputMode: 'decimal',
    };
  },
};

export const mulBy11: Template = {
  id: 'mul-by-11',
  skill: 'mul-by-11',
  smallSpace: true,
  generate(rng: Rng, band): Gen {
    const n =
      band <= 1 ? rng.int(12, 99) : band === 2 ? rng.int(102, 999) : rng.int(1002, 9999);
    const product = n * 11;
    let route: Step[];
    if (n < 100) {
      // Pairwise digit method for two-digit n.
      const t = Math.floor(n / 10);
      const u = n % 10;
      const sum = t + u;
      if (sum < 10) {
        route = [
          step(`Split ${fi(n)}: outside digits ${t} and ${u}`, R(n)),
          step(`${t} + ${u} = ${sum}`, R(sum)),
          step(`${fi(n)} × 11 = ${fi(product)}`, R(product)),
        ];
      } else {
        route = [
          step(`Split ${fi(n)}: outside digits ${t} and ${u}`, R(n)),
          step(`${t} + ${u} = ${sum}`, R(sum)),
          step(`Middle is ${sum}: write ${sum - 10} and carry 1 to ${t}`, R(sum)),
          step(`${fi(n)} × 11 = ${fi(product)}`, R(product)),
        ];
      }
    } else {
      const ten = n * 10;
      route = [
        step(`${fi(n)} × 10 = ${fi(ten)}`, R(ten)),
        step(`${fi(ten)} + ${fi(n)} = ${fi(product)}`, R(product)),
      ];
    }
    return {
      prompt: `${fi(n)} × 11`,
      answer: { kind: 'exact', value: rat(product), unit: 'number' },
      params: { n, m: 11 },
      structure: `${String(n).length}-digit times 11`,
      strategies: ['mul-by-11'],
      route,
      inputMode: 'decimal',
    };
  },
};

export const MULTIPLICATION_TEMPLATES: Template[] = [
  mulTableFact,
  mul2x1,
  mul2x2,
  mulBy525,
  mulDoublingHalving,
  mul3DigitStructured,
  mulMultiTerm,
  mulNearBase,
  mulBy11,
];
