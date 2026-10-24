<script lang="ts">
  import { listFacts, type FactFamily } from '../lib/content/facts';
  import type { State } from '../lib/learn/state';
  import { isFragile, newRec, status } from '../lib/learn/model';

  let { skillId, state }: { skillId: string; state: State } = $props();

  const FAMILY_FOR_SKILL: Partial<Record<string, FactFamily>> = {
    'tables-1-10': 'tables',
    'tables-11-15': 'tables',
    'squares-1-25': 'squares',
    'squares-26-50': 'squares',
    'complements-10': 'complements-10',
    'complements-100': 'complements-100',
    'complements-1000': 'complements-1000',
    'fraction-equivalents': 'fraction-equivalents',
    'percent-anchors': 'percent-anchors',
  };

  const family = $derived(FAMILY_FOR_SKILL[skillId] ?? null);
  const facts = $derived(family ? listFacts(family) : []);

  function cellClass(factId: string): string {
    const rec = state.facts[factId];
    if (!rec || rec.attempts === 0) return 'fact-cell';
    if (isFragile(rec)) return 'fact-cell fragile';
    const st = status(rec);
    if (st === 'solid' || st === 'strong') return 'fact-cell solid';
    return 'fact-cell learning';
  }

  function chipFor(factId: string): string {
    const rec = state.facts[factId] ?? newRec();
    return status(rec);
  }

  // tables: 15x15 cell map, cell (r, c) shows the normalized fact.
  function tableCell(r: number, c: number): string | null {
    if (family !== 'tables') return null;
    const a = Math.min(r, c) + 1;
    const b = Math.max(r, c) + 1;
    if (a > 15 || b > 15) return null;
    const lo = a;
    const hi = b;
    return `t:${lo}x${hi}`;
  }
</script>

{#if family === 'tables'}
  <div class="fact-grid" style="grid-template-columns: repeat(15, 1fr)">
    {#each Array.from({ length: 15 }, (_, r) => r) as r}
      {#each Array.from({ length: 15 }, (_, c) => c) as c}
        {@const fid = tableCell(r, c)}
        {#if fid}
          <div class={cellClass(fid)} title={fid}></div>
        {/if}
      {/each}
    {/each}
  </div>
{:else if family === 'squares'}
  <div class="fact-grid" style="grid-template-columns: repeat(30, 1fr)">
    {#each facts as f}
      <div class={cellClass(f)} title={f}></div>
    {/each}
  </div>
{:else if family === 'complements-100' || family === 'complements-10' || family === 'complements-1000'}
  <div
    class="fact-grid"
    style="grid-template-columns: repeat({family === 'complements-1000' ? 40 : 10}, 1fr)"
  >
    {#each facts as f}
      <div class={cellClass(f)} title={f}></div>
    {/each}
  </div>
{:else if family}
  <table>
    <thead><tr><th>Fact</th><th>Status</th></tr></thead>
    <tbody>
      {#each facts as f}
        <tr><td>{f}</td><td><span class="chip {chipFor(f)}">{chipFor(f)}</span></td></tr>
      {/each}
    </tbody>
  </table>
{/if}
