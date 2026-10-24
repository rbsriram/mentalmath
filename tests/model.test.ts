import { describe, expect, it } from 'vitest';
import {
  applyOutcome,
  isDue,
  isFragile,
  known,
  localDay,
  newRec,
  recentAcc,
  status,
  type Rec,
} from '../src/lib/learn/model';
import type { Band } from '../src/lib/engine/types';

const DAY = 24 * 60 * 60 * 1000;
const T0 = new Date(2025, 0, 10, 12, 0, 0).getTime(); // local noon

const ok = (ms = 2000, band: Band = 0, transfer = false) => ({
  correct: true,
  ms,
  band,
  now: 0,
  transfer,
  speedTargetMs: 5000,
});

const bad = (band: Band = 0) => ({
  correct: false,
  ms: 3000,
  band,
  now: 0,
  transfer: false,
  speedTargetMs: 5000,
});

const run = (rec: Rec, n: number, correct: boolean, ms = 2000, band: Band = 0, now = T0) => {
  for (let i = 0; i < n; i++) {
    rec = applyOutcome(rec, { correct, ms, band, now, transfer: false, speedTargetMs: 5000 });
  }
  return rec;
};

describe('stability and due', () => {
  it('grows 0 -> 1 -> 2.2 -> 4.84 on correct answers', () => {
    let r = newRec();
    r = applyOutcome(r, ok());
    expect(r.stability).toBe(1);
    r = applyOutcome(r, ok());
    expect(r.stability).toBeCloseTo(2.2);
    r = applyOutcome(r, ok());
    expect(r.stability).toBeCloseTo(4.84);
  });

  it('caps stability at 120 days', () => {
    let r = run(newRec(), 20, true);
    expect(r.stability).toBe(120);
  });

  it('wrong decays stability with a 0.25 floor and resets the streak', () => {
    let r = run(newRec(), 3, true);
    r = applyOutcome(r, { ...bad(), now: T0 });
    expect(r.stability).toBeCloseTo(4.84 * 0.3);
    expect(r.streak).toBe(0);
    r = run(r, 3, false);
    expect(r.stability).toBe(0.25);
  });

  it('sets due dates from stability', () => {
    let r = newRec();
    r = applyOutcome(r, { ...ok(), now: T0 });
    expect(r.due).toBe(T0 + 1 * DAY);
    r = applyOutcome(r, { ...bad(), now: T0 });
    expect(r.due).toBe(T0 + 0.25 * DAY);
  });
});

describe('status ladder', () => {
  it('stays learning after 7 fast correct answers in one day', () => {
    const r = run(newRec(), 7, true, 1000);
    expect(status(r)).toBe('learning'); // needs attempts >= 8 and days >= 2
  });

  it('becomes solid with 8 correct over two days and stability >= 3', () => {
    let r = run(newRec(), 4, true, 1000, 0, T0);
    r = run(r, 4, true, 1000, 0, T0 + DAY);
    expect(r.attempts).toBe(8);
    expect(r.days).toBe(2);
    expect(r.stability).toBeGreaterThanOrEqual(3);
    expect(status(r)).toBe('solid');
  });

  it('strong additionally needs independent >= 3 and days >= 3', () => {
    let r = run(newRec(), 5, true, 1000, 0, T0);
    r = run(r, 4, true, 1000, 0, T0 + DAY);
    r = run(r, 3, true, 1000, 0, T0 + 2 * DAY);
    // 12 attempts, 3 days, high stability - but no transfer credit yet.
    expect(status(r)).toBe('solid');
    for (let i = 0; i < 3; i++) {
      r = applyOutcome(r, {
        ...ok(1000, 0, true),
        now: T0 + 2 * DAY,
      });
    }
    expect(r.independent).toBe(3);
    expect(status(r)).toBe('strong');
  });
});

describe('level promotion and demotion', () => {
  it('promotes after streak 4 + acc + median speed at the working band', () => {
    const r = run(newRec(), 6, true, 1000, 0);
    expect(r.level).toBe(1);
    const r2 = run(r, 6, true, 1000, 1);
    expect(r2.level).toBe(2);
  });

  it('does not promote when answers are too slow', () => {
    const r = run(newRec(), 6, true, 99999, 0);
    expect(r.level).toBe(0);
  });

  it('does not promote when the band is above the working level', () => {
    let r = newRec();
    r = run(r, 6, true, 1000, 3); // answered at band 3 while level is 0
    expect(r.level).toBe(0);
  });

  it('demotes when recent accuracy drops below 0.5 at the working band', () => {
    let r = newRec();
    r = { ...r, level: 2 };
    r = run(r, 6, false, 1000, 2);
    expect(r.level).toBe(1);
  });

  it('a wrong stretch item above the level does not demote', () => {
    let r = newRec();
    r = { ...r, level: 2 };
    r = run(r, 6, false, 1000, 3); // band 3 misses while working at level 2
    expect(r.level).toBe(2);
  });

  it('does not demote at level 0', () => {
    const r = run(newRec(), 6, false);
    expect(r.level).toBe(0);
  });
});

describe('predicates', () => {
  it('known needs attempts >= 2 and (acc >= 0.8 or level >= 1)', () => {
    expect(known(newRec())).toBe(false);
    expect(known(run(newRec(), 2, true))).toBe(true);
    const spotty = run(newRec(), 3, false);
    expect(known(spotty)).toBe(false);
    // Diagnostic staircase ending on a miss: acc < 0.8 but level >= 1.
    const diag = { ...spotty, level: 1 as const };
    expect(known(diag)).toBe(true);
  });

  it('isFragile covers low accuracy and low stability', () => {
    expect(isFragile(newRec())).toBe(false);
    const weak = run(newRec(), 2, false);
    expect(isFragile(weak)).toBe(true);
    const stable = run(newRec(), 3, true, 1000);
    expect(isFragile(stable)).toBe(false);
  });

  it('isDue needs attempts and due <= now', () => {
    expect(isDue(newRec(), T0)).toBe(false);
    const r = applyOutcome(newRec(), { ...ok(), now: T0 - 2 * DAY });
    expect(isDue(r, T0)).toBe(true);
    const fresh = applyOutcome(newRec(), { ...ok(), now: T0 });
    expect(isDue(fresh, T0)).toBe(false);
  });
});

describe('local days', () => {
  it('counts distinct local calendar days', () => {
    let r = newRec();
    const late = new Date(2025, 0, 10, 23, 59).getTime();
    const early = new Date(2025, 0, 11, 0, 1).getTime();
    r = applyOutcome(r, { ...ok(), now: late });
    r = applyOutcome(r, { ...ok(), now: early });
    expect(r.days).toBe(2);
    expect(r.lastDay).toBe(localDay(early));
  });

  it('localDay formats YYYY-MM-DD in local time', () => {
    const d = localDay(T0);
    expect(d).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('recentAcc', () => {
  it('is 0 on an empty record', () => {
    expect(recentAcc(newRec())).toBe(0);
  });
  it('means the last 10 outcomes', () => {
    const r = newRec();
    const half = { ...r, recent: [1, 0, 1, 0] as (0 | 1)[] };
    expect(recentAcc(half)).toBe(0.5);
  });
});
