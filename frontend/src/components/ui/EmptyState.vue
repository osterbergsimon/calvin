<template>
  <div
    ref="rootEl"
    class="empty-state"
    :class="{
      'empty-state--quiet': quiet,
      'empty-state--compact': compact,
      'empty-state--flush': compact && !inset,
    }"
    data-test="empty-state"
  >
    <div class="empty-state__body">
      <span v-if="icon && !quiet" class="empty-state__icon" aria-hidden="true">
        <svg class="empty-state__glyph" viewBox="0 0 24 24">
          <path :d="icon" fill="currentColor" />
        </svg>
      </span>
      <p class="empty-state__title">{{ title || message }}</p>
      <template v-if="!quiet">
        <p v-if="help" class="empty-state__help">{{ help }}</p>
        <Button
          v-if="actionLabel"
          variant="primary"
          data-test="empty-state-action"
          @click.stop="runAction"
        >
          {{ actionLabel }}
        </Button>
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
import Button from "./Button.vue";
import PhoneSetupCard from "./PhoneSetupCard.vue";

// The one empty surface (docs/design/frontend-doctrine.md §3): an icon, a
// title, at most one sentence of help and an optional action Button. A region
// fills the space it is put in (`compact` drops that for a panel or a list),
// and it jumps straight to the setting that fixes it (F3/F4). On a touch kiosk
// it also offers the phone hand-off, since the fix usually needs typing.
//
// CLV-20: setup-empty regions report themselves to useSetupPrompt. The screen
// then decides whether the one QR belongs here (`gaps`) or on the welcome card,
// and this region goes quiet behind it (`welcome`).
const props = defineProps({
  // The title line. `message` is the historical name for it.
  title: { type: String, default: "" },
  message: { type: String, default: "" },
  // One sentence that says what to do next (or where the fix lives).
  help: { type: String, default: "" },
  // An @mdi/js path drawn above the title.
  icon: { type: String, default: null },
  // A Button action. With `settingId` it deep-links to Settings; otherwise it
  // emits `action` for the owner to handle.
  actionLabel: { type: String, default: "" },
  // settingsRegistry destination id, opened as /settings?setting=<id>
  settingId: { type: String, default: "" },
  // null = follow touch detection; true/false forces the phone hint on/off.
  phoneHint: { type: Boolean, default: null },
  // This EmptyState is the content region's "nothing configured yet" state.
  setup: { type: Boolean, default: false },
  // Stable id of the content region that owns this EmptyState (dashboard only).
  regionKey: { type: String, default: "" },
  // A panel/list empty: no full-height box, just the block's own inset.
  compact: { type: Boolean, default: false },
  // false when an enclosing block already owns the panel inset.
  inset: { type: Boolean, default: true },
});

const emit = defineEmits(["action"]);

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

const runAction = () => {
  if (props.settingId) openSetting();
  else emit("action");
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
/* A panel or list empty state sizes to its content and insets like a panel
   child; only a dashboard region fills its box. */
.empty-state--compact {
  container-type: normal;
  height: auto;
  overflow: visible;
}
.empty-state__body {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--gap-stack);
  max-width: 34rem;
  padding: var(--gap-6);
  text-align: center;
}
.empty-state--compact .empty-state__body {
  padding: var(--panel-pad-y) var(--panel-pad-x);
}
.empty-state--flush .empty-state__body {
  padding: var(--gap-3) 0;
}
.empty-state__icon {
  display: inline-flex;
  color: var(--ink-3);
}
.empty-state__glyph {
  width: 2rem;
  height: 2rem;
  fill: currentColor;
}
.empty-state__title {
  margin: 0;
  font-family: var(--font-ui);
  font-size: var(--text-title);
  font-weight: var(--weight-title);
  color: var(--ink);
}
.empty-state__help {
  margin: 0;
  color: var(--ink-2);
}
.empty-state__phone {
  margin-top: var(--gap-4);
}
/* Behind the welcome card: just the one quiet line, so the edges of the
   dashboard still say what is missing (CLV-20 §4.3). */
.empty-state--quiet .empty-state__body {
  padding: var(--gap-3);
}
.empty-state--quiet .empty-state__title {
  color: var(--ink-3);
  font-size: var(--text-body);
  font-weight: var(--weight-strong);
}
/* A small region can't fit the QR card — the button alone still works. */
@container (max-height: 360px) {
  .empty-state__phone {
    display: none;
  }
}
</style>
