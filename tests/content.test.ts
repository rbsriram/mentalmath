import { describe, expect, it } from 'vitest';
import { SKILLS } from '../src/lib/content/skills';
import { METHODS } from '../src/lib/content/methods';
import {
  complementFactId,
  FACT_FAMILIES,
  fractionFactId,
  listFacts,
  percentAnchorFactId,
  squareFactId,
  tableFactId,
} from '../src/lib/content/facts';
import {
  factTemplateFor,
  generate,
  generateFact,
  TEMPLATES,
} from '../src/lib/engine/registry';
import { checkAnswer } from '../src/lib/engine/answer';
import { displayAnswer } from '../src/lib/math/format';
import { eq, rat } from '../src/lib/math/rational';
import { seedFor } from '../src/lib/math/rng';
import type { Band } from '../src/lib/engine/types';

const SKILL_IDS = new Set(SKILLS.map((s) => s.id));
const METHOD_IDS = new Set(METHODS.map((m) => m.id));

describe('skill graph', () => {
  it('has unique ids and existing prereqs', () => {
    expect(SKILL_IDS.size).toBe(SKILLS.length);
    for (const s of SKILLS) {
      for (const p of s.prereqs) {
        expect(SKILL_IDS.has(p), `${s.id} has unknown prereq ${p}`).toBe(true);
      }
    }
  });

  it('is a DAG (topological order exists)', () => {
    const indeg = new Map<string, number>(SKILLS.map((s) => [s.id, 0]));
    const edges = new Map<string, string[]>(SKILLS.map((s) => [s.id, []]));
    for (const s of SKILLS) {
      for (const p of s.prereqs) {
        edges.get(p)!.push(s.id);
        indeg.set(s.id, (indeg.get(s.id) ?? 0) + 1);
      }
    }
    const queue = SKILLS.filter((s) => s.prereqs.length === 0).map((s) => s.id);
    let seen = 0;
    while (queue.length > 0) {
      const id = queue.pop()!;
      seen++;
      for (const next of edges.get(id) ?? []) {
        const d = indeg.get(next)! - 1;
        indeg.set(next, d);
        if (d === 0) queue.push(next);
      }
    }
    expect(seen).toBe(SKILLS.length);
  });
});

