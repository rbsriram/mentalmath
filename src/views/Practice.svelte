<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import { app, commit, go, harnessHook, loadAttempts, logAttempt, startPractice } from '../lib/app.svelte';
  import { METHODS } from '../lib/content/methods';
  import { SKILLS } from '../lib/content/skills';
  import { FACT_FAMILIES, factFamilyOf } from '../lib/content/facts';
  import type { CheckResult } from '../lib/engine/answer';
  import {
    answerBenchmark,
    BENCHMARK_SLOTS,
    currentBenchmarkItem,
    finishBenchmark,
    startBenchmark,
    type BenchmarkState,
  } from '../lib/learn/benchmark';
  import {
    answerDiagnostic,
    applyDiagnosticPart,
    currentItem,
    finishDiagnostic,
    hasStartingPoint,
    partOf,
    partsDone,
    startDiagnostic,
    type DiagnosticState,
  } from '../lib/learn/diagnostic';
  import {
    answer as answerRound,
    dismissLesson,
    nextKind,
    newRound,
    serve,
    topicOf,
    ROUND_SIZE,
    type Round,
    type QuestionRef,
  } from '../lib/learn/round';
  import { practicable } from '../lib/learn/scheduler';
  import { localDay } from '../lib/learn/model';
  import { recordOutcome } from '../lib/learn/state';
  import { displayAnswer } from '../lib/math/format';
  import { createRng, seedFor } from '../lib/math/rng';
  import { bySkill, generate, generateFact, factTemplateFor } from '../lib/engine/registry';
  import type { Question as Q } from '../lib/engine/types';
  import MethodCard from '../components/MethodCard.svelte';
  import Question from '../components/Question.svelte';

  type Mode = 'idle' | 'round' | 'diagnostic' | 'benchmark';

  const skillName = new Map(SKILLS.map((s) => [s.id, s.name]));
  const methodById = new Map(METHODS.map((m) => [m.id, m]));
  const FAMILY_NAME: Record<number, string> = {
    1: 'Foundations',
    2: 'Addition and subtraction',
    3: 'Multiplication',
    4: 'Division and decimals',
    5: 'Fractions',
    6: 'Percents and ratios',
    7: 'Estimation and chains',
  };
  const FAMILY_LABEL: Record<string, string> = {
    tables: 'Tables',
    squares: 'Squares',
    'complements-10': 'Complements to 10',
    'fraction-equivalents': 'Fraction equivalents',
    'percent-anchors': 'Percent anchors',
  };
  // Base-fact entries in the chooser, matching the Knowledge Drill buttons.
  const BASE_ENTRIES: { value: string; label: string; skills: string[] }[] = [
    { value: 'facts:tables', label: 'Tables', skills: ['tables-1-10', 'tables-11-15'] },
    { value: 'skill:complements', label: 'Complements (rule)', skills: ['complements-100', 'complements-1000'] },
    { value: 'facts:squares', label: 'Squares', skills: ['squares-1-25', 'squares-26-50'] },
    { value: 'facts:fraction-equivalents', label: 'Fraction equivalents', skills: ['fraction-equivalents'] },
    { value: 'facts:percent-anchors', label: 'Percent anchors', skills: ['percent-anchors'] },
  ];

  let mode = $state<Mode>('idle');
  // Part 1 runs standalone before the first daily card; when it ends the
  // run goes back to Today instead of showing the between-round card.
  let standalone = false;
  let round = $state<Round | null>(null);
  let shown = $state<Q | null>(null);
  let diag = $state<DiagnosticState | null>(null);
  let bench = $state<BenchmarkState | null>(null);
  let pickTopic = $state('');
  let pickBand = $state('auto');

  const rng = createRng(Date.now() % 2147483647);
  const st = $derived(app.state!);
  const families = $derived([...new Set(SKILLS.map((s) => s.family))].sort());
  const practicableByFamily = $derived(
    new Map(families.map((f) => [f, SKILLS.filter((s) => s.family === f && practicable(s.id))])),
  );

  const roundKey = $derived(
    round?.current
      ? `${round.current.templateId}|${round.current.seed}|${round.current.band}|${round.current.factId ?? ''}`
      : null,
  );
  const roundQuestion = $derived.by(() =>
    roundKey === null ? null : untrack(() => regen(round!.current!)),
  );
  $effect(() => {
    if (roundQuestion !== null) shown = roundQuestion;
  });

  const diagKey = $derived(diag && !diag.done ? `${diag.probeIndex}|${diag.itemIndex}` : null);
  const diagQuestion = $derived.by(() =>
    diagKey === null ? null : untrack(() => currentItem(diag!)),
  );
  const benchQuestion = $derived.by(() =>
    bench === null || bench.done ? null : untrack(() => currentBenchmarkItem(bench!)),
  );
  const question = $derived<Q | null>(
    mode === 'round' ? shown
    : mode === 'diagnostic' ? diagQuestion
    : mode === 'benchmark' ? benchQuestion
    : null,
  );

  // A lesson card shows before the served question when round.lesson is set.
  const lessonMethod = $derived(
    round?.lesson ? (methodById.get(round.lesson) ?? null) : null,
  );

  const headLabel = $derived(
    mode === 'diagnostic'
      ? 'Diagnostic'
      : mode === 'benchmark'
        ? 'Benchmark'
        : mode === 'round' && round?.currentTopic
          ? (skillName.get(round.currentTopic) ?? FAMILY_LABEL[round.currentTopic] ?? round.currentTopic)
          : 'Practice',
  );
  const headRight = $derived(
    mode === 'diagnostic' && diag
      ? `Round ${Math.min(4, partOf(diag.probeIndex) + 1)} of 4`
      : mode === 'benchmark' && bench
        ? `${bench.slotIndex + 1} of ${BENCHMARK_SLOTS.length}`
        : mode === 'round' && round
          ? `${Math.min(round.size, round.items.length + (round.current ? 1 : 0))}/${round.size}`
          : '',
  );

  // The round-between card data.
  const roundDone = $derived(
    mode === 'round' && round !== null && round.done && shown === null,
  );
  const diagBoundary = $derived(mode === 'diagnostic' && diag !== null && (diag.done || diag.partBoundary));
  const misses = $derived(round === null ? 0 : round.items.filter((i) => !i.correct).length);

  function regen(ref: QuestionRef): Q {
    if (ref.factId !== undefined) {
      const fam = factFamilyOf(ref.factId)!;
      return generateFact(factTemplateFor(fam), ref.factId, ref.seed);
    }
    return generate(ref.templateId, ref.seed, ref.band);
  }

  function saveRound(r: Round, s = app.state!) {
    round = r;
    commit({ ...s, round: r });
  }

  // Mode comes from state, not the last startPractice call.
  function begin() {
    const now = Date.now();
    const s = app.state!;
    const diagInFlight = s.diagnostic !== null && !s.diagnosticDone;
    const benchInFlight = s.benchmark !== null && !s.benchmark.done;
    const explicit = app.practiceExplicit;
    app.practiceExplicit = false;

    let m: Mode;
    const opts = app.roundOpts;
    if (explicit && app.practiceMode === 'round' && opts.kind !== undefined && opts.kind !== 'mixed') m = 'round';
    else if (benchInFlight) m = 'benchmark';
    else if (diagInFlight && !hasStartingPoint(s)) m = 'diagnostic';
    else if (explicit && app.practiceMode === 'diagnostic' && diagInFlight) m = 'diagnostic';
    else if (!hasStartingPoint(s)) m = 'diagnostic';
    else if (explicit && app.practiceMode === 'round') m = 'round';
    else if (explicit && app.practiceMode === 'benchmark') m = 'benchmark';
    else if (explicit && app.practiceMode === 'diagnostic') m = 'diagnostic';
    else m = 'idle';
    mode = m;
    app.running = m !== 'idle';

    if (m === 'round') {
      let r = s.round;
      if (r === null || r.done || r.date !== localDay(now) || r.kind !== (opts.kind ?? 'mixed') || (opts.kind === 'facts' && r.topic !== opts.topic) || (opts.kind === 'skill' && r.skills.join() !== (opts.skills ?? []).join())) {
        const out = newRound(s, now, Math.floor(rng.next() * 2147483647), opts);
        commit(out.state);
        r = out.round;
      }
      round = r;
      serveNow();
    } else if (m === 'diagnostic') {
      standalone = !hasStartingPoint(s);
      if (s.diagnostic) diag = s.diagnostic;
      else {
        const out = startDiagnostic(s, now);
        diag = out.diagnostic;
        commit(out.state);
      }
    } else if (m === 'benchmark') {
      if (s.benchmark) bench = s.benchmark;
      else {
        const out = startBenchmark(s, now);
        bench = out.benchmark;
        commit(out.state);
      }
    }
  }

  function serveNow() {
    if (!round) return;
    saveRound(serve(round, app.state!, Date.now()));
  }

  function onSubmit(raw: string, ms: number): CheckResult {
    const now = Date.now();
    if (mode === 'round' && round && shown) {
      const out = answerRound(round, app.state!, shown, raw, ms, now);
      round = out.round;
      commit(out.state);
      logAttempt(out.attempt);
      return out.result;
    }
    if (mode === 'diagnostic' && diag) {
      const out = answerDiagnostic(app.state!, diag, raw, ms, now);
      diag = out.diagnostic;
      commit(out.state);
      logAttempt(out.attempt);
      return out.result;
    }
    if (mode === 'benchmark' && bench) {
      const out = answerBenchmark(app.state!, bench, raw, ms, now);
      bench = out.benchmark;
      commit(out.state);
      logAttempt(out.attempt);
      return out.result;
    }
    return { correct: false };
  }

  function onNext() {
    if (mode === 'round' && round) {
      shown = null;
      if (round.done) return; // done card shows via roundDone
      serveNow();
    } else if (mode === 'diagnostic' && diag) {
      // next item renders from derived currentItem
    } else if (mode === 'benchmark' && bench) {
      if (bench.done) void finishBench();
    }
  }

  // Assessment finish guards.
  let finishing = $state(false);
  $effect(() => {
    if (mode === 'diagnostic' && diag && (diag.done || diag.partBoundary) && !finishing) {
      finishing = true;
      if (diag.done) void finishDiag();
      else {
        // lastRoundKind is set only for diagnostic rounds, not for the
        // standalone part-1 run; otherwise nextKind would skip part 2.
        commit({
          ...applyDiagnosticPart(app.state!, diag, Date.now()),
          lastRoundKind: standalone ? app.state!.lastRoundKind : 'diagnostic',
        });
        finishing = false;
        if (standalone) go('today');
      }
    }
    if (mode === 'benchmark' && bench?.done && !finishing) {
      finishing = true;
      void finishBench();
    }
  });

  async function finishDiag() {
    const attempts = await loadAttempts();
    const out = finishDiagnostic(app.state!, diag!, attempts, Date.now());
    commit({ ...out.state, lastRoundKind: 'diagnostic' });
    finishing = false;
    // The "Diagnostic complete" card stays on screen; Again gives mixed.
  }

  async function finishBench() {
    const attempts = await loadAttempts();
    const out = finishBenchmark(app.state!, bench!, attempts, Date.now());
    commit(out.state);
    go('progress');
  }

  function lessonContinue() {
    if (!round) return;
    const out = dismissLesson(round, app.state!);
    saveRound(out.round, out.state);
  }

  function stopRun() {
    if (mode === 'round' && round) {
      commit({ ...app.state!, round: null });
      round = null;
    }
    leaveRun();
  }

  function leaveRun() {
    if (app.runOrigin === 'practice') {
      mode = 'idle';
      app.running = false;
      shown = null;
      round = null;
    } else if (app.runOrigin === 'knowledge') {
      go('knowledge');
    } else {
      go('today');
    }
  }

  function again() {
    // The sequencing rule: Again follows nextKind. Skill/facts rounds
    // repeat their own topic instead.
    if (mode === 'round' && round && (round.kind === 'skill' || round.kind === 'facts')) {
      const rep = { kind: round.kind, ...(round.topic !== null ? { topic: round.topic } : {}), skills: round.skills, band: round.band };
      const out = newRound(st, Date.now(), Math.floor(rng.next() * 2147483647), rep);
      commit({ ...out.state, round: out.round });
      round = out.round;
      shown = null;
      serveNow();
      return;
    }
    const kind = nextKind(st);
    if (kind === 'diagnostic') {
      mode = 'diagnostic';
      app.running = true;
      if (st.diagnostic) diag = st.diagnostic;
      finishing = false;
      return;
    }
    // Mixed follow-up: create the round here rather than through
    // startPractice, which would re-navigate and re-arm practiceExplicit.
    app.roundOpts = { kind: 'mixed' };
    mode = 'round';
    app.running = true;
    const out = newRound(st, Date.now(), Math.floor(rng.next() * 2147483647), app.roundOpts);
    commit({ ...out.state, round: out.round });
    round = out.round;
    shown = null;
    serveNow();
  }

  function chooseTopic() {
    mode = 'idle';
    app.running = false;
    shown = null;
    round = null;
    app.runOrigin = 'practice';
  }

  function startFromChooser() {
    if (pickTopic === '') {
      startPractice('round', { kind: 'mixed' }, 'practice');
    } else if (pickTopic.startsWith('facts:')) {
      startPractice('round', { kind: 'facts', topic: pickTopic.slice(6) }, 'practice');
    } else if (pickTopic === 'skill:complements') {
      const band = pickBand === 'auto' ? null : (Number(pickBand) as 0|1|2|3);
      startPractice('round', { kind: 'skill', skills: ['complements-100', 'complements-1000'], band }, 'practice');
    } else {
      const band = pickBand === 'auto' ? null : (Number(pickBand) as 0|1|2|3);
      startPractice('round', { kind: 'skill', skills: [pickTopic], band }, 'practice');
    }
    begin();
  }

  onMount(() => {
    begin();
    return () => { app.running = false; };
  });

  function onCardKey(e: KeyboardEvent) {
    if (app.keysOpen) return;
    if (e.key === 'Escape' && mode !== 'idle') {
      e.preventDefault();
      stopRun();
      return;
    }
    if (e.key === 'Enter') {
      if (round?.lesson) { e.preventDefault(); lessonContinue(); }
      else if (roundDone || diagBoundary) { e.preventDefault(); again(); }
    }
  }

  const mm = harnessHook();
  if (mm) {
    mm.currentAnswer = () => (question ? displayAnswer(question.answer) : null);
    mm.round = () => (round ? $state.snapshot(round) : null);
  }

