<script lang="ts">
  import { onMount } from 'svelte';
  import { app, go, startPractice } from '../lib/app.svelte';
  import { benchmarkDue } from '../lib/learn/benchmark';
  import { hasStartingPoint, PART_LABELS, partsDone } from '../lib/learn/diagnostic';
  import { dueCounts, nextKind, strongCount } from '../lib/learn/round';
  import { localDay } from '../lib/learn/model';

  const st = $derived(app.state!);
  const now = Date.now();

  const today = $derived(
    new Date(now).toLocaleDateString(undefined, {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
    }),
  );

  const diagPending = $derived(st.diagnostic !== null && !st.diagnosticDone);
  const started = $derived(hasStartingPoint(st));
  const due = $derived(dueCounts(st, now));
  const strong = $derived(strongCount(st));
  const dayToday = $derived(st.days.find((d) => d.date === localDay(now)) ?? null);
  const startLabel = $derived(
    nextKind(st) === 'diagnostic' && st.diagnostic
      ? `Start diagnostic round ${Math.min(4, partsDone(st.diagnostic) + 1)} of 4`
      : 'Start',
  );
  const unfinished = $derived(
    st.round !== null && !st.round.done && st.round.date === localDay(now),
  );

  let btnStart = $state<HTMLButtonElement | null>(null);
  let btnDiag = $state<HTMLButtonElement | null>(null);

  onMount(() => {
    const s = app.state!;
    const pending = s.diagnostic !== null && !s.diagnosticDone;
    if (pending) btnDiag?.focus();
    else (btnStart ?? btnDiag)?.focus();
  });

  function start() {
    // An unfinished round continues whatever its kind; otherwise the
    // sequencing rule decides.
    startPractice(unfinished || nextKind(st) !== 'diagnostic' ? 'round' : 'diagnostic');
  }
</script>

<h1>Today</h1>
<p class="muted">{today}</p>

{#if !started}
  <div class="card">
    <p>A short placement test comes first, in 4 rounds of 5 probes.</p>
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

  <div class="card">
    <p>
      {due.facts + due.skills > 0
        ? `Due now: ${due.facts} facts, ${due.skills} skills.`
        : 'Nothing due right now.'}
    </p>
    {#if dayToday && dayToday.rounds > 0}
      <p>
        Today: {dayToday.rounds} {dayToday.rounds === 1 ? 'round' : 'rounds'},
        {dayToday.correct} of {dayToday.answered} right.
      </p>
    {/if}
    <p class="muted">{strong.strong} of {strong.total} skills strong.</p>
    <button bind:this={btnStart} onclick={start}>
      {unfinished ? 'Continue round' : startLabel}
    </button>
  </div>
{/if}
