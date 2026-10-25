// A round is exactly 10 questions. It ends by itself. There is no clock:
// no minutes, no phases, no pause. Response time is still recorded per
// answer and still drives speed targets and promotion.
//
// The round lives in state.round so a reload mid-round continues where it
// left off. Stop clears state.round; everything already answered stays
// recorded. A diagnostic part counts as a round for sequencing.

import { FAMILY_METHOD, METHODS } from '../content/methods';
import { factFamilyOf, type FactFamily } from '../content/facts';
import { bySkill } from '../engine/registry';
import type { Band, Question } from '../engine/types';
import { createRng, seedFor } from '../math/rng';
import { localDay, isDue, newRec, status } from './model';
import { recordOutcome, markFamilyIntroduced, type State } from './state';
import {
  candFor,
  chooseTarget,
  pickFactInFamily,
  pickMixed,
  serveSkill,
  type Bucket,
  type PickCtx,
  type PickResult,
} from './scheduler';
import type { CheckResult } from '../engine/answer';
import type { Attempt } from './attempt';
import { hasStartingPoint } from './diagnostic';
import { SKILLS } from '../content/skills';

export type RoundKind = 'mixed' | 'skill' | 'facts';

export interface RoundItem {
  ref: QuestionRef;
  topic: string;
  correct: boolean;
  ms: number;
}

export interface QuestionRef {
  templateId: string;
  seed: number;
  band: Band;
  factId?: string | undefined;
}

export interface Round {
  id: string;
  kind: RoundKind;
  topic: string | null; // fact family for 'facts' rounds
  skills: string[]; // 'skill' rounds
  band: Band | null; // explicit band for 'skill' rounds
  size: number; // 10
  seed: number;
  startedAt: number;
  date: string; // local day
  counter: number;
  recentPrompts: string[];
  lastTemplateId: string | null;
  lastTopic: string | null;
  current: QuestionRef | null;
  currentTopic: string | null;
  currentBucket: Bucket | null;
  currentTransfer: boolean;
  // A method card to show before `current` (skill target or fact family);
  // null when none or already dismissed. One card per round, ever.
  lesson: string | null;
  // The fact family a lesson card teaches; null for a target method card.
  lessonFamily: string | null;
  lessonShown: boolean;
  items: RoundItem[];
  done: boolean;
}

export const ROUND_SIZE = 10;

const METHOD_BY_ID = new Map(METHODS.map((m) => [m.id, m]));
const METHOD_BY_SKILL = new Map(METHODS.map((m) => [m.skill, m]));

export function newRound(
  state: State,
  now: number,
  seed: number,
  opts: {
    kind?: RoundKind;
    topic?: string;
    skills?: string[];
    band?: Band | null;
  },
): { round: Round; state: State } {
  const kind = opts.kind ?? 'mixed';
  let st = state;
  if (kind === 'mixed') {
    // Re-pick on every mixed round: a target that has gone solid or off
    // the frontier must be replaced; chooseTarget keeps a live target.
    st = { ...st, target: chooseTarget(st) };
  }
  const round: Round = {
    id: `r-${seed}-${Math.floor(now / 1000)}`,
    kind,
    topic: opts.topic ?? null,
    skills: opts.skills ?? [],
    band: opts.band ?? null,
    size: ROUND_SIZE,
    seed,
    startedAt: now,
    date: localDay(now),
    counter: 0,
    recentPrompts: [],
    lastTemplateId: null,
    lastTopic: null,
    current: null,
    currentTopic: null,
    currentBucket: null,
    currentTransfer: false,
    lesson: null,
    lessonFamily: null,
    lessonShown: false,
    items: [],
    done: false,
  };
  return { round, state: st };
}

function ctxFor(round: Round): PickCtx {
  return {
    target: null, // set by callers for mixed
    recentPrompts: round.recentPrompts,
    lastTemplateId: round.lastTemplateId,
    lastTopic: round.lastTopic,
    counter: round.counter,
    nonce: round.seed,
  };
}

// The topic of a question: its fact family, or its primary skill id.
export function topicOf(q: Question): string {
  if (q.factId !== undefined) {
    const f = factFamilyOf(q.factId);
    if (f !== null) return f;
  }
  return q.skill;
}

// The lesson card a served item needs, if any. A fact question may carry
// its family's card (once ever); a target question may carry the target
// method card (until that method's rec is marked introduced).
function lessonFor(
  round: Round,
  state: State,
  pick: PickResult,
): { method: string; family: string | null } | null {
  if (round.lessonShown) return null;
  const q = pick.question;
  if (q.factId !== undefined) {
    const family = factFamilyOf(q.factId);
    const mid = family === null ? undefined : FAMILY_METHOD[family];
    if (
      family !== null &&
      mid !== undefined &&
      !state.familyIntroduced[family]
    ) {
      return { method: mid, family };
    }
  }
  if (pick.bucket === 'target' && state.target !== null) {
    const rec = state.skills[state.target];
    if (rec !== undefined && !rec.introduced) {
      const m = METHOD_BY_SKILL.get(state.target);
      if (m !== undefined) return { method: m.id, family: null };
    }
  }
  return null;
}

