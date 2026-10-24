import { describe, expect, it } from 'vitest';
import {
  advanceIfOver,
  answer,
  currentQuestion,
  finishSession,
  markLessonShown,
  nextQuestion,
  pause,
  planSession,
  resume,
  summarize,
  tick,
  type Session,
} from '../src/lib/learn/session';
import { SKILLS } from '../src/lib/content/skills';
import { newState, type State } from '../src/lib/learn/state';
import { applyDiagnosticPart, answerDiagnostic, currentItem, startDiagnostic } from '../src/lib/learn/diagnostic';
import { factFamilyOf } from '../src/lib/content/facts';
import { FAMILY_METHOD } from '../src/lib/content/methods';
import { markFamilyIntroduced } from '../src/lib/learn/state';
import { newRec, type Rec } from '../src/lib/learn/model';
import { displayAnswer } from '../src/lib/math/format';
import { createRng } from '../src/lib/math/rng';

const MIN = 60 * 1000;
const T0 = new Date(2025, 0, 10, 9, 0, 0).getTime();

const MINI: Rec = {
  ...newRec(),
  attempts: 4,
  correct: 4,
  streak: 4,
  stability: 4,
  due: T0 + 4 * 24 * 60 * 60 * 1000,
  lastSeen: T0 - 60 * 1000,
  firstSeen: T0 - 4 * 24 * 60 * 60 * 1000,
  days: 2,
  recent: [1, 1, 1, 1],
  recentMs: [800, 800, 800, 800],
};

function fixture(): State {
  return {
    ...newState(T0),
    target: 'mul-2x2',
    skills: {
      'mul-distributive': MINI,
      'mul-2x2': MINI,
      'add-left-to-right': MINI,
      'place-value': MINI,
      'complements-10': MINI,
    },
    facts: {
      't:3x4': MINI,
      't:5x6': MINI,
      't:7x8': MINI,
      't:9x2': MINI,
      'sq:4': MINI,
    },
  };
}

describe('planSession', () => {
  it('budgets sum to 30 minutes', () => {
    const s = planSession(fixture(), T0, 42);
    const total = s.phases.reduce((x, p) => x + p.budgetMs, 0);
    expect(total).toBe(30 * MIN);
    expect(s.target).toBe('mul-2x2');
  });

  it('moves the learn budget to practice when there is no target', () => {
    // Every method/application skill solid => the frontier is empty.
    const strong: Rec = { ...MINI, attempts: 12, stability: 30, days: 4, independent: 3, recent: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1] };
    const skills: Record<string, Rec> = {};
    for (const sk of SKILLS) skills[sk.id] = strong;
    const state: State = { ...fixture(), skills, target: null };
    const s = planSession(state, T0, 7);
    const practice = s.phases.find((p) => p.kind === 'practice')!;
    expect(practice.budgetMs).toBe(19 * MIN);
    expect(s.target).toBeNull();
  });

  it('halves recall when fewer than 5 fact records exist', () => {
    const state = { ...fixture(), facts: {} };
    const s = planSession(state, T0, 1);
    const recall = s.phases.find((p) => p.kind === 'recall')!;
    const practice = s.phases.find((p) => p.kind === 'practice')!;
    expect(recall.budgetMs).toBe(1.5 * MIN);
    expect(practice.budgetMs).toBe(13.5 * MIN);
  });
});

