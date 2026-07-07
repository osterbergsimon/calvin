<template>
  <RegionViewOptions :active="!!view?.linkAction" label="Service view options">
    <div class="svo-row">
      <span class="svo-label">Link behavior</span>
      <div class="svo-seg" role="radiogroup" aria-label="Link behavior">
        <button
          v-for="opt in linkOptions"
          :key="opt.value"
          type="button"
          role="radio"
          :class="{ on: current === opt.value }"
          :aria-checked="current === opt.value ? 'true' : 'false'"
          :aria-label="`Link behavior ${opt.value}`"
          @click="setLink(opt.value)"
        >
          {{ opt.label }}
        </button>
      </div>
    </div>
    <div class="svo-row">
      <span class="svo-label">Card size</span>
      <SelectPill
        class="svo-size"
        :model-value="currentCardSize"
        :options="cardSizeOptions"
        aria-label="Card size"
        @update:model-value="setCardSize"
      />
    </div>
    <div class="svo-row">
      <span class="svo-label">Refresh</span>
      <button
        type="button"
        class="svo-seg-btn"
        data-action="refresh-now"
        aria-label="Refresh service now"
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
import { useWebServicesStore } from "@/stores/webServices";
import RegionViewOptions from "./RegionViewOptions.vue";
import SelectPill from "@/components/ui/SelectPill.vue";
import { DEFAULT_CARD_SIZE } from "@/styles/cardSizeScale.js";

const props = defineProps({
  regionId: { type: String, default: null },
  view: { type: Object, default: () => ({}) },
});

const configStore = useConfigStore();
const webServicesStore = useWebServicesStore();
const refreshNow = () => {
  webServicesStore.refreshCurrentService().catch(err => {
    console.error("Failed to refresh service:", err);
  });
};

// "default" means inherit the plugin hint (persisted as absent).
const linkOptions = [
  { value: "default", label: "Default" },
  { value: "handoff", label: "QR" },
  { value: "embed", label: "In-app" },
  { value: "off", label: "Off" },
];
const current = computed(() => props.view?.linkAction ?? "default");

const setLink = value => {
  if (value === current.value) return;
  const linkAction = value === "default" ? undefined : value;
  configStore.updateRegionView(props.regionId, { linkAction }).catch(err => {
    console.error("Failed to update service view:", err);
  });
};

const cardSizeOptions = [
  { value: "xsmall", label: "X-Small" },
  { value: "small", label: "Small" },
  { value: "medium", label: "Medium" },
  { value: "large", label: "Large" },
  { value: "xlarge", label: "X-Large" },
];
const currentCardSize = computed(() => props.view?.cardSize ?? DEFAULT_CARD_SIZE);

const setCardSize = value => {
  if (value === currentCardSize.value) return;
  configStore.updateRegionView(props.regionId, { cardSize: value }).catch(err => {
    console.error("Failed to update card size:", err);
  });
};
</script>

<style scoped>
.svo-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
}
.svo-label {
  font-family: var(--font-ui);
  font-size: 0.85rem;
  color: var(--ink);
}
.svo-seg {
  display: inline-flex;
  gap: 2px;
  padding: 2px;
  background: var(--bg-1);
  border: 1px solid var(--line);
  border-radius: 8px;
}
.svo-seg button {
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
.svo-seg button.on {
  background: var(--focus);
  color: var(--focus-ink);
}
.svo-seg button:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: 1px;
}
.svo-size {
  flex-wrap: wrap;
  justify-content: flex-end;
}
.svo-seg-btn {
  font-family: var(--font-ui);
  font-size: 0.72rem;
  color: var(--ink-2);
  background: var(--bg-1);
  border: 1px solid var(--line);
  border-radius: 8px;
  padding: 0.2rem 0.5rem;
  min-height: 22px;
  cursor: pointer;
}
.svo-seg-btn:hover {
  border-color: var(--focus-edge);
  color: var(--ink);
}
.svo-seg-btn:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: 1px;
}
</style>
