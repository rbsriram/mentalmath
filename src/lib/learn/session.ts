// The 30-minute daily session state machine.
//
// Phase budgets: recall 3, learn 7, practice 12, timed 5, review 3 minutes.
// A phase never cuts a question in the middle: it only ends between
// questions. The review phase drains the review queue (today's misses,
// regenerated with fresh seeds) and ends early when the queue is empty.
// Time accrues only through `tick`: the UI calls it on a timer while the
// session is unpaused, and it counts everything, including reading a lesson
// or feedback, because that is session time too.

import { factTemplateFor, generate, generateFact } from '../engine/registry';
import type { Band, Question } from '../engine/types';
import type { CheckResult } from '../engine/answer';
import { seedFor, type Rng } from '../math/rng';
import type { Attempt } from './attempt';
import { localDay, newRec } from './model';
import { factFamilyOf } from '../content/facts';
import { pickQuestion, type Bucket } from './scheduler';
import { chooseTarget } from './scheduler';
import { recordOutcome, type SessionSummary, type State } from './state';
import { speedTargetMs } from './targets';

export type PhaseKind = 'recall' | 'learn' | 'practice' | 'timed' | 'review';

export interface Phase {
  kind: PhaseKind;
  budgetMs: number;
  elapsedMs: number;
}

export interface Session {
  id: string;
  date: string; // local 'YYYY-MM-DD'
  seed: number;
  startedAt: number;
  phases: Phase[];
  phaseIndex: number;
  target: string | null;
  lessonShown: boolean;
  // The on-screen question as a regenerable reference, so a serialized
  // session (JSON or IndexedDB) can resume deterministically.
  current: CurrentItem | null;
  counter: number;
  recentPrompts: string[];
  // Last served template, so the scheduler avoids immediate repeats.
  lastTemplateId: string | null;
  misses: { templateId: string; band: Band; prompt: string }[];
  reviewQueue: { templateId: string; band: Band }[];
  answered: number;
  correct: number;
  slow: { skill: string; method: string }[];
  completed: boolean;
  paused: boolean;
}

export interface CurrentItem {
  templateId: string;
  seed: number;
  band: Band;
  factId?: string | undefined;
  bucket: Bucket;
  transfer: boolean;
}

const MIN = 60 * 1000;
const BUDGETS: [PhaseKind, number][] = [
  ['recall', 3],
  ['learn', 7],
  ['practice', 12],
  ['timed', 5],
  ['review', 3],
];

export function planSession(state: State, now: number, seed: number): Session {
  const target = chooseTarget(state);
  let budgets = BUDGETS.map(([kind, minutes]) => ({ kind, minutes }));
  if (target === null) {
    const learn = budgets.find((b) => b.kind === 'learn')!;
    const practice = budgets.find((b) => b.kind === 'practice')!;
    practice.minutes += learn.minutes;
    learn.minutes = 0;
  }
  if (Object.keys(state.facts).length < 5) {
    const recall = budgets.find((b) => b.kind === 'recall')!;
    const practice = budgets.find((b) => b.kind === 'practice')!;
    practice.minutes += recall.minutes / 2;
    recall.minutes /= 2;
  }
  return {
    id: `s-${now.toString(36)}-${seed.toString(36)}`,
    date: localDay(now),
    seed,
    startedAt: now,
    phases: budgets.map((b) => ({
      kind: b.kind,
      budgetMs: b.minutes * MIN,
      elapsedMs: 0,
    })),
    phaseIndex: 0,
    target,
    lessonShown: false,
    current: null,
    counter: 0,
    recentPrompts: [],
    lastTemplateId: null,
    misses: [],
    reviewQueue: [],
    answered: 0,
    correct: 0,
    slow: [],
    completed: false,
    paused: false,
  };
}

// Advance past exhausted phases; a phase never ends mid-question.
export function advanceIfOver(session: Session): Session {
  if (session.current !== null || session.completed) return session;
  let idx = session.phaseIndex;
  const phases = session.phases;
  while (idx < phases.length) {
    const ph = phases[idx]!;
    const over = ph.elapsedMs >= ph.budgetMs;
    // The review phase also ends when its queue is empty.
    const reviewEmpty =
      ph.kind === 'review' && session.reviewQueue.length === 0;
    if (!over && !reviewEmpty) break;
    idx++;
  }
  if (idx === session.phaseIndex) return session;
  return {
    ...session,
    phaseIndex: idx,
    completed: idx >= phases.length,
  };
}

