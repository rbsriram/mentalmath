import { describe, expect, it } from 'vitest';
import {
  answer,
  dismissLesson,
  dueCounts,
  newRound,
  nextKind,
  serve,
  strongCount,
  topicOf,
  type Round,
} from '../src/lib/learn/round';
import {
  answerDiagnostic,
  applyDiagnosticPart,
  currentItem,
  hasStartingPoint,
  startDiagnostic,
} from '../src/lib/learn/diagnostic';
import { generate, generateFact, factTemplateFor } from '../src/lib/engine/registry';
import { factFamilyOf } from '../src/lib/content/facts';
import { isDue, newRec, type Rec } from '../src/lib/learn/model';
import { newState, type State } from '../src/lib/learn/state';
import { METHODS } from '../src/lib/content/methods';
import { displayAnswer } from '../src/lib/math/format';
import { createRng } from '../src/lib/math/rng';
import type { Question } from '../src/lib/engine/types';

const T0 = new Date(2025, 0, 10, 9, 0, 0).getTime();
const DAY = 24 * 60 * 60 * 1000;

function regen(ref: Round['current']): Question {
  if (ref!.factId !== undefined) {
    return generateFact(factTemplateFor(factFamilyOf(ref!.factId)!), ref!.factId, ref!.seed);
  }
  return generate(ref!.templateId, ref!.seed, ref!.band);
}

const DUE: Rec = { ...newRec(), attempts: 6, due: T0 - 1, level: 1, streak: 0 };
const LEARN: Rec = { ...newRec(), attempts: 6, level: 1, introduced: false, streak: 0, due: T0 + DAY };
const SOLID: Rec = { ...newRec(), attempts: 12, stability: 30, recent: Array(10).fill(1), days: 4, independent: 4, level: 2, introduced: true, due: T0 + DAY };

function rich(): State {
  return {
    ...newState(T0),
    diagnosticDone: true,
    target: 'mul-near-base',
    skills: {
      'add-left-to-right': { ...DUE },
      'mul-near-base': { ...LEARN },
      'mul-distributive': { ...newRec(), attempts: 4, level: 1, introduced: true, due: T0 + DAY },
      'mul-2x2': { ...SOLID },
      'pct-build': { ...newRec(), attempts: 4, level: 1, introduced: true, due: T0 + DAY },
      'sub-left-to-right': { ...newRec(), attempts: 4, level: 1, introduced: true, due: T0 + DAY },
      'add-grouping': { ...newRec(), attempts: 4, level: 1, introduced: true, due: T0 + DAY },
    },
    facts: {
      't:7x8': { ...DUE },
      't:3x4': { ...newRec(), attempts: 4, due: T0 + DAY },
      'sq:12': { ...DUE },
    },
  };
}

