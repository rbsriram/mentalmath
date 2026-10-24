import { describe, expect, it } from 'vitest';
import { checkAnswer, parseInput, type ParsedValue } from '../src/lib/engine/answer';
import { rat, type Rational } from '../src/lib/math/rational';
import type { Answer } from '../src/lib/engine/types';

const exact = (v: Rational, unit: 'number' | 'percent' | 'currency' = 'number'): Answer => ({
  kind: 'exact',
  value: v,
  unit,
  ...(unit === 'currency' ? { currency: 'AED' } : {}),
});

const approx = (v: Rational, tol: Rational): Answer => ({
  kind: 'approx',
  value: v,
  tolerance: tol,
  unit: 'number',
});

const single = (p: ReturnType<typeof parseInput>): ParsedValue => {
  if (p === null || Array.isArray(p)) throw new Error('expected a single value');
  return p;
};

describe('parseInput single values', () => {
  it('parses integers and decimals', () => {
    expect(single(parseInput('42', 'number')).value).toEqual(rat(42));
    expect(single(parseInput('3.75', 'number')).value).toEqual(rat(15, 4));
    expect(single(parseInput('.5', 'number')).value).toEqual(rat(1, 2));
    expect(single(parseInput('-5', 'number')).value).toEqual(rat(-5));
    expect(single(parseInput('−7', 'number')).value).toEqual(rat(-7)); // U+2212
  });

  it('parses thousands separators only when groups are 3 digits', () => {
    expect(single(parseInput('12,420', 'number')).value).toEqual(rat(12420));
    expect(single(parseInput('1,234,567', 'number')).value).toEqual(rat(1234567));
    expect(parseInput('12,42', 'number')).toBeNull();
    expect(parseInput('1,2345', 'number')).toBeNull();
    expect(parseInput('1234,567', 'number')).toBeNull();
  });

  it('parses fractions and mixed numbers', () => {
    expect(single(parseInput('7/16', 'number')).value).toEqual(rat(7, 16));
    expect(single(parseInput('-3/4', 'number')).value).toEqual(rat(-3, 4));
    expect(single(parseInput('1 3/4', 'number')).value).toEqual(rat(7, 4));
    expect(single(parseInput('-1 3/4', 'number')).value).toEqual(rat(-7, 4));
    expect(single(parseInput('7/16', 'number')).wasFraction).toBe(true);
  });

  it('strips % , currency tokens, and ~ / ≈ markers', () => {
    expect(single(parseInput('43.75%', 'percent')).value).toEqual(rat(175, 4));
    expect(single(parseInput('AED 250', 'currency')).value).toEqual(rat(250));
    expect(single(parseInput('250 aed', 'currency')).value).toEqual(rat(250));
    expect(single(parseInput('$312.50', 'currency')).value).toEqual(rat(625, 2));
    expect(single(parseInput('~50', 'number')).value).toEqual(rat(50));
    expect(single(parseInput('≈ 50', 'number')).value).toEqual(rat(50));
  });

  it('records decimal places and significant digits', () => {
    const p = single(parseInput('0.333', 'number'));
    expect(p.decimalPlaces).toBe(3);
    expect(p.sigDigits).toBe(3);
    const q = single(parseInput('0.33', 'number'));
    expect(q.sigDigits).toBe(2);
    expect(single(parseInput('7/16', 'number')).decimalPlaces).toBeNull();
  });

  it('rejects junk', () => {
    expect(parseInput('abc', 'number')).toBeNull();
    expect(parseInput('1.2.3', 'number')).toBeNull();
    expect(parseInput('1/0', 'number')).toBeNull();
    expect(parseInput(' ', 'number')).toBeNull();
  });
});

describe('parseInput lists', () => {
  it('splits on commas and spaces', () => {
    const p = parseInput('800 1200 1600', 'number', true);
    expect(Array.isArray(p)).toBe(true);
    expect((p as ParsedValue[]).map((x) => x.value)).toEqual([rat(800), rat(1200), rat(1600)]);
    const q = parseInput('800, 1200, 1600', 'number', true);
    expect((q as ParsedValue[]).map((x) => x.value)).toEqual([rat(800), rat(1200), rat(1600)]);
  });

  it('does not allow thousands separators in list mode', () => {
    // "1,200" splits into 1 and 200 — a two-element list, not one number.
    const p = parseInput('1,200', 'number', true);
    expect((p as ParsedValue[]).map((x) => x.value)).toEqual([rat(1), rat(200)]);
  });
});

