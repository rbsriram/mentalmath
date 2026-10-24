// Shared helpers for question templates: formatting, step building,
// digit decomposition, and small exact-arithmetic utilities.

import {
  fromDecimalString,
  isInteger,
  rat,
  toDisplay,
  type Rational,
} from '../../math/rational';
import {
  formatCurrency as fmoney,
  formatInt as fi,
  formatNumber as fmt,
  formatPercent as fpct,
} from '../../math/format';
import type { Step } from '../types';

export { fi, fmt, fpct, fmoney };

export function R(n: bigint | number, d: bigint | number = 1): Rational {
  return rat(n, d);
}

export function D(s: string): Rational {
  return fromDecimalString(s);
}

export function step(text: string, value: Rational): Step {
  return { text, value };
}

// "a/b" for prompt display of a fraction.
export function frac(n: bigint | number, d: bigint | number): string {
  return `${fi(BigInt(n))}/${fi(BigInt(d))}`;
}

// Minus sign used in prompts (U+2212).
export const MINUS = '−';

export function signed(n: number | bigint): string {
  return fi(BigInt(n));
}

// Nonzero place-value parts of a positive integer, largest first.
export function placeParts(n: number): number[] {
  const out: number[] = [];
  const s = Math.abs(n).toString();
  for (let i = 0; i < s.length; i++) {
    const d = Number(s[i]);
    if (d !== 0) out.push(d * 10 ** (s.length - 1 - i));
  }
  return out;
}

// Decimal digit strings for a value like 3.75 -> { intDigits: '375', places: 2 }.
export function decimalParts(s: string): { digits: bigint; places: number } {
  const t = s.replace('-', '');
  const dot = t.indexOf('.');
  if (dot === -1) return { digits: BigInt(t), places: 0 };
  return { digits: BigInt(t.slice(0, dot) + t.slice(dot + 1)), places: t.length - dot - 1 };
}

// Round a positive integer to `sig` significant digits.
export function roundSig(n: number, sig: number): number {
  if (n <= 0) return n;
  const digits = Math.floor(Math.log10(n)) + 1;
  if (digits <= sig) return n;
  const k = digits - sig;
  const p = 10 ** k;
  return Math.round(n / p) * p;
}

// Greedy split of a percent into anchor parts [50,25,20,10,5,2,1].
export function splitPercent(p: number): number[] {
  const parts: number[] = [];
  let rest = p;
  for (const a of [50, 25, 20, 10, 5, 2, 1]) {
    while (rest >= a) {
      parts.push(a);
      rest -= a;
    }
  }
  return parts;
}

// Left-to-right addition route for a + b: adds place parts of b.
export function addPartsRoute(a: number, b: number): Step[] {
  const parts = placeParts(b);
  const steps: Step[] = [];
  let run = a;
  for (const p of parts) {
    const next = run + p;
    steps.push(step(`${fi(run)} + ${fi(p)} = ${fi(next)}`, R(next)));
    run = next;
  }
  return steps;
}

// Left-to-right subtraction route for a - b.
export function subPartsRoute(a: number, b: number): Step[] {
  const parts = placeParts(b);
  const steps: Step[] = [];
  let run = a;
  for (const p of parts) {
    const next = run - p;
    steps.push(step(`${fi(run)} − ${fi(p)} = ${fi(next)}`, R(next)));
    run = next;
  }
  return steps;
}

// Long-division digits of n/d after the decimal point.
// Yields { digit, dividend, remainder } per step; stops when exact.
export function* longDivision(n: bigint, d: bigint, maxPlaces: number) {
  let rem = n % d;
  for (let i = 0; i < maxPlaces && rem !== 0n; i++) {
    const dividend = rem * 10n;
    const digit = dividend / d;
    rem = dividend % d;
    yield { dividend, digit, rem };
  }
}

// Chain-addition route: repeatedly adds the pair whose sum has the most
// trailing zeros (grouping strategy), ties broken left to right.
export function chainAddRoute(terms: number[]): Step[] {
  const items = terms.slice();
  const steps: Step[] = [];
  const zeros = (x: number): number => {
    let s = 0;
    let v = Math.abs(x);
    while (v !== 0 && v % 10 === 0) {
      s++;
      v = v / 10;
    }
    return s;
  };
  while (items.length > 1) {
    let bi = 0;
    let bj = 1;
    let best = -1;
    for (let i = 0; i < items.length; i++) {
      for (let j = i + 1; j < items.length; j++) {
        const sc = zeros(items[i]! + items[j]!);
        if (sc > best) {
          best = sc;
          bi = i;
          bj = j;
        }
      }
    }
    const s = items[bi]! + items[bj]!;
    steps.push(step(`${fi(items[bi]!)} + ${fi(items[bj]!)} = ${fi(s)}`, R(s)));
    items.splice(bj, 1);
    items.splice(bi, 1);
    items.push(s);
  }
  return steps;
}

// Distributive multiplication route: split `split` into place parts,
// multiply each by `by`, then add. Returns steps; last step is the product.
export function mulSplitRoute(by: number, split: number): Step[] {
  const parts = placeParts(split);
  if (parts.length === 1) {
    return [step(`${fi(by)} × ${fi(split)} = ${fi(by * split)}`, R(by * split))];
  }
  const steps: Step[] = [
    step(`Split ${fi(split)} into ${parts.map(fi).join(' + ')}`, R(split)),
  ];
  const partials: number[] = [];
  for (const p of parts) {
    const prod = by * p;
    partials.push(prod);
    steps.push(step(`${fi(by)} × ${fi(p)} = ${fi(prod)}`, R(prod)));
  }
  let run = partials[0]!;
  for (let i = 1; i < partials.length; i++) {
    const next = run + partials[i]!;
    steps.push(step(`${fi(run)} + ${fi(partials[i]!)} = ${fi(next)}`, R(next)));
    run = next;
  }
  return steps;
}

// Value of a Rational as it should appear in a prompt: integer with commas,
// exact decimal otherwise. Throws for non-terminating values.
export function promptNum(r: Rational): string {
  if (isInteger(r)) return fi(r.n);
  return toDisplay(r).replace('-', MINUS);
}
