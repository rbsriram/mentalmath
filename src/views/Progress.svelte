<script lang="ts">
  import { onMount } from 'svelte';
  import {
    app,
    commit,
    getStorage,
    loadAttempts,
    startPractice,
  } from '../lib/app.svelte';
  import { benchmarkDue, retention } from '../lib/learn/benchmark';
  import {
    familyAccuracyFromReport,
    familyAccuracyFromState,
    recentMedianP90,
    weakAreas,
  } from '../lib/learn/progress';
  import { partsDone } from '../lib/learn/diagnostic';
  import { newState } from '../lib/learn/state';
  import { exportData, exportFilename, importData } from '../lib/store/export';
  import Bar from '../components/Bar.svelte';

  const st = $derived(app.state!);
  const now = Date.now();

  const FAMILY_NAME: Record<number, string> = {
    1: 'Foundations',
    2: 'Add/subtract',
    3: 'Multiplication',
    4: 'Division/decimals',
    5: 'Fractions',
    6: 'Percents/ratios',
    7: 'Estimation/chains',
  };

  onMount(() => {
    void loadAttempts();
  });

  const baselineFam = $derived(
    st.baseline ? familyAccuracyFromReport(st.baseline) : new Map<number, number>(),
  );
  const nowFam = $derived(familyAccuracyFromState(st));
  const famRows = $derived(
    [...new Set([...baselineFam.keys(), ...nowFam.keys()])].sort(),
  );
  const weak = $derived(weakAreas(st));
  const ret7 = $derived(retention(app.attempts, 7));
  const ret30 = $derived(retention(app.attempts, 30));
  const recentSpeed = $derived(recentMedianP90(app.attempts, now));
  const latest = $derived(st.benchmarks.at(-1) ?? null);
  const lastTen = $derived(st.sessions.slice(-10).reverse());

  function pct(x: number | null): string {
    return x === null ? 'not yet' : `${Math.round(x * 100)}%`;
  }
  function secs(ms: number | null): string {
    return ms === null ? 'not yet' : `${(ms / 1000).toFixed(1)} s`;
  }

  function doExport() {
    const doc = exportData(st, app.attempts);
    const blob = new Blob([JSON.stringify(doc)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = exportFilename(Date.now());
    a.click();
    URL.revokeObjectURL(url);
  }

  let fileInput = $state<HTMLInputElement | null>(null);

  async function doImport(e: Event) {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const { state: imported, attempts } = importData(JSON.parse(text));
      await getStorage().replaceAll(imported, attempts);
      app.attempts = attempts;
      app.attemptsLoaded = true;
      app.state = imported;
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'Import failed');
    }
    input.value = '';
  }

  async function doReset() {
    if (!window.confirm('Delete all progress on this device?')) return;
    await getStorage().clear();
    app.attempts = [];
    app.attemptsLoaded = true;
    const fresh = newState(Date.now());
    app.state = fresh;
    void getStorage().saveState(fresh);
  }
</script>

<h1>Progress</h1>

