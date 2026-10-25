import { describe, expect, it } from 'vitest';
import { checkAnswer } from '../src/lib/engine/answer';
import { listFacts } from '../src/lib/content/facts';
import { studySheet } from '../src/lib/content/study';
import { rat } from '../src/lib/math/rational';

const sheet = studySheet();

describe('study sheet', () => {
  it('has a full 15 by 15 table with canonical fact ids', () => {
    expect(sheet.tables.rows).toHaveLength(15);
    expect(sheet.tables.cols).toHaveLength(15);
    expect(sheet.tables.cells.flat()).toHaveLength(225);
    const ids = new Set(listFacts('tables'));
    for (const cell of sheet.tables.cells.flat()) {
      expect(ids.has(cell.factId)).toBe(true);
    }
    // canonical ids: a <= b
    expect(sheet.tables.cells[3]![4]!.product).toBe(20);
    expect(sheet.tables.cells[3]![4]!.factId).toBe('t:4x5');
  });

  it('has 30 squares, 25 fractions, 6 anchors, 5 complement pairs', () => {
    expect(sheet.squares).toHaveLength(30);
    expect(sheet.fractions).toHaveLength(25);
    expect(sheet.anchors).toHaveLength(6);
    expect(sheet.complements.pairs).toHaveLength(5);
    expect(sheet.complements.rule).toMatch(/^Work from the right\./);
    const ex = sheet.complements.examples;
    expect(ex.find((e) => e.n === 370)?.complement).toBe(630);
    expect(ex.find((e) => e.base === 100 && e.n === 68)?.complement).toBe(32);
  });

  it('every factId exists in its family', () => {
    const byFamily: [string, string[]][] = [
      ['squares', sheet.squares.map((x) => x.factId)],
      ['fraction-equivalents', sheet.fractions.map((x) => x.factId)],
      ['percent-anchors', sheet.anchors.map((x) => x.factId)],
    ];
    for (const [family, ids] of byFamily) {
      const all = new Set(listFacts(family as Parameters<typeof listFacts>[0]));
      for (const id of ids) expect(all.has(id)).toBe(true);
    }
  });

  it('decimal and percent strings round-trip through checkAnswer', () => {
    for (const f of sheet.fractions) {
      const [n, d] = f.fraction.split('/').map(Number);
      const decRes = checkAnswer(
        { kind: 'exact', value: rat(n!, d!), unit: 'number' },
        f.decimal,
      );
      expect(decRes.correct, `${f.fraction} decimal "${f.decimal}"`).toBe(true);
      const pctRes = checkAnswer(
        { kind: 'exact', value: rat(100 * n!, d!), unit: 'percent' },
        f.percent,
      );
      expect(pctRes.correct, `${f.fraction} percent "${f.percent}"`).toBe(true);
    }
  });

  it('complement pairs and examples are deterministic and correct', () => {
    const again = studySheet();
    expect(again.complements).toEqual(sheet.complements);
    for (const p of sheet.complements.pairs) {
      expect(p.a + p.b).toBe(10);
    }
    for (const ex of sheet.complements.examples) {
      expect(ex.n + ex.complement).toBe(ex.base);
    }
    const ids = new Set(listFacts('complements-10'));
    for (const p of sheet.complements.pairs) expect(ids.has(p.factId)).toBe(true);
  });
});
