<template>
  <div class="admin-overflow">
    <button
      type="button"
      class="admin-overflow__trigger"
      aria-label="More controls"
      :aria-expanded="open ? 'true' : 'false'"
      aria-haspopup="menu"
      @click="toggle"
      @keydown.escape="close"
    >
      ⋯
    </button>
    <div v-if="open" class="admin-overflow__menu" role="menu" @keydown.escape="close">
      <button type="button" role="menuitem" class="admin-overflow__item" data-admin="mode" @click="onMode">
        {{ modeLabel }}
      </button>
      <button type="button" role="menuitem" class="admin-overflow__item" data-admin="side-view" @click="onSideView">
        {{ sideViewPositionTitle }}
      </button>
      <button type="button" role="menuitem" class="admin-overflow__item" data-admin="orientation" @click="onOrientation">
        {{ orientationLabel }}
      </button>
      <button type="button" role="menuitem" class="admin-overflow__item" data-admin="hide-ui" @click="onHideUi">
        Hide UI
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onUnmounted } from "vue";
import { useConfigStore } from "../../stores/config";
import { useModeStore } from "../../stores/mode";
import { logError } from "../../utils/logger";

const configStore = useConfigStore();
const modeStore = useModeStore();

const open = ref(false);

const onDocClick = event => {
  if (!event.target.closest(".admin-overflow")) close();
};

const toggle = () => {
  open.value ? close() : openMenu();
};
const openMenu = () => {
  open.value = true;
  document.addEventListener("click", onDocClick, true);
};
const close = () => {
  if (!open.value) return;
  open.value = false;
  document.removeEventListener("click", onDocClick, true);
};
onUnmounted(() => document.removeEventListener("click", onDocClick, true));

const modeLabel = computed(() =>
  modeStore.currentMode === modeStore.MODES.WEB_SERVICES ? "Show Photos" : "Show Web Services"
);
const orientationLabel = computed(() =>
  configStore.orientation === "landscape" ? "Switch to Portrait" : "Switch to Landscape"
);
const sideViewPositionTitle = computed(() => {
  if (configStore.orientation === "landscape") {
    return configStore.sideViewPosition === "right" ? "Side view: left" : "Side view: right";
  }
  return configStore.sideViewPosition === "bottom" ? "Side view: top" : "Side view: bottom";
});

const onMode = () => {
  if (modeStore.currentMode === modeStore.MODES.WEB_SERVICES) {
    configStore.setLastSideViewMode("photos");
    modeStore.setMode(modeStore.MODES.PHOTOS);
  } else {
    configStore.setLastSideViewMode("web_services");
    modeStore.setMode(modeStore.MODES.WEB_SERVICES);
  }
  close();
};
const onSideView = async () => {
  configStore.toggleSideViewPosition();
  try {
    await configStore.updateConfig({ sideViewPosition: configStore.sideViewPosition });
  } catch (err) {
    logError("[AdminOverflow]", "Failed to save side view position:", err);
  }
  close();
};
const onOrientation = () => {
  const next = configStore.orientation === "landscape" ? "portrait" : "landscape";
  configStore.setOrientation(next);
  configStore.setSideViewPosition(next === "landscape" ? "right" : "bottom");
  close();
};
const onHideUi = () => {
  configStore.toggleUI();
  close();
};
</script>

<style scoped>
.admin-overflow {
  position: relative;
  display: inline-flex;
}
.admin-overflow__trigger {
  min-width: 46px;
  min-height: 46px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 1.25rem;
  color: var(--ink-2);
  background: var(--bg-2);
  border: 1px solid var(--line);
  border-radius: 11px;
  cursor: pointer;
}
.admin-overflow__trigger:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: 2px;
}
.admin-overflow__menu {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  z-index: 20;
  min-width: 200px;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  padding: 0.4rem;
  background: var(--bg-1);
  border: 1px solid var(--line);
  border-radius: 12px;
  box-shadow: 0 18px 50px -16px var(--focus-glow);
}
.admin-overflow__item {
  min-height: 46px;
  text-align: left;
  padding: 0 0.85rem;
  font-family: var(--font-ui);
  font-size: 0.95rem;
  color: var(--ink);
  background: transparent;
  border: 0;
  border-radius: 9px;
  cursor: pointer;
}
.admin-overflow__item:hover {
  background: var(--bg-2);
}
.admin-overflow__item:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: -2px;
}
</style>
