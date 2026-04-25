<template>
  <div class="content-category">
    <TabNavigation :tabs="tabs" :active-tab="activeTab" @tab-change="handleTabChange" />

    <SettingsTab>
      <ImagesTab v-if="activeTab === 'images'" />
      <ServicesTab v-if="activeTab === 'services'" />
      <CalendarSourcesTab v-if="activeTab === 'calendar-sources'" />
    </SettingsTab>
  </div>
</template>

<script setup>
import { ref, onMounted } from "vue";
import { usePlugins } from "@/composables";
import TabNavigation from "../shared/TabNavigation.vue";
import SettingsTab from "../shared/SettingsTab.vue";
import ImagesTab from "../tabs/content/ImagesTab.vue";
import ServicesTab from "../tabs/content/ServicesTab.vue";
import CalendarSourcesTab from "../tabs/content/CalendarSourcesTab.vue";

const { loadPlugins } = usePlugins();

const tabs = [
  { id: "images", label: "Images", icon: "🖼️" },
  { id: "services", label: "Services", icon: "🔌" },
  { id: "calendar-sources", label: "Calendar Sources", icon: "📅" },
];

const activeTab = ref("images");

const handleTabChange = tabId => {
  activeTab.value = tabId;
};

// Load plugins when component mounts
onMounted(async () => {
  await loadPlugins();
});
</script>

<style scoped>
.content-category {
  width: 100%;
}
</style>
