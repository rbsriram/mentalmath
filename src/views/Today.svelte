<script lang="ts">
  import { app, go, startPractice } from '../lib/app.svelte';
  import { SKILLS } from '../lib/content/skills';
  import { benchmarkDue } from '../lib/learn/benchmark';
  import { practicable } from '../lib/learn/scheduler';
  import { planSession, type Session } from '../lib/learn/session';
  import { localDay } from '../lib/learn/model';
  import type { State } from '../lib/learn/state';

  const st = $derived(app.state!);
  const now = Date.now();

  const skillName = new Map(SKILLS.map((s) => [s.id, s.name]));
  const FAMILY_NAME: Record<number, string> = {
    1: 'Foundations',
    2: 'Addition and subtraction',
    3: 'Multiplication',
    4: 'Division and decimals',
    5: 'Fractions',
    6: 'Percents and ratios',
    7: 'Estimation and chains',
  };

  const today = $derived(
    new Date(now).toLocaleDateString(undefined, {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
    }),
  );

  // The plan for today: resume an unfinished session, else show a fresh plan.
  const session = $derived(st.session);
  const sessionToday = $derived(
    session !== null && session.date === localDay(now) && !session.completed,
  );
  const plan = $derived<Session>(
    sessionToday ? session! : planSession(st, now, now % 100000),
  );
  const completedSummary = $derived(
    st.sessions.at(-1)?.date === localDay(now) ? st.sessions.at(-1)! : null,
  );

  let customSkill = $state('');
  let customBand = $state('auto');

  const families = $derived(
    [...new Set(SKILLS.map((s) => s.family))].sort() as number[],
  );
  const practicableByFamily = $derived(
    new Map(
      families.map((f) => [
        f,
        SKILLS.filter((s) => s.family === f && practicable(s.id)),
      ]),
    ),
  );

  function fmtPhase(kind: string): string {
    return kind[0]!.toUpperCase() + kind.slice(1);
  }

  function start() {
    startPractice('session');
  }

  function startCustom() {
    if (!customSkill) return;
    const band = customBand === 'auto' ? null : Number(customBand);
    startPractice('custom', [customSkill], band);
  }
</script>

<h1>Today</h1>
<p class="muted">{today}</p>

{#if !st.diagnosticDone}
  <div class="card">
    <p>A 15 to 20 minute diagnostic sets your starting point.</p>
    <button onclick={() => startPractice('diagnostic')}>
      {st.diagnostic ? 'Resume diagnostic' : 'Start diagnostic'}
    </button>
  </div>
{:else}
  {#if benchmarkDue(st, now)}
    <div class="card">
      <p><strong>Monthly benchmark is due.</strong></p>
      <button class="secondary" onclick={() => startPractice('benchmark')}>
        Start benchmark
      </button>
    </div>
  {/if}

  {#if completedSummary}
    <div class="card">
      <h3 style="margin-top:0">Done for today</h3>
      <p>
        {completedSummary.minutes} min, {completedSummary.answered} answered,
        {completedSummary.answered > 0
          ? Math.round((completedSummary.correct / completedSummary.answered) * 100)
          : 0}% correct.
        {#if completedSummary.newMethod}
          New method: {skillName.get(completedSummary.newMethod) ?? completedSummary.newMethod}.
        {/if}
      </p>
      <button class="secondary" onclick={() => startPractice('custom', SKILLS.filter((s) => practicable(s.id)).map((s) => s.id))}>
        Practice more
      </button>
    </div>
  {:else}
    <div class="card">
      <h3 style="margin-top:0">Your 30 minutes</h3>
      <ul>
        {#each plan.phases as phase}
          {#if phase.budgetMs > 0}
            <li>
              {fmtPhase(phase.kind)}: {Math.round(phase.budgetMs / 60000)} min
              {#if phase.kind === 'learn' && plan.target}
                <span class="muted">
                  ({skillName.get(plan.target) ?? plan.target})
                </span>
              {/if}
              {#if phase.elapsedMs > 0}
                <span class="muted">- {Math.round(phase.elapsedMs / 6000) / 10} min done</span>
              {/if}
            </li>
          {/if}
        {/each}
      </ul>
      <button onclick={start}>{sessionToday ? 'Resume' : 'Start'}</button>
    </div>
  {/if}

  <div class="card">
    <h3 style="margin-top:0">Custom practice</h3>
    <div style="display:flex;gap:0.5rem;flex-wrap:wrap">
      <select bind:value={customSkill} aria-label="Skill">
        <option value="">Choose a skill</option>
        {#each families as f}
          <optgroup label={FAMILY_NAME[f] ?? `Family ${f}`}>
            {#each practicableByFamily.get(f) ?? [] as s}
              <option value={s.id}>{s.name}</option>
            {/each}
          </optgroup>
        {/each}
      </select>
      <select bind:value={customBand} aria-label="Band">
        <option value="auto">Auto band</option>
        <option value="0">Band 0</option>
        <option value="1">Band 1</option>
        <option value="2">Band 2</option>
        <option value="3">Band 3</option>
      </select>
      <button onclick={startCustom} disabled={!customSkill}>Start</button>
    </div>
  </div>
{/if}