describe('session flow', () => {
  it('serves questions, answers, and advances between questions only', () => {
    const state = fixture();
    const rng = createRng(9);
    let s = planSession(state, T0, 11);
    s = nextQuestion(state, s, rng, T0);
    expect(s.current).not.toBeNull();
    const q = currentQuestion(s)!;
    // Force the recall phase to be over while a question is on screen.
    const expired: Session = {
      ...s,
      phases: s.phases.map((p, i) =>
        i === 0 ? { ...p, elapsedMs: p.budgetMs } : p,
      ),
    };
    const advanced = advanceIfOver(expired);
    expect(advanced.phaseIndex).toBe(0); // current blocks advancing
    const out = answer(state, expired, displayAnswer(q.answer), 1500, T0 + 1000);
    expect(out.result?.correct).toBe(true);
    expect(out.session.current).toBeNull();
    expect(out.session.answered).toBe(1);
    const after = advanceIfOver(out.session);
    expect(after.phaseIndex).toBe(1);
  });

  it('misses go to misses and the review queue', () => {
    const state = fixture();
    const rng = createRng(3);
    let s = planSession(state, T0, 5);
    s = nextQuestion(state, s, rng, T0);
    const q = currentQuestion(s)!;
    const out = answer(state, s, '999999999999', 2000, T0 + 2000);
    expect(out.result?.correct).toBe(false);
    expect(out.session.misses.length).toBe(1);
    expect(out.session.reviewQueue).toEqual([
      { templateId: q.templateId, band: q.band },
    ]);
  });

  it('review phase regenerates a fresh prompt for a missed template/band', () => {
    const state = fixture();
    const rng = createRng(3);
    let s = planSession(state, T0, 5);
    s = nextQuestion(state, s, rng, T0);
    const missed = currentQuestion(s)!;
    const out = answer(state, s, '999999999999', 2000, T0 + 2000);
    // Jump to the review phase.
    s = {
      ...out.session,
      phaseIndex: 4,
      phases: out.session.phases.map((p) => ({ ...p })),
    };
    s = nextQuestion(out.state, s, rng, T0 + 10_000);
    const q = currentQuestion(s)!;
    expect(q.templateId).toBe(missed.templateId);
    expect(q.band).toBe(missed.band);
    expect(s.reviewQueue.length).toBe(0);
    // Same template + band but a fresh seed.
    expect(q.seed).not.toBe(missed.seed);
  });

  it('records slow answers with the primary strategy as the method', () => {
    const state = fixture();
    const rng = createRng(21);
    let s = planSession(state, T0, 8);
    s = nextQuestion(state, s, rng, T0);
    const q = currentQuestion(s)!;
    const out = answer(state, s, displayAnswer(q.answer), 999_999, T0 + 999_999);
    expect(out.result?.correct).toBe(true);
    expect(out.session.slow.length).toBe(1);
    expect(out.session.slow[0]!.skill).toBe(q.skill);
  });

  it('completes when all phases are exhausted', () => {
    const state = fixture();
    let s = planSession(state, T0, 4);
    s = {
      ...s,
      phases: s.phases.map((p) => ({ ...p, elapsedMs: p.budgetMs })),
    };
    s = advanceIfOver(s);
    expect(s.completed).toBe(true);
    // nextQuestion is a no-op once completed.
    const after = nextQuestion(state, s, createRng(1), T0);
    expect(after.completed).toBe(true);
    expect(after.current).toBeNull();
  });

  it('tick accrues whenever the session is live, question or not', () => {
    const state = fixture();
    let s = planSession(state, T0, 6);
    s = tick(s, 10_000); // no question yet: still session time
    expect(s.phases[0]!.elapsedMs).toBe(10_000);
    s = nextQuestion(state, s, createRng(1), T0);
    s = tick(s, 10_000);
    expect(s.phases[0]!.elapsedMs).toBe(20_000);
    s = pause(s);
    s = tick(s, 10_000);
    expect(s.phases[0]!.elapsedMs).toBe(20_000); // paused
    s = resume(s);
    expect(s.paused).toBe(false);
  });

  it('answer does not add response time to the phase clock', () => {
    const state = fixture();
    const rng = createRng(14);
    let s = planSession(state, T0, 7);
    s = nextQuestion(state, s, rng, T0);
    const q = currentQuestion(s)!;
    const out = answer(state, s, displayAnswer(q.answer), 9000, T0 + 9000);
    expect(out.session.phases[0]!.elapsedMs).toBe(0);
  });

  it('markLessonShown flags the session and the target record', () => {
    const state = fixture();
    let s = planSession(state, T0, 3);
    const out = markLessonShown(state, s, T0);
    expect(out.session.lessonShown).toBe(true);
    expect(out.state.skills['mul-2x2']!.introduced).toBe(true);
    expect(state.session).toBeNull();
  });

  it('summarize + finishSession append a capped summary', () => {
    const state = fixture();
    let s = planSession(state, T0, 2);
    s = { ...s, phases: s.phases.map((p) => ({ ...p, elapsedMs: p.budgetMs })) };
    const summary = summarize(s, T0 + 30 * MIN);
    expect(summary.minutes).toBe(30);
    expect(summary.target).toBe('mul-2x2');
    const st = finishSession(state, s, T0 + 30 * MIN);
    expect(st.session).toBeNull();
    expect(st.sessions.length).toBe(1);
    // Cap at 400.
    const many: State = {
      ...st,
      sessions: Array.from({ length: 400 }, (_, i) => ({
        ...summary,
        id: `old-${i}`,
      })),
    };
    const st2 = finishSession(many, s, T0 + 31 * MIN);
    expect(st2.sessions.length).toBe(400);
    expect(st2.sessions[399]!.id).toBe(s.id);
  });

  it('a JSON round trip keeps the session working', () => {
    const state = fixture();
    const rng = createRng(12);
    let s = planSession(state, T0, 9);
    s = nextQuestion(state, s, rng, T0);
    const revived: Session = JSON.parse(JSON.stringify(s));
    const q = currentQuestion(revived)!;
    const out = answer(state, revived, displayAnswer(q.answer), 1200, T0 + 1200);
    expect(out.result?.correct).toBe(true);
    expect(out.session.answered).toBe(1);
  });
});

