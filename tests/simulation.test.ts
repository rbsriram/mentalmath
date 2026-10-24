// Integration smoke test: a scripted learner through the diagnostic and
// three daily sessions. Deterministic seeds, no timers, no I/O.

import { describe, expect, it } from 'vitest';
import {
  answerDiagnostic,
  applyDiagnosticPart,
  currentItem,
  finishDiagnostic,
  partsDone,
  startDiagnostic,
  type DiagnosticState,
} from '../src/lib/learn/diagnostic';
import {
  answer,
  currentQuestion,
  finishSession,
  markLessonShown,
  nextQuestion,
  planSession,
  tick,
  type Session,
} from '../src/lib/learn/session';
import { frontier, practicable, unlocked } from '../src/lib/learn/scheduler';
import { newState, type State } from '../src/lib/learn/state';
import { SKILLS } from '../src/lib/content/skills';
import { displayAnswer } from '../src/lib/math/format';
import { createRng } from '../src/lib/math/rng';
import type { Attempt } from '../src/lib/learn/attempt';

const DAY = 24 * 60 * 60 * 1000;
const T0 = new Date(2025, 0, 10, 9, 0, 0).getTime();

describe('simulated learner', () => {
  it('diagnostic unlocks the graph, three sessions complete', () => {
    let state = newState(T0);
    const started = startDiagnostic(state, T0);
    state = started.state;
    let diag: DiagnosticState = started.diagnostic;
    const attempts: Attempt[] = [];
    let now = T0;

    // Learner: correct at band <= 2 for the first 14 probes, band <= 1 after.
    while (!diag.done) {
      const q = currentItem(diag)!;
      const maxBand = diag.probeIndex < 14 ? 2 : 1;
      const good = q.band <= maxBand;
      const out = answerDiagnostic(
        state,
        diag,
        good ? displayAnswer(q.answer) : 'x',
        2500,
        now,
      );
      state = out.state;
      diag = out.diagnostic;
      attempts.push(out.attempt);
      now += 1500;
    }
    state = finishDiagnostic(state, diag, attempts, now).state;

    expect(state.diagnosticDone).toBe(true);
    expect(state.target).not.toBeNull();
    const fr = frontier(state);
    expect(fr.length).toBeGreaterThan(0);
    // Diagnostic covered these via dependents: no need to teach them.
    expect(fr).not.toContain('mul-distributive');
    expect(fr).not.toContain('add-left-to-right');
    const unlockedCount = SKILLS.filter(
      (s) =>
        (s.kind === 'method' || s.kind === 'application') &&
        unlocked(state, s.id),
    ).length;
    expect(unlockedCount).toBeGreaterThanOrEqual(8);
    // place-value is untestable and therefore never gates.
    expect(practicable('place-value')).toBe(false);

    // Three daily sessions.
    const rng = createRng(20250110);
    for (let day = 0; day < 3; day++) {
      const dayStart = T0 + (day + 1) * DAY;
      let session: Session = planSession(state, dayStart, 1000 + day);
      state = { ...state, session };
      const dayAttemptsBefore = state.sessions.length;
      void dayAttemptsBefore;
      const visited = new Set<number>();
      let guard = 0;
      let t = dayStart;
      while (!session.completed && guard < 500) {
        guard++;
        if (session.current === null) {
          // Entering the learn phase: show the lesson once.
          const phase = session.phases[session.phaseIndex];
          if (phase?.kind === 'learn' && !session.lessonShown && session.target) {
            const marked = markLessonShown(state, session, t);
            state = marked.state;
            session = marked.session;
          }
          session = nextQuestion(state, session, rng, t);
          if (session.current === null) break; // completed
        }
        visited.add(session.phaseIndex);
        session = tick(session, 4000);
        const q = currentQuestion(session)!;
        const good = rng.next() < 0.85;
        const out = answer(
          state,
          session,
          good ? displayAnswer(q.answer) : 'x',
          4000,
          t,
        );
        state = out.state;
        session = out.session;
        attempts.push(out.attempt!);
        expect(out.attempt!.sessionId).toBe(session.id);
        expect(out.attempt!.phase).toBe(
          session.phases[Math.min(session.phaseIndex, 4)]!.kind,
        );
        t += 4000;
      }
      expect(session.completed).toBe(true);
      expect(visited.size).toBe(5); // every phase visited
      // At least one review question served from the queue.
      const reviewPhases = session.phases.filter((p) => p.kind === 'review');
      expect(reviewPhases[0]!.elapsedMs).toBeGreaterThan(0);
      const minutes = session.phases.reduce((x, p) => x + p.elapsedMs, 0) / 60000;
      expect(minutes).toBeGreaterThanOrEqual(25);
      expect(minutes).toBeLessThanOrEqual(35);
      const before = attempts.length - session.answered;
      expect(session.answered).toBeGreaterThan(0);
      void before;
      state = finishSession(state, session, t);
      expect(state.session).toBeNull();
      expect(state.sessions.length).toBe(day + 1);
      expect(state.sessions.at(-1)!.answered).toBe(session.answered);
    }
    expect(state.sessions.length).toBe(3);
  });
});

