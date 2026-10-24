import { describe, expect, it } from 'vitest';
import { checkAnswer } from '../src/lib/engine/answer';
import { generate, TEMPLATES } from '../src/lib/engine/registry';
import type { Band, Question } from '../src/lib/engine/types';
import { displayAnswer, formatInt, valueAppearsInText } from '../src/lib/math/format';
import {
  add as radd,
  cmp,
  div as rdiv,
  eq,
  fromDecimalString,
  isInteger,
  mul as rmul,
  sub as rsub,
  toNumber,
  rat,
  type Rational,
} from '../src/lib/math/rational';

const BANDS: Band[] = [0, 1, 2, 3];
const SEEDS = 500;

const N = (q: Question, k: string): number => {
  const v = q.params[k];
  if (v === undefined) throw new Error(`missing param ${k}`);
  return typeof v === 'number' ? v : Number(v.replace(/,/g, ''));
};
const S = (q: Question, k: string): string => {
  const v = q.params[k];
  if (v === undefined) throw new Error(`missing param ${k}`);
  return String(v);
};
const Rs = (q: Question, k: string): Rational =>
  fromDecimalString(S(q, k).replace(/,/g, ''));

function roundToSig(n: number, sig: number): number {
  const d = Math.floor(Math.log10(Math.abs(n))) + 1;
  if (d <= sig) return n;
  const p = 10 ** (d - sig);
  return Math.round(n / p) * p;
}

