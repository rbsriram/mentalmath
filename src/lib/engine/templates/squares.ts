// Square templates.
// Operand ranges:
//   square-fact:      n 1-25, all bands (recall set).
//   square-general:   b0: 26-50; b1: 41-75; b2: 26-99; b3: 101-299.
//   square-ending-5:  b0-1: 15-95 step 10; b2: 15-195 step 10;
//                     b3: 15-295 step 10.

import { rat } from '../../math/rational';
import { squareFactId } from '../../content/facts';
import type { Rng } from '../../math/rng';
import type { Band, Question, Step, Template } from '../types';
import { fi, R, step } from './common';

type Gen = Omit<Question, 'templateId' | 'seed' | 'band' | 'skill' | 'skills'>;

function ending5Route(n: number): Step[] {
  const t = Math.floor(n / 10); // the part before the 5
  const tt = t * (t + 1);
  const sq = n * n;
  return [
    step(`The part before the 5 is ${fi(t)}`, R(t)),
    step(`${fi(t)} × ${fi(t + 1)} = ${fi(tt)}`, R(tt)),
    step(`Append 25: ${fi(n)}² = ${fi(sq)}`, R(sq)),
  ];
}

// n^2 = (n + k)(n - k) + k^2 with m = n + k or n - k a round ten.
function generalSquareRoute(n: number): Step[] {
  const rem = n % 10;
  if (rem === 5) return ending5Route(n);
  if (rem === 0) {
    const t = n / 10;
    const sq = n * n;
    return [
      step(`${fi(n)} = 10 × ${fi(t)}`, R(n)),
      step(`${fi(t)} × ${fi(t)} = ${fi(t * t)}`, R(t * t)),
      step(`${fi(t * t)} × 100 = ${fi(sq)}`, R(sq)),
    ];
  }
  // d is the distance to the nearer ten m; n² = (n + d)(n − d) + d².
  const d = rem <= 5 ? rem : 10 - rem;
  const m = rem <= 5 ? n - rem : n + (10 - rem);
  const lo = n - d;
  const hi = n + d;
  const pair = lo * hi;
  const k2 = d * d;
  const sq = n * n;
  return [
    step(`${fi(n)} is ${fi(d)} away from the round ${fi(m)}`, R(d)),
    step(`${fi(n)} + ${fi(d)} = ${fi(hi)}`, R(hi)),
    step(`${fi(n)} − ${fi(d)} = ${fi(lo)}`, R(lo)),
    step(`${fi(lo)} × ${fi(hi)} = ${fi(pair)}`, R(pair)),
    step(`${fi(d)}² = ${fi(k2)}`, R(k2)),
    step(`${fi(pair)} + ${fi(k2)} = ${fi(sq)}`, R(sq)),
  ];
}

function squareFactQuestion(n: number): Gen {
  const sq = n * n;
  const route =
    n % 10 === 5 && n >= 15
      ? ending5Route(n)
      : [step(`${fi(n)}² = ${fi(sq)}`, R(sq))];
  return {
    prompt: `${fi(n)}²`,
    answer: { kind: 'exact', value: rat(sq), unit: 'number' },
    params: { n },
    structure: 'recall square 1-25',
    strategies: n % 10 === 5 && n >= 15 ? ['square-ending-5'] : [],
    route,
    inputMode: 'decimal',
    factId: squareFactId(n),
  };
}

export const squareFact: Template = {
  id: 'square-fact',
  skill: 'squares-1-25',
  smallSpace: true,
  generate(rng: Rng, _band): Gen {
    return squareFactQuestion(rng.int(1, 25));
  },
  forFact(factId: string, _rng: Rng): Gen {
    const m = /^sq:(\d+)$/.exec(factId);
    if (!m) throw new Error(`square-fact: bad fact id "${factId}"`);
    return squareFactQuestion(Number(m[1]));
  },
  factBand(factId: string): Band {
    const n = Number(factId.slice(3));
    return n <= 12 ? 0 : n <= 18 ? 1 : n <= 25 ? 2 : 3;
  },
};

export const squareGeneral: Template = {
  id: 'square-general',
  skill: 'square-general',
  smallSpace: true,
  skills: ['squares-26-50'],
  generate(rng: Rng, band): Gen {
    const n =
      band === 0
        ? rng.int(26, 50)
        : band === 1
          ? rng.int(41, 75)
          : band === 2
            ? rng.int(26, 99)
            : rng.int(101, 299);
    const sq = n * n;
    return {
      prompt: `${fi(n)}²`,
      answer: { kind: 'exact', value: rat(sq), unit: 'number' },
      params: { n },
      structure: 'square via (n + k)(n − k) + k²',
      strategies: n % 10 === 5 ? ['square-ending-5', 'square-general'] : ['square-general'],
      route: generalSquareRoute(n),
      inputMode: 'decimal',
    };
  },
};

export const squareEnding5: Template = {
  id: 'square-ending-5',
  skill: 'square-ending-5',
  smallSpace: true,
  generate(rng: Rng, band): Gen {
    const maxTens = band <= 1 ? 9 : band === 2 ? 19 : 29;
    const n = rng.int(1, maxTens) * 10 + 5; // 15..95, ..195, ..295
    const sq = n * n;
    return {
      prompt: `${fi(n)}²`,
      answer: { kind: 'exact', value: rat(sq), unit: 'number' },
      params: { n },
      structure: 'square of a number ending in 5',
      strategies: ['square-ending-5'],
      route: ending5Route(n),
      inputMode: 'decimal',
    };
  },
};

export const SQUARE_TEMPLATES: Template[] = [squareFact, squareGeneral, squareEnding5];
