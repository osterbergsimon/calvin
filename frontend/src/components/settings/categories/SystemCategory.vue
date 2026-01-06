<template>
  <div class="system-category">
    <TabNavigation
      :tabs="tabs"
      :active-tab="activeTab"
      @tab-change="handleTabChange"
    />

    <SettingsTab>
      <PowerTab v-if="activeTab === 'power'" />
      <HardwareTab v-if="activeTab === 'hardware'" />
      <UpdatesTab v-if="activeTab === 'updates'" />
      <DebugTab v-if="activeTab === 'debug'" />
    </SettingsTab>
  </div>
</template>

<script setup>
import { ref } from "vue";
import TabNavigation from "../shared/TabNavigation.vue";
import SettingsTab from "../shared/SettingsTab.vue";
import PowerTab from "../tabs/system/PowerTab.vue";
import HardwareTab from "../tabs/system/HardwareTab.vue";
import UpdatesTab from "../tabs/system/UpdatesTab.vue";
import DebugTab from "../tabs/system/DebugTab.vue";

const tabs = [
  { id: "power", label: "Power", icon: "⚡" },
  { id: "hardware", label: "Hardware", icon: "🖥️" },
  { id: "updates", label: "Updates", icon: "🔄" },
  { id: "debug", label: "Debug", icon: "🐛" },
];

const activeTab = ref("power");

const handleTabChange = (tabId) => {
  activeTab.value = tabId;
};
</script>

<style scoped>
.system-category {
  width: 100%;
}
</style>