// Independent oracles: computed from params with plain arithmetic, never by
// calling the template's helpers.
const ORACLES: Record<string, (q: Question) => Rational | Rational[]> = {
  'add-two': (q) => rat(N(q, 'a') + N(q, 'b')),
  'add-multi-term': (q) =>
    rat(
      Object.keys(q.params)
        .filter((k) => /^t\d+$/.test(k))
        .reduce((s, k) => s + N(q, k), 0),
    ),
  'add-compensation': (q) => rat(N(q, 'a') + N(q, 'b')),
  sub: (q) => rat(N(q, 'a') - N(q, 'b')),
  complement: (q) => rat(N(q, 'base') - N(q, 'n')),
  'mul-table-fact': (q) => rat(N(q, 'a') * N(q, 'b')),
  'mul-2x1': (q) => rat(N(q, 'a') * N(q, 'b')),
  'mul-2x2': (q) => rat(N(q, 'a') * N(q, 'b')),
  'mul-by-5-25': (q) => rat(N(q, 'm') * N(q, 'n')),
  'mul-doubling-halving': (q) => rat(N(q, 'a') * N(q, 'b')),
  'mul-3-digit-structured': (q) => rat(N(q, 's') * N(q, 'n')),
  'mul-multi-term': (q) => rat(N(q, 'f0') * N(q, 'f1') * N(q, 'f2')),
  'mul-near-base': (q) => rat(N(q, 'x') * N(q, 'y')),
  'mul-by-11': (q) => rat(N(q, 'n') * N(q, 'm')),
  'square-fact': (q) => rat(N(q, 'n') * N(q, 'n')),
  'square-general': (q) => rat(N(q, 'n') * N(q, 'n')),
  'square-ending-5': (q) => rat(N(q, 'n') * N(q, 'n')),
  'div-exact': (q) => rat(N(q, 'D') / N(q, 'd')),
  'div-decimal': (q) => rdiv(Rs(q, 'dividend'), Rs(q, 'divisor')),
  'div-estimate': (q) => rat(Math.round(N(q, 'D') / roundToSig(N(q, 'd'), 2))),
  'dec-mul': (q) => rmul(Rs(q, 'a'), Rs(q, 'b')),
  'dec-add-sub': (q) =>
    q.params.op === '+' ? radd(Rs(q, 'a'), Rs(q, 'b')) : rsub(Rs(q, 'a'), Rs(q, 'b')),
  'dec-place-value': (q) =>
    q.params.op === '×'
      ? rmul(Rs(q, 'n'), rat(N(q, 'pow')))
      : rdiv(Rs(q, 'n'), rat(N(q, 'pow'))),
  'frac-to-dec-pct': (q) =>
    q.params.ask === 'percent'
      ? rat(100 * N(q, 'n'), N(q, 'd'))
      : rat(N(q, 'n'), N(q, 'd')),
  'frac-of': (q) => rat((N(q, 'w') / N(q, 'd')) * N(q, 'n')),
  'frac-ops': (q) => {
    const f1 = rat(N(q, 'n1'), N(q, 'd1'));
    const f2 = rat(N(q, 'n2'), N(q, 'd2'));
    if (q.params.op === '+') return radd(f1, f2);
    if (q.params.op === '×') return rmul(f1, f2);
    return rsub(f1, f2);
  },
  'pct-anchor': (q) => rmul(rat(N(q, 'n')), rat(N(q, 'p'), 100)),
  'pct-of': (q) => rmul(rat(N(q, 'n')), rat(N(q, 'p'), 100)),
  'pct-reverse': (q) => rat(N(q, 'given') * 100, N(q, 'p')),
  'pct-discount': (q) => rmul(Rs(q, 'price'), rat(100 - N(q, 'p'), 100)),
  'pct-compound': (q) =>
    rat(N(q, 'base') * (100 + N(q, 'upPct')) * (100 - N(q, 'downPct')), 10000),
  'pct-change': (q) => rat((N(q, 'nw') - N(q, 'old')) * 100, N(q, 'old')),
  'ratio-split': (q) => {
    const parts = Object.keys(q.params)
      .filter((k) => /^r\d+$/.test(k))
      .sort()
      .map((k) => N(q, k));
    const sum = parts.reduce((x, y) => x + y, 0);
    return parts.map((p) => rat((N(q, 'total') / sum) * p));
  },
  proportion: (q) => rat(N(q, 'total1') * N(q, 'q2'), N(q, 'q1')),
  'unit-price': (q) => {
    const u1 = rdiv(Rs(q, 'total1'), rat(N(q, 'q1')));
    const u2 = rdiv(Rs(q, 'total2'), rat(N(q, 'q2')));
    return cmp(u1, u2) <= 0 ? u1 : u2;
  },
  'margin-markup': (q) => {
    const profit = N(q, 'price') - N(q, 'cost');
    const base = q.params.ask === 'margin' ? N(q, 'price') : N(q, 'cost');
    return rat(profit * 100, base);
  },
  'simple-interest': (q) =>
    rat(N(q, 'principal') * N(q, 'rate') * N(q, 'years'), 100),
  'tax-inclusive': (q) => rmul(Rs(q, 'gross'), rat(100, 100 + N(q, 'rate'))),
  'currency-convert': (q) =>
    q.params.from === 'AED'
      ? rmul(rat(N(q, 'amount')), Rs(q, 'rate'))
      : rdiv(rat(N(q, 'amount')), Rs(q, 'rate')),
  'double-halve': (q) =>
    q.params.op === 'double' ? rat(2 * N(q, 'n')) : rat(N(q, 'n'), 2),
  powers: (q) => rat(BigInt(N(q, 'base')) ** BigInt(N(q, 'exp'))),
  roots: (q) => {
    const n = N(q, 'n');
    if (q.band <= 2) return rat(Math.round(Math.sqrt(n)));
    const lo = Math.floor(Math.sqrt(n));
    const off = n - lo * lo;
    const gap = 2 * lo + 1;
    return rat(Math.round(((lo * gap + off) / gap) * 10), 10);
  },
  'estimate-product': (q) =>
    rat(roundToSig(N(q, 'a'), 1) * roundToSig(N(q, 'b'), 1)),
  signed: (q) => {
    const a = N(q, 'a');
    const b = N(q, 'b');
    if (q.params.op === '×') return rat(a * b);
    if (q.params.op === '+') return rat(a + b);
    return rat(a - b);
  },
  'mixed-chain': (q) => {
    let v = rat(N(q, 'start'));
    for (let i = 0; ; i++) {
      const op = q.params[`op${i}`];
      if (op === undefined) break;
      const k = q.params[`k${i}`];
      const os = String(op);
      if (os.endsWith('%')) v = rmul(v, rat(Number(os.slice(0, -1)), 100));
      else if (os === 'add') v = radd(v, rat(Number(k)));
      else if (os === 'subtract') v = rsub(v, rat(Number(k)));
      else if (os === 'multiply') v = rmul(v, rat(Number(k)));
      else if (os === 'halve') v = rdiv(v, rat(2));
      else if (os === 'double') v = rmul(v, rat(2));
      else if (os === 'square') v = rmul(v, v);
      else throw new Error(`unknown chain op ${os}`);
    }
    return v;
  },
};

