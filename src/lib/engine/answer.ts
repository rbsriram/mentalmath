// Answer parsing and checking. All comparisons are exact rational
// arithmetic; no floating-point equality is used anywhere.

import {
  abs,
  cmp,
  eq,
  fromDecimalString,
  isTerminating,
  rat,
  roundTo,
  sub,
  type Rational,
} from '../math/rational';
import type { Answer, Unit } from './types';

export interface ParsedValue {
  value: Rational;
  decimalPlaces: number | null; // digits typed after the decimal point
  sigDigits: number | null; // significant digits typed (null for fractions)
  wasFraction: boolean;
}

export type ParsedInput = ParsedValue | ParsedValue[];

const MINUS = /[−–]/g;

function stripDecorations(s: string): string {
  let t = s.trim().replace(MINUS, '-');
  t = t.replace(/^[~≈]\s*/, ''); // approximate marker
  t = t.replace(/^\$\s*/, ''); // currency symbol
  t = t.replace(/\s*\$$/, '');
  t = t.replace(/^[A-Za-z]{3}\s+/, ''); // leading currency code
  t = t.replace(/\s+[A-Za-z]{3}$/, ''); // trailing currency code
  t = t.replace(/\s*%$/, ''); // percent sign
  t = t.replace(/\.{3}$|…$/, ''); // trailing ellipsis from route/sheet text
  return t.trim();
}

function countSigDigits(intPart: string, fracPart: string): number {
  const digits = (intPart + fracPart).replace(/^0+/, '');
  if (digits === '') return 0;
  // Trailing zeros are significant only when a decimal point was typed.
  if (fracPart === '') return digits.replace(/0+$/, '').length || 1;
  return digits.length;
}

// True when a digits/commas token is either plain digits or correctly
// grouped thousands (first group 1-3 digits, then groups of exactly 3).
function validGroups(s: string): boolean {
  if (!s.includes(',')) return /^[+-]?\d+$/.test(s);
  return /^[+-]?\d{1,3}(?:,\d{3})+$/.test(s);
}

// Parses one numeric token after decoration stripping.
// Accepts integers, decimals, thousands separators, fractions, mixed numbers.
function parseToken(t: string): ParsedValue | null {
  if (t === '') return null;

  const mixed = /^([+-]?\d+)\s+(\d+)\/(\d+)$/.exec(t);
  if (mixed) {
    const whole = BigInt(mixed[1]!);
    const n = BigInt(mixed[2]!);
    const d = BigInt(mixed[3]!);
    if (d === 0n) return null;
    const sign = whole < 0n ? -1n : 1n;
    const absWhole = whole < 0n ? -whole : whole;
    return {
      value: rat(sign * (absWhole * d + n), d),
      decimalPlaces: null,
      sigDigits: null,
      wasFraction: true,
    };
  }

  const frac = /^([+-]?[\d,]+)\/([\d,]+)$/.exec(t);
  if (frac) {
    const numS = frac[1]!;
    const denS = frac[2]!;
    // Thousands separators are allowed inside each fraction part, validated
    // per part (first group 1-3 digits, then groups of exactly 3).
    if (!validGroups(numS) || !validGroups(denS)) return null;
    const d = BigInt(denS.replace(/,/g, ''));
    if (d === 0n) return null;
    return {
      value: rat(BigInt(numS.replace(/,/g, '')), d),
      decimalPlaces: null,
      sigDigits: null,
      wasFraction: true,
    };
  }

  // Thousands separators: first group 1-3 digits, then groups of exactly 3.
  const grouped = /^([+-]?\d{1,3}(?:,\d{3})+)(?:\.(\d+))?$/.exec(t);
  if (grouped) {
    const intDigits = grouped[1]!.replace(/,/g, '');
    const fracDigits = grouped[2] ?? '';
    try {
      const v = fromDecimalString(`${intDigits}${fracDigits ? `.${fracDigits}` : ''}`);
      return {
        value: v,
        decimalPlaces: fracDigits === '' ? null : fracDigits.length,
        sigDigits: countSigDigits(intDigits.replace(/^[+-]/, ''), fracDigits),
        wasFraction: false,
      };
    } catch {
      return null;
    }
  }
  if (t.includes(',')) return null; // malformed separator groups

  const dec = /^([+-]?)(\d*)(?:\.(\d*))?$/.exec(t);
  if (dec && (dec[2] !== '' || (dec[3] ?? '') !== '')) {
    try {
      const v = fromDecimalString(t);
      return {
        value: v,
        decimalPlaces: dec[3] === undefined ? null : dec[3].length,
        sigDigits: countSigDigits(dec[2] ?? '', dec[3] ?? ''),
        wasFraction: false,
      };
    } catch {
      return null;
    }
  }
  return null;
}

