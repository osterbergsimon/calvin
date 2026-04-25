<template>
  <div class="content-sources-category">
    <TabNavigation
      :tabs="tabs"
      :active-tab="activeTab"
      @tab-change="handleTabChange"
    />

    <SettingsTab>
      <CalendarSourcesTab
        v-if="activeTab === 'calendars'"
        :config="config"
        @update:config="$emit('update:config', $event)"
      />
      <PhotosTab
        v-if="activeTab === 'photos'"
        :config="config"
        @update:config="$emit('update:config', $event)"
      />
      <ImagesTab v-if="activeTab === 'images'" />
      <ServicesTab v-if="activeTab === 'services'" />
    </SettingsTab>
  </div>
</template>

<script setup>
import { onMounted } from "vue";
import { usePersistedSettingTab, usePlugins } from "@/composables";
import TabNavigation from "../shared/TabNavigation.vue";
import SettingsTab from "../shared/SettingsTab.vue";
import CalendarSourcesTab from "../tabs/content/CalendarSourcesTab.vue";
import PhotosTab from "../tabs/layout/PhotosTab.vue";
import ImagesTab from "../tabs/content/ImagesTab.vue";
import ServicesTab from "../tabs/content/ServicesTab.vue";

defineProps({
  config: {
    type: Object,
    required: true,
    default: () => ({}),
  },
});

defineEmits(["update:config"]);

const { loadPlugins } = usePlugins();

const tabs = [
  { id: "calendars", label: "Calendars", icon: "📅" },
  { id: "photos", label: "Photos", icon: "📷" },
  { id: "images", label: "Image Sources", icon: "🖼️" },
  { id: "services", label: "Services", icon: "🔌" },
];

const { activeTab, setActiveTab } = usePersistedSettingTab(
  "settings_tab_content_sources",
  "calendars",
);

const handleTabChange = (tabId) => {
  setActiveTab(tabId);
};

onMounted(async () => {
  await loadPlugins();
});
</script>

<style scoped>
.content-sources-category {
  width: 100%;
}
</style>
