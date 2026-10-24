<script lang="ts">
  import { onMount } from 'svelte';
  import { app, startPractice } from '../lib/app.svelte';
  import { SKILLS } from '../lib/content/skills';
  import { benchmarkDue } from '../lib/learn/benchmark';
  import { hasStartingPoint, PART_LABELS, partsDone } from '../lib/learn/diagnostic';
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

  // Placement status.
  const diagParts = $derived(st.diagnostic ? partsDone(st.diagnostic) : 0);
  const diagPending = $derived(st.diagnostic !== null && !st.diagnosticDone);
  const started = $derived(hasStartingPoint(st));

  // In-progress session: "N of 30 min done. Next: Practice, 12 min".
  const elapsedMin = $derived(
    sessionToday
      ? Math.floor(session!.phases.reduce((x, p) => x + p.elapsedMs, 0) / 60000)
      : 0,
  );
  const nextPhase = $derived(
    sessionToday && session!.phaseIndex < session!.phases.length
      ? session!.phases[session!.phaseIndex]!
      : null,
  );

  let customSkill = $state('');
  let customBand = $state('auto');
  let btnStart = $state<HTMLButtonElement | null>(null);
  let btnContinue = $state<HTMLButtonElement | null>(null);
  let btnDiag = $state<HTMLButtonElement | null>(null);

  onMount(() => {
    const s = app.state!;
    const inProgress =
      s.session !== null && !s.session.completed && s.session.date === localDay(now);
    const pending = s.diagnostic !== null && !s.diagnosticDone;
    if (inProgress) btnStart?.focus();
    else if (pending) (btnContinue ?? btnDiag)?.focus();
    else (btnStart ?? btnDiag)?.focus();
  });

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

  function startShort() {
    startPractice('session', [], null, true);
  }

  function startCustom() {
    if (!customSkill) return;
    const band = customBand === 'auto' ? null : Number(customBand);
    startPractice('custom', [customSkill], band);
  }
</script>

<h1>Today</h1>
<p class="muted">{today}</p>

{#if !started}
  <div class="card">
    <p>A short placement test comes first, in 4 parts of about 5 minutes.</p>
    <ol>
      {#each PART_LABELS as label}
        <li>{label}</li>
      {/each}
    </ol>
    <button bind:this={btnDiag} onclick={() => startPractice('diagnostic')}>
      {diagPending ? 'Continue diagnostic' : 'Start diagnostic'}
    </button>
  </div>
{:else}
  {#if diagPending}
    <div class="card">
      <p><strong>Continue diagnostic</strong>, {4 - diagParts} parts left</p>
      <ul>
        {#each PART_LABELS.slice(diagParts) as label}
          <li>{label}</li>
        {/each}
      </ul>
      <button bind:this={btnContinue} class="secondary" onclick={() => startPractice('diagnostic')}>
        Continue
      </button>
    </div>
  {/if}

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
          : 0}% correct
        {#if completedSummary.newMethod}
          . New method: {skillName.get(completedSummary.newMethod) ?? completedSummary.newMethod}
        {/if}
      </p>
      <button class="secondary" onclick={() => startPractice('custom', SKILLS.filter((s) => practicable(s.id)).map((s) => s.id))}>
        Practice more
      </button>
    </div>
  {:else}
    <div class="card">
      <h3 style="margin-top:0">Your session</h3>
      {#if sessionToday}
        <p>
          {elapsedMin} of {session!.short ? 10 : 30} min done.
          {#if nextPhase}
            Next: {fmtPhase(nextPhase.kind)}, {Math.max(0, Math.ceil((nextPhase.budgetMs - nextPhase.elapsedMs) / 60000))} min
          {/if}
        </p>
      {/if}
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
      <div style="display:flex;gap:0.5rem">
        <button bind:this={btnStart} onclick={start}>{sessionToday ? 'Resume' : 'Start'}</button>
        {#if !sessionToday}
          <button class="secondary" onclick={startShort}>10 minutes</button>
        {/if}
      </div>
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
