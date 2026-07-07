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

    <div class="cvo-row">
      <span class="cvo-label">Week numbers</span>
      <div class="cvo-seg" role="radiogroup" aria-label="Week numbers">
        <button
          v-for="opt in weekNumberOptions"
          :key="opt.value"
          type="button"
          role="radio"
          :class="{ on: weekNumbers === opt.value }"
          :aria-checked="weekNumbers === opt.value ? 'true' : 'false'"
          :aria-label="`Week numbers ${opt.value}`"
          @click="setWeekNumbers(opt.value)"
        >
          {{ opt.label }}
        </button>
      </div>
    </div>

    <div v-if="isMonth" class="cvo-row">
      <span class="cvo-label">Events/day</span>
      <div class="cvo-density">
        <button
          v-if="densityOverridden"
          type="button"
          class="cvo-default-chip"
          aria-label="Use default events per day"
          @click="clearDensity"
        >
          Default
        </button>
        <div class="cvo-stepper">
          <button type="button" aria-label="Fewer events per day" @click="stepDensity(-1)">
            −
          </button>
          <span class="cvo-count-value" :class="{ inheriting: !densityOverridden }">
            {{ densityValue }}
          </span>
          <button type="button" aria-label="More events per day" @click="stepDensity(1)">+</button>
        </div>
      </div>
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

// --- Per-region display overrides (inherit the global config when unset) ---
const isMonth = computed(() => props.view?.mode === "month");

// Week numbers: tri-state where "default" means inherit (persisted as absent).
const weekNumberOptions = [
  { value: "default", label: "Default" },
  { value: "on", label: "On" },
  { value: "off", label: "Off" },
];
const weekNumbers = computed(() => {
  if (props.view?.weekNumbers === true) return "on";
  if (props.view?.weekNumbers === false) return "off";
  return "default";
});
const setWeekNumbers = value => {
  if (value === weekNumbers.value) return;
  const weekNumbersPatch = value === "on" ? true : value === "off" ? false : undefined;
  persist({ weekNumbers: weekNumbersPatch });
};

// Events/day density: an override of config.maxVisibleEvents. The stepper shows
// the effective value (inherited or overridden); stepping creates/updates the
// override, and the Default chip clears it back to inherit.
const densityOverridden = computed(() => Number.isFinite(Number(props.view?.maxVisibleEvents)));
const densityValue = computed(
  () => props.view?.maxVisibleEvents ?? configStore.maxVisibleEvents ?? 4
);
const stepDensity = delta => {
  const next = Math.min(20, Math.max(1, densityValue.value + delta));
  if (next !== densityValue.value || !densityOverridden.value) {
    persist({ maxVisibleEvents: next });
  }
};
const clearDensity = () => persist({ maxVisibleEvents: undefined });
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

/* Compact tri-state segmented control (Default / On / Off). */
.cvo-seg {
  display: inline-flex;
  gap: 2px;
  padding: 2px;
  background: var(--bg-1);
  border: 1px solid var(--line);
  border-radius: 8px;
}

.cvo-seg button {
  font-family: var(--font-ui);
  font-size: 0.72rem;
  line-height: 1;
  color: var(--ink-2);
  background: transparent;
  border: 0;
  border-radius: 6px;
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
  font-size: 0.68rem;
  color: var(--ink-2);
  background: var(--bg-1);
  border: 1px solid var(--line);
  border-radius: 999px;
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