describe('fact families', () => {
  it('produces the expected finite fact sets', () => {
    expect(listFacts('tables').length).toBe(120);
    expect(listFacts('squares').length).toBe(30);
    expect(listFacts('complements-100').length).toBe(99);
    expect(listFacts('complements-1000').length).toBe(999);
    expect(listFacts('fraction-equivalents').length).toBe(25);
    expect(listFacts('percent-anchors').length).toBe(6);
  });

  it('fact ids are canonical and include the cheatsheet extras', () => {
    expect(tableFactId(9, 7)).toBe('t:7x9');
    expect(tableFactId(14, 15)).toBe('t:14x15');
    expect(squareFactId(25)).toBe('sq:25');
    expect(complementFactId(100, 23)).toBe('c100:23');
    expect(complementFactId(1000, 476)).toBe('c1000:476');
    expect(fractionFactId(7, 16)).toBe('fe:7/16');
    expect(percentAnchorFactId(25)).toBe('pa:25');
    for (const extra of ['fe:1/12', 'fe:1/15', 'fe:1/25', 'fe:1/50', 'fe:3/16', 'fe:5/16', 'fe:7/16']) {
      expect(listFacts('fraction-equivalents')).toContain(extra);
    }
    for (const f of FACT_FAMILIES) {
      const ids = listFacts(f);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });
});

describe('methods', () => {
  it('every method field references existing nodes', () => {
    for (const m of METHODS) {
      expect(SKILL_IDS.has(m.skill), `${m.id}.skill`).toBe(true);
      for (const p of m.prereqs) {
        expect(SKILL_IDS.has(p), `${m.id} prereq ${p}`).toBe(true);
      }
      for (const n of m.next) {
        expect(METHOD_IDS.has(n), `${m.id} next ${n}`).toBe(true);
      }
      expect(
        TEMPLATES.some((t) => t.id === m.exampleTemplate),
        `${m.id} exampleTemplate ${m.exampleTemplate}`,
      ).toBe(true);
    }
  });

  it('method example generation produces valid questions', () => {
    for (const m of METHODS) {
      const q = generate(m.exampleTemplate, seedFor('example', m.id, 0), m.exampleBand);
      expect(q.prompt.trim().length).toBeGreaterThan(0);
      expect(q.route.length).toBeGreaterThan(0);
    }
  });
});

describe('template/skill wiring', () => {
  it('every template skill and skills[] exists', () => {
    for (const t of TEMPLATES) {
      expect(SKILL_IDS.has(t.skill), `${t.id}.skill`).toBe(true);
      for (const s of t.skills ?? []) {
        expect(SKILL_IDS.has(s), `${t.id} skills[] ${s}`).toBe(true);
      }
    }
  });

  it('every method/application skill has at least one template', () => {
    const covered = new Set<string>();
    for (const t of TEMPLATES) {
      covered.add(t.skill);
      for (const s of t.skills ?? []) covered.add(s);
    }
    for (const s of SKILLS) {
      if (s.kind === 'method' || s.kind === 'application') {
        expect(covered.has(s.id), `no template covers skill ${s.id}`).toBe(true);
      }
    }
  });

  it('every strategy id in generated questions is a known method', () => {
    const bands: Band[] = [0, 1, 2, 3];
    for (const t of TEMPLATES) {
      for (const band of bands) {
        for (let seed = 1; seed <= 20; seed++) {
          const q = generate(t.id, seed, band);
          for (const s of q.strategies) {
            expect(
              METHOD_IDS.has(s),
              `${t.id} seed ${seed} band ${band}: unknown strategy ${s}`,
            ).toBe(true);
          }
        }
      }
    }
  });
});

describe('fact generation', () => {
  it('generateFact reproduces every fact with a correct answer', () => {
    for (const family of FACT_FAMILIES) {
      const templateId = factTemplateFor(family);
      for (const factId of listFacts(family)) {
        const q = generateFact(templateId, factId, 11);
        expect(q.factId, `${templateId}(${factId}) factId`).toBe(factId);
        const shown = displayAnswer(q.answer);
        expect(
          checkAnswer(q.answer, shown).correct,
          `${templateId}(${factId}): "${q.prompt}" -> "${shown}"`,
        ).toBe(true);
      }
    }
  });

  it('generateFact answers match an independent oracle', () => {
    for (const family of FACT_FAMILIES) {
      const templateId = factTemplateFor(family);
      for (const factId of listFacts(family)) {
        const q = generateFact(templateId, factId, 13);
        if (q.answer.kind !== 'exact') throw new Error(`${factId}: not exact`);
        let expected: ReturnType<typeof rat>;
        if (family === 'tables') {
          const m = /^t:(\d+)x(\d+)$/.exec(factId)!;
          expected = rat(Number(m[1]) * Number(m[2]));
        } else if (family === 'squares') {
          expected = rat(Number(factId.slice(3)) ** 2);
        } else if (family.startsWith('complements')) {
          const m = /^c(\d+):(\d+)$/.exec(factId)!;
          expected = rat(Number(m[1]) - Number(m[2]));
        } else if (family === 'fraction-equivalents') {
          const m = /^fe:(\d+)\/(\d+)$/.exec(factId)!;
          const n = Number(m[1]);
          const d = Number(m[2]);
          expected = q.params.ask === 'percent' ? rat(100 * n, d) : rat(n, d);
        } else {
          const p = Number(factId.slice(3));
          expected = rat(Number(q.params.n) * p, 100);
        }
        expect(eq(q.answer.value, expected), `${factId}: ${q.prompt}`).toBe(true);
      }
    }
  });
});

describe('benchmark coverage', () => {
  // Every capability row in the brief's benchmark table maps to a template.
  const BENCHMARK_MAP: Record<string, string[]> = {
    'multi-term addition (23 + 146 + 12 + 9 + 80)': ['add-multi-term'],
    'multi-term multiplication (12 x 23 x 45)': ['mul-multi-term'],
    'subtraction (10,000 - 6,785)': ['sub'],
    'decimal division (7.2 / 0.6)': ['div-decimal'],
    'squares (47^2)': ['square-general', 'square-fact'],
    'near-base multiplication (98 x 97)': ['mul-near-base'],
    'three-digit multiplication (125 x 384)': ['mul-3-digit-structured'],
    'percentages (18% of 240)': ['pct-of'],
    'reverse percentages (680 / 0.85)': ['pct-reverse'],
    'fraction conversion (7/16)': ['frac-to-dec-pct'],
    'decimal multiplication (3.75 x 2.4)': ['dec-mul'],
    'discounts (20% off AED 312.50)': ['pct-discount'],
    'compound percentage (800 x 1.2 x 0.85)': ['pct-compound'],
    'ratios (split 3,600 in 2:3:4)': ['ratio-split'],
    'estimation (19,850 / 397)': ['div-estimate', 'estimate-product'],
    'addition': ['add-two'],
    'subtraction general': ['sub'],
    'powers': ['powers'],
    'roots': ['roots'],
    'unit prices': ['unit-price'],
    'margin vs markup': ['margin-markup'],
    'interest': ['simple-interest'],
    'taxes': ['tax-inclusive'],
    'currency arithmetic': ['currency-convert'],
    'multi-step chains': ['mixed-chain'],
    'signed numbers': ['signed'],
    'proportions': ['proportion'],
  };

  it('every benchmark class has at least one registered template', () => {
    const ids = new Set(TEMPLATES.map((t) => t.id));
    for (const [name, templates] of Object.entries(BENCHMARK_MAP)) {
      const found = templates.some((id) => ids.has(id));
      expect(found, `benchmark class "${name}" has no template`).toBe(true);
    }
  });

  it('benchmark classes produce band-2 questions', () => {
    const ids = new Set(TEMPLATES.map((t) => t.id));
    for (const [, templates] of Object.entries(BENCHMARK_MAP)) {
      for (const id of templates) {
        if (!ids.has(id)) continue;
        const q = generate(id, 42, 2);
        expect(q.prompt.length).toBeGreaterThan(0);
      }
    }
  });
});