describe('checkAnswer: exact terminating', () => {
  it('accepts equivalent forms', () => {
    const a = exact(rat(7, 16));
    expect(checkAnswer(a, '0.4375').correct).toBe(true);
    expect(checkAnswer(a, '.4375').correct).toBe(true);
    expect(checkAnswer(a, '7/16').correct).toBe(true);
    expect(checkAnswer(a, '14/32').correct).toBe(true);
    expect(checkAnswer(a, '0.43750').correct).toBe(true);
  });

  it('rejects wrong values', () => {
    const a = exact(rat(7, 16));
    expect(checkAnswer(a, '0.4376').reason).toBe('wrong');
    expect(checkAnswer(a, '43.75').reason).toBe('wrong'); // number unit
  });

  it('handles the percent unit', () => {
    const a = exact(rat(175, 4), 'percent'); // 43.75%
    expect(checkAnswer(a, '43.75').correct).toBe(true);
    expect(checkAnswer(a, '43.75%').correct).toBe(true);
    expect(checkAnswer(a, '0.4375').reason).toBe('wrong');
  });

  it('handles currency tokens', () => {
    const a = exact(rat(250), 'currency');
    expect(checkAnswer(a, '250').correct).toBe(true);
    expect(checkAnswer(a, 'AED 250').correct).toBe(true);
    expect(checkAnswer(a, 'AED 250.00').correct).toBe(true);
    expect(checkAnswer(a, '251').reason).toBe('wrong');
  });

  it('handles empty and unparsable input', () => {
    const a = exact(rat(5));
    expect(checkAnswer(a, '').reason).toBe('empty');
    expect(checkAnswer(a, '   ').reason).toBe('empty');
    expect(checkAnswer(a, 'abc').reason).toBe('unparsable');
  });
});

describe('checkAnswer: exact non-terminating (3 significant digit rule)', () => {
  const third = exact(rat(1, 3));
  const thirdPct = exact(rat(100, 3), 'percent'); // 33.333...%
  const sixth = exact(rat(1, 6));

  it('accepts the exact fraction', () => {
    expect(checkAnswer(third, '1/3').correct).toBe(true);
    expect(checkAnswer(third, '2/6').correct).toBe(true);
    expect(checkAnswer(thirdPct, '100/3').correct).toBe(true);
    expect(checkAnswer(third, '1/4').reason).toBe('wrong');
  });

  it('accepts decimals with >= 3 significant digits matching the rounding', () => {
    expect(checkAnswer(third, '0.333').correct).toBe(true);
    expect(checkAnswer(third, '0.3333').correct).toBe(true);
    expect(checkAnswer(third, '0.333333333').correct).toBe(true);
    expect(checkAnswer(thirdPct, '33.3').correct).toBe(true);
    expect(checkAnswer(thirdPct, '33.33').correct).toBe(true);
    expect(checkAnswer(thirdPct, '33.33%').correct).toBe(true);
    expect(checkAnswer(sixth, '0.167').correct).toBe(true);
    expect(checkAnswer(sixth, '0.1667').correct).toBe(true);
  });

  it('too-coarse when under 3 significant digits but otherwise matching', () => {
    expect(checkAnswer(third, '0.33').reason).toBe('too-coarse');
    expect(checkAnswer(third, '0.3').reason).toBe('too-coarse');
    expect(checkAnswer(thirdPct, '33').reason).toBe('too-coarse');
  });

  it('wrong when the typed rounding does not match', () => {
    expect(checkAnswer(third, '0.334').reason).toBe('wrong');
    expect(checkAnswer(sixth, '0.166').reason).toBe('wrong');
    expect(checkAnswer(third, '0.5').reason).toBe('wrong'); // 0.5 != round(1/3, 1) = 0.3
  });
});

describe('checkAnswer: approx and list', () => {
  it('accepts within tolerance only', () => {
    const a = approx(rat(50), rat(5));
    expect(checkAnswer(a, '50').correct).toBe(true);
    expect(checkAnswer(a, '49.6').correct).toBe(true);
    expect(checkAnswer(a, '55').correct).toBe(true);
    expect(checkAnswer(a, '55.1').reason).toBe('wrong');
    expect(checkAnswer(a, '44.9').reason).toBe('wrong');
    expect(checkAnswer(a, '~50').correct).toBe(true);
  });

  it('checks lists position by position', () => {
    const a: Answer = {
      kind: 'list',
      values: [rat(800), rat(1200), rat(1600)],
      unit: 'number',
    };
    expect(checkAnswer(a, '800 1200 1600').correct).toBe(true);
    expect(checkAnswer(a, '800, 1200, 1600').correct).toBe(true);
    expect(checkAnswer(a, '800 1600 1200').reason).toBe('wrong');
    expect(checkAnswer(a, '800 1200').reason).toBe('wrong-count');
    expect(checkAnswer(a, '800 1200 1600 2000').reason).toBe('wrong-count');
    expect(checkAnswer(a, 'abc').reason).toBe('unparsable');
  });
});
