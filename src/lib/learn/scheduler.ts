// Question scheduling: what to serve next in a round.
//
// Mixed rounds draw from weighted buckets (tune from use): due 0.45
// (due facts plus due skills), target 0.25, learning 0.15 (attempted but
// not solid skills), newfact 0.10 (unattempted sheet facts), and
// maintenance/transfer 0.05. Empty buckets drop out and the remaining
// weights renormalize. The hard variety rule: never serve the same topic
// (fact family or skill id) twice in a row while any other topic is
// available.

import { SKILLS } from '../content/skills';
import {
  FACT_FAMILIES,
  factFamilyOf,
  familySkillForFact,
  listFacts,
  type FactFamily,
} from '../content/facts';
import {
  bySkill,
  factTemplateFor,
  generate,
  generateFact,
  TEMPLATES,
} from '../engine/registry';
import type { Band, Question, Template } from '../engine/types';
import { seedFor, type Rng } from '../math/rng';
import {
  isDue,
  isFragile,
  known,
  newRec,
  recentAcc,
  status,
  type Rec,
  type Status,
} from './model';
import type { State } from './state';

const SKILL_MAP = new Map(SKILLS.map((s) => [s.id, s]));
const TEMPLATE_MAP = new Map(TEMPLATES.map((t) => [t.id, t]));

// skill -> skills that directly depend on it
const CHILDREN = new Map<string, string[]>();
for (const s of SKILLS) {
  for (const p of s.prereqs) {
    const arr = CHILDREN.get(p) ?? [];
    arr.push(s.id);
    CHILDREN.set(p, arr);
  }
}

function recOf(state: State, id: string): Rec {
  return state.skills[id] ?? newRec();
}

// A skill is practicable when at least one template can serve it.
// Concepts with no template (e.g. place-value) never gate unlocking.
export function practicable(skillId: string): boolean {
  return bySkill(skillId).length > 0;
}

// Implied knowledge: a skill counts as known when it is known itself, or
// when any direct dependent of it is known (a learner who multiplies 2x2
// correctly has demonstrated the distributive split it rests on). The memo
// is per call so repeated checks inside one call share work.
export function knownStar(
  state: State,
  skillId: string,
  memo: Map<string, boolean> = new Map(),
): boolean {
  const hit = memo.get(skillId);
  if (hit !== undefined) return hit;
  const r = state.skills[skillId];
  const result =
    (r !== undefined && known(r)) ||
    (CHILDREN.get(skillId) ?? []).some((d) => knownStar(state, d, memo));
  memo.set(skillId, result);
  return result;
}

// A skill is unlocked when every practicable prereq is known (directly or
// by implication) and every impracticable prereq is a concept, which never
// gates. Skills without prereqs are always unlocked.
export function unlocked(state: State, skillId: string): boolean {
  const skill = SKILL_MAP.get(skillId);
  if (!skill) return false;
  if (skill.prereqs.length === 0) return true;
  const memo = new Map<string, boolean>();
  return skill.prereqs.every(
    (p) => knownStar(state, p, memo) || !practicable(p),
  );
}

// The displayed status: 'implied' when the skill was never attempted but a
// dependent already proves it. The Knowledge view uses this chip.
export function effectiveStatus(
  state: State,
  skillId: string,
): Status | 'implied' {
  const r = recOf(state, skillId);
  const st = status(r);
  if (st === 'new' && r.attempts === 0 && knownStar(state, skillId)) {
    return 'implied';
  }
  return st;
}

// Transitive dependents of a skill (skills that need it, directly or not).
export function dependents(skillId: string): string[] {
  const out = new Set<string>();
  const queue = [...(CHILDREN.get(skillId) ?? [])];
  while (queue.length > 0) {
    const id = queue.pop()!;
    if (out.has(id)) continue;
    out.add(id);
    queue.push(...(CHILDREN.get(id) ?? []));
  }
  return [...out];
}

// Unlocked method/application skills that are not yet solid or strong,
// most depended-upon first. Skills implied known by a dependent but not
// attempted themselves are excluded: there is nothing to teach.
export function frontier(state: State): string[] {
  const memo = new Map<string, boolean>();
  const skills = SKILLS.filter((s) => {
    if (s.kind !== 'method' && s.kind !== 'application') return false;
    if (!unlocked(state, s.id)) return false;
    const r = recOf(state, s.id);
    const st = status(r);
    if (st === 'solid' || st === 'strong') return false;
    return !(!known(r) && knownStar(state, s.id, memo));
  });
  skills.sort(
    (a, b) =>
      dependents(b.id).length - dependents(a.id).length ||
      a.family - b.family ||
      a.id.localeCompare(b.id),
  );
  return skills.map((s) => s.id);
}

