<template>
  <div class="tab-navigation" role="tablist" @keydown="handleKeydown">
    <button
      v-for="tab in tabs"
      :key="tab.id"
      :ref="el => setTabRef(tab.id, el)"
      class="tab-button"
      :class="{ active: activeTab === tab.id }"
      type="button"
      role="tab"
      :aria-selected="activeTab === tab.id"
      :tabindex="activeTab === tab.id ? 0 : -1"
      @click="selectTab(tab.id)"
    >
      <span v-if="tab.icon" class="tab-icon">{{ tab.icon }}</span>
      <span class="tab-label">{{ tab.label }}</span>
      <Tag
        v-if="tab.badge"
        class="tab-badge"
        count
        :tone="activeTab === tab.id ? 'focus' : 'neutral'"
      >
        {{ tab.badge }}
      </Tag>
    </button>
  </div>
</template>

<script setup>
import { nextTick, ref } from "vue";
import Tag from "@/components/ui/Tag.vue";

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
const tabRefs = ref({});

const setTabRef = (tabId, el) => {
  if (el) {
    tabRefs.value[tabId] = el;
  } else {
    delete tabRefs.value[tabId];
  }
};

const selectTab = tabId => {
  if (tabId !== props.activeTab) {
    emit("tab-change", tabId);
  }
};

const focusTab = async tabId => {
  selectTab(tabId);
  await nextTick();
  tabRefs.value[tabId]?.focus();
};

const handleKeydown = event => {
  const currentIndex = props.tabs.findIndex(tab => tab.id === props.activeTab);
  if (currentIndex === -1) return;

  let nextIndex = currentIndex;
  if (event.key === "ArrowRight" || event.key === "ArrowDown") {
    nextIndex = (currentIndex + 1) % props.tabs.length;
  } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
    nextIndex = (currentIndex - 1 + props.tabs.length) % props.tabs.length;
  } else if (event.key === "Home") {
    nextIndex = 0;
  } else if (event.key === "End") {
    nextIndex = props.tabs.length - 1;
  } else {
    return;
  }

  event.preventDefault();
  void focusTab(props.tabs[nextIndex].id);
};
</script>

<style scoped>
.tab-navigation {
  display: flex;
  gap: var(--space-sm);
  border-bottom: 2px solid var(--line);
  margin-bottom: var(--space-3xl);
  overflow-x: auto;
  overflow-y: hidden;
  scrollbar-width: thin;
}

.tab-button {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  padding: 0.75rem var(--space-2xl);
  min-height: var(--touch-target);
  background: transparent;
  border: none;
  border-bottom: 3px solid transparent;
  color: var(--ink-2);
  font-size: var(--fs-control);
  font-family: var(--font-ui);
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
  white-space: nowrap;
  position: relative;
  margin-bottom: -2px;
}

.tab-button:hover {
  color: var(--ink);
  background: var(--bg-2);
}

.tab-button:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: 2px;
}

.tab-button.active {
  color: var(--focus);
  border-bottom-color: var(--focus);
  font-weight: 600;
}

.tab-icon {
  font-size: var(--fs-lg);
}

.tab-label {
  flex: 1;
}

/* Scrollbar styling for tab navigation */
.tab-navigation::-webkit-scrollbar {
  height: 4px;
}

.tab-navigation::-webkit-scrollbar-track {
  background: var(--bg-2);
}

.tab-navigation::-webkit-scrollbar-thumb {
  background: var(--line);
  border-radius: 2px;
}

.tab-navigation::-webkit-scrollbar-thumb:hover {
  background: var(--ink-3);
}
</style>
