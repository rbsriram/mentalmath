import type { Rational } from '../math/rational';
import type { Rng } from '../math/rng';

export type Band = 0 | 1 | 2 | 3; // 0 foundation, 1 easy, 2 benchmark level, 3 beyond
export type Unit = 'number' | 'percent' | 'currency';

export type Answer =
  | { kind: 'exact'; value: Rational; unit: Unit; currency?: string }
  | { kind: 'approx'; value: Rational; tolerance: Rational; unit: Unit }
  | { kind: 'list'; values: Rational[]; unit: Unit };

// Worked route step. `value` must appear formatted somewhere in `text`.
export interface Step {
  text: string;
  value: Rational;
}

export interface Question {
  templateId: string;
  seed: number;
  band: Band;
  // Copied from the template by the registry so the question carries its own
  // provenance for the learning model and the attempt log.
  skill: string;
  skills: string[];
  prompt: string;
  context?: string;
  answer: Answer;
  params: Record<string, number | string>;
  structure: string;
  strategies: string[];
  route: Step[];
  inputMode: 'decimal' | 'text';
  // Set on fact-family questions (tables, squares, complements, fraction
  // equivalents, percent anchors) so the learning model can track the fact.
  factId?: string | undefined;
}

export interface Template {
  id: string;
  skill: string;
  skills?: string[];
  smallSpace?: boolean;
  generate(rng: Rng, band: Band): Omit<Question, 'templateId' | 'seed' | 'band' | 'skill' | 'skills'>;
  // Fact-family templates only: produce the question for one exact fact.
  forFact?(factId: string, rng: Rng): Omit<Question, 'templateId' | 'seed' | 'band' | 'skill' | 'skills'>;
  // Fact-family templates only: the band this fact belongs to.
  factBand?(factId: string): Band;
}
