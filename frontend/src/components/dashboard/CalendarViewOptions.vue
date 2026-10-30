<template>
  <RegionViewOptions :active="rolling" label="Calendar view options">
    <!-- Window + grid options only apply to multi-day views. A day view has no
         window to size, no rolling toggle, and no week grid, so it shows Refresh
         alone — but the tune button itself stays put across every view so it
         doesn't blink in and out when you switch. -->
    <div v-if="!isDay" class="cvo-row">
      <span class="cvo-label">{{ countLabel }}</span>
      <div class="cvo-stepper">
        <button type="button" aria-label="Decrease count" @click="step(-1)">−</button>
        <span class="cvo-count-value">{{ countValue }}</span>
        <button type="button" aria-label="Increase count" @click="step(1)">+</button>
      </div>
    </div>
    <div v-if="!isDay" class="cvo-row">
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

    <div v-if="!isDay" class="cvo-row">
      <span class="cvo-label">Week numbers</span>
      <ToggleSwitch
        :model-value="weekNumbers"
        aria-label="Week numbers"
        @update:model-value="setWeekNumbers"
      />
    </div>

    <div class="cvo-row">
      <span class="cvo-label">Refresh</span>
      <button
        type="button"
        class="cvo-default-chip"
        data-action="refresh-now"
        aria-label="Refresh calendar now"
        @click="refreshNow"
      >
        Refresh now
      </button>
    </div>
  </RegionViewOptions>
</template>

<script setup>
import { computed } from "vue";
import { useConfigStore } from "@/stores/config";
import { useCalendarStore } from "@/stores/calendar";
import RegionViewOptions from "./RegionViewOptions.vue";
import ToggleSwitch from "@/components/ui/ToggleSwitch.vue";

const props = defineProps({
  regionId: { type: String, default: null },
  view: { type: Object, required: true },
});

const configStore = useConfigStore();
const calendarStore = useCalendarStore();
const refreshNow = () => {
  calendarStore.refreshEvents().catch(err => {
    console.error("Failed to refresh calendar:", err);
  });
};

const rolling = computed(() => props.view?.rolling === true);
const weekNumbers = computed(() => props.view?.weekNumbers === true);
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

// --- Per-region display settings (CLV-49) ---
// A day view collapses the popover to just Refresh — no window/grid controls apply.
const isDay = computed(() => props.view?.mode === "day");

// Week numbers are a region setting now: the on-dashboard control toggles this
// region's value, with no household default behind it.
const setWeekNumbers = value => {
  if (value === weekNumbers.value) return;
  persist({ weekNumbers: value });
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
  font-size: var(--fs-sm);
  color: var(--ink);
}

/* Compact tri-state segmented control (Default / On / Off). */
.cvo-seg {
  display: inline-flex;
  gap: 2px;
  padding: 2px;
  background: var(--bg-1);
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
}

.cvo-seg button {
  font-family: var(--font-ui);
  font-size: var(--fs-micro);
  line-height: 1;
  color: var(--ink-2);
  background: transparent;
  border: 0;
  border-radius: var(--radius-xs);
  padding: 0.2rem 0.4rem;
  min-height: 22px;
  cursor: pointer;
}

.cvo-seg button.on {
  background: var(--focus);
  color: var(--focus-ink);
}

.cvo-seg button:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: 1px;
}

.cvo-density {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
}

/* Reset chip — only shown when the density is an explicit override. */
.cvo-default-chip {
  font-family: var(--font-ui);
  font-size: var(--fs-micro);
  color: var(--ink-2);
  background: var(--bg-1);
  border: 1px solid var(--line);
  border-radius: var(--radius-pill);
  padding: 0.1rem 0.4rem;
  min-height: 22px;
  cursor: pointer;
}

.cvo-default-chip:hover {
  border-color: var(--focus-edge);
  color: var(--ink);
}

.cvo-default-chip:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: 1px;
}

/* Muted while inheriting the global value (no explicit override yet). */
.cvo-count-value.inheriting {
  color: var(--ink-3);
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
  border-radius: var(--radius-xs);
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
  font-size: var(--fs-sm);
}

/* Compact toggle — smaller than the shared ToggleSwitch used in settings. */
.cvo-toggle {
  width: 34px;
  height: 18px;
  flex: none;
  border: 0;
  border-radius: var(--radius-pill);
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
  border-radius: var(--radius-pill);
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
