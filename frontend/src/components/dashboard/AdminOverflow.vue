<template>
  <div class="admin-overflow">
    <button
      ref="triggerEl"
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
    <div
      v-if="open"
      class="admin-overflow__menu"
      :class="{ 'admin-overflow__menu--up': openUp, 'admin-overflow__menu--left': alignLeft }"
      role="menu"
      @keydown.escape="close"
    >
      <button type="button" role="menuitem" class="admin-overflow__item" data-admin="settings" @click="onSettings">
        Settings
      </button>
      <button type="button" role="menuitem" class="admin-overflow__item" data-admin="hide-ui" @click="onHideUi">
        Hide UI
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref, onUnmounted } from "vue";
import { useRouter } from "vue-router";
import { useConfigStore } from "../../stores/config";
import { useModeStore } from "../../stores/mode";

const configStore = useConfigStore();
const modeStore = useModeStore();
const router = useRouter();

const open = ref(false);
const triggerEl = ref(null);
// Placement is decided from the trigger's position so the menu never opens
// off-screen — e.g. on a vertical/side clock bar the ⋯ sits at a bottom corner,
// so the menu must open upward and toward the content rather than down/right.
const openUp = ref(false);
const alignLeft = ref(false);

const onDocClick = event => {
  if (!event.target.closest(".admin-overflow")) close();
};

const toggle = () => {
  open.value ? close() : openMenu();
};
const openMenu = () => {
  const rect = triggerEl.value?.getBoundingClientRect();
  if (rect && typeof window !== "undefined") {
    // Lower half of the viewport → open upward; left half → anchor left edge
    // (menu grows rightward into the content) instead of the default right anchor.
    openUp.value = rect.top + rect.height / 2 > window.innerHeight / 2;
    alignLeft.value = rect.left + rect.width / 2 < window.innerWidth / 2;
  }
  open.value = true;
  document.addEventListener("click", onDocClick, true);
};
const close = () => {
  if (!open.value) return;
  open.value = false;
  document.removeEventListener("click", onDocClick, true);
};
onUnmounted(() => document.removeEventListener("click", onDocClick, true));

const onSettings = () => {
  modeStore.setMode(modeStore.MODES.SETTINGS);
  router.push("/settings");
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
  max-height: calc(100vh - 16px);
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  padding: 0.4rem;
  background: var(--bg-1);
  border: 1px solid var(--line);
  border-radius: 12px;
  box-shadow: 0 18px 50px -16px var(--focus-glow);
}
.admin-overflow__menu--up {
  top: auto;
  bottom: calc(100% + 8px);
}
.admin-overflow__menu--left {
  right: auto;
  left: 0;
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
