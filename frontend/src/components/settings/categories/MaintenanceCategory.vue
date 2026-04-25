<template>
  <div class="maintenance-category">
    <TabNavigation
      :tabs="tabs"
      :active-tab="activeTab"
      @tab-change="handleTabChange"
    />

    <SettingsTab>
      <UpdatesTab
        v-if="activeTab === 'updates'"
        :git-repo-url="gitRepoUrl"
        :git-branch="gitBranch"
        @update:gitRepoUrl="$emit('update:gitRepoUrl', $event)"
        @update:gitBranch="$emit('update:gitBranch', $event)"
      />
      <DebugTab
        v-if="activeTab === 'diagnostics'"
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
import UpdatesTab from "../tabs/system/UpdatesTab.vue";
import DebugTab from "../tabs/system/DebugTab.vue";

defineProps({
  config: {
    type: Object,
    required: true,
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
  { id: "updates", label: "Updates", icon: "🔄" },
  { id: "diagnostics", label: "Diagnostics", icon: "🐛" },
];

const { activeTab, setActiveTab } = usePersistedSettingTab(
  "settings_tab_maintenance",
  "updates",
);

const handleTabChange = (tabId) => {
  setActiveTab(tabId);
};
</script>

<style scoped>
.maintenance-category {
  width: 100%;
}
</style>