// Keep the current target while it is still on the frontier (unlocked, not
// yet solid, and not implied known by a dependent); otherwise take the
// front of the frontier.
export function chooseTarget(state: State): string | null {
  const front = frontier(state);
  if (state.target !== null && front.includes(state.target)) {
    return state.target;
  }
  return front[0] ?? null;
}

export type Bucket =
  | 'due'
  | 'target'
  | 'learning'
  | 'newfact'
  | 'maintenance'
  | 'fact'
  | 'skill';

export interface PickCtx {
  target: string | null;
  recentPrompts: string[];
  lastTemplateId: string | null;
  lastTopic: string | null;
  counter: number; // caller increments; part of every seed
  nonce?: number; // round seed; defaults to `now`
}

export interface PickResult {
  question: Question;
  bucket: Bucket;
  transfer: boolean;
  topic: string;
}

interface SkillCand {
  skill: string;
  band: Band;
  templateId: string;
}

// Resolve a skill to a serving template, chosen uniformly (with the rng)
// among the skill's primary templates.
export function candFor(skill: string, band: Band, rng: Rng): SkillCand {
  const all = bySkill(skill);
  if (all.length === 0) throw new Error(`scheduler: no template for ${skill}`);
  const primary = all.filter((t) => t.skill === skill);
  const t = rng.pick(primary.length > 0 ? primary : all);
  return { skill, band, templateId: t.id };
}

// Drop candidates whose template repeats the last one served, but only
// when another candidate remains.
function dropRepeats(cands: SkillCand[], ctx: PickCtx): SkillCand[] {
  if (
    ctx.lastTemplateId !== null &&
    cands.length > 1 &&
    cands.some((c) => c.templateId !== ctx.lastTemplateId)
  ) {
    return cands.filter((c) => c.templateId !== ctx.lastTemplateId);
  }
  return cands;
}

// Generate for a skill candidate, regenerating up to 5 times to dodge
// recently seen prompts.
export function serveSkill(cand: SkillCand, ctx: PickCtx, _rng: Rng): Question {
  const t = TEMPLATE_MAP.get(cand.templateId);
  if (!t) throw new Error(`scheduler: no template for ${cand.skill}`);
  return serveTemplate(t, cand.band, ctx);
}

// Generate for a known template id at a band with the retry rules.
function serveTemplate(t: Template, band: Band, ctx: PickCtx): Question {
  let q = generate(t.id, seedFor('practice', ctx.nonce ?? 0, ctx.counter, 0), band);
  for (let i = 1; i <= 5 && ctx.recentPrompts.includes(q.prompt); i++) {
    q = generate(t.id, seedFor('practice', ctx.nonce ?? 0, ctx.counter, i), band);
  }
  return q;
}

export function serveFact(factId: string, ctx: PickCtx): Question {
  const family = factFamilyOf(factId);
  if (family === null) throw new Error(`scheduler: bad fact id "${factId}"`);
  const templateId = factTemplateFor(family);
  let q = generateFact(
    templateId,
    factId,
    seedFor('practice', ctx.nonce ?? 0, ctx.counter, 0),
  );
  for (let i = 1; i <= 5 && ctx.recentPrompts.includes(q.prompt); i++) {
    q = generateFact(
      templateId,
      factId,
      seedFor('practice', ctx.nonce ?? 0, ctx.counter, i),
    );
  }
  return q;
}

// Facts whose family is "in play": the family skill has attempts, or is a
// prereq of the current target (depth <= 2).
function factFamiliesInPlay(state: State): FactFamily[] {
  const inPlay = new Set<FactFamily>();
  const t = state.target !== null ? SKILL_MAP.get(state.target) : undefined;
  const targetPrereqs = new Set([
    ...(t?.prereqs ?? []),
    ...(t?.prereqs ?? []).flatMap((p) => SKILL_MAP.get(p)?.prereqs ?? []),
  ]);
  for (const family of FACT_FAMILIES) {
    const anyFact = listFacts(family)[0]!;
    const skill = familySkillForFact(anyFact)!;
    const r = state.skills[skill];
    if ((r && r.attempts > 0) || targetPrereqs.has(skill)) inPlay.add(family);
  }
  return [...inPlay];
}

