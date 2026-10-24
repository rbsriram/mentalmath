// Decimal templates.
// Operand ranges:
//   dec-mul:         b0: 1.1-9.9 x 1.1-9.9 (1 dp each);
//                    b1: 1.01-9.99 x 1.1-9.9 (2 dp x 1 dp);
//                    b2: 1.01-9.99 x 1.01-9.99 (2 dp each);
//                    b3: 10.1-99.99 x 1.01-9.9 (up to 3 dp total over 2).
//   dec-add-sub:     b0: 0.1-9.9 + 0.1-9.9; b1: 1.01-99.99 +/- same;
//                    b2-3: up to 999.99, mixed dp, add or subtract.
//   dec-place-value: decimal x or / by 10, 100, 1,000.
//                    b0: n 0.1-9.9 by 10 or 100; b1: n 0.01-99.9 by 10-1,000;
//                    b2-3: n up to 9,999.99, include division to decimals.

import {
  add as radd,
  cmp,
  div as rdiv,
  mul as rmul,
  sub as rsub,
  type Rational,
} from '../../math/rational';
import { formatNumber } from '../../math/format';
import type { Rng } from '../../math/rng';
import type { Question, Step, Template } from '../types';
import { D, decimalParts, fi, R, step } from './common';

type Gen = Omit<Question, 'templateId' | 'seed' | 'band' | 'skill' | 'skills'>;

// A random decimal string in (0, intHi), with up to `places` decimal places
// and no trailing zeros.
function randDecimal(rng: Rng, intHi: number, places: number): string {
  const scale = 10 ** places;
  const v = rng.int(1, intHi * scale - 1);
  let s = (v / scale).toFixed(places);
  if (s.includes('.')) s = s.replace(/0+$/, '').replace(/\.$/, '');
  return s;
}

function decStr(r: Rational): string {
  return formatNumber(r);
}

export const decMul: Template = {
  id: 'dec-mul',
  skill: 'dec-mul',
  generate(rng: Rng, band): Gen {
    let aStr: string;
    let bStr: string;
    if (band === 0) {
      aStr = randDecimal(rng, 9, 1);
      bStr = randDecimal(rng, 9, 1);
    } else if (band === 1) {
      aStr = randDecimal(rng, 9, 2);
      bStr = randDecimal(rng, 9, 1);
    } else if (band === 2) {
      aStr = randDecimal(rng, 9, 2);
      bStr = randDecimal(rng, 9, 2);
    } else {
      aStr = randDecimal(rng, 99, rng.chance(0.5) ? 3 : 2);
      bStr = randDecimal(rng, 9, rng.chance(0.5) ? 2 : 1);
    }
    const a = D(aStr);
    const b = D(bStr);
    const product = rmul(a, b);
    const pa = decimalParts(aStr);
    const pb = decimalParts(bStr);
    const intProduct = pa.digits * pb.digits;
    const places = pa.places + pb.places;
    const route: Step[] = [
      step(
        `Ignore the points: ${fi(pa.digits)} × ${fi(pb.digits)} = ${fi(intProduct)}`,
        R(intProduct),
      ),
      step(
        `Place ${places} decimal place${places === 1 ? '' : 's'}: ${decStr(product)}`,
        product,
      ),
    ];
    return {
      prompt: `${aStr} × ${bStr}`,
      answer: { kind: 'exact', value: product, unit: 'number' },
      params: { a: aStr, b: bStr },
      structure: `decimal product, ${pa.places} + ${pb.places} decimal places`,
      strategies: ['dec-mul-places'],
      route,
      inputMode: 'decimal',
    };
  },
};

export const decAddSub: Template = {
  id: 'dec-add-sub',
  skill: 'dec-add-sub',
  generate(rng: Rng, band): Gen {
    const hi = band === 0 ? 9 : band === 1 ? 99 : 999;
    const p1 = band === 0 ? 1 : 2;
    const p2 = band === 0 ? 1 : band >= 2 && rng.chance(0.5) ? 1 : 2;
    const aStr = randDecimal(rng, hi, p1);
    const bStr = randDecimal(rng, hi, p2);
    const a = D(aStr);
    const b = D(bStr);
    const isAdd = band === 0 ? true : rng.chance(0.5);
    // For subtraction keep the result positive.
    const swap = !isAdd && cmp(a, b) < 0;
    const x = swap ? b : a;
    const y = swap ? a : b;
    const xStr = swap ? bStr : aStr;
    const yStr = swap ? aStr : bStr;
    const result = isAdd ? radd(x, y) : rsub(x, y);
    const scale = 10n ** BigInt(Math.max(decimalParts(xStr).places, decimalParts(yStr).places));
    const ix = (x.n * scale) / x.d;
    const iy = (y.n * scale) / y.d;
    const iRes = isAdd ? ix + iy : ix - iy;
    const op = isAdd ? '+' : '−';
    const route: Step[] = [
      step(
        `Work in ${scale === 10n ? 'tenths' : scale === 100n ? 'hundredths' : 'thousandths'}: ${fi(ix)} ${op} ${fi(iy)} = ${fi(iRes)}`,
        R(iRes),
      ),
      step(`Restore the point: ${decStr(result)}`, result),
    ];
    return {
      prompt: `${xStr} ${op} ${yStr}`,
      answer: { kind: 'exact', value: result, unit: 'number' },
      params: { a: xStr, b: yStr, op },
      structure: `decimal ${isAdd ? 'addition' : 'subtraction'}`,
      strategies: ['dec-place-shift'],
      route,
      inputMode: 'decimal',
    };
  },
};

export const decPlaceValue: Template = {
  id: 'dec-place-value',
  skill: 'dec-place-value',
  generate(rng: Rng, band): Gen {
    const places = band === 0 ? 1 : band === 1 ? rng.pick([1, 2]) : rng.pick([1, 2, 3]);
    const intHi = band === 0 ? 9 : band === 1 ? 99 : 9999;
    const nStr = randDecimal(rng, intHi, places);
    const pow = band === 0 ? rng.pick([10, 100]) : rng.pick([10, 100, 1000]);
    const n = D(nStr);
    const isMul = band === 0 ? true : rng.chance(0.5);
    const result = isMul ? rmul(n, R(pow)) : rdiv(n, R(pow));
    const shift = String(pow).length - 1;
    const route: Step[] = [
      step(
        `Move the point ${shift} place${shift === 1 ? '' : 's'} ${isMul ? 'right' : 'left'}: ${nStr} ${isMul ? '×' : '÷'} ${fi(pow)} = ${decStr(result)}`,
        result,
      ),
    ];
    return {
      prompt: `${nStr} ${isMul ? '×' : '÷'} ${fi(pow)}`,
      answer: { kind: 'exact', value: result, unit: 'number' },
      params: { n: nStr, pow, op: isMul ? '×' : '÷' },
      structure: `decimal ${isMul ? 'times' : 'divided by'} ${fi(pow)}`,
      strategies: ['dec-place-shift'],
      route,
      inputMode: 'decimal',
    };
  },
};

export const DECIMAL_TEMPLATES: Template[] = [decMul, decAddSub, decPlaceValue];
