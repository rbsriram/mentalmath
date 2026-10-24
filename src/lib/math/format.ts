// Display formatting. Integers >= 1000 get comma separators. Decimals are
// exact. Currency uses the fictional AED label from the brief.

import {
  isInteger,
  isTerminating,
  toDecimal,
  toDisplay,
  type Rational,
} from './rational';
import type { Answer, Unit } from '../engine/types';

export function formatInt(v: bigint | number): string {
  const neg = BigInt(v) < 0n;
  const digits = (neg ? -BigInt(v) : BigInt(v)).toString();
  const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return neg ? `−${grouped}` : grouped;
}

// Integer with commas, exact decimal, or "a/b" for non-terminating values.
export function formatNumber(r: Rational): string {
  if (isInteger(r)) return formatInt(r.n);
  if (isTerminating(r)) {
    const dec = toDisplay(r);
    const neg = dec.startsWith('-');
    const body = neg ? dec.slice(1) : dec;
    const dot = body.indexOf('.');
    if (dot === -1) return dec;
    const intPart = body.slice(0, dot).length >= 4
      ? body.slice(0, dot).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
      : body.slice(0, dot);
    return `${neg ? '−' : ''}${intPart}${body.slice(dot)}`;
  }
  return `${formatInt(r.n)}/${formatInt(r.d)}`;
}

export function formatPercent(r: Rational): string {
  return `${formatNumber(r)}%`;
}

// "AED 250" for whole amounts, "AED 312.50" for fractions, with comma
// separators in the integer part.
export function formatCurrency(r: Rational, code = 'AED'): string {
  if (isInteger(r)) return `${code} ${formatInt(r.n)}`;
  const dec = toDecimal(r, 2);
  const neg = dec.startsWith('-');
  const body = neg ? dec.slice(1) : dec;
  const dot = body.indexOf('.');
  const intPart = body.slice(0, dot).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${code} ${neg ? '−' : ''}${intPart}${body.slice(dot)}`;
}

export function formatUnit(r: Rational, unit: Unit, currency?: string): string {
  if (unit === 'percent') return formatPercent(r);
  if (unit === 'currency') return formatCurrency(r, currency ?? 'AED');
  return formatNumber(r);
}

// Canonical display of an answer. Round-trips through parseInput:
// list values are joined with spaces, so no thousands separators appear.
export function displayAnswer(answer: Answer): string {
  switch (answer.kind) {
    case 'list':
      return answer.values.map((v) => formatNumber(v).replace(/,/g, '')).join(' ');
    case 'approx':
      return formatUnit(answer.value, answer.unit);
    case 'exact':
      return formatUnit(answer.value, answer.unit, answer.currency);
  }
}

// True when `value` shows up in `text` in some accepted printed form:
// grouped integer, plain integer, exact decimal (either minus sign), or
// the reduced fraction "n/d".
export function valueAppearsInText(value: Rational, text: string): boolean {
  const candidates = new Set<string>();
  candidates.add(formatNumber(value));
  candidates.add(toDisplay(value));
  if (isInteger(value)) {
    candidates.add(value.n.toString());
    candidates.add(formatInt(value.n));
  } else {
    candidates.add(`${value.n}/${value.d}`);
    candidates.add(`${formatInt(value.n)}/${formatInt(value.d)}`);
  }
  // Repeating values appear in route text as a 3-place rounding with an
  // ellipsis, e.g. 0.167…; the rounded form itself is the substring.
  candidates.add(toDecimal(value, 3));
  if (isTerminating(value)) {
    const dec = toDisplay(value);
    candidates.add(dec);
    candidates.add(dec.replace('-', '−'));
    const neg = dec.startsWith('-');
    const body = neg ? dec.slice(1) : dec;
    const dot = body.indexOf('.');
    if (dot !== -1) {
      const grouped = body.slice(0, dot).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
      candidates.add(`${neg ? '−' : ''}${grouped}${body.slice(dot)}`);
      candidates.add(`${neg ? '-' : ''}${grouped}${body.slice(dot)}`);
    }
  }
  for (const c of candidates) {
    if (c !== '' && text.includes(c)) return true;
  }
  return false;
}