function paramAppears(prompt: string, v: number | string): boolean {
  if (typeof v === 'string') return prompt.includes(v);
  const formatted = Number.isInteger(v) ? formatInt(v) : String(v);
  return prompt.includes(formatted) || prompt.includes(String(v));
}

function sameValue(expected: Rational, actual: Rational): boolean {
  if (isInteger(expected)) return eq(expected, actual);
  return Math.abs(toNumber(expected) - toNumber(actual)) <= 1e-9;
}

describe('generated questions', () => {
  it('covers every registered template with an oracle', () => {
    for (const t of TEMPLATES) {
      expect(ORACLES[t.id], `no oracle for ${t.id}`).toBeDefined();
    }
    for (const id of Object.keys(ORACLES)) {
      expect(
        TEMPLATES.some((t) => t.id === id),
        `oracle for unknown template ${id}`,
      ).toBe(true);
    }
  });

  for (const t of TEMPLATES) {
    for (const band of BANDS) {
      it(`${t.id} band ${band}: 500 seeded questions pass all checks`, () => {
        const oracle = ORACLES[t.id]!;
        const prompts = new Set<string>();
        for (let seed = 1; seed <= SEEDS; seed++) {
          const q = generate(t.id, seed, band);
          // (1) oracle matches the answer
          const expected = oracle(q);
          if (q.answer.kind === 'list') {
            const vals = q.answer.values;
            const exp = expected as Rational[];
            expect(exp.length, `${t.id}#${seed}: list length`).toBe(vals.length);
            exp.forEach((e, i) => {
              expect(
                sameValue(e, vals[i]!),
                `${t.id}#${seed}: share ${i}`,
              ).toBe(true);
            });
          } else {
            expect(
              sameValue(expected as Rational, q.answer.value),
              `${t.id}#${seed}: oracle ${JSON.stringify(q.params)} -> ${toNumber(expected as Rational)} vs ${toNumber(q.answer.value)}`,
            ).toBe(true);
          }
          // (2) last route step equals the answer value
          const last = q.route.at(-1);
          expect(last, `${t.id}#${seed}: empty route`).toBeDefined();
          const answerV =
            q.answer.kind === 'list' ? q.answer.values[0]! : q.answer.value;
          expect(
            eq(last!.value, answerV),
            `${t.id}#${seed}: last step ${toNumber(last!.value)} != answer ${toNumber(answerV)} (${q.prompt})`,
          ).toBe(true);
          // (3) each step's value appears in its text
          for (const s of q.route) {
            expect(
              valueAppearsInText(s.value, s.text),
              `${t.id}#${seed}: step value ${toNumber(s.value)} not in "${s.text}"`,
            ).toBe(true);
          }
          // (4) prompt non-empty and contains every numeric param
          expect(q.prompt.trim().length).toBeGreaterThan(0);
          for (const [k, v] of Object.entries(q.params)) {
            expect(
              paramAppears(q.prompt, v),
              `${t.id}#${seed}: param ${k}=${String(v)} not in "${q.prompt}"`,
            ).toBe(true);
          }
          // (7) canonical display round-trips through checkAnswer
          const shown = displayAnswer(q.answer);
          expect(
            checkAnswer(q.answer, shown).correct,
            `${t.id}#${seed}: display "${shown}" rejected (${q.prompt})`,
          ).toBe(true);
          prompts.add(q.prompt);
        }
        // (6) distinctness for bands 1-3 unless smallSpace
        if (!t.smallSpace && band >= 1) {
          expect(
            prompts.size / SEEDS,
            `${t.id} band ${band}: only ${prompts.size} unique prompts`,
          ).toBeGreaterThanOrEqual(0.6);
        }
      });
    }

    it(`${t.id}: generation is deterministic`, () => {
      for (const band of BANDS) {
        const a = generate(t.id, 7, band);
        const b = generate(t.id, 7, band);
        expect(b).toEqual(a);
      }
    });
  }
});
