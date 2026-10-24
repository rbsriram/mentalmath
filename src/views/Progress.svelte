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

<h2>Baseline vs now</h2>
{#if famRows.length === 0}
  <p class="muted">Finish the diagnostic to set a baseline.</p>
{:else}
  {#each famRows as f}
    <div class="card" style="padding:0.6rem 1rem">
      <p style="margin:0.2rem 0"><strong>{FAMILY_NAME[f] ?? `Family ${f}`}</strong></p>
      <Bar label="Baseline" value={baselineFam.get(f) ?? 0} baseline />
      <Bar label="Now" value={nowFam.get(f) ?? 0} />
    </div>
  {/each}
{/if}

<h2>Speed</h2>
<div class="card">
  <p>
    Median:
    {st.baseline ? secs(st.baseline.medianMs) : 'not yet'}
    &rarr;
    {latest ? secs(latest.medianMs) : secs(recentSpeed.median)}
    &nbsp; p90:
    {st.baseline ? secs(st.baseline.p90Ms) : 'not yet'}
    &rarr;
    {latest ? secs(latest.p90Ms) : secs(recentSpeed.p90)}
  </p>
</div>

<h2>Weak areas</h2>
{#if weak.length === 0}
  <p class="muted">Practice first; weak spots appear here.</p>
{:else}
  {#each weak as w}
    <div class="skill-row" style="cursor:default">
      <span class="name">{w.name}</span>
      <span class="muted">{Math.round(w.acc * 100)}%</span>
    </div>
  {/each}
{/if}

<h2>Retention</h2>
<div class="card">
  <p>After 7 days: {pct(ret7)} &nbsp; After 30 days: {pct(ret30)}</p>
</div>

<h2>Benchmarks</h2>
{#if benchmarkDue(st, now)}
  <p>
    <strong>Monthly benchmark is due.</strong>
    <button class="secondary" onclick={() => startPractice('benchmark')}>Start benchmark</button>
  </p>
{/if}
{#if st.benchmarks.length === 0}
  <p class="muted">No monthly benchmark yet.</p>
{:else}
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

<h2>Recent sessions</h2>
{#if lastTen.length === 0}
  <p class="muted">No sessions yet.</p>
{:else}
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

<h2>Data</h2>
<div class="card" style="display:flex;gap:0.5rem;flex-wrap:wrap;align-items:center">
  <button class="secondary" onclick={doExport}>Export</button>
  <label class="chip" style="padding:0.6rem 1rem;min-height:44px;display:inline-flex;align-items:center;cursor:pointer">
    Import
    <input type="file" accept="application/json" onchange={doImport} style="display:none" />
  </label>
  <button class="secondary" onclick={doReset}>Reset</button>
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
