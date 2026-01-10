<template>
  <div class="layout-category">
    <TabNavigation
      :tabs="tabs"
      :active-tab="activeTab"
      @tab-change="handleTabChange"
    />

    <SettingsTab>
      <DisplayTab
        v-if="activeTab === 'display'"
        :config="config"
        @update:config="$emit('update:config', $event)"
      />
      <UITab
        v-if="activeTab === 'ui'"
        :config="config"
        @update:config="$emit('update:config', $event)"
      />
      <PhotosTab
        v-if="activeTab === 'photos'"
        :config="config"
        @update:config="$emit('update:config', $event)"
      />
      <KeyboardTab
        v-if="activeTab === 'keyboard'"
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
import DisplayTab from "../tabs/layout/DisplayTab.vue";
import UITab from "../tabs/layout/UITab.vue";
import PhotosTab from "../tabs/layout/PhotosTab.vue";
import KeyboardTab from "../tabs/layout/KeyboardTab.vue";

const props = defineProps({
  config: {
    type: Object,
    required: true,
    default: () => ({}),
  },
});

defineEmits(["update:config"]);

const tabs = [
  { id: "display", label: "Display", icon: "🖥️" },
  { id: "ui", label: "UI", icon: "🎨" },
  { id: "photos", label: "Photos", icon: "📷" },
  { id: "keyboard", label: "Keyboard", icon: "⌨️" },
];

const activeTab = ref("display");

const handleTabChange = (tabId) => {
  activeTab.value = tabId;
};
</script>

<style scoped>
.layout-category {
  width: 100%;
}
</style>
