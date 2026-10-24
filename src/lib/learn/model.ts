// The per-item learning record and its update rules.
//
// Spacing: a correct answer doubles stability roughly (x2.2, capped at 120
// days); the first correct answer sets stability to 1 day. A wrong answer
// cuts stability to 0.3x with a floor of 0.25 days and resets the streak.
// `due` is the next review timestamp: now + stability days on a correct
// answer, now + 0.25 day on a wrong one.
//
// Level (working band) promotion needs all of: the answered band equals the
// working band, streak >= 4 after this answer, >= 6 recent outcomes with
// accuracy >= 0.9, and a median recent correct time at or under the skill's
// speed target. Demotion: >= 6 recent outcomes with accuracy < 0.5, the
// level is above 0, and the answered band equals the working band (a missed
// stretch item above the level never demotes). Wrong answers never promote
// or demote a band the user was not working at.
//
// `known` (attempts >= 2 and recent accuracy >= 0.8, or level >= 1) is the
// unlock gate for dependents. The level >= 1 clause matters: the diagnostic
// staircase ends probes with a wrong answer, so a learner correct at bands
// 1-2 ends with accuracy below 0.8 but demonstrably knows the skill.
//
// Status ladder: new -> learning -> solid -> strong. `fragile` means
// attempted but not yet reliable: accuracy < 0.8 or stability < 1 day.
// `days` counts distinct local calendar days practised, from the local
// timezone (not UTC), so status and streaks survive around midnight.

import type { Band } from '../engine/types';

export interface Rec {
  attempts: number;
  correct: number;
  streak: number;
  stability: number; // days; 0 = never answered correctly
  due: number; // ms epoch; 0 = now
  lastSeen: number; // ms epoch, 0 = never
  firstSeen: number; // ms epoch, 0 = never
  days: number; // distinct local calendar days practised
  lastDay: string; // 'YYYY-MM-DD' local, '' when never
  recent: (0 | 1)[]; // last 10 outcomes
  recentMs: number[]; // last 5 response times on CORRECT answers
  level: Band; // working difficulty band
  introduced: boolean; // lesson shown (methods only)
  independent: number; // correct answers on transfer items
}

const DAY_MS = 24 * 60 * 60 * 1000;
const STABILITY_CAP = 120; // days
const STABILITY_FLOOR = 0.25; // days
const WRONG_DELAY_DAYS = 0.25;
const GROWTH = 2.2;
const DECAY = 0.3;
const RECENT_CAP = 10;
const RECENT_MS_CAP = 5;

export function newRec(): Rec {
  return {
    attempts: 0,
    correct: 0,
    streak: 0,
    stability: 0,
    due: 0,
    lastSeen: 0,
    firstSeen: 0,
    days: 0,
    lastDay: '',
    recent: [],
    recentMs: [],
    level: 0,
    introduced: false,
    independent: 0,
  };
}

// 'YYYY-MM-DD' in the local timezone.
export function localDay(now: number): string {
  const d = new Date(now);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

export function recentAcc(rec: Rec): number {
  if (rec.recent.length === 0) return 0;
  return rec.recent.reduce<number>((s, v) => s + v, 0) / rec.recent.length;
}

function median(xs: number[]): number | null {
  if (xs.length === 0) return null;
  const sorted = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[mid]!
    : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

export function applyOutcome(
  rec: Rec,
  o: {
    correct: boolean;
    ms: number;
    band: Band;
    now: number;
    transfer: boolean | undefined;
    speedTargetMs: number;
  },
): Rec {
  const out: Rec = {
    ...rec,
    recent: [...rec.recent],
    recentMs: [...rec.recentMs],
  };
  out.attempts += 1;
  out.lastSeen = o.now;
  if (out.firstSeen === 0) out.firstSeen = o.now;
  const day = localDay(o.now);
  if (day !== out.lastDay) {
    out.days += 1;
    out.lastDay = day;
  }
  out.recent.push(o.correct ? 1 : 0);
  if (out.recent.length > RECENT_CAP) out.recent.shift();

  if (o.correct) {
    out.correct += 1;
    out.streak += 1;
    out.stability =
      out.stability === 0 ? 1 : Math.min(out.stability * GROWTH, STABILITY_CAP);
    out.due = o.now + out.stability * DAY_MS;
    out.recentMs.push(o.ms);
    if (out.recentMs.length > RECENT_MS_CAP) out.recentMs.shift();
    if (o.transfer) out.independent += 1;
  } else {
    out.streak = 0;
    out.stability = Math.max(STABILITY_FLOOR, out.stability * DECAY);
    out.due = o.now + WRONG_DELAY_DAYS * DAY_MS;
  }

  // Band promotion / demotion. Both only apply when the answered band is
  // the working band.
  const enoughRecent = out.recent.length >= 6;
  const acc = recentAcc(out);
  if (
    o.correct &&
    o.band === out.level &&
    out.streak >= 4 &&
    enoughRecent &&
    acc >= 0.9 &&
    out.recentMs.length > 0 &&
    median(out.recentMs)! <= o.speedTargetMs &&
    out.level < 3
  ) {
    out.level = (out.level + 1) as Band;
  }
  if (o.band === out.level && enoughRecent && acc < 0.5 && out.level > 0) {
    out.level = (out.level - 1) as Band;
  }
  return out;
}

export type Status = 'new' | 'learning' | 'solid' | 'strong';

export function status(rec: Rec): Status {
  if (rec.attempts === 0) return 'new';
  const acc = recentAcc(rec);
  if (
    rec.stability >= 21 &&
    acc >= 0.9 &&
    rec.attempts >= 12 &&
    rec.days >= 3 &&
    rec.independent >= 3
  ) {
    return 'strong';
  }
  if (rec.stability >= 3 && acc >= 0.9 && rec.attempts >= 8 && rec.days >= 2) {
    return 'solid';
  }
  return 'learning';
}

export function known(rec: Rec): boolean {
  return rec.attempts >= 2 && (recentAcc(rec) >= 0.8 || rec.level >= 1);
}

export function isFragile(rec: Rec): boolean {
  return rec.attempts > 0 && (recentAcc(rec) < 0.8 || rec.stability < 1);
}

export function isDue(rec: Rec, now: number): boolean {
  return rec.attempts > 0 && rec.due <= now;
}
