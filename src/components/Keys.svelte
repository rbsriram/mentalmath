<script lang="ts">
  import { app } from '../lib/app.svelte';
</script>

<div class="keys-card" role="dialog" aria-label="Keys">
  <h3 style="margin-top:0">Keys</h3>
  <table>
    <tbody>
      <tr><td>Enter</td><td>Submit, continue, start</td></tr>
      <tr><td>Space</td><td>Skip (empty box), continue (after an answer)</td></tr>
      <tr><td>r</td><td>Show or hide the route</td></tr>
      <tr><td>Esc</td><td>Stop (progress is kept)</td></tr>
      <tr><td>Option + 1-4</td><td>Today, Practice, Knowledge, Progress</td></tr>
      <tr><td>?</td><td>This card</td></tr>
    </tbody>
  </table>
  <p class="muted" style="margin-bottom:0">
    On Windows and Linux use Alt + 1-4. Esc closes this card.
    <button class="secondary" onclick={() => (app.keysOpen = false)}>Close</button>
  </p>
</div>
