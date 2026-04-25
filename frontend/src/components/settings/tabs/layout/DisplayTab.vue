<template>
  <div class="display-tab">
    <DashboardLayoutTab
      :config="config"
      @update:config="$emit('update:config', $event)"
    />
    <CalendarDisplayTab
      :config="config"
      @update:config="$emit('update:config', $event)"
    />
    <PluginDisplayTab
      :config="config"
      @update:config="$emit('update:config', $event)"
    />
  </div>
</template>

<script setup>
import DashboardLayoutTab from "../dashboard/DashboardLayoutTab.vue";
import CalendarDisplayTab from "../dashboard/CalendarDisplayTab.vue";
import PluginDisplayTab from "../dashboard/PluginDisplayTab.vue";

defineProps({
  config: {
    type: Object,
    required: true,
    default: () => ({}),
  },
});

defineEmits(["update:config"]);
</script>

<style scoped>
.display-tab {
  width: 100%;
}
</style>
