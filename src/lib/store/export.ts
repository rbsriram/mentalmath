// Export/import of the full local dataset: the state document plus the
// attempt log. `importData` validates the envelope and every attempt, then
// runs the state's migrations.

import type { Attempt } from '../learn/attempt';
import { localDay } from '../learn/model';
import { migrate, type State } from '../learn/state';

export interface ExportDoc {
  format: 'mentalmath-export';
  version: number;
  exportedAt: number;
  state: State;
  attempts: Attempt[];
}

export function exportData(state: State, attempts: Attempt[]): ExportDoc {
  return {
    format: 'mentalmath-export',
    version: state.version,
    exportedAt: Date.now(),
    state,
    attempts,
  };
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function validAttempt(a: unknown): a is Attempt {
  if (!isRecord(a)) return false;
  return (
    typeof a.ts === 'number' &&
    typeof a.templateId === 'string' &&
    typeof a.seed === 'number' &&
    typeof a.band === 'number' &&
    a.band >= 0 &&
    a.band <= 3 &&
    typeof a.skill === 'string' &&
    typeof a.correct === 'boolean' &&
    typeof a.ms === 'number' &&
    typeof a.given === 'string' &&
    typeof a.prompt === 'string' &&
    typeof a.answer === 'string' &&
    typeof a.phase === 'string'
  );
}

export function importData(json: unknown): { state: State; attempts: Attempt[] } {
  if (!isRecord(json) || json.format !== 'mentalmath-export') {
    throw new Error('unsupported export');
  }
  const attempts = json.attempts;
  if (!Array.isArray(attempts) || !attempts.every(validAttempt)) {
    throw new Error('unsupported export');
  }
  const state = migrate(json.state);
  return { state, attempts };
}

export function exportFilename(now: number): string {
  return `mentalmath-${localDay(now)}.json`;
}
