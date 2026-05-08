<template>
  <section :class="panelClasses">
    <header v-if="showPanelHeader" class="dashboard-panel__header">
      <div class="dashboard-panel__title-group">
        <h2 class="dashboard-panel__title">{{ title }}</h2>
        <p v-if="subtitle" class="dashboard-panel__subtitle">{{ subtitle }}</p>
      </div>
      <div v-if="$slots.actions" class="dashboard-panel__actions">
        <slot name="actions" />
      </div>
    </header>
    <div class="dashboard-panel__body">
      <slot />
    </div>
  </section>
</template>

<script setup>
import { computed } from "vue";
import { useConfigStore } from "../stores/config";

const props = defineProps({
  title: {
    type: String,
    required: true,
  },
  subtitle: {
    type: String,
    default: "",
  },
  variant: {
    type: String,
    default: "default",
    validator: value => ["default", "dense", "media", "iframe"].includes(value),
  },
  headerVisible: {
    type: Boolean,
    default: true,
  },
});

const configStore = useConfigStore();

const showPanelHeader = computed(() => props.headerVisible && configStore.shouldShowUI);
const panelClasses = computed(() => [
  "dashboard-panel",
  `dashboard-panel--${props.variant}`,
  { "dashboard-panel--header-hidden": !showPanelHeader.value },
]);
</script>

<style scoped>
.dashboard-panel {
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--bg-primary);
  border-radius: 8px;
}

.dashboard-panel--media {
  background: #000;
}

.dashboard-panel__header {
  min-height: 72px;
  padding: 1rem;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border-color);
}

.dashboard-panel__title-group {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
}

.dashboard-panel__title {
  margin: 0;
  color: var(--text-primary);
  font-size: 1.5rem;
  font-weight: 700;
  line-height: 1.2;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dashboard-panel__subtitle {
  margin: 0;
  color: var(--text-secondary);
  font-size: 0.85rem;
  font-weight: 500;
  line-height: 1.25;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dashboard-panel__actions {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.dashboard-panel__body {
  flex: 1;
  min-height: 0;
  min-width: 0;
  overflow: hidden;
  padding: 1rem;
  display: flex;
  flex-direction: column;
}

.dashboard-panel--dense .dashboard-panel__body {
  padding: 0.75rem;
}

.dashboard-panel--media .dashboard-panel__body,
.dashboard-panel--iframe .dashboard-panel__body {
  padding: 0;
}

:slotted(.dashboard-panel__icon-button) {
  width: 32px;
  height: 32px;
  border-radius: 4px;
  border: 1px solid var(--border-color);
  background: var(--bg-primary);
  color: var(--text-primary);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 1.2rem;
  line-height: 1;
  transition:
    background 0.2s,
    border-color 0.2s;
}

:slotted(.dashboard-panel__icon-button:hover) {
  background: var(--bg-secondary);
  border-color: var(--text-secondary);
}

:slotted(.dashboard-panel__icon-button:focus) {
  outline: 2px solid var(--accent-primary);
  outline-offset: 2px;
}

@media (max-width: 768px), (orientation: portrait) {
  .dashboard-panel__header {
    min-height: 64px;
    padding: clamp(0.5rem, 1.5vw, 1rem);
  }

  .dashboard-panel__title {
    font-size: clamp(1rem, 3vw, 1.5rem);
  }

  .dashboard-panel__subtitle {
    font-size: clamp(0.65rem, 1.6vw, 0.85rem);
  }

  .dashboard-panel__body {
    padding: clamp(0.25rem, 1vw, 0.75rem);
  }

  .dashboard-panel--dense .dashboard-panel__body {
    padding: clamp(0.2rem, 0.8vw, 0.5rem);
  }

  .dashboard-panel--media .dashboard-panel__body,
  .dashboard-panel--iframe .dashboard-panel__body {
    padding: 0;
  }
}
</style>
