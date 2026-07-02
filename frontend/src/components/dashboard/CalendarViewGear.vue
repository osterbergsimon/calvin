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
      ⚙
    </button>
    <div v-if="open" class="calendar-view-gear__popover" @click.stop>
      <p v-if="isDay" class="cvg-hint">Rolling applies to Month or Week views.</p>
      <template v-else>
        <div class="cvg-row">
          <span class="cvg-label">Rolling window</span>
          <ToggleSwitch
            :model-value="rolling"
            aria-label="Rolling window"
            @update:model-value="setRolling"
          />
        </div>
        <div v-if="rolling" class="cvg-row">
          <span class="cvg-count-label">{{ countLabel }}</span>
          <div class="cvg-stepper">
            <button type="button" aria-label="Decrease count" @click="step(-1)">−</button>
            <span class="cvg-count-value">{{ countValue }}</span>
            <button type="button" aria-label="Increase count" @click="step(1)">+</button>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup>
import { computed, ref } from "vue";
import { useConfigStore } from "@/stores/config";
import ToggleSwitch from "@/components/ui/ToggleSwitch.vue";

const props = defineProps({
  regionId: { type: String, default: null },
  view: { type: Object, required: true },
});

const configStore = useConfigStore();
const open = ref(false);

const rolling = computed(() => props.view?.rolling === true);
const isDay = computed(() => props.view?.mode === "day");
const isWeek = computed(() => props.view?.mode === "week");
const countLabel = computed(() => (isWeek.value ? "Days" : "Weeks"));
const countKey = computed(() => (isWeek.value ? "days" : "weeks"));
const countMax = computed(() => (isWeek.value ? 14 : 12));
const countValue = computed(() => (isWeek.value ? (props.view?.days ?? 7) : (props.view?.weeks ?? 4)));

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

.calendar-header__gear.active {
  color: var(--focus);
  border-color: var(--focus);
}

.calendar-view-gear__popover {
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  z-index: 20;
  min-width: 180px;
  padding: 0.6rem 0.75rem;
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
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

.cvg-label,
.cvg-count-label {
  font-family: var(--font-ui);
  font-size: 0.9rem;
  color: var(--ink);
}

.cvg-hint {
  margin: 0;
  font-size: 0.85rem;
  color: var(--ink-2);
}

.cvg-stepper {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
}

.cvg-stepper button {
  min-width: 28px;
  min-height: 28px;
  border: 1px solid var(--line);
  border-radius: 7px;
  background: var(--bg-1);
  color: var(--ink);
  cursor: pointer;
}

.cvg-stepper button:hover {
  border-color: var(--focus-edge);
}

.cvg-count-value {
  min-width: 1.5rem;
  text-align: center;
  font-variant-numeric: tabular-nums;
}
</style>
