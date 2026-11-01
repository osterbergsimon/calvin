<template>
  <FocusPanel as="section" :focused="focused" :dim="dim" :class="panelClasses">
    <header v-if="showPanelHeader" class="dashboard-panel__header">
      <div v-if="titleShown" class="dashboard-panel__title-group">
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
  </FocusPanel>
</template>

<script setup>
import { computed } from "vue";
import { useConfigStore } from "../stores/config";
import FocusPanel from "./ui/FocusPanel.vue";

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
  showTitle: {
    type: Boolean,
    default: true,
  },
  focused: {
    type: Boolean,
    default: false,
  },
  dim: {
    type: Boolean,
    default: false,
  },
});

const configStore = useConfigStore();

const titleShown = computed(() => props.showTitle && !!props.title);
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
  /* Anchor for the absolutely-positioned header overlay below. */
  position: relative;
}

.dashboard-panel--media .dashboard-panel__body {
  background: var(--bg-0);
}

.dashboard-panel__header {
  /* Transient chrome: the header is only mounted while UI is revealed (on focus/
     interaction). Float it over the top of the body instead of stacking above it,
     so the widgets keep their full height and nothing reflows when it appears. */
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  z-index: var(--z-raised);
  min-height: 0;
  padding: var(--gap-2) var(--gap-3);
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: var(--gap-3);
  /* Soft scrim so the title/controls stay legible over whatever the widget draws
     underneath, without a hard bar edge. */
  background: linear-gradient(
    to bottom,
    color-mix(in srgb, var(--bg-1) 88%, transparent),
    transparent
  );
  /* Let clicks fall through the empty parts of the overlay to the content below;
     the interactive children opt back in. */
  pointer-events: none;
}
/* When a title IS shown, space it opposite the controls. */
.dashboard-panel__header:has(.dashboard-panel__title-group) {
  justify-content: space-between;
}

.dashboard-panel__title-group {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: var(--gap-1);
  pointer-events: auto;
}

.dashboard-panel__title {
  margin: 0;
  color: var(--ink);
  font-family: var(--font-display);
  /* Scales with the dashboard "Touch target size" setting; the fallback keeps
     the medium/Default size pixel-identical and covers non-dashboard uses. */
  font-size: var(--region-label-fs, var(--text-title));
  font-weight: var(--weight-title);
  line-height: 1.2;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dashboard-panel__subtitle {
  margin: 0;
  color: var(--ink-2);
  font-size: var(--region-sublabel-fs, var(--text-meta));
  font-weight: var(--weight-strong);
  line-height: 1.25;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dashboard-panel__actions {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: var(--gap-2);
  pointer-events: auto;
}

.dashboard-panel__body {
  flex: 1;
  min-height: 0;
  min-width: 0;
  overflow: hidden;
  padding: var(--gap-4);
  display: flex;
  flex-direction: column;
}

.dashboard-panel--dense .dashboard-panel__body {
  padding: var(--gap-3);
}

.dashboard-panel--media .dashboard-panel__body,
.dashboard-panel--iframe .dashboard-panel__body {
  padding: 0;
}

@media (--bp-phone), (orientation: portrait) {
  .dashboard-panel__header {
    min-height: 64px;
    padding: clamp(var(--gap-2), 1.5vw, var(--gap-4));
  }

  .dashboard-panel__title {
    font-size: clamp(var(--text-label), 3vw, var(--region-label-fs, var(--text-title)));
  }

  .dashboard-panel__subtitle {
    font-size: clamp(var(--text-caption), 1.6vw, var(--region-sublabel-fs, var(--text-meta)));
  }

  .dashboard-panel__body {
    padding: clamp(var(--gap-1), 1vw, var(--gap-3));
  }

  .dashboard-panel--dense .dashboard-panel__body {
    padding: clamp(var(--gap-1), 0.8vw, var(--gap-2));
  }

  .dashboard-panel--media .dashboard-panel__body,
  .dashboard-panel--iframe .dashboard-panel__body {
    padding: 0;
  }
}
</style>
