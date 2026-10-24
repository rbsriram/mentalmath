<script lang="ts">
  import { onMount } from 'svelte';
  import { app, go, startPractice } from '../lib/app.svelte';
  import { SKILLS } from '../lib/content/skills';
  import { benchmarkDue } from '../lib/learn/benchmark';
  import { hasStartingPoint, PART_LABELS, partsDone } from '../lib/learn/diagnostic';
  import { planSession, type Session } from '../lib/learn/session';
  import { localDay } from '../lib/learn/model';
  import type { State } from '../lib/learn/state';

  const st = $derived(app.state!);
  const now = Date.now();

  const skillName = new Map(SKILLS.map((s) => [s.id, s.name]));

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

  let btnStart = $state<HTMLButtonElement | null>(null);
  let btnDiag = $state<HTMLButtonElement | null>(null);

  onMount(() => {
    const s = app.state!;
    const inProgress =
      s.session !== null && !s.session.completed && s.session.date === localDay(now);
    const pending = s.diagnostic !== null && !s.diagnosticDone;
    if (inProgress) btnStart?.focus();
    else if (pending) btnDiag?.focus();
    else (btnStart ?? btnDiag)?.focus();
  });

  function fmtPhase(kind: string): string {
    return kind[0]!.toUpperCase() + kind.slice(1);
  }

  function start() {
    startPractice('session');
  }

  function startShort() {
    startPractice('session', [], null, true);
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
    <button class="secondary" onclick={() => go('knowledge', 'base')}>
      Study base facts
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
          : 0}% correct
        {#if completedSummary.newMethod}
          . New method: {skillName.get(completedSummary.newMethod) ?? completedSummary.newMethod}
        {/if}
      </p>
      <button class="secondary" onclick={() => go('practice')}>
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
              {#if phase.kind === 'diagnostic' && st.diagnostic}
                Diagnostic part {Math.min(4, partsDone(st.diagnostic) + 1)} of 4: {Math.round(phase.budgetMs / 60000)} min
              {:else}
                {fmtPhase(phase.kind)}: {Math.round(phase.budgetMs / 60000)} min
              {/if}
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

{/if}
