<template>
  <RegionViewOptions :active="rolling" label="Calendar view options">
    <!-- Window + grid options only apply to multi-day views. A day view has no
         window to size, no rolling toggle, and no week grid, so it shows Refresh
         alone — but the tune button itself stays put across every view so it
         doesn't blink in and out when you switch. -->
    <div v-if="!isDay" class="cvo-row">
      <span class="cvo-label">{{ countLabel }}</span>
      <NumberStepper
        class="cvo-count"
        :model-value="countValue"
        :min="countMin"
        :max="countMax"
        :aria-label="countLabel"
        @update:model-value="setCount"
      />
    </div>
    <div v-if="!isDay" class="cvo-row">
      <span class="cvo-label">Rolling</span>
      <ToggleSwitch
        :model-value="rolling"
        aria-label="Rolling window"
        @update:model-value="setRolling"
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
      <Button
        class="cvo-default-chip"
        variant="secondary"
        size="sm"
        data-action="refresh-now"
        aria-label="Refresh calendar now"
        @click="refreshNow"
      >
        Refresh now
      </Button>
    </div>
  </RegionViewOptions>
</template>

<script setup>
import { computed } from "vue";
import { useConfigStore } from "@/stores/config";
import { useCalendarStore } from "@/stores/calendar";
import { useProgressStore } from "@/stores/progress";
import RegionViewOptions from "./RegionViewOptions.vue";
import Button from "@/components/ui/Button.vue";
import NumberStepper from "@/components/ui/NumberStepper.vue";
import ToggleSwitch from "@/components/ui/ToggleSwitch.vue";

const props = defineProps({
  regionId: { type: String, default: null },
  view: { type: Object, required: true },
});

const configStore = useConfigStore();
const calendarStore = useCalendarStore();
const progressStore = useProgressStore();
const refreshNow = () => {
  progressStore
    .track(
      `calendar:refresh:${props.regionId || "fullscreen"}`,
      () => calendarStore.refreshEvents(),
      {
        regionId: props.regionId || null,
      }
    )
    .catch(err => {
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

const setCount = next => {
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
/* Layout only: every control inside is a shared ui/ block. */
.cvo-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--gap-3);
}

.cvo-label {
  font-family: var(--font-ui);
  font-size: var(--text-body);
  color: var(--ink);
}
</style>
