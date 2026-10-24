// Template registry: every template by id, skill lookup, and the seeded
// generate() entry point used by the app and the tests.

import { createRng } from '../math/rng';
import type { Band, Question, Template } from './types';
import { ADDITION_TEMPLATES } from './templates/addition';
import { SUBTRACTION_TEMPLATES } from './templates/subtraction';
import { MULTIPLICATION_TEMPLATES } from './templates/multiplication';
import { SQUARE_TEMPLATES } from './templates/squares';
import { DIVISION_TEMPLATES } from './templates/division';
import { DECIMAL_TEMPLATES } from './templates/decimals';
import { FRACTION_TEMPLATES } from './templates/fractions';
import { PERCENT_TEMPLATES } from './templates/percent';
import { APPLICATION_TEMPLATES } from './templates/applications';
import { MISC_TEMPLATES } from './templates/misc';

export const TEMPLATES: Template[] = [
  ...ADDITION_TEMPLATES,
  ...SUBTRACTION_TEMPLATES,
  ...MULTIPLICATION_TEMPLATES,
  ...SQUARE_TEMPLATES,
  ...DIVISION_TEMPLATES,
  ...DECIMAL_TEMPLATES,
  ...FRACTION_TEMPLATES,
  ...PERCENT_TEMPLATES,
  ...APPLICATION_TEMPLATES,
  ...MISC_TEMPLATES,
];

const BY_ID = new Map<string, Template>(TEMPLATES.map((t) => [t.id, t]));

export function getTemplate(id: string): Template | undefined {
  return BY_ID.get(id);
}

export function bySkill(skill: string): Template[] {
  return TEMPLATES.filter((t) => t.skill === skill || (t.skills ?? []).includes(skill));
}

// Generate a question: one seed, one band, deterministic output.
export function generate(templateId: string, seed: number, band: Band): Question {
  const t = BY_ID.get(templateId);
  if (!t) throw new Error(`registry: unknown template "${templateId}"`);
  const q = t.generate(createRng(seed), band);
  return { ...q, templateId, seed, band, skill: t.skill, skills: t.skills ?? [] };
}

// Fact family -> template that produces it.
const FACT_TEMPLATES: Record<string, string> = {
  tables: 'mul-table-fact',
  squares: 'square-fact',
  'complements-10': 'complement',
  'complements-100': 'complement',
  'complements-1000': 'complement',
  'fraction-equivalents': 'frac-to-dec-pct',
  'percent-anchors': 'pct-anchor',
};

export function factTemplateFor(family: string): string {
  const id = FACT_TEMPLATES[family];
  if (!id) throw new Error(`registry: unknown fact family "${family}"`);
  return id;
}

// Generate the question for one exact fact; the band is the fact's own.
export function generateFact(
  templateId: string,
  factId: string,
  seed: number,
): Question {
  const t = BY_ID.get(templateId);
  if (!t?.forFact || !t.factBand) {
    throw new Error(`registry: "${templateId}" is not a fact template`);
  }
  const q = t.forFact(factId, createRng(seed));
  return {
    ...q,
    templateId,
    seed,
    band: t.factBand(factId),
    skill: t.skill,
    skills: t.skills ?? [],
  };
}
