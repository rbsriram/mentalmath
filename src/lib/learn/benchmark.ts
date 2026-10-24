// Monthly benchmark: a fixed battery of slots across the benchmark classes
// plus transfer and fact slots. Items are fully determined by the month
// number, so a benchmark is reproducible and comparable over time.

import { getTemplate, generate } from '../engine/registry';
import type { Band, Question } from '../engine/types';
import type { CheckResult } from '../engine/answer';
import { seedFor } from '../math/rng';
import type { Attempt } from './attempt';
import { recordOutcome, type State } from './state';

export interface BenchmarkItem {
  slot: number; // index into BENCHMARK_SLOTS, -1 for diagnostic items
  templateId: string;
  band: Band;
  skill: string;
  correct: boolean;
  ms: number;
  transfer: boolean;
}

export interface BenchmarkReport {
  kind: 'baseline' | 'monthly';
  month: number;
  takenAt: number;
  items: BenchmarkItem[];
  accuracy: number;
  accuracyBySkill: Record<string, number>;
  accuracyByBand: Record<Band, number>; // bands with no items report 0
  medianMs: number | null;
  p90Ms: number | null;
  transferAccuracy: number | null;
  classesReliable: number;
  retention7: number | null;
  retention30: number | null;
}

export interface BenchmarkState {
  month: number;
  slotIndex: number;
  items: BenchmarkItem[];
  done: boolean;
}

export interface BenchmarkSlot {
  templateId: string;
  band: Band;
  cls: string;
  transfer?: boolean;
}

const CLASSES: [string, string][] = [
  ['Multi-term addition', 'add-multi-term'],
  ['Multi-term multiplication', 'mul-multi-term'],
  ['Subtraction', 'sub'],
  ['Decimal division', 'div-decimal'],
  ['Squares', 'square-general'],
  ['Near-base multiplication', 'mul-near-base'],
  ['Three-digit multiplication', 'mul-3-digit-structured'],
  ['Percentages', 'pct-of'],
  ['Reverse percentages', 'pct-reverse'],
  ['Fraction conversion', 'frac-to-dec-pct'],
  ['Decimal multiplication', 'dec-mul'],
  ['Discounts', 'pct-discount'],
  ['Compound percentage', 'pct-compound'],
  ['Ratios', 'ratio-split'],
  ['Estimation', 'div-estimate'],
];

export const BENCHMARK_SLOTS: BenchmarkSlot[] = [
  ...CLASSES.flatMap(([cls, templateId]) => [
    { templateId, band: 1 as Band, cls },
    { templateId, band: 2 as Band, cls },
  ]),
  // Transfer slots: apply learned skills in a different frame.
  { templateId: 'mixed-chain', band: 2, cls: 'Mixed chain', transfer: true },
  { templateId: 'unit-price', band: 1, cls: 'Unit prices', transfer: true },
  { templateId: 'tax-inclusive', band: 1, cls: 'Taxes', transfer: true },
  { templateId: 'estimate-product', band: 2, cls: 'Estimation', transfer: true },
  { templateId: 'signed', band: 1, cls: 'Signed numbers', transfer: true },
  { templateId: 'margin-markup', band: 1, cls: 'Margin vs markup', transfer: true },
  // Fact slots.
  { templateId: 'mul-table-fact', band: 1, cls: 'Table facts' },
  { templateId: 'square-fact', band: 1, cls: 'Square facts' },
  { templateId: 'complement', band: 1, cls: 'Complements' },
];

const DAY_MS = 24 * 60 * 60 * 1000;

function slotQuestion(bench: BenchmarkState): Question {
  const slot = BENCHMARK_SLOTS[bench.slotIndex]!;
  const seed = seedFor('benchmark', bench.month, bench.slotIndex);
  return generate(slot.templateId, seed, slot.band);
}

export function startBenchmark(
  state: State,
  _now: number,
): { state: State; benchmark: BenchmarkState } {
  const benchmark: BenchmarkState = {
    month: state.benchmarks.length + 1,
    slotIndex: 0,
    items: [],
    done: false,
  };
  return { state: { ...state, benchmark }, benchmark };
}

export function currentBenchmarkItem(bench: BenchmarkState): Question | null {
  if (bench.done || bench.slotIndex >= BENCHMARK_SLOTS.length) return null;
  return slotQuestion(bench);
}

export function answerBenchmark(
  state: State,
  bench: BenchmarkState,
  raw: string,
  ms: number,
  now: number,
): {
  state: State;
  benchmark: BenchmarkState;
  attempt: Attempt;
  result: CheckResult;
  question: Question;
} {
  const slot = BENCHMARK_SLOTS[bench.slotIndex]!;
  const question = slotQuestion(bench);
  const out = recordOutcome(state, question, raw, ms, now, 'benchmark', {
    transfer: slot.transfer === true,
  });
  const item: BenchmarkItem = {
    slot: bench.slotIndex,
    templateId: slot.templateId,
    band: slot.band,
    skill: question.skill,
    correct: out.result.correct,
    ms,
    transfer: slot.transfer === true,
  };
  const slotIndex = bench.slotIndex + 1;
  const benchmark: BenchmarkState = {
    ...bench,
    slotIndex,
    items: [...bench.items, item],
    done: slotIndex >= BENCHMARK_SLOTS.length,
  };
  return { state: out.state, benchmark, attempt: out.attempt, result: out.result, question };
}

