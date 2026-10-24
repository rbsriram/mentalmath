import { describe, expect, it } from 'vitest';
import {
  familyAccuracyFromReport,
  familyAccuracyFromState,
  recentMedianP90,
  weakAreas,
} from '../src/lib/learn/progress';
import { buildReport, type BenchmarkItem } from '../src/lib/learn/benchmark';
import { newState, type State } from '../src/lib/learn/state';
import { newRec, type Rec } from '../src/lib/learn/model';
import type { Attempt } from '../src/lib/learn/attempt';

const DAY = 24 * 60 * 60 * 1000;
const T0 = new Date(2025, 0, 10, 9, 0, 0).getTime();

const rec = (attempts: number, recent: (0 | 1)[], stability = 1): Rec => ({
  ...newRec(),
  attempts,
  correct: recent.filter((x) => x === 1).length,
  stability,
  recent,
  lastSeen: T0,
  firstSeen: T0 - DAY,
});

const item = (skill: string, correct: boolean): BenchmarkItem => ({
  slot: -1,
  templateId: 't',
  band: 1,
  skill,
  correct,
  ms: 1000,
  transfer: false,
});

describe('familyAccuracyFromReport', () => {
  it('aggregates report items by family', () => {
    const items: BenchmarkItem[] = [
      item('add-left-to-right', true), // family 2
      item('sub-left-to-right', false), // family 2
      item('mul-2x2', true), // family 3
      item('mul-2x2', true), // family 3
    ];
    const report = buildReport(items, [], 'baseline', 0, T0);
    const fam = familyAccuracyFromReport(report);
    expect(fam.get(2)).toBe(0.5);
    expect(fam.get(3)).toBe(1);
  });
});

describe('familyAccuracyFromState', () => {
  it('averages recentAcc over practiced skills in each family', () => {
    const state: State = {
      ...newState(T0),
      skills: {
        'add-left-to-right': rec(5, [1, 1, 1, 1]), // fam 2, acc 1
        'sub-left-to-right': rec(5, [1, 0, 1, 0]), // fam 2, acc 0.5
        'mul-2x2': rec(5, [0, 0, 0, 0]), // fam 3, acc 0
        'mul-2x1-x': rec(5, [1]), // unknown id: ignored
      },
    };
    const fam = familyAccuracyFromState(state);
    expect(fam.get(2)).toBe(0.75);
    expect(fam.get(3)).toBe(0);
  });
});

describe('weakAreas', () => {
  it('returns the 5 weakest practiced skills, ties by stability', () => {
    const skills: Record<string, Rec> = {};
    const ids = [
      'add-left-to-right',
      'sub-left-to-right',
      'mul-2x2',
      'mul-by-11',
      'div-reverse',
      'pct-of',
      'ratio-split',
    ];
    const accs: (0 | 1)[][] = [
      [0, 0, 0, 0],
      [1, 1, 0, 0],
      [0, 0, 0, 0],
      [1, 1, 1, 0],
      [0, 0, 0, 0],
      [1, 1, 1, 1],
      [1, 0, 1, 0],
    ];
    ids.forEach((id, i) => {
      skills[id] = rec(4, accs[i]!, id === 'mul-2x2' ? 0.4 : 2);
    });
    const weak = weakAreas({ ...newState(T0), skills });
    expect(weak.length).toBe(5);
    // The three acc-0 skills first; mul-2x2 (stability 0.4) before the others.
    expect(weak[0]!.id).toBe('mul-2x2');
    expect(weak.every((w) => w.acc < 1)).toBe(true);
    expect(weak.map((w) => w.id)).not.toContain('pct-of');
  });
});

describe('recentMedianP90', () => {
  const att = (ts: number, ms: number, correct = true): Attempt => ({
    ts,
    templateId: 't',
    seed: 1,
    band: 1,
    skill: 's',
    correct,
    ms,
    given: 'x',
    prompt: 'p',
    answer: 'a',
    phase: 'practice',
  });

  it('uses only correct attempts inside the window', () => {
    const attempts = [
      att(T0 - 10 * DAY, 100), // outside
      att(T0 - DAY, 200, false), // wrong: excluded
      att(T0 - DAY, 300),
      att(T0, 400),
      att(T0, 600),
    ];
    const { median, p90 } = recentMedianP90(attempts, T0 + DAY);
    expect(median).toBe(400);
    expect(p90).toBe(600);
  });

  it('is null when there is nothing recent', () => {
    expect(recentMedianP90([att(T0 - 10 * DAY, 100)], T0).median).toBeNull();
    expect(recentMedianP90([], T0).p90).toBeNull();
  });
});
