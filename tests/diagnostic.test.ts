import { describe, expect, it } from 'vitest';
import {
  answerDiagnostic,
  currentItem,
  finishDiagnostic,
  PROBES,
  startDiagnostic,
  type DiagnosticState,
} from '../src/lib/learn/diagnostic';
import { newState, type State } from '../src/lib/learn/state';
import { displayAnswer } from '../src/lib/math/format';
import type { Attempt } from '../src/lib/learn/attempt';

const DAY = 24 * 60 * 60 * 1000;
const T0 = new Date(2025, 0, 10, 9, 0, 0).getTime();

function right(state: State, diag: DiagnosticState, now: number) {
  const q = currentItem(diag)!;
  return answerDiagnostic(state, diag, displayAnswer(q.answer), 1500, now);
}

describe('diagnostic staircase', () => {
  it('climbs 1 -> 2 -> 3 on correct answers, then moves to the next probe', () => {
    let state = newState(T0);
    const started = startDiagnostic(state, T0);
    state = started.state;
    let diag = started.diagnostic;
    expect(diag.band).toBe(1);
    let out = right(state, diag, T0);
    diag = out.diagnostic;
    state = out.state;
    expect(diag.band).toBe(2);
    expect(diag.probeIndex).toBe(0);
    out = right(state, diag, T0);
    diag = out.diagnostic;
    state = out.state;
    expect(diag.band).toBe(3);
    expect(diag.probeIndex).toBe(0);
    out = right(state, diag, T0);
    diag = out.diagnostic;
    expect(diag.probeIndex).toBe(1);
    expect(diag.band).toBe(1);
    expect(diag.itemIndex).toBe(0);
  });

  it('a wrong answer at band 1 gives one band-0 item, then moves on', () => {
    let state = newState(T0);
    const { state: s0, diagnostic: d0 } = startDiagnostic(state, T0);
    state = s0;
    let diag = d0;
    let out = answerDiagnostic(state, diag, 'zzz', 1000, T0); // wrong at band 1
    diag = out.diagnostic;
    state = out.state;
    expect(diag.band).toBe(0);
    expect(diag.probeIndex).toBe(0);
    // The band-0 item always ends the probe, correct or not.
    out = answerDiagnostic(state, diag, 'zzz', 1000, T0);
    diag = out.diagnostic;
    expect(diag.probeIndex).toBe(1);
    expect(diag.band).toBe(1);
  });

  it('a wrong answer at band 2 ends the probe', () => {
    let state = newState(T0);
    const started = startDiagnostic(state, T0);
    state = started.state;
    let diag = started.diagnostic;
    let out = right(state, diag, T0); // band1 correct
    diag = out.diagnostic;
    state = out.state;
    expect(diag.band).toBe(2);
    out = answerDiagnostic(state, diag, 'zzz', 1000, T0); // wrong at band 2
    diag = out.diagnostic;
    expect(diag.probeIndex).toBe(1);
    expect(diag.band).toBe(1);
  });

  it('an empty answer counts as a wrong skip', () => {
    let state = newState(T0);
    const started = startDiagnostic(state, T0);
    state = started.state;
    const out = answerDiagnostic(state, started.diagnostic, '', 500, T0);
    expect(out.result.correct).toBe(false);
    expect(out.result.reason).toBe('empty');
    expect(out.diagnostic.band).toBe(0); // fell to band 0
    expect(out.attempt.phase).toBe('diagnostic');
  });

  it('a full run produces between 20 and 60 items', () => {
    let state = newState(T0);
    const started = startDiagnostic(state, T0);
    state = started.state;
    let diag = started.diagnostic;
    const attempts: Attempt[] = [];
    let now = T0;
    while (!diag.done) {
      const q = currentItem(diag)!;
      // Alternate correct/wrong to exercise both staircase paths.
      const good = (diag.probeIndex + diag.itemIndex) % 3 !== 0;
      const raw = good ? displayAnswer(q.answer) : 'zzz';
      const out = answerDiagnostic(state, diag, raw, 1500, now);
      state = out.state;
      diag = out.diagnostic;
      attempts.push(out.attempt);
      now += 1000;
    }
    expect(diag.history.length).toBeGreaterThanOrEqual(PROBES.length);
    expect(diag.history.length).toBeLessThanOrEqual(60);

    const fin = finishDiagnostic(state, diag, attempts, now);
    state = fin.state;
    expect(state.diagnosticDone).toBe(true);
    expect(state.diagnostic).toBeNull();
    expect(state.baseline).not.toBeNull();
    expect(state.baseline!.kind).toBe('baseline');
    // Probed skills got a level; a probe with all-correct sits at 3.
    expect(state.skills['tables-1-10']).toBeDefined();
    expect(state.skills['tables-1-10']!.attempts).toBeGreaterThan(0);
    // Target picked from the graph.
    expect(state.target === null || typeof state.target === 'string').toBe(true);
  });

  it('finishDiagnostic sets stability/due for skills at level >= 1', () => {
    let state = newState(T0);
    const started = startDiagnostic(state, T0);
    state = started.state;
    let diag = started.diagnostic;
    // Probe 0: correct at bands 1, 2, 3 -> level 3, stability 3 days.
    const attempts: Attempt[] = [];
    let now = T0;
    for (let i = 0; i < 3; i++) {
      const out = right(state, diag, now);
      state = out.state;
      diag = out.diagnostic;
      attempts.push(out.attempt);
      now += 1000;
    }
    const fin = finishDiagnostic(state, diag, attempts, now);
    const rec = fin.state.skills['tables-1-10']!;
    expect(rec.level).toBe(3);
    expect(rec.stability).toBe(3);
    expect(rec.due).toBe(now + 3 * DAY);
  });
});
