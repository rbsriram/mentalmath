import { describe, expect, it } from 'vitest';
import {
  chooseTarget,
  dependents,
  frontier,
  pickMixed,
  pickFactInFamily,
  unlocked,
  type Bucket,
} from '../src/lib/learn/scheduler';
import { generate } from '../src/lib/engine/registry';
import { newState, type State } from '../src/lib/learn/state';
import { newRec, type Rec } from '../src/lib/learn/model';
import { createRng, seedFor } from '../src/lib/math/rng';

const DAY = 24 * 60 * 60 * 1000;
const T0 = new Date(2025, 0, 10, 12, 0, 0).getTime();

// A record at a chosen status for fixtures.
function makeRec(over: Partial<Rec>): Rec {
  return { ...newRec(), ...over };
}

const solidRec = (): Rec =>
  makeRec({
    attempts: 10,
    correct: 10,
    streak: 10,
    stability: 30,
    due: T0 + 30 * DAY,
    lastSeen: T0 - DAY,
    firstSeen: T0 - 10 * DAY,
    days: 5,
    lastDay: 'x',
    recent: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
    recentMs: [1000, 1000, 1000, 1000, 1000],
    level: 1,
    introduced: true,
    independent: 3,
  });

const knownRec = (): Rec =>
  makeRec({
    attempts: 4,
    correct: 4,
    streak: 4,
    stability: 4,
    due: T0 + 4 * DAY,
    lastSeen: T0 - DAY,
    firstSeen: T0 - 4 * DAY,
    days: 2,
    recent: [1, 1, 1, 1],
    recentMs: [1000, 1000, 1000, 1000],
    level: 0,
  });

const dueRec = (): Rec =>
  makeRec({
    attempts: 5,
    correct: 4,
    streak: 0,
    stability: 1,
    due: T0 - DAY,
    lastSeen: T0 - 2 * DAY,
    firstSeen: T0 - 6 * DAY,
    days: 3,
    recent: [1, 1, 1, 1, 0],
    recentMs: [2000],
    level: 1,
  });

const fragileRec = (): Rec =>
  makeRec({
    attempts: 3,
    correct: 1,
    streak: 0,
    stability: 0.3,
    due: T0 + DAY,
    lastSeen: T0 - DAY,
    firstSeen: T0 - 3 * DAY,
    days: 2,
    recent: [1, 0, 0],
    recentMs: [3000],
    level: 0,
  });

const learningRec = (): Rec =>
  makeRec({
    attempts: 5,
    correct: 5,
    streak: 5,
    stability: 2,
    due: T0 + 2 * DAY,
    lastSeen: T0,
    firstSeen: T0 - DAY,
    days: 2,
    recent: [1, 1, 1, 1, 1],
    recentMs: [1000],
    level: 0,
  });

describe('unlocking and the frontier', () => {
  it('mul-near-base stays locked until its prereqs are known', () => {
    const state = newState(T0);
    expect(unlocked(state, 'mul-near-base')).toBe(false);
    expect(unlocked(state, 'place-value')).toBe(true); // root skill
    const withPrereqs: State = {
      ...state,
      skills: {
        'complements-100': knownRec(),
        'mul-distributive': knownRec(),
      },
    };
    expect(unlocked(withPrereqs, 'mul-near-base')).toBe(true);
  });

  it('dependents computes the transitive closure', () => {
    const d = dependents('tables-1-10');
    expect(d).toContain('mul-2x2');
    expect(d).toContain('mul-near-base');
    expect(d).not.toContain('tables-1-10');
  });

  it('chooseTarget keeps an unlocked learning target', () => {
    const state: State = {
      ...newState(T0),
      target: 'mul-2x2',
      skills: {
        'mul-distributive': knownRec(),
        'mul-2x2': learningRec(),
      },
    };
    expect(chooseTarget(state)).toBe('mul-2x2');
    // A solid target is done: pick something else.
    const done: State = {
      ...state,
      skills: { ...state.skills, 'mul-2x2': solidRec() },
    };
    expect(chooseTarget(done)).not.toBe('mul-2x2');
  });

  it('frontier prefers high-impact dependents and skips solid skills', () => {
    const state: State = {
      ...newState(T0),
      skills: {
        'place-value': knownRec(),
        'complements-10': knownRec(),
        'add-left-to-right': learningRec(),
        'add-grouping': solidRec(),
      },
    };
    const f = frontier(state);
    expect(f).toContain('add-left-to-right'); // unlocked method, learning
    expect(f).not.toContain('add-grouping'); // solid
    expect(f).not.toContain('mul-2x2'); // locked: mul-distributive untrained
  });
});

