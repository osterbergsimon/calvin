<template>
  <div class="device-category">
    <TabNavigation :tabs="tabs" :active-tab="activeTab" @tab-change="handleTabChange" />

    <SettingsTab>
      <PowerTab
        v-if="activeTab === 'power'"
        :config="config"
        @update:config="$emit('update:config', $event)"
      />
      <KeyboardTab
        v-if="activeTab === 'keyboard'"
        :config="config"
        @update:config="$emit('update:config', $event)"
      />
      <RebootComboTab
        v-if="activeTab === 'reboot'"
        :config="config"
        @update:config="$emit('update:config', $event)"
      />
      <HardwareTab
        v-if="activeTab === 'hardware'"
        :version="version"
        :frontend-version="frontendVersion"
      />
    </SettingsTab>
  </div>
</template>

<script setup>
import { usePersistedSettingTab } from "@/composables";
import TabNavigation from "../shared/TabNavigation.vue";
import SettingsTab from "../shared/SettingsTab.vue";
import PowerTab from "../tabs/system/PowerTab.vue";
import KeyboardTab from "../tabs/layout/KeyboardTab.vue";
import RebootComboTab from "../tabs/device/RebootComboTab.vue";
import HardwareTab from "../tabs/system/HardwareTab.vue";

defineProps({
  config: {
    type: Object,
    required: true,
  },
  version: {
    type: String,
    default: null,
  },
  frontendVersion: {
    type: String,
    default: null,
  },
});

defineEmits(["update:config"]);

const tabs = [
  { id: "power", label: "Power & Display", icon: "⚡" },
  { id: "keyboard", label: "Keyboard", icon: "⌨️" },
  { id: "reboot", label: "Reboot Combo", icon: "🔁" },
  { id: "hardware", label: "Hardware", icon: "🖥️" },
];

const { activeTab, setActiveTab } = usePersistedSettingTab("settings_tab_device", "power");

const handleTabChange = tabId => {
  setActiveTab(tabId);
};
</script>

<style scoped>
.device-category {
  width: 100%;
}
</style>
