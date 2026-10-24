// The flat persisted state document and the shared outcome-application
// path used by sessions, the diagnostic, and benchmarks.
//
// Everything here is pure: functions return new State objects with
// structural sharing. Nothing reads storage; the store layer persists
// `State` plus an append-only Attempt log.

import { checkAnswer, type CheckResult } from '../engine/answer';
import type { Question } from '../engine/types';
import { familySkillForFact } from '../content/facts';
import { displayAnswer } from '../math/format';
import { applyOutcome, newRec, type Rec } from './model';
import { speedTargetMs } from './targets';
import type { Attempt, AttemptPhase } from './attempt';
import type { Session } from './session';
import type { DiagnosticState } from './diagnostic';
import type { BenchmarkReport, BenchmarkState } from './benchmark';

export interface SessionSummary {
  id: string;
  date: string; // local 'YYYY-MM-DD'
  minutes: number;
  answered: number;
  correct: number;
  target: string | null;
  newMethod: string | null;
}

export interface State {
  version: 2;
  createdAt: number;
  skills: Record<string, Rec>;
  facts: Record<string, Rec>;
  target: string | null;
  session: Session | null;
  diagnostic: DiagnosticState | null;
  benchmark: BenchmarkState | null;
  sessions: SessionSummary[]; // newest last, cap 400
  diagnosticDone: boolean;
  baseline: BenchmarkReport | null;
  benchmarks: BenchmarkReport[];
  settings: { theme: 'system' | 'light' | 'dark' };
}

export function newState(now: number): State {
  return {
    version: 2,
    createdAt: now,
    skills: {},
    facts: {},
    target: null,
    session: null,
    diagnostic: null,
    benchmark: null,
    sessions: [],
    diagnosticDone: false,
    baseline: null,
    benchmarks: [],
    settings: { theme: 'light' },
  };
}

// Migrations from version N to N+1.
// v1 -> v2: the illustrated light theme is the default. A v1 'system'
// theme becomes 'light'; anything else passes through.
export const MIGRATIONS: Record<number, (s: unknown) => unknown> = {
  1: (doc) => {
    const d = doc as Record<string, unknown>;
    const settings = { ...((d.settings ?? {}) as Record<string, unknown>) };
    if (settings.theme === 'system') settings.theme = 'light';
    return { ...d, settings, version: 2 };
  },
};

const LATEST_VERSION = 2;

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

// Validates a raw persisted document and migrates it to the latest version.
// Throws Error('unsupported export') on anything that is not a state doc.
export function migrate(raw: unknown): State {
  if (!isPlainObject(raw)) throw new Error('unsupported export');
  const version = raw.version;
  if (
    typeof version !== 'number' ||
    !Number.isInteger(version) ||
    version < 1 ||
    version > LATEST_VERSION
  ) {
    throw new Error('unsupported export');
  }
  let doc: unknown = raw;
  let v = version;
  while (v < LATEST_VERSION) {
    const step = MIGRATIONS[v];
    if (!step) throw new Error('unsupported export');
    doc = step(doc);
    v += 1;
  }
  const d = doc as Record<string, unknown>;
  if (
    typeof d.createdAt !== 'number' ||
    !isPlainObject(d.skills) ||
    !isPlainObject(d.facts) ||
    !Array.isArray(d.sessions) ||
    !Array.isArray(d.benchmarks) ||
    typeof d.diagnosticDone !== 'boolean' ||
    !isPlainObject(d.settings)
  ) {
    throw new Error('unsupported export');
  }
  return doc as State;
}

// Returns the record for an id, creating it lazily inside `state` when it
// does not exist yet. Callers that need purity should clone the map first;
// this is the write-path helper (recordOutcome already does that itself).
export function recFor(state: State, kind: 'skills' | 'facts', id: string): Rec {
  const map = state[kind];
  const existing = map[id];
  if (existing) return existing;
  const rec = newRec();
  map[id] = rec;
  return rec;
}

export interface OutcomeOpts {
  transfer?: boolean;
  sessionId?: string;
}

// Checks the raw answer, updates the primary skill record, every secondary
// skill record, and the fact record when the question carries a factId, and
// builds the Attempt for the append-only log. Pure: returns a new State.
export function recordOutcome(
  state: State,
  question: Question,
  raw: string,
  ms: number,
  now: number,
  phase: AttemptPhase,
  opts: OutcomeOpts = {},
): { state: State; attempt: Attempt; result: CheckResult } {
  const result = checkAnswer(question.answer, raw);
  const correct = result.correct;
  const speed = speedTargetMs(question.skill, question.band);
  const outcome = {
    correct,
    ms,
    band: question.band,
    now,
    transfer: opts.transfer,
    speedTargetMs: speed,
  };

  const skills: Record<string, Rec> = { ...state.skills };
  const touch = (id: string) => {
    const cur = skills[id] ?? newRec();
    skills[id] = applyOutcome(cur, {
      ...outcome,
      speedTargetMs: speedTargetMs(id, question.band),
    });
  };
  touch(question.skill);
  for (const s of question.skills ?? []) {
    if (s !== question.skill) touch(s);
  }

  const facts: Record<string, Rec> = { ...state.facts };
  if (question.factId !== undefined) {
    const famSkill = familySkillForFact(question.factId) ?? question.skill;
    const cur = facts[question.factId] ?? newRec();
    facts[question.factId] = applyOutcome(cur, {
      ...outcome,
      speedTargetMs: speedTargetMs(famSkill, question.band),
    });
  }

  const attempt: Attempt = {
    ts: now,
    templateId: question.templateId,
    seed: question.seed,
    band: question.band,
    skill: question.skill,
    factId: question.factId,
    correct,
    ms,
    given: raw,
    prompt: question.prompt,
    answer: displayAnswer(question.answer),
    phase,
    transfer: opts.transfer,
    sessionId: opts.sessionId,
  };
  return { state: { ...state, skills, facts }, attempt, result };
}
