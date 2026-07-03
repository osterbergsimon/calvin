<template>
  <RegionViewOptions :active="rolling" label="Calendar view options">
    <div class="cvo-row">
      <span class="cvo-label">{{ countLabel }}</span>
      <div class="cvo-stepper">
        <button type="button" aria-label="Decrease count" @click="step(-1)">−</button>
        <span class="cvo-count-value">{{ countValue }}</span>
        <button type="button" aria-label="Increase count" @click="step(1)">+</button>
      </div>
    </div>
    <div class="cvo-row">
      <span class="cvo-label">Rolling</span>
      <button
        type="button"
        role="switch"
        class="cvo-toggle"
        :class="{ on: rolling }"
        :aria-checked="rolling ? 'true' : 'false'"
        aria-label="Rolling window"
        @click="setRolling(!rolling)"
      />
    </div>
  </RegionViewOptions>
</template>

<script setup>
import { computed } from "vue";
import { useConfigStore } from "@/stores/config";
import RegionViewOptions from "./RegionViewOptions.vue";

const props = defineProps({
  regionId: { type: String, default: null },
  view: { type: Object, required: true },
});

const configStore = useConfigStore();

const rolling = computed(() => props.view?.rolling === true);
const isWeek = computed(() => props.view?.mode === "week");
// A non-rolling month always shows the whole month, so its count means "extra
// look-ahead weeks after the month" (min 0). Every other view's count is the
// window size itself: `days` for week, `weeks` for a rolling month.
const isExtraWeeks = computed(() => props.view?.mode === "month" && !rolling.value);
const countLabel = computed(() =>
  isWeek.value ? "Days" : isExtraWeeks.value ? "Extra weeks" : "Weeks"
);
const countKey = computed(() =>
  isWeek.value ? "days" : isExtraWeeks.value ? "extraWeeks" : "weeks"
);
const countMin = computed(() => (isExtraWeeks.value ? 0 : 1));
const countMax = computed(() => (isWeek.value ? 14 : isExtraWeeks.value ? 8 : 12));
const countValue = computed(() =>
  isWeek.value
    ? (props.view?.days ?? 7)
    : isExtraWeeks.value
      ? (props.view?.extraWeeks ?? 0)
      : (props.view?.weeks ?? 4)
);

const persist = patch => {
  configStore.updateRegionView(props.regionId, patch).catch(err => {
    console.error("Failed to update calendar view:", err);
  });
};

const setRolling = value => persist({ rolling: value });

const step = delta => {
  const next = Math.min(countMax.value, Math.max(countMin.value, countValue.value + delta));
  if (next !== countValue.value) persist({ [countKey.value]: next });
};
</script>

<style scoped>
.cvo-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
}

.cvo-label {
  font-family: var(--font-ui);
  font-size: 0.85rem;
  color: var(--ink);
}

.cvo-stepper {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
}

.cvo-stepper button {
  min-width: 24px;
  min-height: 24px;
  border: 1px solid var(--line);
  border-radius: 6px;
  background: var(--bg-1);
  color: var(--ink);
  cursor: pointer;
}

.cvo-stepper button:hover {
  border-color: var(--focus-edge);
}

.cvo-count-value {
  min-width: 1.25rem;
  text-align: center;
  font-variant-numeric: tabular-nums;
  font-size: 0.85rem;
}

/* Compact toggle — smaller than the shared ToggleSwitch used in settings. */
.cvo-toggle {
  width: 34px;
  height: 18px;
  flex: none;
  border: 0;
  border-radius: 999px;
  background: var(--line);
  position: relative;
  cursor: pointer;
  transition: background 0.2s;
}

.cvo-toggle::after {
  content: "";
  position: absolute;
  top: 2px;
  left: 2px;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: var(--switch-knob);
  transition: transform 0.2s;
}

.cvo-toggle.on {
  background: var(--focus);
}

.cvo-toggle.on::after {
  transform: translateX(16px);
  background: var(--switch-knob-on);
}

.cvo-toggle:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: 2px;
}

@media (prefers-reduced-motion: reduce) {
  .cvo-toggle,
  .cvo-toggle::after {
    transition: none;
  }
}
</style>
