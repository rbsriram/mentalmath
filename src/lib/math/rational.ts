// Exact rational arithmetic on BigInt. Every Rational is normalized:
// d > 0, gcd(n, d) = 1, and zero is 0/1. Objects are immutable.

export interface Rational {
  readonly n: bigint;
  readonly d: bigint;
}

function gcd(a: bigint, b: bigint): bigint {
  let x = a < 0n ? -a : a;
  let y = b < 0n ? -b : b;
  while (y !== 0n) {
    const t = x % y;
    x = y;
    y = t;
  }
  return x;
}

export function rat(n: bigint | number, d: bigint | number = 1): Rational {
  let num = BigInt(n);
  let den = BigInt(d);
  if (den === 0n) throw new Error('rational: zero denominator');
  if (num === 0n) return { n: 0n, d: 1n };
  if (den < 0n) {
    num = -num;
    den = -den;
  }
  const g = gcd(num, den);
  return { n: num / g, d: den / g };
}

function parseDecimalPart(t: string): Rational {
  const m = /^([+-]?)(\d*)(?:\.(\d*))?$/.exec(t);
  if (!m) throw new Error(`rational: cannot parse "${t}"`);
  const intDigits = m[2] ?? '';
  const fracDigits = m[3] ?? '';
  if (intDigits === '' && fracDigits === '') {
    throw new Error(`rational: cannot parse "${t}"`);
  }
  const all = (intDigits + fracDigits).replace(/^0+(?=\d)/, '');
  const coeff = BigInt((m[1] === '-' ? '-' : '') + (all === '' ? '0' : all));
  return rat(coeff, 10n ** BigInt(fracDigits.length));
}

// Parses '3.75', '-.5', '1,234.5' (commas are stripped), and '7/16'.
export function fromDecimalString(s: string): Rational {
  const t = s.trim().replace(/,/g, '').replace(/[−–]/g, '-');
  const parts = t.split('/');
  if (parts.length === 1) return parseDecimalPart(t);
  if (parts.length === 2) {
    return div(parseDecimalPart(parts[0]!), parseDecimalPart(parts[1]!));
  }
  throw new Error(`rational: cannot parse "${s}"`);
}

export function add(a: Rational, b: Rational): Rational {
  return rat(a.n * b.d + b.n * a.d, a.d * b.d);
}

export function sub(a: Rational, b: Rational): Rational {
  return rat(a.n * b.d - b.n * a.d, a.d * b.d);
}

export function mul(a: Rational, b: Rational): Rational {
  return rat(a.n * b.n, a.d * b.d);
}

export function div(a: Rational, b: Rational): Rational {
  if (b.n === 0n) throw new Error('rational: division by zero');
  return rat(a.n * b.d, a.d * b.n);
}

export function neg(a: Rational): Rational {
  return { n: -a.n, d: a.d };
}

export function abs(a: Rational): Rational {
  return a.n < 0n ? { n: -a.n, d: a.d } : a;
}

export function cmp(a: Rational, b: Rational): -1 | 0 | 1 {
  const x = a.n * b.d - b.n * a.d;
  return x < 0n ? -1 : x > 0n ? 1 : 0;
}

export function eq(a: Rational, b: Rational): boolean {
  return a.n === b.n && a.d === b.d;
}

export function isZero(a: Rational): boolean {
  return a.n === 0n;
}

export function isInteger(a: Rational): boolean {
  return a.d === 1n;
}

export function floor(a: Rational): bigint {
  const q = a.n / a.d;
  return a.n % a.d !== 0n && a.n < 0n ? q - 1n : q;
}

export function toNumber(a: Rational): number {
  return Number(a.n) / Number(a.d);
}

function absBig(x: bigint): bigint {
  return x < 0n ? -x : x;
}

// Exact decimal expansion with `places` digits after the point,
// rounding half away from zero. Returns a string.
export function toDecimal(r: Rational, places: number): string {
  if (!Number.isInteger(places) || places < 0) {
    throw new Error('rational: places must be a non-negative integer');
  }
  const scale = 10n ** BigInt(places);
  const num = r.n * scale;
  let q = num / r.d;
  const rem = num % r.d;
  if (absBig(2n * rem) >= r.d) q += num < 0n ? -1n : 1n;
  const negative = q < 0n;
  const digits = (negative ? -q : q).toString().padStart(places + 1, '0');
  const intPart = digits.slice(0, digits.length - places);
  const fracPart = digits.slice(digits.length - places);
  const sign = negative && q !== 0n ? '-' : '';
  return places === 0 ? sign + intPart : `${sign}${intPart}.${fracPart}`;
}

// Round to `places` decimals, half away from zero, staying exact.
export function roundTo(r: Rational, places: number): Rational {
  return fromDecimalString(toDecimal(r, places));
}

// True when the reduced denominator has only factors 2 and 5.
export function isTerminating(r: Rational): boolean {
  let d = r.d;
  while (d % 2n === 0n) d /= 2n;
  while (d % 5n === 0n) d /= 5n;
  return d === 1n;
}

// Exact decimal string. Throws when the decimal does not terminate.
export function toExactDecimalString(r: Rational): string {
  if (!isTerminating(r)) throw new Error('rational: non-terminating decimal');
  let d = r.d;
  let twos = 0n;
  let fives = 0n;
  while (d % 2n === 0n) {
    d /= 2n;
    twos += 1n;
  }
  while (d % 5n === 0n) {
    d /= 5n;
    fives += 1n;
  }
  const places = Number(twos > fives ? twos : fives);
  return toDecimal(r, places);
}

// Exact decimal when terminating, otherwise the fraction "a/b".
export function toDisplay(r: Rational): string {
  if (isTerminating(r)) return toExactDecimalString(r);
  return `${r.n}/${r.d}`;
}