describe('rounds', () => {
  it('serves exactly 10 questions then done; an 11th serve is a no-op', () => {
    let state = rich();
    const rng = createRng(1);
    const out = newRound(state, T0, 7, { kind: 'mixed' });
    state = out.state;
    let r = out.round;
    for (let i = 0; i < 10; i++) {
      r = serve(r, state, T0);
      if (r.lesson) { const d = dismissLesson(r, state); r = d.round; state = d.state; }
      expect(r.current).not.toBeNull();
      const a = answer(r, state, regen(r.current), 'x', 500, T0 + i);
      r = a.round;
      state = a.state;
    }
    expect(r.done).toBe(true);
    expect(r.items).toHaveLength(10);
    const again = serve(r, state, T0);
    expect(again).toBe(r);
  });

  it('never serves the same topic twice in a row when another exists', () => {
    for (let seed = 1; seed <= 200; seed++) {
      let state = rich();
      const out = newRound(state, T0, seed, { kind: 'mixed' });
      state = out.state;
      let r = out.round;
      for (let i = 0; i < 10; i++) {
        r = serve(r, state, T0);
        if (r.lesson) { const d = dismissLesson(r, state); r = d.round; state = d.state; }
        if (i > 0 && r.items.length + 1 > 1) {
          const prev = r.lastTopic;
          void prev;
        }
        const a = answer(r, state, regen(r.current), 'x', 500, T0 + i);
        if (i > 0) {
          expect(a.round.items[i]!.topic).not.toBe(a.round.items[i - 1]!.topic);
        }
        r = a.round;
        state = a.state;
      }
    }
  });

  it('a skill round with one skill still completes', () => {
    let state = rich();
    const out = newRound(state, T0, 3, { kind: 'skill', skills: ['mul-near-base'] });
    state = out.state;
    let r = out.round;
    for (let i = 0; i < 10; i++) {
      r = serve(r, state, T0);
      if (r.lesson) { const d = dismissLesson(r, state); r = d.round; state = d.state; }
      const a = answer(r, state, regen(r.current), 'x', 500, T0 + i);
      r = a.round;
      state = a.state;
    }
    expect(r.done).toBe(true);
  });

  it('with 20 due items, >=90% of 200 rounds contain >=3 due items', () => {
    const base = rich();
    // Spread the due items across topics so the variety rule does not
    // force non-due picks after a due item is served.
    const dueIds = [
      't:7x9', 't:6x8', 't:9x11', 't:12x13',
      'sq:14', 'sq:17', 'sq:19',
      'fe:3/8', 'fe:5/8',
      'pa:25', 'pa:75',
      'c10:4',
      't:5x12', 't:8x13', 't:11x14', 't:6x15',
      'sq:22', 'fe:1/12', 'pa:20', 'c10:9',
    ];
    for (const id of dueIds) base.facts[id] = { ...DUE };
    let good = 0;
    for (let seed = 1; seed <= 200; seed++) {
      let state = base;
      // Snapshot the due set at round start; answering pushes due dates
      // out, which would otherwise erase items from the count.
      const dueSet = new Set([
        ...Object.keys(state.facts).filter((f) => isDue(state.facts[f]!, T0)),
        ...Object.keys(state.skills).filter((id) => isDue(state.skills[id]!, T0)),
      ]);
      const out = newRound(state, T0, seed * 31, { kind: 'mixed' });
      state = out.state;
      let r = out.round;
      let dueCount = 0;
      for (let i = 0; i < 10; i++) {
        r = serve(r, state, T0);
        if (r.lesson) { const d = dismissLesson(r, state); r = d.round; state = d.state; }
        const q = regen(r.current);
        if (dueSet.has(q.factId ?? q.skill)) dueCount++;
        const a = answer(r, state, regen(r.current), 'x', 500, T0 + i);
        r = a.round;
        state = a.state;
      }
      if (dueCount >= 3) good++;
    }
    expect(good / 200).toBeGreaterThanOrEqual(0.9);
  });

  it('unintroduced target shows one lesson card; dismiss marks introduced', () => {
    let state = rich();
    // make every bucket except target empty by removing due + unattempted
    state = {
      ...state,
      skills: { 'mul-near-base': { ...LEARN } },
      facts: {},
      target: 'mul-near-base',
    };
    const out = newRound(state, T0, 9, { kind: 'mixed' });
    state = out.state;
    let r = out.round;
    r = serve(r, state, T0);
    expect(r.currentBucket).toBe('target');
    expect(r.lesson).not.toBeNull();
    const d = dismissLesson(r, state);
    r = d.round;
    state = d.state;
    expect(state.skills['mul-near-base']!.introduced).toBe(true);
    for (let i = 0; i < 4; i++) {
      r = serve(r, state, T0);
      expect(r.lesson).toBeNull();
      const a = answer(r, state, regen(r.current), 'x', 500, T0 + i);
      r = a.round;
      state = a.state;
    }
  });

  it('stop semantics: nulling the round keeps recorded answers', () => {
    let state = rich();
    const out = newRound(state, T0, 5, { kind: 'mixed' });
    state = out.state;
    let r = out.round;
    const before = state.skills['mul-near-base']!.attempts;
    for (let i = 0; i < 4; i++) {
      r = serve(r, state, T0);
      if (r.lesson) { const d = dismissLesson(r, state); r = d.round; state = d.state; }
      const a = answer(r, state, regen(r.current), 'x', 500, T0 + i);
      r = a.round;
      state = a.state;
    }
    state = { ...state, round: null };
    expect(state.skills['mul-near-base']!.attempts).toBeGreaterThan(before);
  });

  it('nextKind sequencing', () => {
    let state = newState(T0);
    const started = startDiagnostic(state, T0);
    state = started.state;
    expect(nextKind(state)).toBe('mixed'); // no starting point -> caller gates
    let diag = started.diagnostic;
    while (!diag.partBoundary) {
      const q = currentItem(diag)!;
      const out = answerDiagnostic(state, diag, displayAnswer(q.answer), 1000, T0);
      state = out.state;
      diag = out.diagnostic;
    }
    state = applyDiagnosticPart(state, diag, T0);
    state = { ...state, diagnostic: { ...diag, partBoundary: false } };
    expect(nextKind(state)).toBe('diagnostic');
    state = { ...state, lastRoundKind: 'diagnostic' };
    expect(nextKind(state)).toBe('mixed');
    state = { ...state, diagnosticDone: true, diagnostic: null };
    expect(nextKind(state)).toBe('mixed');
  });

  it('finishing a round updates the day entry; two rounds merge', () => {
    let state = rich();
    for (let k = 0; k < 2; k++) {
      const out = newRound(state, T0, 42 + k, { kind: 'mixed' });
      state = out.state;
      let r = out.round;
      for (let i = 0; i < 10; i++) {
        r = serve(r, state, T0);
        if (r.lesson) { const d = dismissLesson(r, state); r = d.round; state = d.state; }
        const a = answer(r, state, regen(r.current), 'x', 500, T0 + i);
        r = a.round;
        state = a.state;
      }
    }
    const day = state.days.find((d) => d.date === '2025-01-10')!;
    expect(day.rounds).toBe(2);
    expect(day.answered).toBe(20);
    expect(day.correct).toBe(0);
  });

  it('dueCounts and strongCount', () => {
    const state = rich();
    const d = dueCounts(state, T0);
    expect(d.facts).toBe(2);
    expect(d.skills).toBe(1);
    const s = strongCount(state);
    expect(s.strong).toBe(1);
    expect(s.total).toBeGreaterThan(0);
  });
});

