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

type Gen = Omit<Question, 'templateId' | 'seed' | 'band' | 'skill' | 'skills'>;

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
    // Bands 0-1: unit prices are whole or .50 amounts (50-cent steps).
    const cStep = band <= 1 ? 50 : 1;
    const cLo = band <= 1 ? 100 : 20;
    let uc1 = 0;
    let uc2 = 0;
    let q1 = 0;
    let q2 = 0;
    // Resample until the two unit prices differ but sit within 25%.
    for (let t = 0; t < 500; t++) {
      uc1 = cStep * rng.int(Math.ceil(cLo / cStep), Math.floor(uHi / cStep));
      uc2 = cStep * rng.int(Math.ceil(cLo / cStep), Math.floor(uHi / cStep));
      q1 = rng.int(2, qHi);
      q2 = rng.int(2, qHi);
      const lo = Math.min(uc1, uc2);
      const hi = Math.max(uc1, uc2);
      if (uc1 !== uc2 && lo * 4 >= hi * 3) break;
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
      answer: { kind: 'exact', value: cheaper, unit: 'currency', currency: 'AED' },
      params: { q1, total1: formatNumber(rat(t1, 100)), q2, total2: formatNumber(rat(t2, 100)) },
      structure: 'unit price comparison of two packs',
      strategies: ['unit-price'],
      route,
      inputMode: 'decimal',
    };
  },
};

const MARGIN_PCTS = [5, 10, 12.5, 20, 25, 30, 40, 50];

// Denominator of p/100 in lowest terms (12.5 -> 8, 30 -> 10).
function pctDenom(p: number): number {
  const num = Math.round(p * 10); // tenths of a percent
  const den = 1000;
  let a = num;
  let b = den;
  while (b !== 0) {
    const t = a % b;
    a = b;
    b = t;
  }
  return den / a;
}

export const marginMarkup: Template = {
  id: 'margin-markup',
  skill: 'margin-markup',
  smallSpace: true,
  generate(rng: Rng, band): Gen {
    const askMargin = rng.chance(0.5);
    const cap = band <= 1 ? 200 : band === 2 ? 1000 : 10000;
    let cost = 0;
    let price = 0;
    let pct = 0;
    // Build from the asked percent so the answer is exact: profit = pct/100
    // of the relevant base, so the base must be a multiple of pct's
    // denominator.
    for (let t = 0; t < 500; t++) {
      pct = rng.pick(MARGIN_PCTS);
      const den = pctDenom(pct);
      const kLo = Math.ceil(20 / den);
      const kHi = Math.floor(cap / den);
      const base = den * rng.int(kLo, kHi);
      const profit = (pct * base) / 100;
      if (!Number.isInteger(profit)) continue;
      if (askMargin) {
        price = base;
        cost = price - profit;
      } else {
        cost = base;
        price = cost + profit;
      }
      if (cost > 0 && cost !== price) break;
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
      prompt: `Cost ${fi(cost)}, price ${fi(price)}. What is the ${askMargin ? 'margin percent (profit over price)' : 'markup percent (profit over cost)'}?`,
      answer: { kind: 'exact', value: pctVal, unit: 'percent' },
      params: { cost, price, ask: askMargin ? 'margin' : 'markup' },
      structure: `${askMargin ? 'margin' : 'markup'} percent`,
      strategies: ['margin-vs-markup'],
      route,
      inputMode: 'decimal',
    };
  },
};

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
