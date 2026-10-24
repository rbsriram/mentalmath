import { describe, expect, it } from 'vitest';
import {
  chooseTarget,
  dependents,
  frontier,
  pickQuestion,
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

describe('practice bucket mix', () => {
  function richState(): State {
    // Every bucket non-empty:
    // - due: add-left-to-right (due, level 1) + a due fact
    // - fragile: complements-100 (fragile prereq of the target)
    // - target: mul-near-base (unlocked, learning)
    // - transfer: mul-2x2 solid
    // - maintenance: several unlocked skills with attempts
    return {
      ...newState(T0),
      target: 'mul-near-base',
      skills: {
        'add-left-to-right': dueRec(),
        'complements-100': fragileRec(),
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

  it('hits every bucket over 2,000 picks within +-5 points', () => {
    const state = richState();
    const rng = createRng(42);
    const counts = new Map<Bucket, number>();
    for (let i = 0; i < 2000; i++) {
      const r = pickQuestion(state, rng, T0, {
        phase: 'practice',
        target: state.target,
        recentPrompts: [],
        lastTemplateId: null,
        counter: i,
        nonce: 7,
      });
      counts.set(r.bucket, (counts.get(r.bucket) ?? 0) + 1);
      expect(r.question.prompt.length).toBeGreaterThan(0);
    }
    const shares = (b: Bucket) => (counts.get(b) ?? 0) / 2000;
    // All five buckets appear; target and due dominate as weighted.
    for (const b of ['due', 'fragile', 'target', 'transfer', 'maintenance'] as Bucket[]) {
      expect(shares(b), `bucket ${b}`).toBeGreaterThan(0.02);
    }
    // Rough proportions: target ~30%, due ~25%, fragile ~20%, transfer ~15%, maint ~10%.
    expect(Math.abs(shares('target') - 0.3)).toBeLessThan(0.06);
    expect(Math.abs(shares('due') - 0.25)).toBeLessThan(0.06);
    expect(Math.abs(shares('fragile') - 0.2)).toBeLessThan(0.06);
    expect(Math.abs(shares('transfer') - 0.15)).toBeLessThan(0.06);
    expect(Math.abs(shares('maintenance') - 0.1)).toBeLessThan(0.06);
  });

  it('redistributes weight when buckets are empty', () => {
    // Only maintenance candidates exist.
    const state: State = {
      ...newState(T0),
      skills: { 'add-left-to-right': knownRec() },
    };
    const rng = createRng(1);
    for (let i = 0; i < 50; i++) {
      const r = pickQuestion(state, rng, T0, {
        phase: 'practice',
        target: null,
        recentPrompts: [],
        lastTemplateId: null,
        counter: i,
        nonce: 3,
      });
      expect(r.bucket).toBe('maintenance');
    }
  });

  it('avoids prompts in recentPrompts', () => {
    const state = richState();
    const rng = createRng(5);
    // Force the first draw for the target bucket so we know what comes.
    const seed = seedFor('practice', 7, 0, 0);
    const blocked = generate('mul-near-base', seed, 0).prompt;
    const r = pickQuestion(state, rng, T0, {
      phase: 'practice',
      target: 'mul-near-base',
      recentPrompts: [blocked],
      lastTemplateId: null,
      counter: 0,
      nonce: 7,
    });
    expect(r.question.prompt).not.toBe(blocked);
  });

  it('recall serves only fact-family questions with factId', () => {
    const state: State = {
      ...newState(T0),
      facts: { 't:7x8': dueRec(), 'sq:12': dueRec() },
      target: 'mul-near-base',
      skills: { 'mul-near-base': learningRec(), 'complements-100': fragileRec(), 'mul-distributive': knownRec() },
    };
    const rng = createRng(9);
    for (let i = 0; i < 30; i++) {
      const r = pickQuestion(state, rng, T0, {
        phase: 'recall',
        target: state.target,
        recentPrompts: [],
        lastTemplateId: null,
        counter: i,
        nonce: 4,
      });
      expect(r.question.factId).toBeDefined();
      expect(['mul-table-fact', 'square-fact', 'complement', 'frac-to-dec-pct', 'pct-anchor']).toContain(
        r.question.templateId,
      );
    }
  });

  it('timed serves only reliable skills', () => {
    const state: State = {
      ...newState(T0),
      skills: {
        'mul-2x2': solidRec(),
        'mul-near-base': fragileRec(),
      },
    };
    const rng = createRng(11);
    for (let i = 0; i < 20; i++) {
      const r = pickQuestion(state, rng, T0, {
        phase: 'timed',
        target: null,
        recentPrompts: [],
        lastTemplateId: null,
        counter: i,
        nonce: 1,
      });
      expect(r.question.skill).toBe('mul-2x2');
    }
  });

  it('custom serves the given skills at the given band', () => {
    const state = newState(T0);
    const rng = createRng(3);
    for (let i = 0; i < 20; i++) {
      const r = pickQuestion(state, rng, T0, {
        phase: 'custom',
        target: null,
        recentPrompts: [],
        lastTemplateId: null,
        customSkills: ['mul-by-11'],
        customBand: 2,
        counter: i,
        nonce: 2,
      });
      expect(r.question.skill).toBe('mul-by-11');
      expect(r.question.band).toBe(2);
      expect(r.bucket).toBe('custom');
    }
  });

  it('does not repeat the same templateId twice in a row when it can avoid it', () => {
    // Two custom skills whose primary templates differ.
    const state = newState(T0);
    const rng = createRng(13);
    let last: string | null = 'add-two';
    for (let i = 0; i < 30; i++) {
      const r = pickQuestion(state, rng, T0, {
        phase: 'custom',
        target: null,
        recentPrompts: [],
        lastTemplateId: last,
        customSkills: ['add-left-to-right', 'sub-left-to-right'],
        customBand: 1,
        counter: i,
        nonce: 5,
      });
      expect(r.question.templateId).not.toBe(last);
      last = r.question.templateId;
    }
  });
});
