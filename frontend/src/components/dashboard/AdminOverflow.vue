<template>
  <div class="admin-overflow">
    <Button
      ref="triggerEl"
      class="admin-overflow__trigger"
      variant="ghost"
      size="md"
      icon-only
      label="More controls"
      :icon="mdiDotsHorizontal"
      :aria-expanded="open ? 'true' : 'false'"
      aria-haspopup="menu"
      @click="toggle"
      @keydown.escape="close"
    />
    <div
      v-if="open"
      class="admin-overflow__menu"
      :class="{ 'admin-overflow__menu--up': openUp, 'admin-overflow__menu--left': alignLeft }"
      role="menu"
      @keydown.escape="close"
    >
      <Button
        variant="ghost"
        size="sm"
        class="admin-overflow__item"
        role="menuitem"
        data-admin="settings"
        @click="onSettings"
      >
        Settings
      </Button>
      <Button
        v-if="canResizeRegions"
        variant="ghost"
        size="sm"
        class="admin-overflow__item"
        role="menuitem"
        data-admin="lock-layout"
        @click="onToggleLock"
      >
        {{ configStore.regionsLocked ? "Unlock layout" : "Lock layout" }}
      </Button>
      <Button
        variant="ghost"
        size="sm"
        class="admin-overflow__item"
        role="menuitem"
        data-admin="hide-ui"
        @click="onHideUi"
      >
        Hide controls
      </Button>
    </div>
    <!-- F7: hiding is global (every screen) and the way back is a hidden
         long-press, so say both before doing it. -->
    <Teleport to="body">
      <ConfirmModal
        :show="confirmHide"
        title="Hide controls?"
        :message="hideMessage"
        confirm-text="Hide controls"
        @confirm="onConfirmHide"
        @cancel="confirmHide = false"
      />
    </Teleport>
  </div>
</template>

<script setup>
import { ref, computed, onUnmounted } from "vue";
import { mdiDotsHorizontal } from "@mdi/js";
import { useRouter } from "vue-router";
import { useConfigStore } from "../../stores/config";
import { useModeStore } from "../../stores/mode";
import { getActiveDashboardScreen } from "../../utils/layout";
import { normalizeHotCornerPosition } from "../../utils/hotCorner";
import Button from "../ui/Button.vue";
import ConfirmModal from "../settings/shared/ConfirmModal.vue";

const configStore = useConfigStore();
const modeStore = useModeStore();
const router = useRouter();

// Drag-resize only makes sense with at least two top-level regions to share.
// effectiveDashboardScreens so kiosk mode reflects the kiosk-active screen (calvin-yu0).
const canResizeRegions = computed(() => {
  const screen = getActiveDashboardScreen(configStore.effectiveDashboardScreens);
  return (screen?.layout?.regions?.length || 0) > 1;
});

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
  // A component ref exposes the instance; the button element is its $el.
  const trigger = triggerEl.value?.$el ?? triggerEl.value;
  const rect = trigger?.getBoundingClientRect?.();
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
const confirmHide = ref(false);
const hideMessage = computed(() => {
  const corner = normalizeHotCornerPosition(configStore.hotCornerPosition).replace("-", " ");
  const seconds = Math.max(0.1, Number(configStore.hotCornerLongPressMs) / 1000 || 0.5);
  return (
    "This hides the clock-bar buttons and menus on every screen showing this dashboard, " +
    `not only this one. To bring them back, press and hold the ${corner} corner of the ` +
    `screen for ${seconds} s.`
  );
});
const onHideUi = () => {
  close();
  // Bringing controls back needs no confirmation.
  if (!configStore.shouldShowUI) {
    configStore.toggleUI();
    return;
  }
  confirmHide.value = true;
};
const onConfirmHide = () => {
  confirmHide.value = false;
  configStore.toggleUI();
};
const onToggleLock = () => {
  configStore.toggleRegionsLock();
  close();
};
</script>

<style scoped>
.admin-overflow {
  position: relative;
  display: inline-flex;
}

/* Placement only: the trigger's chrome, focus ring and 48px target come from
   ui/Button. The menu anchors to the trigger and flips at the screen edges. */
.admin-overflow__menu {
  position: absolute;
  top: calc(100% + var(--gap-2));
  right: 0;
  z-index: var(--z-raised);
  min-width: 200px;
  max-height: calc(100vh - var(--gap-4));
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: var(--gap-1);
  padding: var(--gap-2);
  background: var(--bg-1);
  border: 1px solid var(--line);
  border-radius: var(--radius-card);
  box-shadow: var(--elev-1);
}
.admin-overflow__menu--up {
  top: auto;
  bottom: calc(100% + var(--gap-2));
}
.admin-overflow__menu--left {
  right: auto;
  left: 0;
}
/* The shared Button is inline-flex; a menu item fills the menu and reads
   left-aligned like every other action list. */
.admin-overflow__item {
  justify-content: flex-start;
  width: 100%;
  text-align: left;
}
</style>
