<template>
  <div class="ui-tab">
    <AppearanceTab
      :config="config"
      @update:config="$emit('update:config', $event)"
    />
    <ClockSettingsTab
      :config="config"
      @update:config="$emit('update:config', $event)"
    />
    <NotificationsTab
      :config="config"
      @update:config="$emit('update:config', $event)"
    />
  </div>
</template>

<script setup>
import AppearanceTab from "../dashboard/AppearanceTab.vue";
import ClockSettingsTab from "../dashboard/ClockSettingsTab.vue";
import NotificationsTab from "../dashboard/NotificationsTab.vue";

defineProps({
  config: {
    type: Object,
    required: true,
  },
});

defineEmits(["update:config"]);
</script>

<style scoped>
.ui-tab {
  width: 100%;
}
</style>
