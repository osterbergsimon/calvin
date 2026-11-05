<template>
  <div class="clock-bar-overview">
    <div class="clock-bar-overview__preview" data-test="clock-bar-mini-preview">
      <ClockBarHorizontal
        position="top"
        :enabled="true"
        :always-show="true"
        :design="resolved.horizontal"
        :sample="true"
      />
    </div>
    <SettingRow
      label="Clock bar"
      description="The parts, their order and their sizes. One look for both bar shapes."
    >
      <Button variant="primary" data-test="edit-clock-bar" @click="$emit('edit')">
        Edit clock bar
      </Button>
    </SettingRow>
  </div>
</template>

<script setup>
import { computed, onMounted } from "vue";
import { useWebServicesStore } from "@/stores/webServices";
import { resolveClockBarDesign } from "@/utils/clockBarDesign";
import Button from "@/components/ui/Button.vue";
import SettingRow from "@/components/settings/shell/SettingRow.vue";
import ClockBarHorizontal from "@/components/ClockBarHorizontal.vue";

// Dashboard › Clock bar: a live mini preview of the design the dashboard is
// drawing, plus the one way into the editor (docs/design/2026-11-04-clock-bar-editor.md §5).
defineOptions({ name: "ClockBarOverview" });
const props = defineProps({
  config: { type: Object, required: true },
});
defineEmits(["edit"]);

const webServicesStore = useWebServicesStore();
const resolved = computed(() => resolveClockBarDesign(props.config, webServicesStore.services));

onMounted(() => {
  if (webServicesStore.services.length === 0 && !webServicesStore.loading) {
    webServicesStore.fetchServices();
  }
});
</script>

<style scoped>
.clock-bar-overview {
  display: flex;
  flex-direction: column;
}

.clock-bar-overview__preview {
  display: flex;
  flex-direction: column;
  padding: var(--panel-pad-y) var(--panel-pad-x) 0;
  overflow: hidden;
  border-radius: var(--radius-control);
}
</style>
