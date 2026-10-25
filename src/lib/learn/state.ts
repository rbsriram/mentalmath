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
import { factFamilyOf } from '../content/facts';
import { speedTargetMs } from './targets';
import type { Attempt, AttemptPhase } from './attempt';
import type { Round, RoundKind } from './round';
import type { DiagnosticState } from './diagnostic';
import type { BenchmarkReport, BenchmarkState } from './benchmark';

export interface DaySummary {
  date: string; // local 'YYYY-MM-DD'
  rounds: number;
  answered: number;
  correct: number;
}

export interface State {
  version: 4;
  createdAt: number;
  skills: Record<string, Rec>;
  facts: Record<string, Rec>;
  target: string | null;
  round: Round | null;
  diagnostic: DiagnosticState | null;
  benchmark: BenchmarkState | null;
  days: DaySummary[]; // newest last, cap 400
  // Kind of the last finished round (or 'diagnostic'); drives what Start
  // serves next. Set only when a run finishes, never on Stop.
  lastRoundKind: RoundKind | 'diagnostic' | null;
  diagnosticDone: boolean;
  baseline: BenchmarkReport | null;
  benchmarks: BenchmarkReport[];
  // Fact families already taught by a Recall lesson card; each family
  // gets one card, ever.
  familyIntroduced: Record<string, boolean>;
  settings: { theme: 'system' | 'light' | 'dark' };
}

export function newState(now: number): State {
  return {
    version: 4,
    createdAt: now,
    skills: {},
    facts: {},
    target: null,
    round: null,
    diagnostic: null,
    benchmark: null,
    days: [],
    lastRoundKind: null,
    diagnosticDone: false,
    baseline: null,
    benchmarks: [],
    familyIntroduced: {},
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
  2: (doc) => {
    // v2 -> v3: the per-family lesson flags start empty.
    const d = doc as Record<string, unknown>;
    return { ...d, familyIntroduced: {}, version: 3 };
  },
  3: (doc) => {
    // v3 -> v4: timed sessions become rounds. The in-flight session is
    // dropped; each old session summary becomes a day entry (merged per
    // date, one round per session). Fact records for families that no
    // longer exist (complements to 100/1,000 are a rule, not facts) are
    // dropped.
    const d = doc as Record<string, unknown>;
    const oldSessions = Array.isArray(d.sessions)
      ? (d.sessions as { date?: string; answered?: number; correct?: number }[])
      : [];
    const byDate = new Map<string, { date: string; rounds: number; answered: number; correct: number }>();
    for (const s0 of oldSessions) {
      if (typeof s0.date !== 'string') continue;
      const cur = byDate.get(s0.date) ?? { date: s0.date, rounds: 0, answered: 0, correct: 0 };
      cur.rounds += 1;
      cur.answered += typeof s0.answered === 'number' ? s0.answered : 0;
      cur.correct += typeof s0.correct === 'number' ? s0.correct : 0;
      byDate.set(s0.date, cur);
    }
    const facts: Record<string, unknown> = {};
    for (const [id, rec] of Object.entries(
      (d.facts ?? {}) as Record<string, unknown>,
    )) {
      if (factFamilyOf(id) !== null) facts[id] = rec;
    }
    delete d.session;
    delete d.sessions;
    return {
      ...d,
      facts,
      round: null,
      days: [...byDate.values()].slice(-400),
      lastRoundKind: null,
      version: 4,
    };
  },
};

const LATEST_VERSION = 4;

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
    !Array.isArray(d.days) ||
    !Array.isArray(d.benchmarks) ||
    !isPlainObject(d.familyIntroduced) ||
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

// One lesson card per fact family, ever: the Recall runner marks the
// family as introduced before the first fact is shown.
export function markFamilyIntroduced(state: State, family: string): State {
  return {
    ...state,
    familyIntroduced: { ...state.familyIntroduced, [family]: true },
  };
}