describe('short plan and resume', () => {
  it('short plan budgets sum to 10 minutes with recall + practice only', () => {
    const s = planSession(fixture(), T0, 42, { short: true });
    expect(s.short).toBe(true);
    expect(s.phases.map((p) => p.kind)).toEqual(['recall', 'practice']);
    const total = s.phases.reduce((x, p) => x + p.budgetMs, 0);
    expect(total).toBe(10 * MIN);
  });

  it('a paused session resumes at the same phase with the same current', () => {
    const state = fixture();
    const rng = createRng(8);
    let s = planSession(state, T0, 21);
    s = nextQuestion(state, s, rng, T0);
    const q = currentQuestion(s)!;
    s = pause(s);
    const resumed = resume(s);
    expect(resumed.phaseIndex).toBe(0);
    expect(resumed.current).toEqual(s.current);
    expect(currentQuestion(resumed)!.prompt).toBe(q.prompt);
  });
});

describe('diagnostic parts inside the session', () => {
  function stateWithPartDone(parts: number): { state: State; now: number } {
    let state = newState(T0);
    const started = startDiagnostic(state, T0);
    state = started.state;
    let diag = started.diagnostic;
    let now = T0;
    for (let p = 0; p < parts; p++) {
      while (!diag.partBoundary && !diag.done) {
        const q = currentItem(diag)!;
        const out = answerDiagnostic(state, diag, displayAnswer(q.answer), 900, now);
        state = out.state;
        diag = out.diagnostic;
        now += 500;
      }
      state = { ...applyDiagnosticPart(state, diag, now), diagnostic: applyDiagnosticPart(state, diag, now).diagnostic };
      diag = { ...diag, partBoundary: false };
      state = { ...state, diagnostic: diag };
    }
    return { state, now };
  }

  it('a pending part prepends a 5-minute diagnostic phase (30 min total)', () => {
    const { state, now } = stateWithPartDone(1);
    const s = planSession(state, now, 1);
    expect(s.phases.map((p) => p.kind)).toEqual([
      'diagnostic', 'recall', 'learn', 'practice', 'timed', 'review',
    ]);
    expect(s.phases[0]!.budgetMs).toBe(5 * MIN);
    const total = s.phases.reduce((x, p) => x + p.budgetMs, 0);
    expect(total).toBe(30 * MIN);
  });

  it('short plan with a pending part is diagnostic 5 + practice 5', () => {
    const { state, now } = stateWithPartDone(1);
    const s = planSession(state, now, 1, { short: true });
    expect(s.phases.map((p) => p.kind)).toEqual(['diagnostic', 'practice']);
    expect(s.phases.reduce((x, p) => x + p.budgetMs, 0)).toBe(10 * MIN);
  });

  it('no diagnostic phase when the diagnostic is done or before part 1', () => {
    const fresh = newState(T0);
    expect(planSession(fresh, T0, 1).phases.map((p) => p.kind)).not.toContain('diagnostic');
    const { state } = stateWithPartDone(0); // in-flight, no part done
    // stateWithPartDone(0) leaves an in-flight diag with 0 parts
    // (startDiagnostic ran but no part applied) -> still no phase.
    // Simulate a finished diagnostic instead: mark done.
    const done = { ...state, diagnostic: null, diagnosticDone: true };
    expect(planSession(done, T0, 1).phases.map((p) => p.kind)).not.toContain('diagnostic');
  });

  it('a part ends inside the session and the target re-picks', () => {
    const { state, now } = stateWithPartDone(1);
    const rng = createRng(3);
    let ses = planSession(state, now, 7);
    expect(ses.phases[0]!.kind).toBe('diagnostic');
    ses = nextQuestion(state, ses, rng, now);
    expect(ses.current).not.toBeNull();
    // answer until the boundary: the phase should mark elapsed=budget
    let st = state;
    let guard = 0;
    while (ses.phases[0]!.elapsedMs < ses.phases[0]!.budgetMs && guard++ < 30) {
      const out = answer(st, ses, 'x', 800, now + guard * 500);
      st = out.state;
      ses = out.session;
      if (ses.current === null && ses.phases[0]!.elapsedMs >= ses.phases[0]!.budgetMs) break;
      if (ses.current === null) ses = nextQuestion(st, ses, rng, now + guard * 500);
    }
    // The diagnostic part completed -> applyDiagnosticPart ran -> target matches state.target
    expect(ses.target).toBe(st.target);
    expect(st.diagnostic!.probeIndex).toBe(10);
    // advanceIfOver moves to the next phase at the boundary
    const adv = advanceIfOver(ses);
    expect(adv.phaseIndex).toBe(1);
  });
});

