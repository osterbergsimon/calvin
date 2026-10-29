<template>
  <div class="empty-state" data-test="empty-state">
    <div class="empty-state__body">
      <p class="empty-state__message">{{ message }}</p>
      <p v-if="help" class="empty-state__help">{{ help }}</p>
      <button
        v-if="actionLabel && settingId"
        type="button"
        class="empty-state__action"
        data-test="empty-state-action"
        @click.stop="openSetting"
      >
        {{ actionLabel }}
      </button>
      <PhoneSetupCard v-if="showPhone" class="empty-state__phone" compact :setting-id="settingId" />
    </div>
  </div>
</template>

<script setup>
import { computed } from "vue";
import { useRouter } from "vue-router";
import { useModeStore } from "@/stores/mode";
import { useTouchCapability } from "@/composables/useTouchCapability";
import PhoneSetupCard from "./PhoneSetupCard.vue";

// An empty dashboard surface that says what's missing and jumps straight to the
// setting that fixes it (F3/F4). On a touch kiosk it also offers the phone
// hand-off, since the fix usually needs typing.
const props = defineProps({
  message: { type: String, required: true },
  help: { type: String, default: "" },
  actionLabel: { type: String, default: "" },
  // settingsRegistry destination id, opened as /settings?setting=<id>
  settingId: { type: String, default: "" },
  // null = follow touch detection; true/false forces the phone hint on/off.
  phoneHint: { type: Boolean, default: null },
});

const router = useRouter();
const modeStore = useModeStore();
const { isTouch } = useTouchCapability();

const showPhone = computed(
  () => Boolean(props.settingId) && (props.phoneHint === null ? isTouch.value : props.phoneHint)
);

const openSetting = () => {
  modeStore.setMode(modeStore.MODES.SETTINGS);
  router.push({ path: "/settings", query: { setting: props.settingId } });
};
</script>

<style scoped>
.empty-state {
  container-type: size;
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: auto;
}
.empty-state__body {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-sm);
  max-width: 34rem;
  padding: var(--space-xl);
  text-align: center;
}
.empty-state__message {
  margin: 0;
  font-family: var(--font-ui);
  font-size: 1.15rem;
  font-weight: 600;
  color: var(--ink);
}
.empty-state__help {
  margin: 0;
  color: var(--ink-2);
}
.empty-state__action {
  min-height: var(--touch-target);
  margin-top: var(--space-xs);
  padding: 0 1.25rem;
  font-family: var(--font-ui);
  font-size: 1rem;
  font-weight: 600;
  color: var(--focus-ink);
  background: var(--focus);
  border: 0;
  border-radius: 10px;
  cursor: pointer;
}
.empty-state__action:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: 3px;
}
.empty-state__phone {
  margin-top: var(--space-lg);
}
/* A small region can't fit the QR card — the button alone still works. */
@container (max-height: 360px) {
  .empty-state__phone {
    display: none;
  }
}
</style>
