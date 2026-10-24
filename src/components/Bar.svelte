<script lang="ts">
  let {
    label,
    value,
    baseline = false,
  }: { label: string; value: number; baseline?: boolean } = $props();
</script>

<div class="bar-row">
  <span class="bar-label">{label}</span>
  <div class="bar-track">
    <div
      class="bar-fill"
      class:baseline
      style="width: {Math.round(Math.max(0, Math.min(1, value)) * 100)}%"
    ></div>
  </div>
  <span class="bar-val">{Math.round(value * 100)}%</span>
</div>
