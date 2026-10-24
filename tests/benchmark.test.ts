import { describe, expect, it } from 'vitest';
import {
  answerBenchmark,
  BENCHMARK_SLOTS,
  benchmarkDue,
  buildReport,
  currentBenchmarkItem,
  finishBenchmark,
  retention,
  startBenchmark,
  type BenchmarkItem,
} from '../src/lib/learn/benchmark';
import { newState, type State } from '../src/lib/learn/state';
import { displayAnswer } from '../src/lib/math/format';
import type { Attempt } from '../src/lib/learn/attempt';

const DAY = 24 * 60 * 60 * 1000;
const T0 = new Date(2025, 0, 10, 9, 0, 0).getTime();

describe('benchmark items', () => {
  it('has 39 slots: 15 classes x 2 bands + 6 transfer + 3 facts', () => {
    expect(BENCHMARK_SLOTS.length).toBe(39);
    expect(BENCHMARK_SLOTS.filter((s) => s.transfer).length).toBe(6);
    const classes = new Set(BENCHMARK_SLOTS.map((s) => s.cls));
    expect(classes.size).toBeGreaterThanOrEqual(15);
  });

  it('same month gives identical items; different months differ', () => {
    const mk = (month: number) =>
      BENCHMARK_SLOTS.map((_slot, i) => {
        const bench = { month, slotIndex: i, items: [], done: false };
        return currentBenchmarkItem(bench);
      });
    const m1a = mk(1).map((q) => q!.prompt);
    const m1b = mk(1).map((q) => q!.prompt);
    const m2 = mk(2).map((q) => q!.prompt);
    expect(m1a).toEqual(m1b);
    // Same slots and bands; most prompts differ.
    const same = m1a.filter((p, i) => p === m2[i]).length;
    expect(same).toBeLessThan(m1a.length / 2);
  });

  it('a full benchmark run produces a report', () => {
    let state: State = { ...newState(T0), diagnosticDone: true };
    const started = startBenchmark(state, T0);
    state = started.state;
    let bench = started.benchmark;
    expect(bench.month).toBe(1);
    const attempts: Attempt[] = [];
    let now = T0;
    let i = 0;
    while (!bench.done) {
      const q = currentBenchmarkItem(bench)!;
      const raw = i % 4 === 0 ? 'zzz' : displayAnswer(q.answer); // 75% correct
      const out = answerBenchmark(state, bench, raw, 2000 + i, now);
      state = out.state;
      bench = out.benchmark;
      attempts.push(out.attempt);
      expect(out.attempt.phase).toBe('benchmark');
      i++;
      now += 1000;
    }
    expect(bench.items.length).toBe(39);
    const fin = finishBenchmark(state, bench, attempts, now);
    state = fin.state;
    expect(state.benchmarks.length).toBe(1);
    const r = fin.report;
    expect(r.accuracy).toBeCloseTo(0.75, 1);
    expect(r.medianMs).not.toBeNull();
    expect(r.transferAccuracy).not.toBeNull();
    expect(r.kind).toBe('monthly');
  });
});

describe('buildReport stats', () => {
  const item = (over: Partial<BenchmarkItem>): BenchmarkItem => ({
    slot: 0,
    templateId: 't',
    band: 1,
    skill: 's',
    correct: true,
    ms: 1000,
    transfer: false,
    ...over,
  });

  it('computes median, p90, per-skill, per-band, classesReliable', () => {
    const items: BenchmarkItem[] = [
      item({ ms: 100, skill: 'a', band: 1, slot: 0 }),
      item({ ms: 300, skill: 'a', band: 1, slot: 1 }),
      item({ ms: 200, skill: 'b', band: 2, slot: 2, correct: false }),
      item({ ms: 900, skill: 'b', band: 2, slot: 3, transfer: true }),
    ];
    const r = buildReport(items, [], 'monthly', 1, T0);
    expect(r.accuracy).toBe(0.75);
    expect(r.medianMs).toBe(300); // correct items: 100, 300, 900
    expect(r.p90Ms).toBe(900);
    expect(r.accuracyBySkill['a']).toBe(1);
    expect(r.accuracyBySkill['b']).toBe(0.5);
    expect(r.accuracyByBand[1]).toBe(1);
    expect(r.accuracyByBand[2]).toBe(0.5);
    expect(r.transferAccuracy).toBe(1);
    // Slot 0,1 both correct (class 1) -> reliable; slot 2 has a wrong -> not.
    expect(r.classesReliable).toBe(1);
  });

  it('null stats on empty items', () => {
    const r = buildReport([], [], 'monthly', 1, T0);
    expect(r.medianMs).toBeNull();
    expect(r.p90Ms).toBeNull();
    expect(r.transferAccuracy).toBeNull();
    expect(r.classesReliable).toBe(0);
  });
});

describe('retention', () => {
  const att = (ts: number, skill: string, correct: boolean): Attempt => ({
    ts,
    templateId: 't',
    seed: 1,
    band: 1,
    skill,
    correct,
    ms: 1000,
    given: 'x',
    prompt: 'p',
    answer: 'a',
    phase: 'practice',
  });

  it('counts first attempts after a >= 7 day gap', () => {
    const log: Attempt[] = [
      att(T0, 'a', true),
      att(T0 + 10 * DAY, 'a', true), // gap 10d -> retention probe, correct
      att(T0 + 10 * DAY + 1000, 'a', true), // same session, not a probe
      att(T0 + 42 * DAY, 'a', false), // gap > 30d -> probe, wrong
      att(T0, 'b', true),
      att(T0 + DAY, 'b', false), // gap 1d -> not a probe
    ];
    expect(retention(log, 7)).toBe(0.5);
    expect(retention(log, 30)).toBe(0); // one 30d probe, wrong
  });

  it('is null when no qualifying attempts exist', () => {
    const log = [att(T0, 'a', true), att(T0 + DAY, 'a', false)];
    expect(retention(log, 7)).toBeNull();
    expect(retention([], 7)).toBeNull();
  });
});

describe('benchmarkDue', () => {
  it('is false before the diagnostic and true 30 days after it', () => {
    const fresh = newState(T0);
    expect(benchmarkDue(fresh, T0 + 40 * DAY)).toBe(false);
    const post: State = { ...fresh, diagnosticDone: true };
    expect(benchmarkDue(post, T0 + 10 * DAY)).toBe(false);
    expect(benchmarkDue(post, T0 + 40 * DAY)).toBe(true);
    const withReport: State = {
      ...post,
      benchmarks: [buildReport([], [], 'monthly', 1, T0 + 35 * DAY)],
    };
    expect(benchmarkDue(withReport, T0 + 50 * DAY)).toBe(false);
    expect(benchmarkDue(withReport, T0 + 70 * DAY)).toBe(true);
  });
});
