<template>
  <div class="calendar-view-gear">
    <button
      type="button"
      class="calendar-header__nav calendar-header__gear"
      :class="{ active: rolling }"
      title="View options"
      aria-label="View options"
      @click.stop="open = !open"
    >
      <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true">
        <circle cx="12" cy="12" r="3" />
        <path
          d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"
        />
      </svg>
    </button>
    <div v-if="open" class="calendar-view-gear__popover" @click.stop>
      <div class="cvg-row">
        <span class="cvg-label">{{ countLabel }}</span>
        <div class="cvg-stepper">
          <button type="button" aria-label="Decrease count" @click="step(-1)">−</button>
          <span class="cvg-count-value">{{ countValue }}</span>
          <button type="button" aria-label="Increase count" @click="step(1)">+</button>
        </div>
      </div>
      <div class="cvg-row">
        <span class="cvg-label">Rolling</span>
        <button
          type="button"
          role="switch"
          class="cvg-toggle"
          :class="{ on: rolling }"
          :aria-checked="rolling ? 'true' : 'false'"
          aria-label="Rolling window"
          @click="setRolling(!rolling)"
        />
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref } from "vue";
import { useConfigStore } from "@/stores/config";

const props = defineProps({
  regionId: { type: String, default: null },
  view: { type: Object, required: true },
});

const configStore = useConfigStore();
const open = ref(false);

const rolling = computed(() => props.view?.rolling === true);
const isWeek = computed(() => props.view?.mode === "week");
// Count is the window size — weeks for month, days for week — and it always
// applies; rolling only flips the anchor (period-start vs today).
const countLabel = computed(() => (isWeek.value ? "Days" : "Weeks"));
const countKey = computed(() => (isWeek.value ? "days" : "weeks"));
const countMax = computed(() => (isWeek.value ? 14 : 12));
const countValue = computed(() =>
  isWeek.value ? (props.view?.days ?? 7) : (props.view?.weeks ?? 4)
);

const persist = patch => {
  configStore.updateRegionView(props.regionId, patch).catch(err => {
    console.error("Failed to update calendar view:", err);
  });
};

const setRolling = value => persist({ rolling: value });

const step = delta => {
  const next = Math.min(countMax.value, Math.max(1, countValue.value + delta));
  if (next !== countValue.value) persist({ [countKey.value]: next });
};
</script>

<style scoped>
.calendar-view-gear {
  position: relative;
  display: inline-flex;
}

.calendar-header__gear {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--ink-2);
}

.calendar-header__gear svg {
  fill: none;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.calendar-header__gear.active {
  color: var(--focus);
}

.calendar-view-gear__popover {
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  z-index: 20;
  min-width: 150px;
  padding: 0.5rem 0.6rem;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  background: var(--bg-2);
  border: 1px solid var(--line);
  border-radius: 10px;
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.25);
}

.cvg-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
}

.cvg-label {
  font-family: var(--font-ui);
  font-size: 0.85rem;
  color: var(--ink);
}

.cvg-stepper {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
}

.cvg-stepper button {
  min-width: 24px;
  min-height: 24px;
  border: 1px solid var(--line);
  border-radius: 6px;
  background: var(--bg-1);
  color: var(--ink);
  cursor: pointer;
}

.cvg-stepper button:hover {
  border-color: var(--focus-edge);
}

.cvg-count-value {
  min-width: 1.25rem;
  text-align: center;
  font-variant-numeric: tabular-nums;
  font-size: 0.85rem;
}

/* Compact toggle — smaller than the shared ToggleSwitch used in settings. */
.cvg-toggle {
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

.cvg-toggle::after {
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

.cvg-toggle.on {
  background: var(--focus);
}

.cvg-toggle.on::after {
  transform: translateX(16px);
  background: var(--switch-knob-on);
}

.cvg-toggle:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: 2px;
}

@media (prefers-reduced-motion: reduce) {
  .cvg-toggle,
  .cvg-toggle::after {
    transition: none;
  }
}
</style>
