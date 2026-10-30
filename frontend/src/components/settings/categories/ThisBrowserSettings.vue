<!-- frontend/src/components/settings/categories/ThisBrowserSettings.vue -->
<template>
  <div class="this-browser-settings" data-test="this-browser-page">
    <SettingsSection id="this-browser" title="This browser">
      <SettingRow
        label="Touchscreen"
        description="Shows touch buttons: arrows, page dots, the ✕ in fullscreen. Auto works for most screens; choose On if a touch panel acts like a mouse."
      >
        <template #description>
          <p class="setting-row__desc">
            Shows touch buttons: arrows, page dots, the ✕ in fullscreen. Auto works for most
            screens; choose On if a touch panel acts like a mouse.
          </p>
          <KioskScope
            :overridden="touchSetting.overridden.value"
            reset-test="reset-browser-touch"
            @reset="resetTouch"
          />
        </template>
        <SegmentedControl
          :model-value="touchMode"
          :options="[
            { value: 'auto', label: 'Auto' },
            { value: 'on', label: 'On' },
            { value: 'off', label: 'Off' },
          ]"
          aria-label="Touchscreen"
          @update:model-value="setTouchMode"
        />
      </SettingRow>

      <SettingRow label="Show it">
        <template #description>
          <p class="setting-row__desc">
            <span>{{ oskDescription }}</span>
            <button
              v-if="oskMode === 'auto' && oskHardwareSeen"
              type="button"
              class="device-osk-show-again"
              @click="showOskAgain"
            >
              Show it again
            </button>
          </p>
          <KioskScope
            :overridden="oskSetting.overridden.value"
            reset-test="reset-browser-osk"
            @reset="resetOsk"
          />
        </template>
        <SegmentedControl
          :model-value="oskMode"
          :options="[
            { value: 'auto', label: 'Auto' },
            { value: 'on', label: 'Always' },
            { value: 'off', label: 'Never' },
          ]"
          aria-label="Show it"
          @update:model-value="setOskMode"
        />
      </SettingRow>
      <p class="device-live" aria-live="polite">{{ oskLiveMessage }}</p>

      <SettingRow
        label="Settings text size"
        description="Only changes Settings. The dashboard has its own size below."
      >
        <template #description>
          <p class="setting-row__desc">
            Only changes Settings. The dashboard has its own size below.
          </p>
          <KioskScope
            :overridden="uiSizeSetting.overridden.value"
            reset-test="reset-browser-text-size"
            @reset="resetUiSize"
          />
        </template>
        <SegmentedControl
          :model-value="uiSize"
          :options="UI_SIZE_OPTIONS"
          aria-label="Settings text size"
          @update:model-value="setUiSize"
        />
      </SettingRow>
    </SettingsSection>
  </div>
</template>

<script setup>
import { computed, ref } from "vue";
import SettingsSection from "@/components/settings/shell/SettingsSection.vue";
import SettingRow from "@/components/settings/shell/SettingRow.vue";
import KioskScope from "@/components/settings/shared/KioskScope.vue";
import SegmentedControl from "@/components/ui/SegmentedControl.vue";
import { useScreenSetting } from "@/composables/useScreenSetting";
import { useOskHardwareSeen } from "@/composables/useOnScreenKeyboard";
import { useUiScale } from "@/composables/useUiScale";
import { UI_SIZE_OPTIONS } from "@/styles/uiScale";

// "This browser" is only shown to a browser that is not a set-up screen (§2),
// so every row here is a local choice with the Default value as its fallback.

const props = defineProps({
  config: { type: Object, required: true },
});
const emit = defineEmits(["changed"]);

const touchSetting = useScreenSetting("touchControls", {
  storageKey: "calvin-touch-controls",
  serverValue: () => props.config.touchControls,
});
const touchMode = computed(() => touchSetting.value.value || "auto");
const setTouchMode = async value => {
  await touchSetting.set(value);
  emit("changed");
};
const resetTouch = async () => {
  await touchSetting.reset();
  emit("changed");
};

// --- On-screen keyboard: Auto · Always · Never, per browser (CLV-27 §6) ------
const oskSetting = useScreenSetting("onScreenKeyboard", {
  storageKey: "calvin-osk-mode",
  serverValue: () => props.config.onScreenKeyboard,
});
const oskMode = computed(() => oskSetting.value.value || "auto");
const { seen: oskHardwareSeen, forget: forgetOskHardware } = useOskHardwareSeen();
const oskLiveMessage = ref("");
// Each mode says what it will actually do here, including the fallback after a
// real keyboard was used (CLV-27 §6) — the row's value alone can't say that.
const oskDescription = computed(() => {
  if (oskMode.value === "on") return "Shows whenever you tap a text field.";
  if (oskMode.value === "off") {
    return "Never shows by itself. On a touchscreen, tap Keyboard by a field to open it.";
  }
  if (oskHardwareSeen.value) return "Hidden here because a keyboard was used.";
  return "Shows on touchscreens when you tap a text field. Typing on a real keyboard hides it on this screen.";
});
const setOskMode = async value => {
  await oskSetting.set(value);
  emit("changed");
};
const resetOsk = async () => {
  await oskSetting.reset();
  emit("changed");
};
const showOskAgain = () => {
  forgetOskHardware();
  oskLiveMessage.value = "On-screen keyboard will show again.";
};

// --- Settings text size, local to this browser (§2, §6) --------------------
const uiSizeSetting = useScreenSetting("uiSize", {
  storageKey: "calvin-ui-size",
  serverValue: () => props.config.uiSize,
});
const uiSize = computed(() => uiSizeSetting.value.value || "default");
const { applyUiScale } = useUiScale();
const setUiSize = async value => {
  await uiSizeSetting.set(value);
  // Apply immediately, without waiting for the config store to round-trip.
  applyUiScale(value);
  emit("changed");
};
const resetUiSize = async () => {
  await uiSizeSetting.reset();
  applyUiScale(props.config.uiSize || "default");
  emit("changed");
};
</script>

<style scoped>
.this-browser-settings {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}
/* Slot content is in this component's scope, not SettingRow's. */
.setting-row__desc {
  margin: 0.2rem 0 0;
  font-size: var(--fs-sm);
  line-height: 1.4;
  color: var(--ink-2);
}
.device-osk-show-again {
  margin-left: 4px;
  padding: 0;
  background: none;
  border: none;
  color: var(--ink);
  font-family: var(--font-ui);
  font-size: inherit;
  font-weight: 500;
  text-decoration: underline;
  text-underline-offset: 3px;
  cursor: pointer;
}
.device-osk-show-again:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: 2px;
}
.device-live {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  padding: 0;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
  border: 0;
}
</style>
