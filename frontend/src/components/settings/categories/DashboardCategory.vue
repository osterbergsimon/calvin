<template>
  <div class="dashboard-category">
    <TabNavigation :tabs="tabs" :active-tab="activeTab" @tab-change="handleTabChange" />

    <SettingsTab>
      <DashboardLayoutTab
        v-if="activeTab === 'layout'"
        :config="config"
        @update:config="$emit('update:config', $event)"
      />
      <CalendarDisplayTab
        v-if="activeTab === 'calendar'"
        :config="config"
        @update:config="$emit('update:config', $event)"
      />
      <PluginDisplayTab
        v-if="activeTab === 'plugin-display'"
        :config="config"
        @update:config="$emit('update:config', $event)"
      />
      <AppearanceTab
        v-if="activeTab === 'appearance'"
        :config="config"
        @update:config="$emit('update:config', $event)"
      />
      <NotificationsTab
        v-if="activeTab === 'notifications'"
        :config="config"
        @update:config="$emit('update:config', $event)"
      />
    </SettingsTab>
  </div>
</template>

<script setup>
import { usePersistedSettingTab } from "@/composables";
import TabNavigation from "../shared/TabNavigation.vue";
import SettingsTab from "../shared/SettingsTab.vue";
import DashboardLayoutTab from "../tabs/dashboard/DashboardLayoutTab.vue";
import CalendarDisplayTab from "../tabs/dashboard/CalendarDisplayTab.vue";
import PluginDisplayTab from "../tabs/dashboard/PluginDisplayTab.vue";
import AppearanceTab from "../tabs/dashboard/AppearanceTab.vue";
import NotificationsTab from "../tabs/dashboard/NotificationsTab.vue";

defineProps({
  config: {
    type: Object,
    required: true,
    default: () => ({}),
  },
});

defineEmits(["update:config"]);

const tabs = [
  { id: "layout", label: "Layout", icon: "📐" },
  { id: "calendar", label: "Calendar Display", icon: "📅" },
  { id: "plugin-display", label: "Plugin Display", icon: "📦" },
  { id: "appearance", label: "Appearance", icon: "🎨" },
  { id: "notifications", label: "Notifications", icon: "🔔" },
];

const { activeTab, setActiveTab } = usePersistedSettingTab("settings_tab_dashboard", "layout");

const handleTabChange = tabId => {
  setActiveTab(tabId);
};
</script>

<style scoped>
.dashboard-category {
  width: 100%;
}
</style>
