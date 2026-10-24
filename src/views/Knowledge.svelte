<script lang="ts">
  import { app, go, startPractice } from '../lib/app.svelte';
  import { studySheet } from '../lib/content/study';
  import { METHODS } from '../lib/content/methods';
  import { SKILLS } from '../lib/content/skills';
  import { isDue, newRec, status } from '../lib/learn/model';
  import { dependents, effectiveStatus, practicable } from '../lib/learn/scheduler';
  import FactGrid from '../components/FactGrid.svelte';
  import MethodCard from '../components/MethodCard.svelte';

  const st = $derived(app.state!);
  const now = Date.now();

  const FAMILY_NAME: Record<number, string> = {
    1: 'Foundations',
    2: 'Addition and subtraction',
    3: 'Multiplication',
    4: 'Division and decimals',
    5: 'Fractions',
    6: 'Percents and ratios',
    7: 'Estimation and chains',
  };

  const skillMap = new Map(SKILLS.map((s) => [s.id, s]));
  const methodsBySkill = new Map<string, typeof METHODS>();
  for (const m of METHODS) {
    const arr = methodsBySkill.get(m.skill) ?? [];
    arr.push(m);
    methodsBySkill.set(m.skill, arr);
  }

  const families = [1, 2, 3, 4, 5, 6, 7] as const;
  const detail = $derived(app.detail !== null ? skillMap.get(app.detail) : undefined);

  function chip(skillId: string): string {
    return effectiveStatus(st, skillId);
  }

  function level(skillId: string): number {
    return (st.skills[skillId] ?? newRec()).level;
  }

  function dueText(skillId: string): string {
    const rec = st.skills[skillId];
    if (!rec || rec.attempts === 0) return '';
    if (isDue(rec, now)) return 'due';
    if (rec.due - now <= 86400000) return 'today';
    return `in ${Math.ceil((rec.due - now) / 86400000)} d`;
  }

  const FACT_KIND = new Set(['fact']);

  // The memorization sheet: built once, tinted by each fact's record.
  const sheet = studySheet();
  function tint(factId: string): string {
    const rec = st.facts[factId];
    const s0 = rec ? status(rec) : 'new';
    return `st-${s0}`;
  }
  const DRILLS = {
    tables: ['tables-1-10', 'tables-11-15'],
    complements: ['complements-10', 'complements-100', 'complements-1000'],
    squares: ['squares-1-25', 'squares-26-50'],
    fractions: ['fraction-equivalents'],
    anchors: ['percent-anchors'],
  } as const;
  function drill(skills: readonly string[]) {
    startPractice('custom', [...skills], null, false, 'knowledge');
  }

  // #knowledge/base lands on the sheet without breaking skill details.
  $effect(() => {
    if (app.detail === 'base' && !detail) {
      requestAnimationFrame(() =>
        document.getElementById('base')?.scrollIntoView({ block: 'start' }),
      );
    }
  });
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && detail && go('knowledge')} />

<h1>Knowledge</h1>