describe('mixed bucket mix', () => {
  function richState(): State {
    // due: add-left-to-right + a due fact; target: mul-near-base;
    // learning: add-grouping (attempted, not solid); newfact: fresh facts;
    // maintenance: solid/known skills.
    return {
      ...newState(T0),
      target: 'mul-near-base',
      skills: {
        'add-left-to-right': dueRec(),
        'add-grouping': learningRec(),
        'mul-distributive': knownRec(),
        'mul-near-base': learningRec(),
        'mul-2x2': solidRec(),
        'sub-left-to-right': knownRec(),
        'pct-build': knownRec(),
      },
      facts: {
        't:7x8': dueRec(),
      },
    };
  }
  const CTX = (i: number) => ({
    target: 'mul-near-base',
    recentPrompts: [] as string[],
    lastTemplateId: null,
    lastTopic: null,
    counter: i,
    nonce: 7,
  });

  it('hits every populated bucket over 2,000 picks', () => {
    const state = richState();
    const rng = createRng(42);
    const counts = new Map<Bucket, number>();
    for (let i = 0; i < 2000; i++) {
      const r = pickMixed(state, rng, T0, CTX(i));
      counts.set(r.bucket, (counts.get(r.bucket) ?? 0) + 1);
      expect(r.question.prompt.length).toBeGreaterThan(0);
    }
    const shares = (b: Bucket) => (counts.get(b) ?? 0) / 2000;
    expect(shares('due')).toBeGreaterThan(0.3);
    expect(shares('target')).toBeGreaterThan(0.1);
    expect(shares('learning')).toBeGreaterThan(0.02);
    expect(shares('newfact')).toBeGreaterThan(0.02);
    expect(shares('maintenance')).toBeGreaterThan(0.005);
  });

  it('avoids prompts in recentPrompts', () => {
    const state = richState();
    const rng = createRng(5);
    const seed = seedFor('practice', 7, 0, 0);
    const blocked = generate('mul-near-base', seed, 0).prompt;
    const r = pickMixed(state, rng, T0, {
      ...CTX(0),
      recentPrompts: [blocked],
    });
    expect(r.question.prompt).not.toBe(blocked);
  });

  it('a facts round serves only that family with factId', () => {
    const state: State = {
      ...newState(T0),
      facts: { 't:7x8': dueRec() },
    };
    const rng = createRng(9);
    for (let i = 0; i < 30; i++) {
      const r = pickFactInFamily(state, rng, T0, CTX(i), 'tables');
      expect(r.question.factId).toMatch(/^t:/);
    }
  });

  it('never repeats a topic when another exists', () => {
    const state = richState();
    const rng = createRng(13);
    let last: string | null = null;
    for (let i = 0; i < 30; i++) {
      const r = pickMixed(state, rng, T0, { ...CTX(i), lastTopic: last });
      expect(r.topic).not.toBe(last);
      last = r.topic;
    }
  });
});

describe('mixed due balance', () => {
  it('due skills are not starved by hundreds of due facts', () => {
    const facts: Record<string, ReturnType<typeof dueRec>> = {};
    for (let i = 1; i <= 200; i++) {
      facts[`t:${Math.min(15, (i % 14) + 1)}x${(i % 12) + 1}`] = dueRec();
    }
    const state: State = {
      ...newState(T0),
      skills: {
        'add-left-to-right': dueRec(),
        'sub-left-to-right': dueRec(),
      },
      facts,
    };
    const rng = createRng(77);
    let skillDue = 0;
    let factDue = 0;
    for (let i = 0; i < 300; i++) {
      const r = pickMixed(state, rng, T0, {
        target: null,
        recentPrompts: [],
        lastTemplateId: null,
        lastTopic: null,
        counter: i,
        nonce: 3,
      });
      if (r.bucket === 'due') {
        if (r.question.factId === undefined) skillDue++;
        else factDue++;
      }
    }
    const share = skillDue / (skillDue + factDue);
    expect(share).toBeGreaterThan(0.3);
    expect(share).toBeLessThan(0.7);
  });
});

describe('facts round due ordering', () => {
  it('a fact due at t=100 is due at now=200 and not at now=50', () => {
    const rec = { ...dueRec(), due: 100 };
    const state: State = {
      ...newState(T0),
      facts: { 't:3x4': rec },
    };
    const ctx = {
      target: null,
      recentPrompts: [] as string[],
      lastTemplateId: null,
      lastTopic: null,
      counter: 0,
      nonce: 1,
    };
    const rng = createRng(4);
    const at200 = pickFactInFamily(state, rng, 200, ctx, 'tables');
    expect(at200.question.factId).toBe('t:3x4');
    const ctx2 = { ...ctx, counter: 1 };
    const at50 = pickFactInFamily(state, rng, 50, ctx2, 'tables');
    expect(at50.question.factId).not.toBe('t:3x4');
  });
});
