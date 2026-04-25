<template>
  <div class="tab-navigation">
    <button
      v-for="tab in tabs"
      :key="tab.id"
      class="tab-button"
      :class="{ active: activeTab === tab.id }"
      @click="selectTab(tab.id)"
    >
      <span v-if="tab.icon" class="tab-icon">{{ tab.icon }}</span>
      <span class="tab-label">{{ tab.label }}</span>
      <span v-if="tab.badge" class="tab-badge">{{ tab.badge }}</span>
    </button>
  </div>
</template>

<script setup>
const props = defineProps({
  tabs: {
    type: Array,
    required: true,
    validator: tabs =>
      tabs.every(
        tab =>
          typeof tab === "object" &&
          tab.id &&
          tab.label &&
          (tab.icon === undefined || typeof tab.icon === "string") &&
          (tab.badge === undefined ||
            typeof tab.badge === "string" ||
            typeof tab.badge === "number")
      ),
  },
  activeTab: {
    type: String,
    required: true,
  },
});

const emit = defineEmits(["tab-change"]);

const selectTab = tabId => {
  if (tabId !== props.activeTab) {
    emit("tab-change", tabId);
  }
};
</script>

<style scoped>
.tab-navigation {
  display: flex;
  gap: 0.5rem;
  border-bottom: 2px solid var(--border-color);
  margin-bottom: 1.5rem;
  overflow-x: hidden;
  overflow-y: hidden;
}

.tab-button {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem 1.25rem;
  background: transparent;
  border: none;
  border-bottom: 3px solid transparent;
  color: var(--text-secondary);
  font-size: 0.95rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
  white-space: nowrap;
  position: relative;
  margin-bottom: -2px;
}

.tab-button:hover {
  color: var(--text-primary);
  background: var(--bg-secondary);
}

.tab-button.active {
  color: var(--accent-primary);
  border-bottom-color: var(--accent-primary);
  font-weight: 600;
}

.tab-icon {
  font-size: 1.1rem;
}

.tab-label {
  flex: 1;
}

.tab-badge {
  padding: 0.125rem 0.5rem;
  background: var(--bg-tertiary);
  color: var(--text-secondary);
  border-radius: 12px;
  font-size: 0.75rem;
  font-weight: 600;
}

.tab-button.active .tab-badge {
  background: var(--accent-primary);
  color: white;
}

/* Scrollbar styling for tab navigation */
.tab-navigation::-webkit-scrollbar {
  height: 4px;
}

.tab-navigation::-webkit-scrollbar-track {
  background: var(--bg-secondary);
}

.tab-navigation::-webkit-scrollbar-thumb {
  background: var(--border-color);
  border-radius: 2px;
}

.tab-navigation::-webkit-scrollbar-thumb:hover {
  background: var(--text-tertiary);
}
</style>
