// Application templates (contextual arithmetic).
// Operand ranges:
//   ratio-split:      b0: 2 parts 1-9, unit 2-50; b1: 3 parts 1-9, unit 5-200;
//                     b2: 3 parts 1-12, unit 10-500; b3: 3-4 parts, unit 50-2,000.
//                     Total = part sum x unit, so shares are always exact.
//   proportion:       q1 units at total1, ask total for q2: unit rate is exact.
//                     b0: u 2-20, q1 2-9, q2 2-12; b1: u 2-60, q up to 15;
//                     b2-3: u up to 250, q up to 40.
//   unit-price:       two packs, clean unit prices 0.20-25.00, quantities 2-24.
//   margin-markup:    cost/price pairs giving exact integer percents.
//   simple-interest:  P 500-50,000 step 100, r 2-12%, t 2-8 years.
//   tax-inclusive:    rate 5% or 10%; net chosen so the gross is clean cents.
//   currency-convert: round fictional rates {0.5,0.75,1.25,1.5,2,2.5,3.5,4,5}.

import { div as rdiv, mul as rmul, rat, type Rational } from '../../math/rational';
import { formatNumber } from '../../math/format';
import type { Rng } from '../../math/rng';
import type { Question, Step, Template } from '../types';
import { fi, fmoney, R, step } from './common';

type Gen = Omit<Question, 'templateId' | 'seed' | 'band'>;

export const ratioSplit: Template = {
  id: 'ratio-split',
  skill: 'ratio-split',
  generate(rng: Rng, band): Gen {
    const count = band === 0 ? 2 : band === 3 ? rng.pick([3, 4]) : 3;
    const partHi = band <= 1 ? 9 : 12;
    const unitLo = band === 0 ? 2 : band === 1 ? 5 : band === 2 ? 10 : 50;
    const unitHi = band === 0 ? 50 : band === 1 ? 200 : band === 2 ? 500 : 2000;
    let parts: number[] = Array.from({ length: count }, () => rng.int(1, partHi));
    // Avoid a trivial all-equal ratio.
    for (let t = 0; t < 20 && parts.every((p) => p === parts[0]); t++) {
      parts = Array.from({ length: count }, () => rng.int(1, partHi));
    }
    const sum = parts.reduce((x, y) => x + y, 0);
    const unit = rng.int(unitLo, unitHi);
    const total = sum * unit;
    const shares = parts.map((p) => p * unit);
    const route: Step[] = [
      step(`${parts.join(' + ')} = ${sum} parts`, R(sum)),
      step(`${fi(total)} ÷ ${sum} = ${fi(unit)} per part`, R(unit)),
    ];
    for (let i = 1; i < parts.length; i++) {
      route.push(step(`${parts[i]} × ${fi(unit)} = ${fi(shares[i]!)}`, R(shares[i]!)));
    }
    route.push(
      step(
        `First share: ${parts[0]} × ${fi(unit)} = ${fi(shares[0]!)}. The split is ${shares.map(fi).join(', ')}`,
        R(shares[0]!),
      ),
    );
    const params: Record<string, number> = { total };
    parts.forEach((p, i) => {
      params[`r${i}`] = p;
    });
    return {
      prompt: `Split ${fi(total)} in the ratio ${parts.join(':')}. Answer with ${count} numbers separated by spaces`,
      answer: { kind: 'list', values: shares.map((s) => rat(s)), unit: 'number' },
      params,
      structure: `ratio split into ${count} parts`,
      strategies: ['ratio-split'],
      route,
      inputMode: 'text',
    };
  },
};

const PROPORTION_ITEMS = [
  'tickets',
  'kilograms of rice',
  'litres of fuel',
  'notebooks',
];

export const proportion: Template = {
  id: 'proportion',
  skill: 'proportion',
  smallSpace: true,
  generate(rng: Rng, band): Gen {
    const uHi = band === 0 ? 20 : band === 1 ? 60 : 250;
    const qHi = band === 0 ? 9 : band === 1 ? 15 : 40;
    const u = rng.int(2, uHi);
    const q1 = rng.int(2, 9);
    const q2 = rng.int(2, qHi);
    const total1 = u * q1;
    const total2 = u * q2;
    const item = rng.pick(PROPORTION_ITEMS);
    const route: Step[] = [
      step(`${fi(total1)} ÷ ${q1} = ${fi(u)} per unit`, R(u)),
      step(`${fi(u)} × ${q2} = ${fi(total2)}`, R(total2)),
    ];
    return {
      prompt: `${q1} ${item} cost ${fi(total1)}. What do ${q2} ${item} cost?`,
      answer: { kind: 'exact', value: rat(total2), unit: 'number' },
      params: { q1, total1, q2 },
      structure: 'proportion through a unit rate',
      strategies: ['proportion-scaling', 'unit-price'],
      route,
      inputMode: 'decimal',
    };
  },
};

