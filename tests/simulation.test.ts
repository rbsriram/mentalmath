// Integration smoke test: a scripted learner through the diagnostic and
// 60 days of short rounds. Deterministic seeds, no timers, no I/O.

import { describe, expect, it } from 'vitest';
import {
  answerDiagnostic,
  applyDiagnosticPart,
  currentItem,
  finishDiagnostic,
  startDiagnostic,
  type DiagnosticState,
} from '../src/lib/learn/diagnostic';
import {
  answer,
  dismissLesson,
  newRound,
  nextKind,
  serve,
  topicOf,
  strongCount,
} from '../src/lib/learn/round';
import { generate, generateFact, factTemplateFor } from '../src/lib/engine/registry';
import { factFamilyOf } from '../src/lib/content/facts';
import { frontier, unlocked } from '../src/lib/learn/scheduler';
import { newState, type State } from '../src/lib/learn/state';
import { SKILLS } from '../src/lib/content/skills';
import { displayAnswer } from '../src/lib/math/format';
import { createRng } from '../src/lib/math/rng';
import type { Attempt } from '../src/lib/learn/attempt';
import type { Question } from '../src/lib/engine/types';

const DAY = 24 * 60 * 60 * 1000;
const T0 = new Date(2025, 0, 10, 9, 0, 0).getTime();

function regen(ref: { templateId: string; seed: number; band: 0|1|2|3; factId?: string | undefined }): Question {
  if (ref.factId !== undefined) {
    return generateFact(factTemplateFor(factFamilyOf(ref.factId)!), ref.factId, ref.seed);
  }
  return generate(ref.templateId, ref.seed, ref.band);
}

describe('simulated learner', () => {
  it('diagnostic parts then 6 rounds a day for 60 days', () => {
    let state = newState(T0);
    const attempts: Attempt[] = [];
    let now = T0;
    const rng = createRng(20250110);

    // Part 1 standalone, then the rest folds through nextKind.
    const started = startDiagnostic(state, T0);
    state = started.state;
    let diag: DiagnosticState = started.diagnostic;
    while (!diag.partBoundary && !diag.done) {
      const q = currentItem(diag)!;
      const out = answerDiagnostic(state, diag, displayAnswer(q.answer), 2000, now);
      state = out.state;
      diag = out.diagnostic;
      attempts.push(out.attempt);
      now += 1500;
    }
    state = { ...applyDiagnosticPart(state, diag, now), lastRoundKind: 'diagnostic' };
    expect(state.lastRoundKind).toBe('diagnostic');

    let strongBefore = strongCount(state).strong;
    for (let day = 0; day < 60 && !state.diagnosticDone; day++) {
      const dayStart = T0 + (day + 1) * DAY;
      for (let r = 0; r < 6 && !state.diagnosticDone; r++) {
        const kind = nextKind(state);
        if (kind === 'diagnostic') {
          const d = state.diagnostic!;
          while (!d.partBoundary && !d.done && state.diagnostic === d) {
            const dd = state.diagnostic!;
            if (dd.partBoundary || dd.done) break;
            const q = currentItem(dd)!;
            const good = rng.next() < 0.8;
            const out = answerDiagnostic(state, dd, good ? displayAnswer(q.answer) : 'x', 2000, dayStart);
            state = out.state;
            attempts.push(out.attempt);
          }
          const dd = state.diagnostic!;
          if (dd.done) {
            const fin = finishDiagnostic(state, dd, attempts, dayStart);
            state = fin.state;
          } else if (dd.partBoundary) {
            state = { ...applyDiagnosticPart(state, dd, dayStart), lastRoundKind: 'diagnostic' };
          }
          continue;
        }
        const out = newRound(state, dayStart, 1000 + day * 7 + r, { kind: 'mixed' });
        state = out.state;
        let round = out.round;
        while (!round.done) {
          round = serve(round, state, dayStart);
          if (round.lesson !== null) {
            const dis = dismissLesson(round, state);
            round = dis.round;
            state = dis.state;
          }
          const q = regen(round.current!);
          const good = rng.next() < 0.85;
          const a = answer(round, state, q, good ? displayAnswer(q.answer) : 'x', 2500, dayStart);
          round = a.round;
          state = a.state;
          attempts.push(a.attempt);
        }
        state = { ...state, round: null };
      }
      const s = strongCount(state);
      expect(s.strong).toBeGreaterThanOrEqual(strongBefore);
      strongBefore = s.strong;
    }
    expect(state.diagnosticDone).toBe(true);
    expect(state.baseline).not.toBeNull();
    expect(state.days.length).toBeGreaterThan(0);
    const fr = frontier(state);
    expect(fr.length).toBeGreaterThan(0);
    const unlockedCount = SKILLS.filter(
      (s) => (s.kind === 'method' || s.kind === 'application') && unlocked(state, s.id),
    ).length;
    expect(unlockedCount).toBeGreaterThanOrEqual(8);

    // Every served topic maps to a real family or skill.
    const ids = new Set([...SKILLS.map((s) => s.id), 'tables', 'squares', 'complements-10', 'fraction-equivalents', 'percent-anchors']);
    for (const a of attempts) {
      const fam = a.factId !== undefined ? factFamilyOf(a.factId) : null;
      expect(ids.has(fam ?? a.skill)).toBe(true);
    }
  });
});