// Serve the next item in the round. No-op when one is already on screen or
// the round is done. The question is stored as a JSON-safe ref plus the
// topic that drove it; the UI regenerates from the ref.
export function serve(round: Round, state: State, now: number): Round {
  if (round.current !== null || round.done) return round;
  const rng = createRng(seedFor('round', round.seed, round.counter));
  let pick: PickResult;
  if (round.kind === 'facts') {
    pick = pickFactInFamily(state, rng, now, ctxFor(round), round.topic as FactFamily);
  } else if (round.kind === 'skill') {
    const pool = round.skills.length > 0 ? round.skills : [SKILLS[0]!.id];
    const skill = rng.pick(pool);
    const band = round.band ?? (state.skills[skill]?.level ?? 0);
    const cand = candFor(skill, band as Band, rng);
    const q = serveSkill(cand, ctxFor(round), rng);
    pick = { question: q, bucket: 'skill', transfer: false, topic: skill };
  } else {
    pick = pickMixed(state, rng, now, { ...ctxFor(round), target: state.target });
  }
  const topic = topicOf(pick.question);
  const lesson = lessonFor(round, state, pick);
  return {
    ...round,
    counter: round.counter + 1,
    current: {
      templateId: pick.question.templateId,
      seed: pick.question.seed,
      band: pick.question.band,
      factId: pick.question.factId,
    },
    currentTopic: topic,
    currentBucket: pick.bucket,
    currentTransfer: pick.transfer,
    lesson: lesson?.method ?? null,
    lessonFamily: lesson?.family ?? null,
    recentPrompts: [...round.recentPrompts, pick.question.prompt].slice(-20),
    lastTemplateId: pick.question.templateId,
    lastTopic: topic,
  };
}

// The user saw the card: mark the lesson dismissed. For a fact family this
// sets familyIntroduced; for a target method it marks the skill rec
// introduced. The served question stays on screen.
export function dismissLesson(
  round: Round,
  state: State,
): { round: Round; state: State } {
  if (round.lesson === null) return { round, state };
  let st = state;
  if (round.lessonFamily !== null) {
    st = markFamilyIntroduced(st, round.lessonFamily);
  } else {
    const m = METHOD_BY_ID.get(round.lesson);
    if (m !== undefined) {
      const rec = st.skills[m.skill] ?? newRec();
      st = {
        ...st,
        skills: { ...st.skills, [m.skill]: { ...rec, introduced: true } },
      };
    }
  }
  return {
    round: { ...round, lesson: null, lessonFamily: null, lessonShown: true },
    state: st,
  };
}

export interface AnswerOutcome {
  round: Round;
  state: State;
  attempt: Attempt;
  result: CheckResult;
}

// Record the answer, update records through recordOutcome, push the item,
// and close the round when items reach the size. Finishing a round also
// stamps today's DaySummary and lastRoundKind.
export function answer(
  round: Round,
  state: State,
  question: Question,
  raw: string,
  ms: number,
  now: number,
): AnswerOutcome {
  const out = recordOutcome(state, question, raw, ms, now, 'round', {
    transfer: round.currentTransfer,
    sessionId: round.id,
  });
  const items = [
    ...round.items,
    {
      ref: round.current!,
      topic: round.currentTopic ?? topicOf(question),
      correct: out.result.correct,
      ms,
    },
  ];
  const done = items.length >= round.size;
  let r: Round = { ...round, items, current: null, currentTopic: null, done };
  let st = { ...out.state, round: r };
  if (done) {
    const correctCount = items.filter((i) => i.correct).length;
    st = {
      ...st,
      lastRoundKind: round.kind,
      days: addDay(st.days, r.date, items.length, correctCount),
    };
  }
  return { round: r, state: st, attempt: out.attempt, result: out.result };
}

function addDay(
  days: State['days'],
  date: string,
  answered: number,
  correct: number,
): State['days'] {
  const idx = days.findIndex((d) => d.date === date);
  if (idx === -1) {
    return [...days, { date, rounds: 1, answered, correct }].slice(-400);
  }
  const next = [...days];
  next[idx] = {
    ...next[idx]!,
    rounds: next[idx]!.rounds + 1,
    answered: next[idx]!.answered + answered,
    correct: next[idx]!.correct + correct,
  };
  return next;
}

// What Start serves next: a diagnostic part while parts remain and the
// last finished round was not a diagnostic, else a mixed round.
export function nextKind(state: State): 'diagnostic' | 'mixed' {
  if (
    state.diagnostic !== null &&
    !state.diagnostic.done &&
    !state.diagnosticDone &&
    hasStartingPoint(state) &&
    state.lastRoundKind !== 'diagnostic'
  ) {
    return 'diagnostic';
  }
  return 'mixed';
}

export function dueCounts(state: State, now: number): { facts: number; skills: number } {
  const facts = Object.keys(state.facts).filter((f) =>
    isDue(state.facts[f]!, now),
  ).length;
  const skills = Object.keys(state.skills).filter((id) =>
    isDue(state.skills[id]!, now),
  ).length;
  return { facts, skills };
}

// Total practicable skills = skills with at least one serving template.
export function strongCount(state: State): { strong: number; total: number } {
  const practicable = SKILLS.filter((s) => bySkill(s.id).length > 0);
  const strong = practicable.filter(
    (s) => status(state.skills[s.id] ?? newRec()) === 'strong',
  ).length;
  return { strong, total: practicable.length };
}