export const unitPrice: Template = {
  id: 'unit-price',
  skill: 'unit-price',
  smallSpace: true,
  generate(rng: Rng, band): Gen {
    const uHi = band === 0 ? 500 : band === 1 ? 1500 : 2500; // cents
    const qHi = band === 0 ? 8 : band === 1 ? 16 : 24;
    let uc1 = 0;
    let uc2 = 0;
    let q1 = 0;
    let q2 = 0;
    for (let t = 0; t < 500; t++) {
      uc1 = rng.int(20, uHi);
      uc2 = rng.int(20, uHi);
      q1 = rng.int(2, qHi);
      q2 = rng.int(2, qHi);
      if (uc1 !== uc2) break; // a tie has no cheaper pack
    }
    const t1 = uc1 * q1;
    const t2 = uc2 * q2;
    const cheaperIsA = uc1 < uc2;
    const cheaperCents = Math.min(uc1, uc2);
    const cheaper = rat(cheaperCents, 100);
    const route: Step[] = [
      step(`Pack A: ${fmoney(rat(t1, 100))} ÷ ${q1} = ${fmoney(rat(uc1, 100))} per unit`, rat(uc1, 100)),
      step(`Pack B: ${fmoney(rat(t2, 100))} ÷ ${q2} = ${fmoney(rat(uc2, 100))} per unit`, rat(uc2, 100)),
      step(
        `Pack ${cheaperIsA ? 'A' : 'B'} is cheaper: ${fmoney(cheaper)} per unit`,
        cheaper,
      ),
    ];
    return {
      prompt: `Pack A: ${q1} units for ${fmoney(rat(t1, 100))}. Pack B: ${q2} units for ${fmoney(rat(t2, 100))}. Give the unit price of the cheaper pack`,
      context: 'Two packs of the same product.',
      answer: { kind: 'exact', value: cheaper, unit: 'currency', currency: 'AED' },
      params: { q1, total1: formatNumber(rat(t1, 100)), q2, total2: formatNumber(rat(t2, 100)) },
      structure: 'unit price comparison of two packs',
      strategies: ['unit-price'],
      route,
      inputMode: 'decimal',
    };
  },
};

const MARGIN_SET = [10, 20, 25, 40, 50];
const MARKUP_SET = [10, 20, 25, 50, 75, 100];

export const marginMarkup: Template = {
  id: 'margin-markup',
  skill: 'margin-markup',
  smallSpace: true,
  generate(rng: Rng, band): Gen {
    const askMargin = rng.chance(0.5);
    let cost = 60;
    let price = 80;
    let pct = 25;
    if (askMargin) {
      // margin m: cost = price x (100 - m)/100 must be a whole number.
      for (let t = 0; t < 500; t++) {
        pct = rng.pick(MARGIN_SET);
        const pHi = band === 0 ? 200 : band === 1 ? 1000 : 5000;
        price = rng.int(2, pHi) * (100 / gcd100(100 - pct));
        cost = (price * (100 - pct)) / 100;
        if (Number.isInteger(cost) && cost > 0 && cost !== price) break;
      }
    } else {
      for (let t = 0; t < 500; t++) {
        pct = rng.pick(MARKUP_SET);
        const cHi = band === 0 ? 200 : band === 1 ? 1000 : 5000;
        cost = rng.int(2, cHi) * (100 / gcd100(pct));
        price = (cost * (100 + pct)) / 100;
        if (Number.isInteger(price) && price !== cost) break;
      }
    }
    const profit = price - cost;
    const base = askMargin ? price : cost;
    const frac = rat(profit, base);
    const pctVal = rmul(frac, R(100));
    const route: Step[] = [
      step(`Profit: ${fi(price)} − ${fi(cost)} = ${fi(profit)}`, R(profit)),
      step(
        `${askMargin ? 'Margin divides by the price' : 'Markup divides by the cost'}: ${fi(profit)} ÷ ${fi(base)} = ${formatNumber(frac)}`,
        frac,
      ),
      step(`${formatNumber(frac)} × 100 = ${formatNumber(pctVal)}%`, pctVal),
    ];
    return {
      prompt: `Cost ${fi(cost)}, price ${fi(price)}. What is the ${askMargin ? 'margin' : 'markup'} percent?`,
      context: 'Margin is profit over price; markup is profit over cost.',
      answer: { kind: 'exact', value: pctVal, unit: 'percent' },
      params: { cost, price, ask: askMargin ? 'margin' : 'markup' },
      structure: `${askMargin ? 'margin' : 'markup'} percent`,
      strategies: ['margin-vs-markup'],
      route,
      inputMode: 'decimal',
    };
  },
};

