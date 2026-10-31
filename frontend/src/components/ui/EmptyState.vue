<template>
  <div
    ref="rootEl"
    class="empty-state"
    :class="{ 'empty-state--quiet': quiet }"
    data-test="empty-state"
  >
    <div class="empty-state__body">
      <p class="empty-state__message">{{ message }}</p>
      <template v-if="!quiet">
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
        <PhoneSetupCard
          v-if="showPhone"
          class="empty-state__phone"
          compact
          :setting-id="phoneSettingId"
          :setup-code="setupCode"
          :hint="usesPrompt ? 'Typing is easier there.' : undefined"
        />
      </template>
    </div>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { useModeStore } from "@/stores/mode";
import { useAuthStore } from "@/stores/auth";
import { useTouchCapability } from "@/composables/useTouchCapability";
import { usePhoneHandoff } from "@/composables/usePhoneHandoff";
import { useSetupPrompt } from "@/composables/useSetupPrompt";
import { useSetupCode } from "@/composables/useSetupCode";
import PhoneSetupCard from "./PhoneSetupCard.vue";

// An empty dashboard surface that says what's missing and jumps straight to the
// setting that fixes it (F3/F4). On a touch kiosk it also offers the phone
// hand-off, since the fix usually needs typing.
//
// CLV-20: setup-empty regions report themselves to useSetupPrompt. The screen
// then decides whether the one QR belongs here (`gaps`) or on the welcome card,
// and this region goes quiet behind it (`welcome`).
const props = defineProps({
  message: { type: String, required: true },
  help: { type: String, default: "" },
  actionLabel: { type: String, default: "" },
  // settingsRegistry destination id, opened as /settings?setting=<id>
  settingId: { type: String, default: "" },
  // null = follow touch detection; true/false forces the phone hint on/off.
  phoneHint: { type: Boolean, default: null },
  // This EmptyState is the content region's "nothing configured yet" state.
  setup: { type: Boolean, default: false },
  // Stable id of the content region that owns this EmptyState (dashboard only).
  regionKey: { type: String, default: "" },
});

const router = useRouter();
const modeStore = useModeStore();
const auth = useAuthStore();
const { isTouch } = useTouchCapability();
const { isPhoneHandoff } = usePhoneHandoff();
const setupPrompt = useSetupPrompt();
const { code: setupCode, load: loadSetupCode } = useSetupCode();

// Only the server's own screen can read the code; the QR carries it so the
// phone does not have to type it.
watch(
  () => auth.status,
  status => {
    if (status === "setup") loadSetupCode();
  },
  { immediate: true }
);

const rootEl = ref(null);
let resizeObserver = null;

const usesPrompt = computed(() => Boolean(props.setup && props.regionKey));
const quiet = computed(() => usesPrompt.value && setupPrompt.mode.value === "welcome");

const showPhone = computed(() => {
  if (!props.settingId) return false;
  if (usesPrompt.value) {
    // Exactly one region per screen owns the QR in gaps mode.
    return (
      isPhoneHandoff.value &&
      setupPrompt.mode.value === "gaps" &&
      setupPrompt.qrOwner.value === props.regionKey
    );
  }
  // Fullscreen/legacy surfaces have no region registry: keep the local rule.
  return props.phoneHint === null ? isTouch.value : props.phoneHint;
});

// When several regions are missing, point the phone at Settings › Content
// instead of guessing one of them (CLV-20 §4.2).
const phoneSettingId = computed(() =>
  usesPrompt.value ? setupPrompt.qrSettingId.value : props.settingId
);

const openSetting = () => {
  modeStore.setMode(modeStore.MODES.SETTINGS);
  router.push({ path: "/settings", query: { setting: props.settingId } });
};

const reportArea = () => {
  const el = rootEl.value;
  if (!el) return;
  const width = el.clientWidth || el.getBoundingClientRect?.().width || 0;
  const height = el.clientHeight || el.getBoundingClientRect?.().height || 0;
  setupPrompt.report(props.regionKey, { area: width * height, height });
};

onMounted(() => {
  if (!usesPrompt.value) return;
  reportArea();
  if (typeof ResizeObserver !== "undefined" && rootEl.value) {
    resizeObserver = new ResizeObserver(reportArea);
    resizeObserver.observe(rootEl.value);
  }
});

onBeforeUnmount(() => {
  resizeObserver?.disconnect();
  resizeObserver = null;
  if (usesPrompt.value) setupPrompt.clear(props.regionKey);
});
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
  font-size: var(--fs-lg);
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
  font-size: var(--fs-base);
  font-weight: 600;
  color: var(--focus-ink);
  background: var(--focus);
  border: 0;
  border-radius: var(--radius-md);
  cursor: pointer;
}
.empty-state__action:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: 3px;
}
.empty-state__phone {
  margin-top: var(--space-lg);
}
/* Behind the welcome card: just the one quiet line, so the edges of the
   dashboard still say what is missing (CLV-20 §4.3). */
.empty-state--quiet .empty-state__body {
  padding: var(--space-md);
}
.empty-state--quiet .empty-state__message {
  color: var(--ink-3);
  font-size: var(--fs-base);
  font-weight: 500;
}
/* A small region can't fit the QR card — the button alone still works. */
@container (max-height: 360px) {
  .empty-state__phone {
    display: none;
  }
}
</style>
