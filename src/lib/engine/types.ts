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
  prompt: string;
  context?: string;
  answer: Answer;
  params: Record<string, number | string>;
  structure: string;
  strategies: string[];
  route: Step[];
  inputMode: 'decimal' | 'text';
}

export interface Template {
  id: string;
  skill: string;
  skills?: string[];
  smallSpace?: boolean;
  generate(rng: Rng, band: Band): Omit<Question, 'templateId' | 'seed' | 'band'>;
}