</script>

<svelte:window onkeydown={onCardKey} />

{#if mode !== 'idle'}
  <div class="runhead">
    <span class="runlabel">{headLabel}</span>
    <span class="runtime">{headRight}</span>
  </div>
{/if}

{#if mode === 'idle'}
  <div class="card">
    <h3 style="margin-top:0">Practice</h3>
    <div style="display:flex;gap:0.5rem;flex-wrap:wrap">
      <select bind:value={pickTopic} aria-label="Topic">
        <option value="">Everything</option>
        <optgroup label="Base facts">
          {#each BASE_ENTRIES as e}<option value={e.value}>{e.label}</option>{/each}
        </optgroup>
        {#each families as f}
          <optgroup label={FAMILY_NAME[f] ?? `Family ${f}`}>
            {#each practicableByFamily.get(f) ?? [] as s}
              <option value={s.id}>{s.name}</option>
            {/each}
          </optgroup>
        {/each}
      </select>
      <select bind:value={pickBand} aria-label="Band">
        <option value="auto">Auto band</option>
        <option value="0">Band 0</option>
        <option value="1">Band 1</option>
        <option value="2">Band 2</option>
        <option value="3">Band 3</option>
      </select>
      <button onclick={startFromChooser}>Start</button>
    </div>
  </div>
{:else if mode === 'round' && round}
  {#if roundDone}
    <div class="card">
      <h3 style="margin-top:0">Round done</h3>
      <p>{round.items.filter((i) => i.correct).length} of {round.size} right.{misses > 0 ? ` ${misses} come back later.` : ''}</p>
      <button onclick={again}>Again</button>
      <button class="secondary" onclick={chooseTopic}>Choose topic</button>
      <button class="secondary" onclick={leaveRun}>Done</button>
    </div>
  {:else if round.lesson && lessonMethod}
    <MethodCard method={lessonMethod} />
    <button onclick={lessonContinue}>Continue</button>
  {:else if question}
    <Question {question} {onSubmit} {onNext} />
  {:else}
    <div class="card"><p class="muted">Preparing...</p></div>
  {/if}
  {#if !roundDone}
    <p><button class="stop" onclick={stopRun}>Stop</button></p>
  {/if}
{:else if mode === 'diagnostic' && diag}
  {#if diag.done || diag.partBoundary}
    <div class="card">
      <h3 style="margin-top:0">
        {diag.done ? 'Diagnostic complete' : `Diagnostic round ${Math.min(4, partsDone(diag))} of 4 done`}
      </h3>
      <button onclick={again}>Again</button>
      <button class="secondary" onclick={chooseTopic}>Choose topic</button>
      <button class="secondary" onclick={leaveRun}>Done</button>
    </div>
  {:else if question}
    <Question {question} {onSubmit} {onNext} skippable />
  {:else}
    <div class="card"><p class="muted">Finishing...</p></div>
  {/if}
  {#if !(diag.done || diag.partBoundary)}
    <p><button class="stop" onclick={stopRun}>Stop</button></p>
  {/if}
{:else if mode === 'benchmark' && bench}
  {#if question}
    <Question {question} {onSubmit} {onNext} skippable />
  {:else}
    <div class="card"><p class="muted">Finishing...</p></div>
  {/if}
  <p><button class="stop" onclick={stopRun}>Stop</button></p>
{/if}