// One candidate: a topic plus a deferred way to serve the question.
interface Cand {
  topic: string;
  serve: () => { question: Question; transfer: boolean };
}

function skillCand(c: SkillCand, ctx: PickCtx, rng: Rng, transfer: boolean): Cand {
  return {
    topic: c.skill,
    serve: () => ({ question: serveSkill(c, ctx, rng), transfer }),
  };
}

function factCand(factId: string, ctx: PickCtx): Cand {
  return {
    topic: factFamilyOf(factId) ?? factId,
    serve: () => ({ question: serveFact(factId, ctx), transfer: false }),
  };
}

// The sheet families whose facts may be introduced as new.
const NEW_FACT_FAMILIES: FactFamily[] = [
  'tables',
  'squares',
  'fraction-equivalents',
  'percent-anchors',
  'complements-10',
];

const BUCKET_ORDER = ['due', 'target', 'learning', 'newfact', 'maintenance'] as const;
type MixedBucket = (typeof BUCKET_ORDER)[number];

// The mixed-round pick. Builds the five buckets, rolls the weights, then
// applies the variety rule inside the chosen bucket and across buckets.
export function pickMixed(
  state: State,
  rng: Rng,
  now: number,
  ctx: PickCtx,
): PickResult {
  if (ctx.nonce === undefined) ctx = { ...ctx, nonce: now };
  const buckets = new Map<MixedBucket, Cand[]>();

  // due: skills then facts
  const dueSkills = Object.keys(state.skills)
    .filter((id) => SKILL_MAP.has(id) && isDue(state.skills[id]!, now))
    .map((id) => candFor(id, state.skills[id]!.level, rng));
  const dueFacts = Object.keys(state.facts).filter(
    (f) => factFamilyOf(f) !== null && isDue(state.facts[f]!, now),
  );
  buckets.set('due', [
    ...dropRepeats(dueSkills, ctx).map((c) => skillCand(c, ctx, rng, false)),
    ...dueFacts.map((f) => factCand(f, ctx)),
  ]);

  // target
  if (ctx.target !== null && SKILL_MAP.has(ctx.target)) {
    const rec = recOf(state, ctx.target);
    const band: Band =
      rec.streak >= 3 && rec.level < 3 && rng.chance(0.25)
        ? ((rec.level + 1) as Band)
        : rec.level;
    buckets.set('target', [skillCand(candFor(ctx.target, band, rng), ctx, rng, false)]);
  } else {
    buckets.set('target', []);
  }

  // learning: attempted, not solid or strong, not due right now
  const learning = SKILLS.filter((s) => {
    const r = state.skills[s.id];
    if (r === undefined || r.attempts === 0) return false;
    const st = status(r);
    return (st === 'learning' || st === 'new') && !isDue(r, now) && bySkill(s.id).length > 0;
  }).map((s) => candFor(s.id, state.skills[s.id]!.level, rng));
  buckets.set('learning', dropRepeats(learning, ctx).map((c) => skillCand(c, ctx, rng, false)));

  // newfact: the lowest-index unattempted fact per sheet family
  const newFacts: Cand[] = [];
  for (const family of NEW_FACT_FAMILIES) {
    const first = listFacts(family).find(
      (f) => (state.facts[f]?.attempts ?? 0) === 0,
    );
    if (first !== undefined) newFacts.push(factCand(first, ctx));
  }
  buckets.set('newfact', newFacts);

  // maintenance + transfer, carried over from the old practice bucket
  const transferCands: SkillCand[] = [];
  const transferTemplates = new Set<string>();
  for (const s of SKILLS) {
    const r = state.skills[s.id];
    if (!r) continue;
    const st = status(r);
    if (st === 'solid' || st === 'strong') {
      transferCands.push(candFor(s.id, Math.min(3, r.level + 1) as Band, rng));
      for (const t of bySkill(s.id)) {
        if (SKILL_MAP.get(t.skill)?.kind === 'application' || t.id === 'mixed-chain') {
          transferTemplates.add(t.id);
        }
      }
    }
  }
  const maintCands: SkillCand[] = SKILLS.filter((s) => {
    const r = state.skills[s.id];
    return r !== undefined && r.attempts > 0 && unlocked(state, s.id);
  })
    .sort((a, b) => recOf(state, a.id).lastSeen - recOf(state, b.id).lastSeen)
    .slice(0, 5)
    .map((s) => candFor(s.id, recOf(state, s.id).level, rng));
  const maint: Cand[] = [
    ...dropRepeats(transferCands, ctx).map((c) => skillCand(c, ctx, rng, true)),
    ...dropRepeats(maintCands, ctx).map((c) => skillCand(c, ctx, rng, false)),
  ];
  const tt = [...transferTemplates];
  if (tt.length > 0 && rng.chance(0.4)) {
    const tid = rng.pick(tt);
    const template = TEMPLATE_MAP.get(tid)!;
    maint.push({
      topic: template.skill,
      serve: () => ({
        question: serveTemplate(template, recOf(state, template.skill).level, ctx),
        transfer: true,
      }),
    });
  }
  buckets.set('maintenance', maint);

  const WEIGHTS: Record<MixedBucket, number> = {
    due: 0.45,
    target: 0.25,
    learning: 0.15,
    newfact: 0.1,
    maintenance: 0.05,
  };

  const total = BUCKET_ORDER.reduce(
    (x, b) => x + (buckets.get(b)!.length > 0 ? WEIGHTS[b] : 0),
    0,
  );
  let chosen: MixedBucket = 'maintenance';
  if (total > 0) {
    let roll = rng.next() * total;
    for (const b of BUCKET_ORDER) {
      const cands = buckets.get(b)!;
      if (cands.length === 0) continue;
      roll -= WEIGHTS[b];
      if (roll <= 0) {
        chosen = b;
        break;
      }
    }
  }

  // Variety: from the chosen bucket, drop lastTopic candidates when at
  // least one other topic remains. If the bucket is only lastTopic, walk
  // the bucket order from the chosen one until a different topic appears.
  const pickFrom = (cands: Cand[]): Cand | null => {
    const alt = cands.filter((c) => c.topic !== ctx.lastTopic);
    if (alt.length > 0) return rng.pick(alt);
    return null;
  };

  let cand = pickFrom(buckets.get(chosen)!);
  let bucket: MixedBucket = chosen;
  if (cand === null) {
    const start = BUCKET_ORDER.indexOf(chosen);
    for (let i = 1; i < BUCKET_ORDER.length; i++) {
      const b = BUCKET_ORDER[(start + i) % BUCKET_ORDER.length]!;
      cand = pickFrom(buckets.get(b)!);
      if (cand !== null) {
        bucket = b;
        break;
      }
    }
  }
  if (cand === null) {
    // Every candidate everywhere is lastTopic: repeat is allowed.
    const first = BUCKET_ORDER.map((b) => buckets.get(b)!).find((c) => c.length > 0);
    if (first === undefined) {
      // Nothing at all: serve the first method skill as a backstop.
      const skill = SKILLS.find((s) => s.kind === 'method')!.id;
      const c = skillCand(candFor(skill, 0, rng), ctx, rng, false);
      const q = c.serve();
      return { question: q.question, bucket: 'maintenance', transfer: false, topic: c.topic };
    }
    cand = rng.pick(first);
    bucket = BUCKET_ORDER.find((b) => buckets.get(b) === first)!;
  }

  const out = cand.serve();
  return { question: out.question, bucket, transfer: out.transfer, topic: cand.topic };
}

// A 'facts' round serves inside one family: due first, then weak, then
// unattempted, then a random fact.
export function pickFactInFamily(
  state: State,
  rng: Rng,
  ctx: PickCtx,
  family: FactFamily,
): PickResult {
  if (ctx.nonce === undefined) ctx = { ...ctx, nonce: 0 };
  const ids = listFacts(family);
  const due = ids.filter((f) => {
    const r = state.facts[f];
    return r !== undefined && isDue(r, Date.now());
  });
  const weak = ids.filter((f) => {
    const r = state.facts[f];
    return r !== undefined && r.attempts > 0 && recentAcc(r) < 0.8 && !due.includes(f);
  });
  const fresh = ids.filter((f) => state.facts[f] === undefined || state.facts[f]!.attempts === 0);
  const factId =
    due.length > 0 ? rng.pick(due)
    : weak.length > 0 ? rng.pick(weak)
    : fresh.length > 0 ? rng.pick(fresh)
    : rng.pick(ids);
  return { question: serveFact(factId, ctx), bucket: 'fact', transfer: false, topic: family };
}