// Parses user input into exact values. In list mode (list: true) the input
// is split on commas and whitespace; thousands separators are NOT allowed
// there, because "1,200" is ambiguous between one value and two.
export function parseInput(raw: string, unit: Unit, list = false): ParsedInput | null {
  void unit; // the unit affects semantics, not syntax; kept for the public API
  const t = raw.trim();
  if (t === '') return null;

  if (list) {
    // Decorations apply to the whole input, not to each element.
    const cleaned = stripDecorations(t);
    const tokens = cleaned.split(/[\s,]+/).filter((x) => x !== '');
    if (tokens.length === 0) return null;
    const out: ParsedValue[] = [];
    for (const tok of tokens) {
      const p = parseToken(tok);
      if (p === null) return null;
      out.push(p);
    }
    return out;
  }

  const cleaned = stripDecorations(t);
  return parseToken(cleaned);
}

export type RejectReason = 'empty' | 'unparsable' | 'wrong' | 'too-coarse' | 'wrong-count';
export interface CheckResult {
  correct: boolean;
  reason?: RejectReason;
}

function checkSingle(value: Rational, parsed: ParsedValue): CheckResult {
  if (isTerminating(value)) {
    return eq(parsed.value, value) ? { correct: true } : { correct: false, reason: 'wrong' };
  }
  // Non-terminating value: accept the exact fraction, or a decimal that
  // matches the true value rounded to the typed places, with at least 3
  // significant digits.
  if (parsed.wasFraction) {
    return eq(parsed.value, value) ? { correct: true } : { correct: false, reason: 'wrong' };
  }
  const places = parsed.decimalPlaces ?? 0;
  const matches = eq(parsed.value, roundTo(value, places));
  if (!matches) return { correct: false, reason: 'wrong' };
  if ((parsed.sigDigits ?? 0) < 3) return { correct: false, reason: 'too-coarse' };
  return { correct: true };
}

export function checkAnswer(answer: Answer, raw: string): CheckResult {
  if (raw.trim() === '') return { correct: false, reason: 'empty' };

  if (answer.kind === 'list') {
    const parsed = parseInput(raw, answer.unit, true);
    if (parsed === null) return { correct: false, reason: 'unparsable' };
    const items = parsed as ParsedValue[];
    if (items.length !== answer.values.length) {
      return { correct: false, reason: 'wrong-count' };
    }
    for (let i = 0; i < items.length; i++) {
      if (!eq(items[i]!.value, answer.values[i]!)) {
        return { correct: false, reason: 'wrong' };
      }
    }
    return { correct: true };
  }

  const parsed = parseInput(raw, answer.unit);
  if (parsed === null || Array.isArray(parsed)) {
    return { correct: false, reason: 'unparsable' };
  }

  if (answer.kind === 'approx') {
    const delta = abs(sub(parsed.value, answer.value));
    return cmp(delta, answer.tolerance) <= 0
      ? { correct: true }
      : { correct: false, reason: 'wrong' };
  }

  return checkSingle(answer.value, parsed);
}
