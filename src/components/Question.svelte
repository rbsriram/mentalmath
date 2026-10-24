<script lang="ts">
  import { checkAnswer, type CheckResult } from '../lib/engine/answer';
  import type { Question as Q } from '../lib/engine/types';
  import { displayAnswer } from '../lib/math/format';
  import { go } from '../lib/app.svelte';
  import Route from './Route.svelte';

  let {
    question,
    skippable = false,
    methodLink = null,
    onSubmit,
    onNext,
  }: {
    question: Q;
    skippable?: boolean;
    // A fact question can link to its family's method card after a miss.
    methodLink?: { name: string; skill: string } | null;
    // Records the attempt and returns the check result.
    onSubmit: (raw: string, ms: number) => CheckResult;
    onNext: () => void;
  } = $props();

  let input = $state<HTMLInputElement | null>(null);
  let given = $state('');
  let result = $state<CheckResult | null>(null);
  let hint = $state('');
  let showRoute = $state(false);
  let shownAt = $state(0);

  const answered = $derived(result !== null);
  const shown = $derived(displayAnswer(question.answer));

  $effect(() => {
    // Reset per question. Must not read `input` here: when the field
    // unmounts after an answer, bind:this would flip it to null and this
    // effect would wipe the feedback state.
    question;
    given = '';
    result = null;
    hint = '';
    showRoute = false;
    shownAt = performance.now();
  });

  $effect(() => {
    // Focus on mount and on every remount (after feedback the field comes
    // back for the next question).
    input?.focus();
  });

  function submit() {
    if (answered) {
      onNext();
      return;
    }
    const ms = Math.max(0, Math.round(performance.now() - shownAt));
    const local = checkAnswer(question.answer, given);
    if (local.reason === 'unparsable') {
      hint = 'Could not read that answer';
      return;
    }
    if (local.reason === 'empty' && !skippable) {
      hint = 'Type an answer';
      return;
    }
    result = onSubmit(given, ms);
    hint = '';
    // Assessment modes get no feedback card: record and move on so the
    // runner can finish as soon as the last item is answered.
    if (skippable) onNext();
  }

  function skip() {
    if (answered) return;
    const ms = Math.max(0, Math.round(performance.now() - shownAt));
    result = onSubmit('', ms);
    if (skippable) onNext();
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation(); // the window handler must not see this Enter
      submit();
    } else if (e.key === ' ' && given.trim() === '') {
      e.preventDefault();
      e.stopPropagation();
      skip();
    } else if (e.key === 'r' && answered && result?.correct) {
      showRoute = !showRoute;
    }
  }

  function onGlobal(e: KeyboardEvent) {
    // A printable keystroke while nothing is focused goes to the field.
    // '?' is reserved for the keys card in App.
    if (
      !answered &&
      e.key.length === 1 &&
      e.key !== '?' &&
      !e.metaKey &&
      !e.ctrlKey &&
      !e.altKey &&
      document.activeElement !== input
    ) {
      input?.focus();
    }
    // r toggles the route while feedback is shown; Enter or Space continue.
    if ((e.key === 'Enter' || e.key === ' ') && answered) {
      e.preventDefault();
      onNext();
    } else if (e.key === 'r' && answered) {
      showRoute = !showRoute;
    }
  }
</script>

<svelte:window onkeydown={onGlobal} />

{#if question.context}
  <p class="context">{question.context}</p>
{/if}
<p class="problem">{question.prompt}</p>

{#if !answered}
  <input
    bind:this={input}
    bind:value={given}
    class="answer"
    type="text"
    inputmode={question.inputMode === 'decimal' ? 'decimal' : 'text'}
    autocomplete="off"
    autocapitalize="off"
    spellcheck="false"
    enterkeyhint="done"
    onkeydown={onKeydown}
    aria-label="Your answer"
  />
  {#if hint}
    <p class="muted" style="text-align:center">{hint}</p>
  {/if}

{:else}
  <div class="card" style="text-align:center">
    {#if result?.correct}
      <p class="good" style="font-size:1.2rem;margin:0">Correct</p>
      {#if question.answer.kind === 'approx'}
        <p class="muted">Exactly: {shown}</p>
      {/if}
      <p>
        <button class="secondary" onclick={() => (showRoute = !showRoute)}>
          {showRoute ? 'Hide route' : 'Show route'}
        </button>
      </p>
      {#if showRoute}
        <Route {question} />
      {/if}
    {:else}
      {#if result?.reason === 'too-coarse'}
        <p class="bad">Give at least 3 significant digits or the fraction.</p>
      {:else}
        <p class="bad" style="font-size:1.2rem;margin:0">Correct answer: {shown}</p>
        {#if question.answer.kind === 'approx'}
          <p class="muted">≈ {shown} accepted</p>
        {/if}
      {/if}
      <Route {question} />
      {#if methodLink}
        <p style="margin:0.5rem 0 0">
          <button class="secondary" onclick={() => go('knowledge', methodLink.skill)}>
            Method: {methodLink.name}
          </button>
        </p>
      {/if}
    {/if}
    <p class="muted" style="font-size:0.85rem">Enter to continue</p>
  </div>
{/if}
