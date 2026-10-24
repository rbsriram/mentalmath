<script lang="ts">
  import { app, go, startPractice } from '../lib/app.svelte';
  import { METHODS } from '../lib/content/methods';
  import { SKILLS } from '../lib/content/skills';
  import { isDue, newRec } from '../lib/learn/model';
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
