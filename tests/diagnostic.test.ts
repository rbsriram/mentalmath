import { describe, expect, it } from 'vitest';
import {
  answerDiagnostic,
  applyDiagnosticPart,
  PART_LABELS,
  currentItem,
  finishDiagnostic,
  hasStartingPoint,
  partOf,
  partsDone,
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

describe('diagnostic in 4 parts', () => {
  // Run the diagnostic answering correctly up to a per-probe band cap,
  // stopping at each part boundary.
  function runUntilBoundary(state: State, diag: DiagnosticState, now: number, maxBand: number) {
    const attempts: Attempt[] = [];
    while (!diag.done && !diag.partBoundary) {
      const q = currentItem(diag)!;
      const good = q.band <= maxBand;
      const out = answerDiagnostic(state, diag, good ? displayAnswer(q.answer) : 'x', 1500, now);
      state = out.state;
      diag = out.diagnostic;
      attempts.push(out.attempt);
      now += 1000;
    }
    return { state, diag, attempts, now };
  }

  it('partOf and partsDone track probe progress', () => {
    expect(partOf(0)).toBe(0);
    expect(partOf(4)).toBe(0);
    expect(partOf(5)).toBe(1);
    expect(partOf(19)).toBe(3);
    let state = newState(T0);
    const { state: s0, diagnostic } = startDiagnostic(state, T0);
    state = s0;
    expect(partsDone(diagnostic)).toBe(0);
    let diag = diagnostic;
    let now = T0;
    ({ state, diag, now } = runUntilBoundary(state, diag, now, 3));
    expect(diag.partBoundary).toBe(true);
    expect(partsDone(diag)).toBe(1);
    expect(diag.probeIndex).toBe(5);
  });

  it('applyDiagnosticPart sets levels for probed skills only and is idempotent', () => {
    let state = newState(T0);
    const { state: s0, diagnostic } = startDiagnostic(state, T0);
    state = s0;
    let now = T0;
    let r = runUntilBoundary(state, diagnostic, now, 2);
    state = r.state;
    const diag = r.diag;
    const applied = applyDiagnosticPart(state, diag, r.now);
    // Probed skill got a level; unprobed skill untouched.
    expect(applied.skills['tables-1-10']!.level).toBe(2);
    expect(applied.skills['tables-1-10']!.stability).toBe(3);
    expect(applied.skills['pct-reverse']).toBeUndefined();
    // Same result twice.
    const again = applyDiagnosticPart(applied, diag, r.now);
    expect(again.skills['tables-1-10']!.due).toBe(applied.skills['tables-1-10']!.due);
    expect(again.target).toBe(applied.target);
    expect(hasStartingPoint(applied)).toBe(true);
  });

  it('hasStartingPoint is false before part 1 and true after', () => {
    const s0 = newState(T0);
    expect(hasStartingPoint(s0)).toBe(false);
    const { state: s1, diagnostic } = startDiagnostic(s0, T0);
    expect(hasStartingPoint(s1)).toBe(false);
    let { state, diag } = runUntilBoundary(s1, diagnostic, T0, 2);
    expect(hasStartingPoint({ ...state, diagnostic: diag })).toBe(true);
  });

  it('all four parts then finish produces baseline and diagnosticDone', () => {
    let state = newState(T0);
    const started = startDiagnostic(state, T0);
    state = started.state;
    let diag = started.diagnostic;
    let now = T0;
    const attempts: Attempt[] = [];
    let boundaries = 0;
    while (!diag.done) {
      const r = runUntilBoundary(state, diag, now, 2);
      state = r.state;
      diag = r.diag;
      attempts.push(...r.attempts);
      now = r.now;
      expect(diag.partBoundary || diag.done).toBe(true);
      boundaries++;
      if (!diag.done) {
        state = { ...applyDiagnosticPart(state, diag, now), diagnostic: diag };
        diag = { ...diag, partBoundary: false };
      }
    }
    expect(boundaries).toBe(4);
    const fin = finishDiagnostic(state, diag, attempts, now);
    expect(fin.state.diagnosticDone).toBe(true);
    expect(fin.state.baseline).not.toBeNull();
    expect(hasStartingPoint(fin.state)).toBe(true);
  });
});

describe('part labels', () => {
  it('each label maps to a part of 5 probes', () => {
    expect(PART_LABELS).toHaveLength(4);
    for (let i = 0; i < 4; i++) {
      expect(PROBES.slice(i * 5, i * 5 + 5)).toHaveLength(5);
    }
  });
});
