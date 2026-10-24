<script lang="ts">
  import { onMount } from 'svelte';
  import { app, flush, init, syncFromHash } from './lib/app.svelte';
  import Today from './views/Today.svelte';
  import Practice from './views/Practice.svelte';
  import Knowledge from './views/Knowledge.svelte';
  import Progress from './views/Progress.svelte';
  import { pause } from './lib/learn/session';
  import { commit } from './lib/app.svelte';

  const NAV: { view: 'today' | 'practice' | 'knowledge' | 'progress'; label: string }[] = [
    { view: 'today', label: 'Today' },
    { view: 'practice', label: 'Practice' },
    { view: 'knowledge', label: 'Knowledge' },
    { view: 'progress', label: 'Progress' },
  ];

  function onKey(e: KeyboardEvent) {
    if (e.key === 'Escape' && app.state?.session && !app.state.session.completed) {
      commit({ ...app.state, session: pause(app.state.session) });
    }
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
    const theme = app.state?.settings.theme ?? 'system';
    if (theme === 'system') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', theme);
  });
</script>

<svelte:window onkeydown={onKey} />

<nav>
  {#each NAV as item}
    <a href="#{item.view}" class:active={app.view === item.view}>{item.label}</a>
  {/each}
</nav>

<main>
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
</main>