describe('diagnostic parts fold into sessions', () => {
  // Part 1 runs standalone, then parts 2-4 arrive as the first block of
  // the next daily sessions.
  function stateAfterPart1(): { state: State; attempts: Attempt[]; now: number } {
    let state = newState(T0);
    const started = startDiagnostic(state, T0);
    state = started.state;
    let diag = started.diagnostic;
    const attempts: Attempt[] = [];
    let now = T0;
    while (!diag.partBoundary && !diag.done) {
      const q = currentItem(diag)!;
      const out = answerDiagnostic(state, diag, displayAnswer(q.answer), 1500, now);
      state = out.state;
      diag = out.diagnostic;
      attempts.push(out.attempt);
      now += 800;
    }
    state = applyDiagnosticPart(state, diag, now);
    expect(partsDone(state.diagnostic!)).toBe(1);
    return { state, attempts, now };
  }

  it('a pending part runs as the first block, completes, re-picks target', () => {
    let { state, attempts, now } = stateAfterPart1();
    const rng = createRng(77);
    let session = planSession(state, now, 11);
    expect(session.phases[0]!.kind).toBe('diagnostic');
    session = nextQuestion(state, session, rng, now);
    expect(currentQuestion(session)).not.toBeNull();
    expect(session.phases[0]!.kind).toBe('diagnostic');

    // Answer until the part boundary lands.
    let guard = 0;
    while (partsDone(state.diagnostic!) === 1 && guard++ < 40) {
      const q = currentQuestion(session)!;
      const out = answer(state, session, displayAnswer(q.answer), 1500, now + guard * 700);
      state = out.state;
      session = out.session;
      attempts.push(out.attempt!);
      if (session.current === null) {
        if (session.phaseIndex > 0) break;
        session = nextQuestion(state, session, rng, now);
      }
    }
    expect(partsDone(state.diagnostic!)).toBe(2);
    // The phase ended right after the part and the target re-picked.
    expect(session.phases[0]!.elapsedMs).toBe(session.phases[0]!.budgetMs);
    expect(session.target).toBe(state.target);
  });

  it('a 5-minute budget mid-part resumes in the next plan', () => {
    let { state, attempts, now } = stateAfterPart1();
    const rng = createRng(5);
    let session = planSession(state, now, 3);
    session = nextQuestion(state, session, rng, now);
    // Two answers, then the budget runs out.
    for (let i = 0; i < 2; i++) {
      const q = currentQuestion(session)!;
      const out = answer(state, session, displayAnswer(q.answer), 1500, now + i * 700);
      state = out.state;
      session = out.session;
      attempts.push(out.attempt!);
      session = nextQuestion(state, session, rng, now);
    }
    session = tick(session, 300_000);
    // The item on screen still answers (the budget ends at a boundary).
    const q3 = currentQuestion(session)!;
    const out3 = answer(state, session, displayAnswer(q3.answer), 1500, now);
    state = out3.state;
    session = out3.session;
    attempts.push(out3.attempt!);
    session = nextQuestion(state, session, rng, now); // boundary: phase ends
    expect(session.phaseIndex).toBe(1);
    expect(state.diagnostic!.probeIndex).toBeGreaterThanOrEqual(5);
    const stillInFlight = state.diagnostic!;
    // Next day's plan puts the diagnostic block first again, same item.
    const next = planSession(state, now + DAY, 4);
    expect(next.phases[0]!.kind).toBe('diagnostic');
    const s2 = nextQuestion(state, next, rng, now);
    expect(currentQuestion(s2)!.prompt).toBe(currentItem(stillInFlight)!.prompt);
    void attempts;
  });

  it('parts 2-4 finish across sessions and the baseline is written', () => {
    let { state, attempts, now } = stateAfterPart1();
    const rng = createRng(99);
    let day = 0;
    while (!state.diagnosticDone && day++ < 10) {
      const dayStart = now + day * DAY;
      let session = planSession(state, dayStart, 100 + day);
      let guard = 0;
      while (!session.completed && guard++ < 400) {
        if (session.current === null) {
          const phase = session.phases[session.phaseIndex];
          if (phase?.kind === 'learn' && !session.lessonShown && session.target) {
            const marked = markLessonShown(state, session, dayStart);
            state = marked.state;
            session = marked.session;
          }
          session = nextQuestion(state, session, rng, dayStart);
          if (session.current === null) break;
        }
        const q = currentQuestion(session)!;
        const out = answer(state, session, displayAnswer(q.answer), 1200, dayStart + guard * 700);
        state = out.state;
        session = out.session;
        if (out.attempt) attempts.push(out.attempt);
        if (out.needsFinish) {
          const fin = finishDiagnostic(state, state.diagnostic!, attempts, dayStart);
          state = fin.state;
        }
        session = tick(session, 10_000);
      }
      state = finishSession(state, session, dayStart + guard * 10_000);
    }
    expect(state.diagnosticDone).toBe(true);
    expect(state.baseline).not.toBeNull();
    expect(state.sessions.length).toBeGreaterThanOrEqual(3);
  });
});
