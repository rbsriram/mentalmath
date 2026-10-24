<script lang="ts">
  import type { Question } from '../lib/engine/types';
  import { displayAnswer } from '../lib/math/format';

  let { question }: { question: Question } = $props();
</script>

<ol class="route">
  {#each question.route as step}
    <li>{step.text}</li>
  {/each}
</ol>
<p class="muted">Answer: {displayAnswer(question.answer)}</p>
