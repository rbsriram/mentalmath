// Per-skill speed targets for promotion. `speedTargetMs(skillId, band)` is
// the median time a correct answer must hit for the working band to rise.
// Band multiplier: 1, 1, 1.5, 2 for bands 0-3.

import type { Band } from '../engine/types';

const FACT_SKILLS = new Set([
  'tables-1-10',
  'tables-11-15',
  'complements-10',
  'complements-100',
  'complements-1000',
  'squares-1-25',
  'squares-26-50',
  'fraction-equivalents',
  'percent-anchors',
  'doubles-halves',
]);

const MID_MUL = new Set([
  'mul-2x2',
  'mul-near-base',
  'square-general',
  'square-ending-5',
  'mul-by-11',
  'mul-by-5-25',
  'mul-doubling-halving',
  'mul-distributive',
]);

const LONG_APP = new Set([
  'pct-reverse',
  'pct-compound',
  'ratio-split',
  'proportion',
  'unit-price',
  'margin-markup',
  'simple-interest',
  'tax-inclusive',
  'currency-convert',
]);

const EST = new Set([
  'estimation',
  'div-estimate',
  'powers',
  'roots',
  'signed-numbers',
]);

const PCT_15 = new Set(['pct-of', 'pct-build', 'pct-discount', 'pct-change']);

const BAND_MULT = [1, 1, 1.5, 2] as const;

function baseSeconds(skillId: string): number {
  if (FACT_SKILLS.has(skillId)) return 3;
  if (skillId === 'add-multi-term') return 20;
  if (skillId.startsWith('add-') || skillId.startsWith('sub-')) return 8;
  if (MID_MUL.has(skillId)) return 15;
  if (skillId === 'mul-3-digit-structured' || skillId === 'mul-multi-term') {
    return 25;
  }
  if (LONG_APP.has(skillId)) return 30;
  if (skillId === 'mixed-chain') return 40;
  if (EST.has(skillId)) return 12;
  if (PCT_15.has(skillId)) return 15;
  if (
    skillId.startsWith('div-') ||
    skillId.startsWith('dec-') ||
    skillId.startsWith('frac-')
  ) {
    return 15;
  }
  return 20;
}

export function speedTargetMs(skillId: string, band: Band): number {
  return Math.round(baseSeconds(skillId) * BAND_MULT[band] * 1000);
}
