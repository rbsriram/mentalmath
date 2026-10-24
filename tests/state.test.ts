import { describe, expect, it } from 'vitest';
import { migrate, newState, recFor, recordOutcome, type State } from '../src/lib/learn/state';
import { generate, generateFact } from '../src/lib/engine/registry';
import { displayAnswer } from '../src/lib/math/format';

const T0 = new Date(2025, 0, 10, 9, 0, 0).getTime();

describe('newState and migrate', () => {
  it('builds a versioned empty document', () => {
    const s = newState(T0);
    expect(s.version).toBe(2);
    expect(s.createdAt).toBe(T0);
    expect(s.skills).toEqual({});
    expect(s.facts).toEqual({});
    expect(s.sessions).toEqual([]);
    expect(s.benchmarks).toEqual([]);
    expect(s.diagnosticDone).toBe(false);
    expect(s.settings.theme).toBe('light');
  });

  it('migrate accepts a valid v1 document', () => {
    const s = newState(T0);
    const round = migrate(JSON.parse(JSON.stringify(s)));
    expect(round.version).toBe(2);
    expect(round.createdAt).toBe(T0);
  });

  it('migrate rejects garbage with unsupported export', () => {
    for (const bad of [
      null,
      42,
      'text',
      [],
      { version: 'one' },
      { version: 0, createdAt: 1, skills: {}, facts: {}, sessions: [], benchmarks: [], diagnosticDone: false, settings: {} },
      { version: 99, createdAt: 1, skills: {}, facts: {}, sessions: [], benchmarks: [], diagnosticDone: false, settings: {} },
      { version: 1, createdAt: 'x', skills: {}, facts: {}, sessions: [], benchmarks: [], diagnosticDone: false, settings: {} },
      { version: 1, createdAt: 1, skills: [], facts: {}, sessions: [], benchmarks: [], diagnosticDone: false, settings: {} },
    ]) {
      expect(() => migrate(bad), JSON.stringify(bad)).toThrow('unsupported export');
    }
  });
});

describe('recFor and recordOutcome', () => {
  it('recFor lazily creates records inside the state', () => {
    const s = newState(T0);
    const r = recFor(s, 'skills', 'mul-2x2');
    expect(r.attempts).toBe(0);
    expect(s.skills['mul-2x2']).toBeDefined();
  });

  it('recordOutcome updates the primary skill, secondary skills, and the fact', () => {
    const state = newState(T0);
    const q = generateFact('mul-table-fact', 't:7x8', 5);
    expect(q.factId).toBe('t:7x8');
    const raw = displayAnswer(q.answer);
    const out = recordOutcome(state, q, raw, 1200, T0, 'practice', { sessionId: 's1' });
    expect(out.result.correct).toBe(true);
    expect(out.state.skills['tables-1-10']!.attempts).toBe(1);
    expect(out.state.skills['tables-11-15']!.attempts).toBe(1); // secondary tag
    expect(out.state.facts['t:7x8']!.attempts).toBe(1);
    expect(out.state.facts['t:7x8']!.stability).toBe(1);
    // The input state is untouched.
    expect(state.skills['tables-1-10']).toBeUndefined();
    expect(state.facts['t:7x8']).toBeUndefined();
    // Attempt shape.
    expect(out.attempt.skill).toBe('tables-1-10');
    expect(out.attempt.factId).toBe('t:7x8');
    expect(out.attempt.answer).toBe(raw);
    expect(out.attempt.phase).toBe('practice');
    expect(out.attempt.sessionId).toBe('s1');
  });

  it('a wrong answer counts against every tracked record', () => {
    const state = newState(T0);
    const q = generate('pct-of', 3, 1);
    const out = recordOutcome(state, q, 'zz', 4000, T0, 'practice', {});
    expect(out.result.correct).toBe(false);
    expect(out.state.skills['pct-of']!.streak).toBe(0);
    for (const s of q.skills) {
      expect(out.state.skills[s]!.attempts).toBe(1);
    }
  });
});

describe('version 2 migration', () => {
  it('a v1 document with system theme migrates to v2 light', () => {
    const v1 = { ...newState(T0), version: 1, settings: { theme: 'system' } };
    const doc = migrate(v1);
    expect(doc.version).toBe(2);
    expect(doc.settings.theme).toBe('light');
  });

  it('a v1 document with dark theme keeps dark', () => {
    const v1 = { ...newState(T0), version: 1, settings: { theme: 'dark' } };
    const doc = migrate(v1);
    expect(doc.settings.theme).toBe('dark');
  });

  it('a v2 document passes through untouched', () => {
    const s = newState(T0);
    const doc = migrate(s);
    expect(doc.version).toBe(2);
    expect(doc.settings.theme).toBe('light');
  });
});
