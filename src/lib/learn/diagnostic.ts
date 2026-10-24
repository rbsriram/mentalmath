// The one-time staircase diagnostic: probes each core skill, climbing
// bands while the learner answers correctly and dropping to band 0 once on
// a band-1 miss. Produces the baseline report and seeds the target.

import { generate } from '../engine/registry';
import type { Band, Question } from '../engine/types';
import type { CheckResult } from '../engine/answer';
import { seedFor } from '../math/rng';
import type { Attempt } from './attempt';
import { buildReport, type BenchmarkItem } from './benchmark';
import { recordOutcome, type State } from './state';
import { chooseTarget } from './scheduler';
import { newRec } from './model';

const DAY_MS = 24 * 60 * 60 * 1000;

export interface Probe {
  skill: string;
  templateId: string;
}

export const PROBES: Probe[] = [
  { skill: 'tables-1-10', templateId: 'mul-table-fact' },
  { skill: 'tables-11-15', templateId: 'mul-table-fact' },
  { skill: 'complements-100', templateId: 'complement' },
  { skill: 'squares-1-25', templateId: 'square-fact' },
  { skill: 'fraction-equivalents', templateId: 'frac-to-dec-pct' },
  { skill: 'percent-anchors', templateId: 'pct-anchor' },
  { skill: 'add-multi-term', templateId: 'add-multi-term' },
  { skill: 'sub-left-to-right', templateId: 'sub' },
  { skill: 'mul-2x2', templateId: 'mul-2x2' },
  { skill: 'mul-near-base', templateId: 'mul-near-base' },
  { skill: 'square-general', templateId: 'square-general' },
  { skill: 'div-reverse', templateId: 'div-exact' },
  { skill: 'dec-mul', templateId: 'dec-mul' },
  { skill: 'div-decimal-shift', templateId: 'div-decimal' },
  { skill: 'pct-of', templateId: 'pct-of' },
  { skill: 'pct-reverse', templateId: 'pct-reverse' },
  { skill: 'pct-discount', templateId: 'pct-discount' },
  { skill: 'ratio-split', templateId: 'ratio-split' },
  { skill: 'div-estimate', templateId: 'div-estimate' },
  { skill: 'mixed-chain', templateId: 'mixed-chain' },
];

export interface DiagEntry {
  probe: number;
  item: number;
  templateId: string;
  skill: string;
  band: Band;
  correct: boolean;
  ms: number;
}

export interface DiagnosticState {
  createdAt: number;
  probeIndex: number;
  itemIndex: number; // item within the current probe
  band: Band;
  history: DiagEntry[];
  done: boolean;
}

export function startDiagnostic(
  state: State,
  _now: number,
): { state: State; diagnostic: DiagnosticState } {
  const diagnostic: DiagnosticState = {
    createdAt: state.createdAt,
    probeIndex: 0,
    itemIndex: 0,
    band: 1,
    history: [],
    done: false,
  };
  return { state: { ...state, diagnostic }, diagnostic };
}

export function currentItem(diag: DiagnosticState): Question | null {
  if (diag.done || diag.probeIndex >= PROBES.length) return null;
  const probe = PROBES[diag.probeIndex]!;
  const seed = seedFor('diagnostic', diag.createdAt, diag.probeIndex, diag.itemIndex);
  return generate(probe.templateId, seed, diag.band);
}

export function answerDiagnostic(
  state: State,
  diag: DiagnosticState,
  raw: string,
  ms: number,
  now: number,
): {
  state: State;
  diagnostic: DiagnosticState;
  attempt: Attempt;
  result: CheckResult;
  question: Question;
} {
  const probe = PROBES[diag.probeIndex]!;
  const question = currentItem(diag)!;
  // An empty raw means "skip" and counts as wrong.
  const out = recordOutcome(state, question, raw, ms, now, 'diagnostic', {});
  const correct = out.result.correct;

  const history = [
    ...diag.history,
    {
      probe: diag.probeIndex,
      item: diag.itemIndex,
      templateId: probe.templateId,
      skill: probe.skill,
      band: diag.band,
      correct,
      ms,
    },
  ];

  // Staircase: correct climbs 1 -> 2 -> 3 -> next probe; wrong at 1 drops to
  // a single band-0 item; wrong at 2 or 3 ends the probe; band 0 always ends.
  let probeIndex = diag.probeIndex;
  let band = diag.band;
  let itemIndex = diag.itemIndex;
  let done = false;
  const probeOver =
    band === 0 || band === 3 || (band === 2 && !correct);
  if (probeOver) {
    probeIndex += 1;
    band = 1;
    itemIndex = 0;
    done = probeIndex >= PROBES.length;
  } else {
    band = correct ? ((band + 1) as Band) : (0 as Band);
    itemIndex += 1;
  }

  return {
    state: out.state,
    diagnostic: {
      ...diag,
      probeIndex,
      itemIndex,
      band,
      history,
      done,
    },
    attempt: out.attempt,
    result: out.result,
    question,
  };
}

// Sets each probed skill's level to the highest band answered correctly.
// Skills at level >= 1 get a modest starting stability so early reviews
// space out. Writes the baseline report and picks the first target.
export function finishDiagnostic(
  state: State,
  diag: DiagnosticState,
  attempts: Attempt[],
  now: number,
): { state: State } {
  const skills = { ...state.skills };
  PROBES.forEach((probe, i) => {
    const entries = diag.history.filter((h) => h.probe === i);
    const level = entries.reduce<Band>(
      (hi, e) => (e.correct && e.band > hi ? e.band : hi),
      0,
    ) as Band;
    const cur = skills[probe.skill] ?? newRec();
    const next = { ...cur, level };
    if (level >= 1) {
      next.stability = 3;
      next.due = now + 3 * DAY_MS;
    }
    skills[probe.skill] = next;
  });

  const items: BenchmarkItem[] = diag.history.map((h, i) => ({
    slot: -1,
    templateId: h.templateId,
    band: h.band,
    skill: h.skill,
    correct: h.correct,
    ms: h.ms,
    transfer: false,
  }));
  const baseline = buildReport(items, attempts, 'baseline', 0, now);
  const withSkills: State = {
    ...state,
    skills,
    diagnosticDone: true,
    diagnostic: null,
    baseline,
  };
  return { state: { ...withSkills, target: chooseTarget(withSkills) } };
}