{#if detail}
  {@const id = detail.id}
  <div class="card">
    <h3 style="margin-top:0">
      {detail.name}
      <span class="chip {chip(id)}">{chip(id)}</span>
      {#if practicable(id)}<span class="badge">B{level(id)}</span>{/if}
    </h3>
    <p>{detail.summary}</p>
    {#if detail.prereqs.length > 0}
      <p class="muted" style="margin-bottom:0.2rem">Needs:</p>
      <p style="display:flex;gap:0.4rem;flex-wrap:wrap">
        {#each detail.prereqs as p}
          <button
            class="secondary"
            style="min-height:0;padding:0.25rem 0.6rem"
            onclick={() => go('knowledge', p)}
          >{skillMap.get(p)?.name ?? p} <span class="chip {chip(p)}">{chip(p)}</span></button>
        {/each}
      </p>
    {/if}
    {#if dependents(id).length > 0}
      <p class="muted" style="margin-bottom:0.2rem">Unlocks:</p>
      <p style="display:flex;gap:0.4rem;flex-wrap:wrap">
        {#each dependents(id) as d}
          <button
            class="secondary"
            style="min-height:0;padding:0.25rem 0.6rem"
            onclick={() => go('knowledge', d)}
          >{skillMap.get(d)?.name ?? d}</button>
        {/each}
      </p>
    {/if}
    {#if FACT_KIND.has(detail.kind)}
      <FactGrid skillId={id} state={st} />
    {/if}
    {#each methodsBySkill.get(id) ?? [] as m}
      <MethodCard method={m} />
    {/each}
    {#if practicable(id)}
      <button onclick={() => startPractice('custom', [id])}>Practice this</button>
    {/if}
  </div>
{:else}
  <h2 id="base">Base knowledge</h2>
  <p class="legend">
    <span class="legend-cell st-new">not known</span>
    <span class="legend-cell st-learning">learning</span>
    <span class="legend-cell st-solid">solid</span>
    <span class="legend-cell st-strong">strong</span>
  </p>

  <div class="card">
    <h3 style="margin-top:0">Multiplication tables</h3>
    <div class="sheet-scroll">
      <table class="sheet">
        <thead>
          <tr>
            <th class="rowhead">×</th>
            {#each sheet.tables.cols as c}<th>{c}</th>{/each}
          </tr>
        </thead>
        <tbody>
          {#each sheet.tables.rows as r, ri}
            <tr>
              <th class="rowhead">{r}</th>
              {#each sheet.tables.cells[ri]! as cell}
                <td class={tint(cell.factId)}>{cell.product}</td>
              {/each}
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
    <button class="secondary" onclick={() => drill(DRILLS.tables)}>Drill</button>
  </div>

  <div class="card">
    <h3 style="margin-top:0">Complements</h3>
    {#each sheet.complements as comp}
      <p>
        <strong>to {comp.base}</strong>
        <span class="muted">: {comp.rule}</span><br />
        {#each comp.examples as ex, i}{i > 0 ? ', ' : ''}<span class="comp {tint(`c${comp.base}:${ex.n}`)}">{ex.n} → {ex.complement}</span>{/each}
      </p>
    {/each}
    <button class="secondary" onclick={() => drill(DRILLS.complements)}>Drill</button>
  </div>

  <div class="card">
    <h3 style="margin-top:0">Squares</h3>
    <div class="sheet-scroll">
      <table class="sheet">
        <tbody>
          <tr>
            <th class="rowhead">n</th>
            {#each sheet.squares as sq}<th>{sq.n}</th>{/each}
          </tr>
          <tr>
            <th class="rowhead">n²</th>
            {#each sheet.squares as sq}<td class={tint(sq.factId)}>{sq.sq}</td>{/each}
          </tr>
        </tbody>
      </table>
    </div>
    <button class="secondary" onclick={() => drill(DRILLS.squares)}>Drill</button>
  </div>

  <div class="card">
    <h3 style="margin-top:0">Fraction equivalents</h3>
    <table class="sheet">
      <tbody>
        {#each sheet.fractions as f}
          <tr class={tint(f.factId)}>
            <td>{f.fraction}</td>
            <td>{f.decimal}</td>
            <td>{f.percent}</td>
          </tr>
        {/each}
      </tbody>
    </table>
    <button class="secondary" onclick={() => drill(DRILLS.fractions)}>Drill</button>
  </div>

  <div class="card">
    <h3 style="margin-top:0">Percent anchors</h3>
    <table class="sheet">
      <tbody>
        {#each sheet.anchors as a}
          <tr class={tint(a.factId)}>
            <td>{a.percent}%</td>
            <td>{a.method}</td>
            <td>{a.example}</td>
          </tr>
        {/each}
      </tbody>
    </table>
    <button class="secondary" onclick={() => drill(DRILLS.anchors)}>Drill</button>
  </div>

  {#each families as fam}
    <h2>{FAMILY_NAME[fam]}</h2>
    {#each SKILLS.filter((s) => s.family === fam) as s}
      <button class="skill-row" onclick={() => go('knowledge', s.id)}>
        <span class="name">{s.name}</span>
        <span class="due">{dueText(s.id)}</span>
        {#if practicable(s.id)}<span class="badge">B{level(s.id)}</span>{/if}
        <span class="chip {chip(s.id)}">{chip(s.id)}</span>
      </button>
    {/each}
  {/each}
{/if}
