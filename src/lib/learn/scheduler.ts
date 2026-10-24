// Question scheduling: what to serve next in each session phase.
//
// Buckets (practice weights): due 0.25, fragile 0.20, target 0.30,
// transfer 0.15, maintenance 0.10. Empty buckets drop out and the remaining
// weights renormalize. Other phases override the mix: recall serves facts
// only, learn serves the target, timed serves only reliable skills, review
// is handled by the session (it regenerates missed templates), and custom
// serves a caller-supplied skill list.

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
import type { PhaseKind } from './session';

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
  | 'fragile'
  | 'target'
  | 'transfer'
  | 'maintenance'
  | 'fact'
  | 'custom';

export interface PickCtx {
  phase: PhaseKind | 'custom';
  target: string | null;
  recentPrompts: string[];
  lastTemplateId: string | null;
  customSkills?: string[] | undefined;
  customBand?: Band | undefined;
  counter: number; // caller increments; part of every seed
  nonce?: number; // session seed; defaults to `now`
}

export interface PickResult {
  question: Question;
  bucket: Bucket;
  transfer: boolean;
}

interface SkillCand {
  skill: string;
  band: Band;
  templateId: string;
}

// Resolve a skill to a serving template, chosen uniformly (with the rng)
// among the skill's primary templates.
function candFor(skill: string, band: Band, rng: Rng): SkillCand {
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
function serveSkill(cand: SkillCand, ctx: PickCtx, _rng: Rng): Question {
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

function serveFact(factId: string, ctx: PickCtx): Question {
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

export function pickQuestion(
  state: State,
  rng: Rng,
  now: number,
  ctx: PickCtx,
): PickResult {
  if (ctx.nonce === undefined) ctx = { ...ctx, nonce: now };

  if (ctx.phase === 'custom') {
    const pool = (ctx.customSkills ?? []).filter((id) => SKILL_MAP.has(id));
    const cands = dropRepeats(
      (pool.length > 0 ? pool : [SKILLS[0]!.id]).map((id) =>
        candFor(id, ctx.customBand ?? recOf(state, id).level, rng),
      ),
      ctx,
    );
    const cand = rng.pick(cands);
    return {
      question: serveSkill(cand, ctx, rng),
      bucket: 'custom',
      transfer: false,
    };
  }

  if (ctx.phase === 'recall') {
    return { ...recallPick(state, rng, now, ctx), transfer: false };
  }

  if (ctx.phase === 'learn') {
    if (ctx.target !== null) {
      const rec = recOf(state, ctx.target);
      return {
        question: serveSkill(candFor(ctx.target, rec.level, rng), ctx, rng),
        bucket: 'target',
        transfer: false,
      };
    }
    // No target: practice with the transfer weight doubled.
    return practicePick(state, rng, now, ctx, 2);
  }

  if (ctx.phase === 'timed') {
    const eligible = SKILLS.filter((s) => {
      const r = state.skills[s.id];
      if (!r) return false;
      const st = status(r);
      return (
        st === 'solid' ||
        st === 'strong' ||
        (r.attempts >= 5 && recentAcc(r) >= 0.9)
      );
    });
    if (eligible.length > 0) {
      const eligible2 = dropRepeats(
        eligible.map((s) => candFor(s.id, recOf(state, s.id).level, rng)),
        ctx,
      );
      const s = rng.pick(eligible2);
      return {
        question: serveSkill(s, ctx, rng),
        bucket: 'maintenance',
        transfer: false,
      };
    }
    return { ...recallPick(state, rng, now, ctx), transfer: false };
  }

  // practice and 'review' (defensive) use the bucket mix.
  return practicePick(state, rng, now, ctx, 1);
}

// Recall phase: facts only. Due facts first, then weak ones, then a random
// fact from a family in play.
function recallPick(
  state: State,
  rng: Rng,
  now: number,
  ctx: PickCtx,
): { question: Question; bucket: Bucket } {
  const factIds = Object.keys(state.facts).filter(
    (f) => factFamilyOf(f) !== null,
  );
  const due = factIds.filter((f) => isDue(state.facts[f]!, now));
  const weak = factIds.filter(
    (f) => state.facts[f]!.attempts > 0 && recentAcc(state.facts[f]!) < 0.8,
  );
  let factId: string | undefined;
  if (due.length > 0) factId = rng.pick(due);
  else if (weak.length > 0) factId = rng.pick(weak);
  else {
    const fams = factFamiliesInPlay(state);
    const fam = fams.length > 0 ? rng.pick(fams) : 'tables';
    factId = rng.pick(listFacts(fam));
  }
  return { question: serveFact(factId, ctx), bucket: 'fact' };
}

function practicePick(
  state: State,
  rng: Rng,
  now: number,
  ctx: PickCtx,
  transferWeightMult: number,
): PickResult {
  const dueSkills = Object.keys(state.skills)
    .filter((id) => SKILL_MAP.has(id) && isDue(state.skills[id]!, now))
    .map((id) => candFor(id, state.skills[id]!.level, rng));
  const dueFacts = Object.keys(state.facts).filter(
    (f) => factFamilyOf(f) !== null && isDue(state.facts[f]!, now),
  );

  const fragilePrereqs: SkillCand[] = [];
  if (ctx.target !== null) {
    const t = SKILL_MAP.get(ctx.target);
    if (t) {
      const prereqIds = new Set([
        ...t.prereqs,
        ...t.prereqs.flatMap((p) => SKILL_MAP.get(p)?.prereqs ?? []),
      ]);
      for (const id of prereqIds) {
        const r = state.skills[id];
        if (r && isFragile(r)) {
          fragilePrereqs.push(candFor(id, r.level, rng));
        }
      }
    }
  }

  // Transfer: a solid skill pushed one band up, or an application/mixed-chain
  // template that carries at least one solid skill tag.
  const transferCands: SkillCand[] = [];
  const transferTemplates = new Set<string>();
  for (const s of SKILLS) {
    const r = state.skills[s.id];
    if (!r) continue;
    const st = status(r);
    if (st === 'solid' || st === 'strong') {
      transferCands.push(
        candFor(s.id, Math.min(3, r.level + 1) as Band, rng),
      );
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

  const weights: [Bucket, number, boolean][] = [
    ['due', 0.25, dueSkills.length + dueFacts.length > 0],
    ['fragile', 0.2, fragilePrereqs.length > 0],
    ['target', 0.3, ctx.target !== null],
    [
      'transfer',
      0.15 * transferWeightMult,
      transferCands.length > 0 || transferTemplates.size > 0,
    ],
    ['maintenance', 0.1, maintCands.length > 0],
  ];
  const total = weights.reduce((s, [, w, ok]) => s + (ok ? w : 0), 0);
  let bucket: Bucket = 'maintenance';
  if (total > 0) {
    let roll = rng.next() * total;
    for (const [b, w, ok] of weights) {
      if (!ok) continue;
      roll -= w;
      if (roll <= 0) {
        bucket = b;
        break;
      }
    }
  }

  switch (bucket) {
    case 'due': {
      if (dueSkills.length > 0 && (dueFacts.length === 0 || rng.chance(0.5))) {
        const cand = rng.pick(dropRepeats(dueSkills, ctx));
        return {
          question: serveSkill(cand, ctx, rng),
          bucket,
          transfer: false,
        };
      }
      if (dueFacts.length > 0) {
        return {
          question: serveFact(rng.pick(dueFacts), ctx),
          bucket,
          transfer: false,
        };
      }
      break; // fall through to maintenance
    }
    case 'fragile': {
      if (fragilePrereqs.length > 0) {
        const cand = rng.pick(dropRepeats(fragilePrereqs, ctx));
        return {
          question: serveSkill(cand, ctx, rng),
          bucket,
          transfer: false,
        };
      }
      break;
    }
    case 'target': {
      if (ctx.target !== null) {
        const rec = recOf(state, ctx.target);
        const band: Band =
          rec.streak >= 3 && rec.level < 3 && rng.chance(0.25)
            ? ((rec.level + 1) as Band)
            : rec.level;
        return {
          question: serveSkill(candFor(ctx.target, band, rng), ctx, rng),
          bucket,
          transfer: false,
        };
      }
      break;
    }
    case 'transfer': {
      const tt = [...transferTemplates];
      if (tt.length > 0 && (transferCands.length === 0 || rng.chance(0.5))) {
        const tid = rng.pick(tt);
        const template = TEMPLATE_MAP.get(tid)!;
        const band = recOf(state, template.skill).level;
        return {
          question: serveTemplate(template, band, ctx),
          bucket,
          transfer: true,
        };
      }
      if (transferCands.length > 0) {
        const cand = rng.pick(dropRepeats(transferCands, ctx));
        return {
          question: serveSkill(cand, ctx, rng),
          bucket,
          transfer: true,
        };
      }
      break;
    }
    case 'maintenance':
      break;
  }

  // maintenance, or a bucket whose candidates vanished.
  if (maintCands.length === 0) {
    const first = SKILLS.find(
      (s) => s.kind === 'method' && unlocked(state, s.id),
    );
    const skill = first?.id ?? 'tables-1-10';
    return {
      question: serveSkill(candFor(skill, 0, rng), ctx, rng),
      bucket: 'maintenance',
      transfer: false,
    };
  }
  const cand = rng.pick(dropRepeats(maintCands, ctx));
  return {
    question: serveSkill(cand, ctx, rng),
    bucket: 'maintenance',
    transfer: false,
  };
}
