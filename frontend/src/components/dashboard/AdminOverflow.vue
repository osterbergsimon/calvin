<template>
  <div class="admin-overflow">
    <Popover
      v-model="open"
      label="More controls"
      haspopup="menu"
      role="menu"
      initial-focus="button"
      @close="open = false"
    >
      <template #trigger="{ attrs }">
        <Button
          class="admin-overflow__trigger"
          variant="ghost"
          size="md"
          icon-only
          label="More controls"
          :icon="mdiDotsHorizontal"
          v-bind="attrs"
        />
      </template>
      <Menu :items="menuItems" label="More controls" @select="onSelect" @close="open = false" />
    </Popover>
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
import { ref, computed } from "vue";
import { mdiDotsHorizontal } from "@mdi/js";
import { useRouter } from "vue-router";
import { useConfigStore } from "../../stores/config";
import { useModeStore } from "../../stores/mode";
import { getActiveDashboardScreen } from "../../utils/layout";
import { normalizeHotCornerPosition } from "../../utils/hotCorner";
import Button from "../ui/Button.vue";
import Menu from "../ui/Menu.vue";
import Popover from "../ui/Popover.vue";
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

// Menu sorts danger items last; these are all neutral actions.
const menuItems = computed(() => {
  const items = [{ key: "settings", label: "Settings" }];
  if (canResizeRegions.value) {
    items.push({
      key: "lock-layout",
      label: configStore.regionsLocked ? "Unlock layout" : "Lock layout",
    });
  }
  items.push({ key: "hide-ui", label: "Hide controls" });
  return items;
});

const onSelect = key => {
  open.value = false;
  if (key === "settings") onSettings();
  else if (key === "lock-layout") onToggleLock();
  else if (key === "hide-ui") onHideUi();
};

const onSettings = () => {
  modeStore.setMode(modeStore.MODES.SETTINGS);
  router.push("/settings");
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
};
</script>

<style scoped>
.admin-overflow {
  display: inline-flex;
}
</style>