describe('round target and lesson bookkeeping', () => {
  it('newRound re-picks a target that went solid', () => {
    // mul-2x2 is solid and off the frontier; the frontier offers others.
    const state: State = {
      ...newState(T0),
      diagnosticDone: true,
      target: 'mul-2x2',
      skills: {
        'mul-2x2': { ...SOLID },
        'mul-near-base': { ...newRec(), attempts: 4, level: 1, introduced: true, due: T0 + DAY },
        'mul-distributive': { ...newRec(), attempts: 4, level: 1, introduced: true, due: T0 + DAY },
      },
    };
    const out = newRound(state, T0, 1, { kind: 'mixed' });
    expect(out.state.target).not.toBe('mul-2x2');
  });

  it('family lesson marks familyIntroduced, not the target introduced flag', () => {
    // The frac-to-dec-pct method's skill doubles as the target here;
    // dismissing the family card must set familyIntroduced only.
    const famSkill = METHODS.find((m) => m.id === 'frac-to-dec-pct')!.skill;
    const st2: State = {
      ...newState(T0),
      diagnosticDone: true,
      target: famSkill,
      skills: { [famSkill]: { ...newRec(), attempts: 2, level: 1, introduced: false, due: T0 + DAY } },
      facts: {},
    };
    // Craft a served fact item of the fraction family manually.
    const round: Round = {
      id: 'r1', kind: 'mixed', topic: null, skills: [], band: null,
      size: 10, seed: 1, startedAt: T0, date: '2025-01-10',
      counter: 0, recentPrompts: [], lastTemplateId: null, lastTopic: null,
      current: { templateId: 'frac-to-dec-pct', seed: 1, band: 0, factId: 'fe:1/4' },
      currentTopic: 'fraction-equivalents', currentBucket: 'newfact', currentTransfer: false,
      lesson: 'frac-to-dec-pct', lessonFamily: 'fraction-equivalents',
      lessonShown: false, items: [], done: false,
    };
    const out = dismissLesson(round, st2);
    expect(out.state.familyIntroduced['fraction-equivalents']).toBe(true);
    expect(out.state.skills[famSkill]!.introduced).toBe(false);
    expect(out.round.lesson).toBeNull();
    expect(out.round.lessonFamily).toBeNull();
  });

  it('target lesson marks the skill introduced, not the family', () => {
    const state: State = {
      ...newState(T0),
      diagnosticDone: true,
      target: 'mul-near-base',
      skills: { 'mul-near-base': { ...LEARN } },
    };
    const round: Round = {
      id: 'r2', kind: 'mixed', topic: null, skills: [], band: null,
      size: 10, seed: 1, startedAt: T0, date: '2025-01-10',
      counter: 0, recentPrompts: [], lastTemplateId: null, lastTopic: null,
      current: { templateId: 'mul-near-base', seed: 1, band: 1 },
      currentTopic: 'mul-near-base', currentBucket: 'target', currentTransfer: false,
      lesson: 'mul-near-base', lessonFamily: null,
      lessonShown: false, items: [], done: false,
    };
    const out = dismissLesson(round, state);
    expect(out.state.skills['mul-near-base']!.introduced).toBe(true);
    expect(Object.keys(out.state.familyIntroduced)).toHaveLength(0);
  });
});