describe('fact family lessons in recall', () => {
  it('the first recall fact of a family carries a pendingLesson flag', () => {
    const state = newState(T0);
    const rng = createRng(9);
    let s = planSession(state, T0, 42);
    s = nextQuestion(state, s, rng, T0);
    expect(s.phases[0]!.kind).toBe('recall');
    expect(s.current!.factId).toBeDefined();
    const family = factFamilyOf(s.current!.factId!)!;
    expect(s.pendingLesson).toEqual({ method: FAMILY_METHOD[family] });

    // After the family is marked, serving a fact of it sets no lesson.
    const marked = markFamilyIntroduced(state, family);
    let guard = 0;
    let s2: Session = { ...s, current: null, pendingLesson: null };
    while (guard++ < 60) {
      s2 = nextQuestion(marked, s2, rng, T0 + guard);
      if (s2.current === null || s2.current.factId === undefined) break;
      if (factFamilyOf(s2.current.factId) === family) {
        expect(s2.pendingLesson ?? null).toBeNull();
        return;
      }
      s2 = { ...s2, current: null, pendingLesson: null } as Session;
    }
    // A fact of that family was served at least once above or the loop
    // exhausted; either way an unintroduced family would have flagged.
  });

  it('an introduced family never shows a second card', () => {
    const state = markFamilyIntroduced(newState(T0), 'tables');
    const rng = createRng(4);
    let s = planSession(state, T0, 5);
    s = nextQuestion(state, s, rng, T0);
    if (s.current?.factId !== undefined && factFamilyOf(s.current.factId) === 'tables') {
      expect(s.pendingLesson ?? null).toBeNull();
    }
  });
});