function gcd100(x: number): number {
  let a = 100;
  let b = x;
  while (b !== 0) {
    const t = a % b;
    a = b;
    b = t;
  }
  return a;
}

export const simpleInterest: Template = {
  id: 'simple-interest',
  skill: 'simple-interest',
  smallSpace: true,
  generate(rng: Rng, band): Gen {
    const pHi = band === 0 ? 5000 : band === 1 ? 20000 : 50000;
    const principal = 100 * rng.int(5, Math.floor(pHi / 100));
    const rate = rng.int(2, band === 0 ? 8 : 12);
    const years = rng.int(2, band === 0 ? 5 : 8);
    const perYear = (principal * rate) / 100;
    const interest = perYear * years;
    const route: Step[] = [
      step(`${rate}% of ${fi(principal)} = ${fi(perYear)} per year`, R(perYear)),
      step(`${fi(perYear)} × ${years} = ${fi(interest)}`, R(interest)),
    ];
    return {
      prompt: `Simple interest: ${fmoney(rat(principal))} at ${rate}% per year for ${years} years. How much interest?`,
      context: 'Simple interest adds the same amount each year.',
      answer: { kind: 'exact', value: rat(interest), unit: 'currency', currency: 'AED' },
      params: { principal, rate, years },
      structure: 'simple interest P x r% x t',
      strategies: ['simple-interest', 'pct-build'],
      route,
      inputMode: 'decimal',
    };
  },
};

export const taxInclusive: Template = {
  id: 'tax-inclusive',
  skill: 'tax-inclusive',
  skills: ['pct-reverse'],
  smallSpace: true,
  generate(rng: Rng, band): Gen {
    const rate = rng.pick([5, 10]);
    const nHi = band === 0 ? 500 : band === 1 ? 3000 : 20000;
    const net = rng.int(2, nHi);
    // gross = net x (100 + rate)/100 always lands on whole cents for 5 or 10.
    const grossR = rat(net * (100 + rate), 100);
    const perPct = rdiv(grossR, R(100 + rate));
    const route: Step[] = [
      step(`The gross is ${100 + rate}% of the net`, R(100 + rate)),
      step(
        `${formatNumber(grossR)} ÷ ${100 + rate} = ${formatNumber(perPct)} per percent`,
        perPct,
      ),
      step(`${formatNumber(perPct)} × 100 = ${formatNumber(rat(net))}`, rat(net)),
    ];
    return {
      prompt: `A bill of ${fmoney(grossR)} includes ${rate}% tax. What was the amount before tax?`,
      context: 'The tax is part of the shown total.',
      answer: { kind: 'exact', value: rat(net), unit: 'currency', currency: 'AED' },
      params: { gross: fmoney(grossR).slice(4), rate },
      structure: `remove ${rate}% tax from the gross`,
      strategies: ['tax-inclusive', 'pct-reverse'],
      route,
      inputMode: 'decimal',
    };
  },
};

const RATES = [0.5, 0.75, 1.25, 1.5, 2, 2.5, 3.5, 4, 5];

export const currencyConvert: Template = {
  id: 'currency-convert',
  skill: 'currency-convert',
  smallSpace: true,
  generate(rng: Rng, band): Gen {
    const rate = rng.pick(RATES);
    const aHi = band === 0 ? 200 : band === 1 ? 2000 : 20000;
    // Amount is a multiple of 4, so every rate in RATES gives whole credits.
    const amount = rng.int(2, aHi) * 4;
    const toCredits = rng.chance(0.5);
    const credits = amount * rate; // always an integer here
    let answer: Rational;
    let prompt: string;
    let route: Step[];
    let shownAmount: number;
    if (toCredits) {
      answer = rat(credits);
      shownAmount = amount;
      prompt = `Convert AED ${fi(amount)} to credits at ${rate} credits per AED`;
      route = [step(`${fi(amount)} × ${rate} = ${fi(credits)}`, answer)];
    } else {
      answer = rat(amount);
      shownAmount = credits;
      prompt = `Convert ${fi(credits)} credits to AED at ${rate} credits per AED`;
      route = [step(`${fi(credits)} ÷ ${rate} = ${fi(amount)}`, answer)];
    }
    return {
      prompt,
      context: 'The rate is a fictional round number.',
      answer: { kind: 'exact', value: answer, unit: 'number' },
      params: { amount: shownAmount, rate, from: toCredits ? 'AED' : 'credits' },
      structure: `currency conversion at rate ${rate}`,
      strategies: ['currency-rate', 'mul-distributive-split'],
      route,
      inputMode: 'decimal',
    };
  },
};

export const APPLICATION_TEMPLATES: Template[] = [
  ratioSplit,
  proportion,
  unitPrice,
  marginMarkup,
  simpleInterest,
  taxInclusive,
  currencyConvert,
];
