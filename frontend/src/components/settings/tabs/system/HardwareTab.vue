<template>
  <div class="hardware-tab">
    <CollapsibleSection title="System Information" icon="ℹ️" :expanded="true">
      <SettingItem label="Backend Version">
        <span>{{ version || "Unknown" }}</span>
      </SettingItem>

      <SettingItem label="Frontend Version">
        <span>{{ frontendVersion || "Unknown" }}</span>
      </SettingItem>

      <SettingItem label="System Status">
        <div class="status-info">
          <span :class="connectionStatusClass">
            {{ connectionStatusText }}
          </span>
        </div>
      </SettingItem>
    </CollapsibleSection>
  </div>
</template>

<script setup>
import { computed } from "vue";
import { useConnectionStore } from "@/stores/connection";
import CollapsibleSection from "../../shared/CollapsibleSection.vue";
import SettingItem from "../../shared/SettingItem.vue";

const props = defineProps({
  version: {
    type: String,
    default: null,
  },
  frontendVersion: {
    type: String,
    default: null,
  },
});

const connectionStore = useConnectionStore();

const connectionStatusClass = computed(() => {
  if (connectionStore.isBackendOnline) {
    return "status-online";
  }
  return "status-offline";
});

const connectionStatusText = computed(() => {
  if (connectionStore.isBackendOnline) {
    return "● Online";
  }
  return "○ Offline";
});
</script>

<style scoped>
.hardware-tab {
  width: 100%;
}

.status-info {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.status-online {
  color: #4caf50;
  font-weight: 600;
}

.status-offline {
  color: #f44336;
  font-weight: 600;
}
</style>
