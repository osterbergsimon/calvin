<template>
  <div class="system-category">
    <TabNavigation
      :tabs="tabs"
      :active-tab="activeTab"
      @tab-change="handleTabChange"
    />

    <SettingsTab>
      <PowerTab
        v-if="activeTab === 'power'"
        :config="config"
        @update:config="$emit('update:config', $event)"
      />
      <HardwareTab
        v-if="activeTab === 'hardware'"
        :version="version"
        :frontend-version="frontendVersion"
      />
      <UpdatesTab
        v-if="activeTab === 'updates'"
        :git-repo-url="gitRepoUrl"
        :git-branch="gitBranch"
        @update:gitRepoUrl="$emit('update:gitRepoUrl', $event)"
        @update:gitBranch="$emit('update:gitBranch', $event)"
      />
      <DebugTab
        v-if="activeTab === 'debug'"
        :config="config"
        @update:config="$emit('update:config', $event)"
      />
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
  gitRepoUrl: {
    type: String,
    default: "",
  },
  gitBranch: {
    type: String,
    default: "main",
  },
});

defineEmits(["update:config", "update:gitRepoUrl", "update:gitBranch"]);

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