{#if !st.baseline && st.sessions.length === 0}
  <p class="muted">Progress appears after the diagnostic and your first sessions.</p>
{:else}
  {#if famRows.length > 0 || st.diagnostic}
    <h2>Baseline vs now</h2>
    {#if !st.diagnosticDone && st.diagnostic}
      <p class="muted">
        Baseline after the diagnostic ({partsDone(st.diagnostic)} of 4 parts done)
      </p>
    {/if}
    {#each famRows as f}
      <div class="card" style="padding:0.6rem 1rem">
        <p style="margin:0.2rem 0"><strong>{FAMILY_NAME[f] ?? `Family ${f}`}</strong></p>
        {#if st.baseline}
          <Bar label="Baseline" value={baselineFam.get(f) ?? 0} baseline />
        {:else}
          <div class="bar-row"><span class="bar-label">Baseline</span><span class="muted">in progress</span></div>
        {/if}
        <Bar label="Now" value={nowFam.get(f) ?? 0} />
      </div>
    {/each}
  {/if}

  {#if st.baseline || latest || recentSpeed.median !== null}
    <h2>Speed</h2>
    <div class="card">
      <p>
        {#if st.baseline}
          Median: {secs(st.baseline.medianMs)} &nbsp; p90: {secs(st.baseline.p90Ms)}
        {/if}
        {#if latest}
          {st.baseline ? '→ now ' : ''}Median: {secs(latest.medianMs)} &nbsp; p90: {secs(latest.p90Ms)}
        {:else if recentSpeed.median !== null}
          {st.baseline ? '→ last 7 days ' : ''}Median: {secs(recentSpeed.median)} &nbsp; p90: {secs(recentSpeed.p90)}
        {/if}
      </p>
    </div>
  {/if}

  {#if weak.length > 0}
    <h2>Weak areas</h2>
    {#each weak as w}
      <div class="skill-row" style="cursor:default">
        <span class="name">{w.name}</span>
        <span class="muted">{Math.round(w.acc * 100)}%</span>
      </div>
    {/each}
  {/if}

  {#if ret7 !== null || ret30 !== null}
    <h2>Retention</h2>
    <div class="card">
      <p>
        {#if ret7 !== null}After 7 days: {pct(ret7)}{/if}
        {#if ret7 !== null && ret30 !== null}&nbsp;{/if}
        {#if ret30 !== null}After 30 days: {pct(ret30)}{/if}
      </p>
    </div>
  {/if}

  {#if st.benchmarks.length > 0 || benchmarkDue(st, now)}
    <h2>Benchmarks</h2>
    {#if benchmarkDue(st, now)}
      <p>
        <strong>Monthly benchmark is due.</strong>
        <button class="secondary" onclick={() => startPractice('benchmark')}>Start benchmark</button>
      </p>
    {/if}
    {#if st.benchmarks.length > 0}
      <table>
        <thead>
          <tr><th>Month</th><th>Date</th><th>Accuracy</th><th>Median</th><th>p90</th><th>Transfer</th><th>Classes</th></tr>
        </thead>
        <tbody>
          {#each st.benchmarks as b}
            <tr>
              <td>{b.month}</td>
              <td>{new Date(b.takenAt).toLocaleDateString()}</td>
              <td>{Math.round(b.accuracy * 100)}%</td>
              <td>{secs(b.medianMs)}</td>
              <td>{secs(b.p90Ms)}</td>
              <td>{pct(b.transferAccuracy)}</td>
              <td>{b.classesReliable} of 15</td>
            </tr>
          {/each}
        </tbody>
      </table>
    {/if}
  {/if}

  {#if lastTen.length > 0}
    <h2>Recent sessions</h2>
    <table>
      <thead><tr><th>Date</th><th>Minutes</th><th>Answered</th><th>Accuracy</th></tr></thead>
      <tbody>
        {#each lastTen as s}
          <tr>
            <td>{s.date}</td>
            <td>{s.minutes}</td>
            <td>{s.answered}</td>
            <td>{s.answered > 0 ? Math.round((s.correct / s.answered) * 100) : 0}%</td>
          </tr>
        {/each}
      </tbody>
    </table>
  {/if}
{/if}

<h2>Data</h2>
<div class="card" style="display:flex;gap:0.5rem;flex-wrap:wrap;align-items:center">
  <button class="secondary" onclick={doExport}>Export</button>
  <button class="secondary" onclick={() => fileInput?.click()}>Import</button>
  <input bind:this={fileInput} type="file" accept="application/json" onchange={doImport} style="display:none" />
  <button class="stop" onclick={doReset}>Reset</button>
  <select
    value={st.settings.theme}
    onchange={(e) =>
      commit({
        ...st,
        settings: { theme: (e.target as HTMLSelectElement).value as 'system' | 'light' | 'dark' },
      })}
    aria-label="Theme"
  >
    <option value="system">System</option>
    <option value="light">Light</option>
    <option value="dark">Dark</option>
  </select>
</div>
<p class="muted">Data lives in this browser only. Export to back up.</p>
