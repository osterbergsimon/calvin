<template>
  <div
    class="progress-bar"
    role="progressbar"
    :aria-label="label"
    aria-valuemin="0"
    aria-valuemax="100"
    :aria-valuenow="clamped"
    :aria-valuetext="valueText || undefined"
  >
    <span class="progress-bar__fill" :style="{ width: `${clamped}%` }" />
  </div>
</template>

<script setup>
import { computed } from "vue";

// The one progress bar (docs/design/frontend-doctrine.md §3): a long task such
// as a guest upload. The fill is --focus because progress is action feedback;
// any visible "3 of 8" text belongs beside it, not in a live region, so a
// screen reader is not told the same thing twice.
const props = defineProps({
  // 0–100; clamped.
  value: { type: Number, default: 0 },
  // The accessible name ("Upload progress").
  label: { type: String, required: true },
  // Optional spoken value ("Sending 3 of 8").
  valueText: { type: String, default: "" },
});

const clamped = computed(() => Math.max(0, Math.min(100, Math.round(props.value || 0))));
</script>

<style scoped>
.progress-bar {
  height: var(--progress-h);
  overflow: hidden;
  background: var(--bg-2);
  border-radius: var(--radius-round);
}

.progress-bar__fill {
  display: block;
  height: 100%;
  background: var(--focus);
  transition: width var(--dur-fast) linear;
}
</style>