// Serve the next question, or null when the session is over/paused.
export function nextQuestion(
  state: State,
  session: Session,
  rng: Rng,
  now: number,
): Session {
  if (session.completed || session.paused || session.current !== null) {
    return session;
  }
  let s = advanceIfOver(session);
  if (s.completed) return s;
  const phase = s.phases[s.phaseIndex]!;

  let question: Question;
  let bucket: Bucket;
  let transfer = false;
  let counter = s.counter;
  let reviewQueue = s.reviewQueue;

  if (phase.kind === 'review') {
    if (reviewQueue.length === 0) {
      // Queue drained: the review phase ends and we continue.
      s = advanceIfOver({
        ...s,
        phases: s.phases.map((p, i) =>
          i === s.phaseIndex ? { ...p, elapsedMs: p.budgetMs } : p,
        ),
      });
      if (s.completed) return s;
      return nextQuestion(state, s, rng, now);
    }
    const item = reviewQueue[0]!;
    reviewQueue = reviewQueue.slice(1);
    const seed = seedFor('practice', s.seed, counter);
    counter++;
    question = generate(item.templateId, seed, item.band);
    let tries = 0;
    while (s.recentPrompts.includes(question.prompt) && tries < 5) {
      question = generate(
        item.templateId,
        seedFor('practice', s.seed, counter),
        item.band,
      );
      counter++;
      tries++;
    }
    bucket = 'maintenance';
  } else {
    const pick = pickQuestion(state, rng, now, {
      phase: phase.kind,
      target: s.target,
      recentPrompts: s.recentPrompts,
      lastTemplateId: s.lastTemplateId,
      counter,
      nonce: s.seed,
    });
    counter++;
    question = pick.question;
    bucket = pick.bucket;
    transfer = pick.transfer;
  }

  const recentPrompts = [...s.recentPrompts, question.prompt].slice(-20);
  return {
    ...s,
    current: {
      templateId: question.templateId,
      seed: question.seed,
      band: question.band,
      factId: question.factId,
      bucket,
      transfer,
    },
    counter,
    reviewQueue,
    recentPrompts,
    lastTemplateId: question.templateId,
  };
}

// Regenerates the on-screen question. Deterministic because the item is a
// (templateId, seed, band[, factId]) reference into the seeded generator.
export function currentQuestion(session: Session): Question | null {
  const c = session.current;
  if (c === null) return null;
  if (c.factId !== undefined) {
    const family = factFamilyOf(c.factId);
    if (family === null) return null;
    return generateFact(factTemplateFor(family), c.factId, c.seed);
  }
  return generate(c.templateId, c.seed, c.band);
}

export interface AnswerResult {
  state: State;
  session: Session;
  attempt: Attempt | null;
  result: CheckResult | null;
}

export function answer(
  state: State,
  session: Session,
  raw: string,
  ms: number,
  now: number,
): AnswerResult {
  if (session.current === null || session.completed) {
    return { state, session, attempt: null, result: null };
  }
  const question = currentQuestion(session);
  if (question === null) {
    return { state, session, attempt: null, result: null };
  }
  const { transfer } = session.current;
  const phase = session.phases[session.phaseIndex]!;
  const outcome = recordOutcome(state, question, raw, ms, now, phase.kind, {
    transfer,
    sessionId: session.id,
  });

  const misses = outcome.result.correct
    ? session.misses
    : [
        ...session.misses,
        { templateId: question.templateId, band: question.band, prompt: question.prompt },
      ];
  const reviewQueue = outcome.result.correct
    ? session.reviewQueue
    : [...session.reviewQueue, { templateId: question.templateId, band: question.band }];
  const slow =
    outcome.result.correct &&
    ms > 1.5 * speedTargetMs(question.skill, question.band)
      ? [
          ...session.slow,
          { skill: question.skill, method: question.strategies[0] ?? '' },
        ]
      : session.slow;

  // Response time does not add to the phase: `tick` owns the clock.
  return {
    state: outcome.state,
    session: {
      ...session,
      misses,
      reviewQueue,
      slow,
      current: null,
      answered: session.answered + 1,
      correct: session.correct + (outcome.result.correct ? 1 : 0),
    },
    attempt: outcome.attempt,
    result: outcome.result,
  };
}

// Session time accrues through tick. The UI calls it on a timer; it counts
// whenever the session is live, with or without a question on screen.
export function tick(session: Session, deltaMs: number): Session {
  if (session.paused || session.completed || session.phaseIndex >= session.phases.length) {
    return session;
  }
  return {
    ...session,
    phases: session.phases.map((p, i) =>
      i === session.phaseIndex ? { ...p, elapsedMs: p.elapsedMs + deltaMs } : p,
    ),
  };
}

// Marks the lesson card as shown and the target skill's record as
// introduced. Pure: returns updated state and session.
export function markLessonShown(
  state: State,
  session: Session,
  _now: number,
): { state: State; session: Session } {
  if (session.target === null) {
    return { state, session: { ...session, lessonShown: true } };
  }
  const rec = state.skills[session.target] ?? newRec();
  const skills = {
    ...state.skills,
    [session.target]: { ...rec, introduced: true },
  };
  return {
    state: { ...state, skills },
    session: { ...session, lessonShown: true },
  };
}

export function pause(session: Session): Session {
  return { ...session, paused: true };
}

export function resume(session: Session): Session {
  return { ...session, paused: false };
}

export function summarize(session: Session, _now: number): SessionSummary {
  const totalMs = session.phases.reduce((s, p) => s + p.elapsedMs, 0);
  return {
    id: session.id,
    date: session.date,
    minutes: Math.round((totalMs / MIN) * 10) / 10,
    answered: session.answered,
    correct: session.correct,
    target: session.target,
    newMethod: session.lessonShown ? session.target : null,
  };
}

export function finishSession(
  state: State,
  session: Session,
  now: number,
): State {
  return {
    ...state,
    sessions: [...state.sessions, summarize(session, now)].slice(-400),
    session: null,
  };
}
