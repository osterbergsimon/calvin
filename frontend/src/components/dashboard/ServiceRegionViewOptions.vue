<template>
  <RegionViewOptions :active="!!view?.linkAction" label="Service view options">
    <div class="svo-row">
      <span class="svo-label">Link behavior</span>
      <SegmentedControl
        class="svo-seg"
        :model-value="current"
        :options="linkOptions"
        aria-label="Link behavior"
        @update:model-value="setLink"
      />
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
      <Button
        class="svo-refresh"
        variant="secondary"
        size="sm"
        data-action="refresh-now"
        aria-label="Refresh service now"
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
import { useWebServicesStore } from "@/stores/webServices";
import { useProgressStore } from "@/stores/progress";
import RegionViewOptions from "./RegionViewOptions.vue";
import Button from "@/components/ui/Button.vue";
import SegmentedControl from "@/components/ui/SegmentedControl.vue";
import SelectPill from "@/components/ui/SelectPill.vue";
import { DEFAULT_CARD_SIZE } from "@/styles/cardSizeScale.js";

const props = defineProps({
  regionId: { type: String, default: null },
  view: { type: Object, default: () => ({}) },
});

const configStore = useConfigStore();
const webServicesStore = useWebServicesStore();
const progressStore = useProgressStore();
const refreshNow = () => {
  progressStore
    .track(
      `plugin:refresh:${props.regionId || "fullscreen"}`,
      () => webServicesStore.refreshCurrentService(),
      { regionId: props.regionId || null }
    )
    .catch(err => {
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
/* Layout only: the controls are shared ui/ blocks. */
.svo-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--gap-3);
}
.svo-label {
  font-family: var(--font-ui);
  font-size: var(--text-body);
  color: var(--ink);
}
.svo-size {
  flex-wrap: wrap;
  justify-content: flex-end;
}
</style>