function median(sorted: number[]): number | null {
  if (sorted.length === 0) return null;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[mid]!
    : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

function p90(sorted: number[]): number | null {
  if (sorted.length === 0) return null;
  return sorted[Math.max(0, Math.ceil(sorted.length * 0.9) - 1)]!;
}

// Share of first-attempts-after-a-gap that are correct. Groups attempts by
// skill; a gap of at least `days` since the previous attempt on the same
// skill marks the attempt as a retention probe. null when there are none.
export function retention(attempts: Attempt[], days: number): number | null {
  const bySkill = new Map<string, Attempt[]>();
  for (const a of attempts) {
    const arr = bySkill.get(a.skill) ?? [];
    arr.push(a);
    bySkill.set(a.skill, arr);
  }
  let probes = 0;
  let hits = 0;
  for (const list of bySkill.values()) {
    list.sort((a, b) => a.ts - b.ts);
    for (let i = 1; i < list.length; i++) {
      if (list[i]!.ts - list[i - 1]!.ts >= days * DAY_MS) {
        probes++;
        if (list[i]!.correct) hits++;
      }
    }
  }
  return probes === 0 ? null : hits / probes;
}

export function buildReport(
  items: BenchmarkItem[],
  attempts: Attempt[],
  kind: 'baseline' | 'monthly',
  month: number,
  takenAt: number,
): BenchmarkReport {
  const n = items.length;
  const correctItems = items.filter((i) => i.correct);
  const accuracy = n === 0 ? 0 : correctItems.length / n;

  const accuracyBySkill: Record<string, number> = {};
  const skillGroups = new Map<string, BenchmarkItem[]>();
  for (const i of items) {
    const arr = skillGroups.get(i.skill) ?? [];
    arr.push(i);
    skillGroups.set(i.skill, arr);
  }
  for (const [skill, arr] of skillGroups) {
    accuracyBySkill[skill] = arr.filter((i) => i.correct).length / arr.length;
  }

  const accuracyByBand = { 0: 0, 1: 0, 2: 0, 3: 0 } as Record<Band, number>;
  for (const b of [0, 1, 2, 3] as Band[]) {
    const arr = items.filter((i) => i.band === b);
    if (arr.length > 0) {
      accuracyByBand[b] = arr.filter((i) => i.correct).length / arr.length;
    }
  }

  const correctMs = correctItems.map((i) => i.ms).sort((a, b) => a - b);
  const transferItems = items.filter((i) => i.transfer);

  // A class is reliable when every slot that belongs to it was correct.
  let classesReliable = 0;
  const classSlots = new Map<string, BenchmarkItem[]>();
  for (const i of items) {
    if (i.slot < 0 || i.slot >= BENCHMARK_SLOTS.length) continue;
    const cls = BENCHMARK_SLOTS[i.slot]!.cls;
    const arr = classSlots.get(cls) ?? [];
    arr.push(i);
    classSlots.set(cls, arr);
  }
  for (const arr of classSlots.values()) {
    if (arr.every((i) => i.correct)) classesReliable++;
  }

  return {
    kind,
    month,
    takenAt,
    items,
    accuracy,
    accuracyBySkill,
    accuracyByBand,
    medianMs: median(correctMs),
    p90Ms: p90(correctMs),
    transferAccuracy:
      transferItems.length === 0
        ? null
        : transferItems.filter((i) => i.correct).length / transferItems.length,
    classesReliable,
    retention7: retention(attempts, 7),
    retention30: retention(attempts, 30),
  };
}

export function finishBenchmark(
  state: State,
  bench: BenchmarkState,
  attempts: Attempt[],
  now: number,
): { state: State; report: BenchmarkReport } {
  const report = buildReport(bench.items, attempts, 'monthly', bench.month, now);
  return {
    state: {
      ...state,
      benchmark: null,
      benchmarks: [...state.benchmarks, report],
    },
    report,
  };
}

// A benchmark is due once the diagnostic is done and either no benchmark
// exists and the account is 30 days old, or the last one is 30 days old.
export function benchmarkDue(state: State, now: number): boolean {
  if (!state.diagnosticDone) return false;
  if (state.benchmarks.length === 0) {
    return now - state.createdAt >= 30 * DAY_MS;
  }
  const last = state.benchmarks[state.benchmarks.length - 1]!;
  return now - last.takenAt >= 30 * DAY_MS;
}
