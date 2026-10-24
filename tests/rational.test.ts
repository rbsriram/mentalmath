import { describe, expect, it } from 'vitest';
import {
  abs,
  add,
  cmp,
  div,
  eq,
  floor,
  fromDecimalString,
  isInteger,
  isTerminating,
  isZero,
  mul,
  neg,
  rat,
  sub,
  toDecimal,
  toDisplay,
  toExactDecimalString,
  toNumber,
  type Rational,
} from '../src/lib/math/rational';

const r = (n: number | bigint, d: number | bigint = 1) => rat(n, d);

describe('rational normalization', () => {
  it('reduces to lowest terms', () => {
    expect(r(4, 6)).toEqual({ n: 2n, d: 3n });
    expect(r(375, 100)).toEqual({ n: 15n, d: 4n });
  });
  it('keeps the denominator positive', () => {
    expect(r(1, -2)).toEqual({ n: -1n, d: 2n });
    expect(r(-1, -2)).toEqual({ n: 1n, d: 2n });
  });
  it('normalizes zero to 0/1', () => {
    expect(r(0, 7)).toEqual({ n: 0n, d: 1n });
    expect(r(0, -5)).toEqual({ n: 0n, d: 1n });
  });
  it('throws on a zero denominator', () => {
    expect(() => r(1, 0)).toThrow();
    expect(() => div(r(1), r(0))).toThrow();
  });
});

describe('arithmetic', () => {
  it('adds and subtracts', () => {
    expect(add(r(1, 3), r(1, 6))).toEqual(r(1, 2));
    expect(sub(r(1, 3), r(1, 2))).toEqual(r(-1, 6));
  });
  it('multiplies and divides', () => {
    expect(mul(r(3, 4), r(8, 9))).toEqual(r(2, 3));
    expect(div(r(2, 3), r(4, 5))).toEqual(r(5, 6));
  });
  it('additive inverse and identity laws', () => {
    const a = r(-7, 12);
    const b = r(5, 8);
    expect(add(a, neg(a))).toEqual(r(0));
    expect(mul(a, r(1))).toEqual(a);
    expect(eq(add(a, b), add(b, a))).toBe(true);
    expect(eq(mul(a, b), mul(b, a))).toBe(true);
    expect(eq(mul(a, add(b, r(1, 3))), add(mul(a, b), mul(a, r(1, 3))))).toBe(true);
  });
  it('compares exactly', () => {
    expect(cmp(r(1, 3), r(1, 2))).toBe(-1);
    expect(cmp(r(2, 4), r(1, 2))).toBe(0);
    expect(cmp(r(5, 4), r(1))).toBe(1);
    expect(abs(r(-3, 4))).toEqual(r(3, 4));
    expect(isZero(r(0))).toBe(true);
    expect(isInteger(r(8, 4))).toBe(true);
    expect(isInteger(r(8, 3))).toBe(false);
  });
  it('floors negatives correctly', () => {
    expect(floor(r(7, 2))).toBe(3n);
    expect(floor(r(-7, 2))).toBe(-4n);
    expect(floor(r(-8, 2))).toBe(-4n);
  });
});

describe('fromDecimalString', () => {
  it('parses decimals', () => {
    expect(fromDecimalString('3.75')).toEqual(r(15, 4));
    expect(fromDecimalString('-.5')).toEqual(r(-1, 2));
    expect(fromDecimalString('1,234.5')).toEqual(r(2469, 2));
    expect(fromDecimalString('0.125')).toEqual(r(1, 8));
  });
  it('parses fractions', () => {
    expect(fromDecimalString('7/16')).toEqual(r(7, 16));
    expect(fromDecimalString('-6/8')).toEqual(r(-3, 4));
  });
  it('rejects junk', () => {
    expect(() => fromDecimalString('abc')).toThrow();
    expect(() => fromDecimalString('')).toThrow();
  });
});

describe('decimal output', () => {
  it('rounds half away from zero', () => {
    expect(toDecimal(r(2, 3), 3)).toBe('0.667');
    expect(toDecimal(r(1, 2), 0)).toBe('1');
    expect(toDecimal(r(-1, 2), 0)).toBe('-1');
    expect(toDecimal(r(-2, 3), 2)).toBe('-0.67');
    expect(toDecimal(r(999, 100), 1)).toBe('10.0');
    expect(toDecimal(r(1, 8), 0)).toBe('0');
  });
  it('detects terminating decimals', () => {
    expect(isTerminating(r(1, 3))).toBe(false);
    expect(isTerminating(r(7, 16))).toBe(true);
    expect(isTerminating(r(1, 6))).toBe(false);
    expect(isTerminating(r(1, 40))).toBe(true);
  });
  it('writes exact decimal strings', () => {
    expect(toExactDecimalString(r(7, 16))).toBe('0.4375');
    expect(toExactDecimalString(r(1, 25))).toBe('0.04');
    expect(toExactDecimalString(r(5))).toBe('5');
    expect(() => toExactDecimalString(r(1, 3))).toThrow();
  });
  it('toDisplay picks decimal or fraction', () => {
    expect(toDisplay(r(7, 16))).toBe('0.4375');
    expect(toDisplay(r(1, 3))).toBe('1/3');
    expect(toDisplay(r(-4))).toBe('-4');
  });
  it('toNumber is for comparisons only', () => {
    expect(toNumber(r(1, 4))).toBeCloseTo(0.25);
  });
});

describe('type sanity', () => {
  it('Rational is a plain immutable pair', () => {
    const x: Rational = r(6, 9);
    expect(x).toEqual({ n: 2n, d: 3n });
  });
});
