<script lang="ts">
  import type { Method } from '../lib/content/methods';
  import { generate } from '../lib/engine/registry';
  import { displayAnswer } from '../lib/math/format';
  import { seedFor } from '../lib/math/rng';
  import Route from './Route.svelte';

  let { method, examples = 3 }: { method: Method; examples?: number } = $props();

  const sample = $derived(
    Array.from({ length: examples }, (_, i) =>
      generate(method.exampleTemplate, seedFor('example', method.id, i), method.exampleBand),
    ),
  );
  let open = $state(-1);
</script>

<div class="card">
  <h3>{method.name}</h3>
  <p>{method.rule}</p>
  <p class="muted">{method.rationale}</p>
  {#if method.patterns.length > 0}
    <p class="muted">Look for: {method.patterns.join('; ')}</p>
  {/if}
  {#if method.limits.length > 0}
    <p class="muted">Limits: {method.limits.join('; ')}</p>
  {/if}
  {#each sample as q, i}
    <div class="card" style="margin:0.5rem 0">
      <p>{q.prompt} = <strong>{displayAnswer(q.answer)}</strong></p>
      <button
        class="secondary"
        style="min-height:0;padding:0.2rem 0.6rem;font-size:0.85rem"
        onclick={() => (open = open === i ? -1 : i)}
      >{open === i ? 'Hide route' : 'Show route'}</button>
      {#if open === i}
        <Route question={q} />
      {/if}
    </div>
  {/each}
</div>
