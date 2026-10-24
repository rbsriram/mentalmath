<script lang="ts">
  import { onMount } from 'svelte';
  import { app, flush, go, init, syncFromHash } from './lib/app.svelte';
  import Today from './views/Today.svelte';
  import Practice from './views/Practice.svelte';
  import Knowledge from './views/Knowledge.svelte';
  import Progress from './views/Progress.svelte';
  import Keys from './components/Keys.svelte';

  const NAV: { view: 'today' | 'practice' | 'knowledge' | 'progress'; label: string }[] = [
    { view: 'today', label: 'Today' },
    { view: 'practice', label: 'Practice' },
    { view: 'knowledge', label: 'Knowledge' },
    { view: 'progress', label: 'Progress' },
  ];

  function isTyping(): boolean {
    const el = document.activeElement;
    return (
      el instanceof HTMLInputElement ||
      el instanceof HTMLTextAreaElement ||
      el instanceof HTMLSelectElement
    );
  }

  function onKey(e: KeyboardEvent) {
    if (app.keysOpen) {
      if (e.key === 'Escape' || e.key === '?') {
        e.preventDefault();
        app.keysOpen = false;
      }
      return;
    }
    if (e.altKey && /^Digit[1-4]$/.test(e.code)) {
      e.preventDefault();
      go(NAV[Number(e.code.slice(-1)) - 1]!.view);
      return;
    }
    if (e.key === '?' && !isTyping()) {
      e.preventDefault();
      app.keysOpen = true;
      return;
    }
  }

  // The illustrated background, one image per view. Only the active
  // view's image is requested. Dark themes hide the layer in CSS.
  const BG_IMG: Record<string, number> = {
    today: 1,
    practice: 3,
    knowledge: 2,
    progress: 2,
  };
  function bgUrl(): string {
    const n = BG_IMG[app.view] ?? 1;
    const w =
      typeof window === 'undefined'
        ? 1200
        : window.innerWidth * (window.devicePixelRatio || 1);
    return `${import.meta.env.BASE_URL}bg/bg-${n}-${w > 1000 ? 1600 : 900}.webp`;
  }

  onMount(() => {
    void init();
    const onHash = () => syncFromHash();
    const onHide = () => flush();
    window.addEventListener('hashchange', onHash);
    window.addEventListener('pagehide', onHide);
    document.addEventListener('visibilitychange', onHide);
    return () => {
      window.removeEventListener('hashchange', onHash);
      window.removeEventListener('pagehide', onHide);
      document.removeEventListener('visibilitychange', onHide);
    };
  });

  $effect(() => {
    const theme = app.state?.settings.theme ?? 'light';
    document.documentElement.setAttribute('data-theme', theme);
  });
</script>

<svelte:window onkeydown={onKey} />

<nav>
  {#each NAV as item}
    <a href="#{item.view}" class:active={app.view === item.view}>{item.label}</a>
  {/each}
</nav>

<div class="bg" style={`--bg-url: url("${bgUrl()}")`} aria-hidden="true"></div>

{#if app.updateReady}
  <button class="update-pill" onclick={() => location.reload()}>Updated. Reload</button>
{/if}

{#if app.keysOpen}
  <Keys />
{/if}

<main>
  <div class="panel">
    {#if app.error}
      <div class="card"><p class="bad">Storage failed: {app.error}</p></div>
    {:else if !app.ready || app.state === null}
      <p class="muted">Loading...</p>
    {:else if app.view === 'practice'}
      <Practice />
    {:else if app.view === 'knowledge'}
      <Knowledge />
    {:else if app.view === 'progress'}
      <Progress />
    {:else}
      <Today />
    {/if}
  </div>
</main>
