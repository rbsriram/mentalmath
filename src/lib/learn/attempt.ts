// One logged answer. The append-only attempt log is the audit trail for
// benchmarks, retention metrics, and export.

import type { Band } from '../engine/types';
// Old session phase names stay in the union so stored logs still
// type-check; new attempts use 'round', 'diagnostic', or 'benchmark'.
export type AttemptPhase =
  | 'recall'
  | 'learn'
  | 'practice'
  | 'timed'
  | 'review'
  | 'round'
  | 'diagnostic'
  | 'benchmark'
  | 'custom';

export interface Attempt {
  ts: number; // ms epoch
  templateId: string;
  seed: number;
  band: Band;
  skill: string; // primary skill of the template
  factId?: string | undefined;
  correct: boolean;
  ms: number; // response time
  given: string; // what the user typed
  prompt: string;
  answer: string; // canonical display string
  phase: AttemptPhase;
  transfer?: boolean | undefined;
  sessionId?: string | undefined;
}
