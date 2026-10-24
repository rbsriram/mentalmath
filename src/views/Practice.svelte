<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import { app, commit, commitQuiet, go, harnessHook, loadAttempts, logAttempt, startPractice } from '../lib/app.svelte';
  import { METHODS } from '../lib/content/methods';
  import { SKILLS } from '../lib/content/skills';
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
  import { practicable, pickQuestion } from '../lib/learn/scheduler';
  import {
    advanceIfOver,
    answer,
    currentQuestion,
    finishSession,
    markLessonShown,
    nextQuestion,
    pause,
    planSession,
    resume,
    tick,
    type Session,
  } from '../lib/learn/session';
  import { localDay } from '../lib/learn/model';
  import { recordOutcome } from '../lib/learn/state';
  import { displayAnswer } from '../lib/math/format';
  import { createRng } from '../lib/math/rng';
  import type { Question as Q } from '../lib/engine/types';
  import MethodCard from '../components/MethodCard.svelte';
  import Question from '../components/Question.svelte';

  type Mode = 'idle' | 'session' | 'diagnostic' | 'benchmark' | 'custom';

  const skillName = new Map(SKILLS.map((s) => [s.id, s.name]));
  const methodFor = new Map(METHODS.map((m) => [m.skill, m]));
  const FAMILY_NAME: Record<number, string> = {
    1: 'Foundations',
    2: 'Addition and subtraction',
    3: 'Multiplication',
    4: 'Division and decimals',
    5: 'Fractions',
    6: 'Percents and ratios',
    7: 'Estimation and chains',
  };

  let mode = $state<Mode>('idle');
  let session = $state<Session | null>(null);
  let shown = $state<Q | null>(null); // the question on screen; survives answering
  let diag = $state<DiagnosticState | null>(null);
  let bench = $state<BenchmarkState | null>(null);
  let customQ = $state<Q | null>(null);
  let customCounter = $state(0);
  let recentPrompts = $state<string[]>([]);
  let lastTemplateId = $state<string | null>(null);
  // Phase-change interstitial: index of the phase awaiting a continue.
  let interstitial = $state<number | null>(null);
  let seenPhase = $state(-1);
  let slowSeen = $state(0); // count of slow entries already shown

  // Chooser state (idle mode).
  let pickSkill = $state('');
  let pickBand = $state('auto');

  const rng = createRng(Date.now() % 2147483647);

  const st = $derived(app.state!);

  const families = $derived([...new Set(SKILLS.map((s) => s.family))].sort());
  const practicableByFamily = $derived(
    new Map(
      families.map((f) => [
        f,
        SKILLS.filter((s) => s.family === f && practicable(s.id)),
      ]),
    ),
  );
  const sessionLive = $derived(
    st.session !== null &&
      !st.session.completed &&
      st.session.date === localDay(Date.now()),
  );
  const sessionDoneMin = $derived(
    sessionLive
      ? Math.floor(st.session!.phases.reduce((x, p) => x + p.elapsedMs, 0) / 60000)
      : 0,
  );

  // Question objects must be stable across ticks: only regenerate when the
  // served item itself changes (key = template|seed|band|factId, or the
  // assessment position).
  const sessionKey = $derived(
    session?.current
      ? `${session.current.templateId}|${session.current.seed}|${session.current.band}|${session.current.factId ?? ''}`
      : null,
  );
  const sessionQuestion = $derived.by(() =>
    sessionKey === null ? null : untrack(() => currentQuestion(session!)),
  );
  const diagKey = $derived(
    diag && !diag.done ? `${diag.probeIndex}|${diag.itemIndex}` : null,
  );
  const diagQuestion = $derived.by(() =>
    diagKey === null ? null : untrack(() => currentItem(diag!)),
  );
  const benchQuestion = $derived.by(() =>
    bench === null || bench.done
      ? null
      : untrack(() => currentBenchmarkItem(bench!)),
  );
  const question = $derived<Q | null>(
    mode === 'session'
      ? shown
      : mode === 'diagnostic'
        ? diagQuestion
        : mode === 'benchmark'
          ? benchQuestion
          : mode === 'custom'
            ? customQ
            : null,
  );
  // Keep `shown` pointing at the served question. Answering clears
  // session.current but not shown, so the feedback card stays mounted
  // until onNext clears it.
  $effect(() => {
    if (sessionQuestion !== null) shown = sessionQuestion;
  });

  const phase = $derived(
    session && session.phaseIndex < session.phases.length
      ? session.phases[session.phaseIndex]!
      : null,
  );

  const blockLabel = $derived(
    mode === 'session'
      ? phase
        ? cap(phase.kind)
        : 'Session'
      : mode === 'diagnostic'
        ? 'Diagnostic'
        : mode === 'benchmark'
          ? 'Benchmark'
          : (skillName.get(app.customSkills[0] ?? '') ?? 'Custom practice'),
  );

  const corner = $derived.by(() => {
    if (mode === 'session' && session && phase) {
      if (interstitial !== null || session.completed) {
        return `${Math.round(phase.budgetMs / 60000)} min`;
      }
      const left = Math.max(0, phase.budgetMs - phase.elapsedMs);
      const m = Math.floor(left / 60000);
      const sec = Math.floor((left % 60000) / 1000);
      return `${m}:${String(sec).padStart(2, '0')}`;
    }
    if (mode === 'diagnostic' && diag) {
      return `Part ${Math.min(4, partOf(diag.probeIndex) + 1)} of 4`;
    }
    if (mode === 'benchmark' && bench) {
      return `${bench.slotIndex + 1} of ${BENCHMARK_SLOTS.length}`;
    }
    return '';
  });
  const cornerLow = $derived(
    mode === 'session' &&
      session !== null &&
      phase !== null &&
      interstitial === null &&
      !session.completed &&
      phase.budgetMs - phase.elapsedMs <= 60_000,
  );

  const learnMethod = $derived(
    session?.target ? (methodFor.get(session.target) ?? null) : null,
  );
  const showLesson = $derived(
    mode === 'session' &&
      session !== null &&
      phase?.kind === 'learn' &&
      !session.lessonShown &&
      learnMethod !== null,
  );

  function cap(s: string): string {
    return s[0]!.toUpperCase() + s.slice(1);
  }

  // Assessment finish guards: fire once when done flips, so the finish
  // cannot be missed even if the question already unmounted.
  let finishing = $state(false);
  $effect(() => {
    if (mode === 'diagnostic' && diag && (diag.done || diag.partBoundary) && !finishing) {
      finishing = true;
      if (diag.done) void finishDiag();
      else {
        commit(applyDiagnosticPart(app.state!, diag, Date.now()));
        go('today');
      }
    }
    if (mode === 'benchmark' && bench?.done && !finishing) {
      finishing = true;
      void finishBench();
    }
  });

  function saveSession(s: Session) {
    session = s;
    commit({ ...app.state!, session: s });
  }

  function serveNext() {
    if (!session) return;
    const s = nextQuestion(app.state!, session, rng, Date.now());
    saveSession(s);
  }

  // Mode comes from state, not from the last startPractice call: explicit
  // starts keep their mode, in-flight assessments resume, nothing starts
  // a session before the first diagnostic part is in.
  function begin() {
    const now = Date.now();
    const s = app.state!;
    const diagInFlight = s.diagnostic !== null && !s.diagnosticDone;
    const benchInFlight = s.benchmark !== null && !s.benchmark.done;
    const explicit = app.practiceExplicit;
    app.practiceExplicit = false;

    let m: Mode;
    if (explicit && app.practiceMode === 'custom') m = 'custom';
    else if (benchInFlight) m = 'benchmark';
    else if (diagInFlight && !hasStartingPoint(s)) m = 'diagnostic';
    else if (explicit && app.practiceMode === 'diagnostic' && diagInFlight)
      m = 'diagnostic';
    else if (!hasStartingPoint(s)) m = 'diagnostic';
    else if (explicit && app.practiceMode === 'session') m = 'session';
    else if (explicit && app.practiceMode === 'benchmark') m = 'benchmark';
    else if (explicit && app.practiceMode === 'diagnostic') m = 'diagnostic';
    else m = 'idle';
    mode = m;
    app.running = m !== 'idle';

    if (m === 'session') {
      let ses = s.session;
      if (ses === null || ses.completed || ses.date !== localDay(now)) {
        if (ses !== null && !ses.completed) {
          commit(finishSession(s, ses, now));
        }
        ses = planSession(app.state!, now, Math.floor(rng.next() * 2147483647), {
          short: app.sessionShort,
        });
      }
      if (ses.paused) ses = resume(ses);
      session = ses;
      // A diagnostic first block announces itself with a block card like
      // every later phase change, so hold off serving until Continue.
      const diagFirst =
        session.phaseIndex === 0 && session.phases[0]?.kind === 'diagnostic';
      seenPhase = diagFirst ? -1 : session.phaseIndex;
      if (session.current === null && !diagFirst) {
        session = nextQuestion(app.state!, session, rng, now);
      }
      commit({ ...app.state!, session });
    } else if (m === 'diagnostic') {
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
    } else if (m === 'custom') {
      serveCustom();
    }
  }

  onMount(() => {
    begin();
    const timer = setInterval(() => {
      if (
        mode === 'session' &&
        session &&
        !session.paused &&
        !session.completed &&
        document.visibilityState === 'visible'
      ) {
        const t = tick(session, 1000);
        session = t;
        commitQuiet({ ...app.state!, session: t });
      }
    }, 1000);
    return () => {
      clearInterval(timer);
      app.running = false;
    };
  });

  // Watch for phase changes: show the interstitial between questions.
  $effect(() => {
    if (!session || session.completed) return;
    if (session.phaseIndex !== seenPhase && session.current === null) {
      interstitial = session.phaseIndex;
    }
  });

  function continuePhase() {
    if (interstitial === null || !session) return;
    seenPhase = interstitial;
    interstitial = null;
    slowSeen = session.slow.length;
    serveNext();
  }

  function lessonContinue() {
    if (!session) return;
    const out = markLessonShown(app.state!, session, Date.now());
    session = out.session;
    commit(out.state);
    serveNext();
  }

  function onSubmit(raw: string, ms: number): CheckResult {
    const now = Date.now();
    if (mode === 'session' && session) {
      const out = answer(app.state!, session, raw, ms, now);
      session = out.session;
      commit(out.state);
      if (out.attempt) logAttempt(out.attempt);
      if (out.needsFinish) {
        // The diagnostic finished inside the session: write the baseline
        // but keep the session running.
        void (async () => {
          const attempts = await loadAttempts();
          const d = app.state!.diagnostic!;
          const fin = finishDiagnostic(app.state!, d, attempts, Date.now());
          commit(fin.state);
        })();
      }
      return out.result ?? { correct: false };
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
    // custom
    const q = customQ;
    if (q) {
      const out = recordOutcome(app.state!, q, raw, ms, now, 'custom', {});
      commit(out.state);
      logAttempt(out.attempt);
      return out.result;
    }
    return { correct: false };
  }

  function onNext() {
    if (mode === 'session' && session) {
      shown = null;
      if (session.completed) {
        doneSession();
        return;
      }
      const advanced = advanceIfOver(session);
      if (advanced.completed) {
        session = advanced;
        commit({ ...app.state!, session: advanced });
        return;
      }
      if (advanced.phaseIndex !== session.phaseIndex) {
        session = advanced;
        saveSession(advanced);
        return; // interstitial effect handles it
      }
      serveNext();
    } else if (mode === 'diagnostic' && diag) {
      if (diag.done) {
        void finishDiag();
      }
      // next item renders from derived currentItem
    } else if (mode === 'benchmark' && bench) {
      if (bench.done) {
        void finishBench();
      }
    } else {
      serveCustom();
    }
  }

  async function finishDiag() {
    const attempts = await loadAttempts();
    const out = finishDiagnostic(app.state!, diag!, attempts, Date.now());
    commit(out.state);
    go('today');
  }

  async function finishBench() {
    const attempts = await loadAttempts();
    const out = finishBenchmark(app.state!, bench!, attempts, Date.now());
    commit(out.state);
    go('progress');
  }

  function serveCustom() {
    const pick = pickQuestion(app.state!, rng, Date.now(), {
      phase: 'custom',
      target: null,
      recentPrompts,
      lastTemplateId,
      customSkills: app.customSkills.length > 0 ? app.customSkills : undefined,
      customBand: app.customBand === null ? undefined : (app.customBand as 0 | 1 | 2 | 3),
      counter: customCounter,
      nonce: Date.now() % 2147483647,
    });
    customCounter++;
    recentPrompts = [...recentPrompts, pick.question.prompt].slice(-20);
    lastTemplateId = pick.question.templateId;
    customQ = pick.question;
  }

  // The only way out besides natural ends: keep what is persisted and
  // go back to where the run started. A session is marked paused so the
  // model serves nothing while away. A run started from the Practice tab
  // returns to the chooser, which is the same view and needs no remount.
  function leaveRun() {
    if (app.runOrigin === 'practice') {
      mode = 'idle';
      app.running = false;
      shown = null;
    } else {
      go('today');
    }
  }

  function stopRun() {
    if (mode === 'session' && session && !session.completed) {
      saveSession(pause(session));
    }
    leaveRun();
  }

  function doneSession() {
    if (mode === 'session' && session) {
      commit(finishSession(app.state!, session, Date.now()));
    }
    leaveRun();
  }

  function onCardKey(e: KeyboardEvent) {
    if (app.keysOpen) return;
    if (e.key === 'Escape' && mode !== 'idle') {
      e.preventDefault();
      stopRun();
      return;
    }
    if (interstitial !== null) {
      if (e.key === 'Enter') {
        e.preventDefault();
        continuePhase();
      }
    } else if (showLesson && e.key === 'Enter') {
      e.preventDefault();
      lessonContinue();
    }
  }

  function startCustomFromChooser() {
    if (!pickSkill) return;
    const band = pickBand === 'auto' ? null : Number(pickBand);
    startPractice('custom', [pickSkill], band, false, 'practice');
    begin();
  }

  function resumeSessionFromChooser() {
    startPractice('session', [], null, false, 'practice');
    begin();
  }

  // Extend the harness hook from app.svelte.ts with runner helpers.
  const mm = harnessHook();
  if (mm) {
    mm.currentAnswer = () => (question ? displayAnswer(question.answer) : null);
    mm.session = () => (session ? $state.snapshot(session) : null);
    mm.fastForward = (ms: number) => {
      if (session && !session.paused && !session.completed) {
        const t = tick(session, ms);
        session = t;
        commitQuiet({ ...app.state!, session: t });
      }
    };
  }
</script>

<svelte:window onkeydown={onCardKey} />

{#if mode !== 'idle'}
  <div class="runhead">
    <span class="runlabel">{blockLabel}</span>
    <span class="runtime" class:low={cornerLow}>{corner}</span>
  </div>
{/if}

{#if mode === 'idle'}
  <div class="card">
    <h3 style="margin-top:0">Custom practice</h3>
    {#if sessionLive}
      <p>
        Session in progress: {sessionDoneMin} of {st.session!.short ? 10 : 30} min done.
        <button class="secondary" onclick={resumeSessionFromChooser}>Resume</button>
      </p>
    {/if}
    <div style="display:flex;gap:0.5rem;flex-wrap:wrap">
      <select bind:value={pickSkill} aria-label="Skill">
        <option value="">Choose a skill</option>
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
      <button onclick={startCustomFromChooser} disabled={!pickSkill}>Start</button>
    </div>
  </div>
{:else if mode === 'session' && session}
  {#if session.completed}
    <div class="card">
      <p><strong>Session complete.</strong></p>
      <button onclick={doneSession}>Done</button>
    </div>
  {:else if interstitial !== null && phase}
    <div class="card">
      <h3 style="margin-top:0">
        {phase.kind === 'diagnostic' && st.diagnostic
          ? `Diagnostic, part ${Math.min(4, partsDone(st.diagnostic) + 1)} of 4`
          : cap(phase.kind)}
      </h3>
      <p class="muted">{Math.round(phase.budgetMs / 60000)} min</p>
      {#each session.slow.slice(slowSeen) as slow}
        <p class="muted">
          {skillName.get(slow.skill) ?? slow.skill} was slower than target.
          Method: {slow.method}
        </p>
      {/each}
      <button onclick={continuePhase}>Continue</button>
      <button class="stop" onclick={stopRun}>Stop</button>
    </div>
  {:else if showLesson && learnMethod}
    <MethodCard method={learnMethod} />
    <button onclick={lessonContinue}>Continue</button>
  {:else if question}
    <Question
      {question}
      {onSubmit}
      {onNext}
      skippable={phase?.kind === 'diagnostic'}
    />
  {:else}
    <div class="card"><p class="muted">Preparing...</p></div>
  {/if}
  {#if !session.completed && interstitial === null}
    <p>
      <button class="stop" onclick={stopRun}>Stop</button>
    </p>
  {/if}
{:else if mode === 'diagnostic' && diag}
  {#if question}
    <Question {question} {onSubmit} {onNext} skippable />
  {:else}
    <div class="card"><p class="muted">Finishing...</p></div>
  {/if}
  <p>
    <button class="stop" onclick={stopRun}>Stop</button>
  </p>
{:else if mode === 'benchmark' && bench}
  {#if question}
    <Question {question} {onSubmit} {onNext} skippable />
  {:else}
    <div class="card"><p class="muted">Finishing...</p></div>
  {/if}
  <p>
    <button class="stop" onclick={stopRun}>Stop</button>
  </p>
{:else}
  {#if question}
    <Question {question} {onSubmit} {onNext} />
  {/if}
  <p><button class="stop" onclick={stopRun}>Stop</button></p>
{/if}
