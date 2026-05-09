<template>
  <div class="clock-bar-category">
    <TabNavigation :tabs="tabs" :active-tab="activeTab" @tab-change="handleTabChange" />

    <SettingsTab>
      <ClockSettingsTab
        v-if="activeTab === 'appearance'"
        :config="config"
        @update:config="$emit('update:config', $event)"
      />
      <ClockBarItemsTab v-if="activeTab === 'bar-items'" />
    </SettingsTab>
  </div>
</template>

<script setup>
import { usePersistedSettingTab } from "@/composables";
import TabNavigation from "../shared/TabNavigation.vue";
import SettingsTab from "../shared/SettingsTab.vue";
import ClockSettingsTab from "../tabs/dashboard/ClockSettingsTab.vue";
import ClockBarItemsTab from "../tabs/clock-bar/ClockBarItemsTab.vue";

defineProps({
  config: {
    type: Object,
    required: true,
    default: () => ({}),
  },
});

defineEmits(["update:config"]);

const tabs = [
  { id: "appearance", label: "Appearance", icon: "🕐" },
  { id: "bar-items", label: "Bar Items", icon: "🧩" },
];

const { activeTab, setActiveTab } = usePersistedSettingTab("settings_tab_clock_bar", "appearance");

const handleTabChange = tabId => {
  setActiveTab(tabId);
};
</script>

<style scoped>
.clock-bar-category {
  width: 100%;
}
</style>
