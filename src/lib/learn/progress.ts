// Aggregation helpers for the Progress view. Pure functions over the state
// and the attempt log.

import { SKILLS } from '../content/skills';
import type { BenchmarkReport } from './benchmark';
import { recentAcc } from './model';
import type { Attempt } from './attempt';
import type { State } from './state';

const SKILL_FAMILY = new Map(SKILLS.map((s) => [s.id, s.family]));
const DAY_MS = 24 * 60 * 60 * 1000;

// Baseline accuracy per family: the mean of each skill's diagnostic
// accuracy, weighted by item count is not available per family, so the
// report's per-skill accuracy is averaged across each family's skills.
export function familyAccuracyFromReport(
  report: BenchmarkReport,
): Map<number, number> {
  const sums = new Map<number, { total: number; n: number }>();
  for (const item of report.items) {
    const fam = SKILL_FAMILY.get(item.skill);
    if (fam === undefined) continue;
    const e = sums.get(fam) ?? { total: 0, n: 0 };
    e.total += item.correct ? 1 : 0;
    e.n++;
    sums.set(fam, e);
  }
  const out = new Map<number, number>();
  for (const [fam, e] of sums) out.set(fam, e.n > 0 ? e.total / e.n : 0);
  return out;
}

// Current accuracy per family: mean recentAcc over practiced skills.
export function familyAccuracyFromState(state: State): Map<number, number> {
  const sums = new Map<number, { total: number; n: number }>();
  for (const [id, rec] of Object.entries(state.skills)) {
    if (rec.attempts === 0) continue;
    const fam = SKILL_FAMILY.get(id);
    if (fam === undefined) continue;
    const e = sums.get(fam) ?? { total: 0, n: 0 };
    e.total += recentAcc(rec);
    e.n++;
    sums.set(fam, e);
  }
  const out = new Map<number, number>();
  for (const [fam, e] of sums) out.set(fam, e.total / e.n);
  return out;
}

export interface WeakArea {
  id: string;
  name: string;
  family: number;
  acc: number;
  stability: number;
}

// The 5 practiced skills with the lowest recent accuracy; ties break toward
// lower stability.
export function weakAreas(state: State): WeakArea[] {
  const name = new Map(SKILLS.map((s) => [s.id, s.name]));
  return Object.entries(state.skills)
    .filter(([id, rec]) => rec.attempts > 0 && SKILL_FAMILY.has(id))
    .map(([id, rec]) => ({
      id,
      name: name.get(id) ?? id,
      family: SKILL_FAMILY.get(id)!,
      acc: recentAcc(rec),
      stability: rec.stability,
    }))
    .sort((a, b) => a.acc - b.acc || a.stability - b.stability || a.id.localeCompare(b.id))
    .slice(0, 5);
}

function medianP90(xs: number[]): { median: number | null; p90: number | null } {
  if (xs.length === 0) return { median: null, p90: null };
  const sorted = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median =
    sorted.length % 2 === 1
      ? sorted[mid]!
      : (sorted[mid - 1]! + sorted[mid]!) / 2;
  const p90 = sorted[Math.max(0, Math.ceil(sorted.length * 0.9) - 1)]!;
  return { median, p90 };
}

// Response times over CORRECT attempts in the last `days` days.
export function recentMedianP90(
  attempts: Attempt[],
  now: number,
  days = 7,
): { median: number | null; p90: number | null } {
  const cutoff = now - days * DAY_MS;
  const xs = attempts
    .filter((a) => a.correct && a.ts >= cutoff)
    .map((a) => a.ms);
  return medianP90(xs);
}
