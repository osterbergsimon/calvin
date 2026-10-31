<template>
  <div
    v-if="visible"
    ref="rootEl"
    class="connection-status"
    :class="[
      {
        'connection-status--compact': compact,
        'connection-status--floating': floating,
      },
      floating ? `connection-status--${floatingCorner}` : null,
    ]"
    data-test="connection-status"
  >
    <Button
      v-if="hasPill && !compact"
      ref="pillEl"
      variant="secondary"
      size="sm"
      shape="pill"
      aria-haspopup="dialog"
      :aria-expanded="open ? 'true' : 'false'"
      data-test="connection-pill"
      @click="togglePopover"
    >
      <template #icon>
        <svg class="connection-status__icon" viewBox="0 0 24 24" aria-hidden="true">
          <path :d="iconPath" />
        </svg>
      </template>
      <span class="connection-status__text"
        >{{ pillBaseText
        }}<span v-if="dataFrom" class="connection-status__from">
          · data from {{ dataFrom }}</span
        ></span
      >
    </Button>
    <IconButton
      v-else-if="hasPill"
      ref="pillEl"
      variant="ghost"
      size="sm"
      shape="circle"
      :label="pillText"
      aria-haspopup="dialog"
      :aria-expanded="open ? 'true' : 'false'"
      data-test="connection-pill"
      @click="togglePopover"
    >
      <svg class="connection-status__icon" viewBox="0 0 24 24" aria-hidden="true">
        <path :d="iconPath" />
      </svg>
    </IconButton>
    <span
      v-else-if="showConnecting"
      class="connection-status__connecting"
      data-test="connection-connecting"
    >
      Connecting…
    </span>
    <span
      v-else-if="showConnected"
      class="connection-status__connected"
      data-test="connection-connected"
    >
      <span aria-hidden="true">✓</span> Connected
    </span>

    <span v-if="compact && hasPill" class="connection-status__compact-time">{{ dataFrom }}</span>

    <span class="connection-status__announce" role="status" aria-live="polite">{{
      announcement
    }}</span>

    <Teleport to="body">
      <div
        v-if="open && hasPill"
        ref="popoverEl"
        class="connection-popover"
        :style="popoverStyle"
        role="dialog"
        aria-labelledby="connection-popover-title"
        data-test="connection-popover"
      >
        <h2 id="connection-popover-title" class="connection-popover__title">{{ popoverTitle }}</h2>
        <p>{{ popoverDataLine }}</p>
        <p v-if="status === 'unreachable'">
          Check that the Calvin server is on and that this screen is on the same network.
        </p>
        <p v-else>It isn't connected to the network. Check its Wi-Fi or cable.</p>
        <Button
          ref="tryButtonEl"
          variant="secondary"
          data-test="connection-try-now"
          :disabled="trying"
          @click="tryNow"
        >
          {{ trying ? "Checking…" : "Try now" }}
        </Button>
        <InlineNote
          v-if="tryFailed"
          class="connection-popover__result"
          tone="err"
          data-test="connection-try-failed"
        >
          Still can't reach it.
        </InlineNote>
      </div>
    </Teleport>
  </div>
</template>

<script setup>
import { computed, nextTick, onUnmounted, ref, watch } from "vue";
import { mdiCloudOffOutline, mdiLanDisconnect } from "@mdi/js";
import { useConfigStore } from "../stores/config";
import { useConnectionStore } from "../stores/connection";
import { formatDataFrom } from "../utils/connectionTime";
import Button from "./ui/Button.vue";
import IconButton from "./ui/IconButton.vue";
import InlineNote from "./ui/InlineNote.vue";

/**
 * The dashboard's single connection indicator (CLV-48).
 *
 * Replaces the old "No Connection" badge and the Healthy/Error status dot.
 * Nothing shows while things work; after two consecutive failed checks a pill
 * says what is wrong and how old the data is, and tapping it explains why.
 *
 * `compact` is the vertical clock bar variant (icon only, time below);
 * `floating` is the bottom-left fallback used when no clock bar is visible.
 */
const props = defineProps({
  compact: {
    type: Boolean,
    default: false,
  },
  floating: {
    type: Boolean,
    default: false,
  },
});

const STARTING_DELAY_MS = 5000;

const configStore = useConfigStore();
const connectionStore = useConnectionStore();

const rootEl = ref(null);
const pillEl = ref(null);
const popoverEl = ref(null);
const tryButtonEl = ref(null);

const open = ref(false);
const trying = ref(false);
const tryFailed = ref(false);
const startingElapsed = ref(false);
const popoverStyle = ref({});

let startingTimer = null;

const status = computed(() => connectionStore.status);

const dataFrom = computed(() =>
  formatDataFrom(connectionStore.lastBackendCheck, {
    timeFormat: configStore.timeFormat,
    timezone: configStore.timezone,
  })
);

const hasPill = computed(() => status.value === "unreachable" || status.value === "offline");
const showConnected = computed(() => status.value === "ok" && connectionStore.reconnected);
const showConnecting = computed(() => status.value === "starting" && startingElapsed.value);

// The clock bar shows every state; the floating fallback is status only, never
// the short "Connecting…"/"✓ Connected" chatter.
const visible = computed(() => {
  if (props.floating) return hasPill.value;
  return hasPill.value || showConnecting.value || showConnected.value;
});

const iconPath = computed(() =>
  status.value === "offline" ? mdiLanDisconnect : mdiCloudOffOutline
);

const pillBaseText = computed(() =>
  status.value === "offline" ? "No network" : "Can't reach Calvin"
);

const pillText = computed(() => {
  return dataFrom.value
    ? `${pillBaseText.value} · data from ${dataFrom.value}`
    : pillBaseText.value;
});

const floatingCorner = computed(() =>
  configStore.hotCornerPosition === "bottom-left" ? "top-left" : "bottom-left"
);

const popoverTitle = computed(() =>
  status.value === "offline" ? "This screen is offline" : "Can't reach Calvin"
);

const popoverDataLine = computed(() =>
  dataFrom.value
    ? `This screen is showing what it last got at ${dataFrom.value}. It keeps trying on its own.`
    : "This screen is showing what it last got. It keeps trying on its own."
);

const announcement = computed(() => {
  if (connectionStore.reconnected) return "Connected again.";
  if (status.value === "offline") return "This screen is offline.";
  if (status.value === "unreachable") return "Can't reach Calvin.";
  return "";
});

watch(
  status,
  value => {
    clearTimeout(startingTimer);
    startingElapsed.value = false;
    if (value === "starting") {
      startingTimer = setTimeout(() => {
        startingElapsed.value = true;
      }, STARTING_DELAY_MS);
    }
    // Reconnecting closes the explanation and shows "Connected" instead.
    if (value === "ok" && open.value) closePopover();
  },
  { immediate: true }
);

// Component refs expose the instance; the DOM node is their $el.
const pillNode = () => pillEl.value?.$el ?? pillEl.value;

const updatePopoverPosition = () => {
  const pill = pillNode();
  const popover = popoverEl.value;
  if (!pill) return;
  const rect = pill.getBoundingClientRect();
  const width = popover?.offsetWidth || 320;
  const height = popover?.offsetHeight || 200;
  const margin = 8;

  let top = rect.bottom + margin;
  if (top + height > window.innerHeight - margin) {
    top = Math.max(margin, rect.top - margin - height);
  }
  let left = rect.left;
  if (left + width > window.innerWidth - margin) {
    left = window.innerWidth - margin - width;
  }
  left = Math.max(margin, left);

  popoverStyle.value = { top: `${top}px`, left: `${left}px` };
};

const onDocumentPointerDown = event => {
  if (!open.value) return;
  const target = event.target;
  if (rootEl.value?.contains(target) || popoverEl.value?.contains(target)) return;
  closePopover();
};

const onDocumentKeyDown = event => {
  if (event.key === "Escape" && open.value) closePopover();
};

const addDocumentListeners = () => {
  document.addEventListener("pointerdown", onDocumentPointerDown);
  document.addEventListener("keydown", onDocumentKeyDown);
  window.addEventListener("resize", updatePopoverPosition);
  window.addEventListener("scroll", updatePopoverPosition, true);
};

const removeDocumentListeners = () => {
  document.removeEventListener("pointerdown", onDocumentPointerDown);
  document.removeEventListener("keydown", onDocumentKeyDown);
  window.removeEventListener("resize", updatePopoverPosition);
  window.removeEventListener("scroll", updatePopoverPosition, true);
};

const openPopover = async () => {
  open.value = true;
  tryFailed.value = false;
  addDocumentListeners();
  await nextTick();
  updatePopoverPosition();
  const tryButton = tryButtonEl.value?.$el ?? tryButtonEl.value;
  tryButton?.focus?.();
};

const closePopover = () => {
  if (!open.value) return;
  const focusWasInside =
    document.activeElement === document.body ||
    popoverEl.value?.contains(document.activeElement) ||
    rootEl.value?.contains(document.activeElement);
  open.value = false;
  removeDocumentListeners();
  if (focusWasInside) pillNode()?.focus?.();
};

const togglePopover = () => {
  if (open.value) closePopover();
  else openPopover();
};

const tryNow = async () => {
  trying.value = true;
  tryFailed.value = false;
  const ok = await connectionStore.checkBackend();
  trying.value = false;
  if (ok) closePopover();
  else tryFailed.value = true;
};

onUnmounted(() => {
  clearTimeout(startingTimer);
  removeDocumentListeners();
});
</script>

<style scoped>
.connection-status {
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  gap: var(--gap-1);
  min-width: 0;
}

/* The status glyph keeps the warn tone; the button chrome comes from ui/. */
.connection-status__icon {
  width: 1rem;
  height: 1rem;
  flex: 0 0 auto;
  fill: var(--warn);
}

/* On a phone-width clock bar the age of the data is the first thing that does
   not fit; the popover still spells it out (CLV-66). */
@media (max-width: 600px) {
  .connection-status__from {
    display: none;
  }
}

.connection-status__connecting {
  font-family: var(--font-ui);
  font-size: var(--text-body);
  color: var(--ink-2);
  white-space: nowrap;
}

.connection-status__connected {
  font-family: var(--font-ui);
  font-size: var(--text-body);
  color: var(--ok-text);
  white-space: nowrap;
}

.connection-status__compact-time {
  font-family: var(--font-data);
  font-size: var(--text-meta);
  color: var(--ink-2);
  white-space: nowrap;
}

/* Floating fallback when no clock bar is visible: status, not chrome. */
.connection-status--floating {
  position: fixed;
  left: var(--gap-4);
  bottom: var(--gap-4);
  z-index: calc(var(--z-dialog) + 3);
}

.connection-status--floating.connection-status--top-left {
  top: var(--gap-4);
  bottom: auto;
}

.connection-status__announce {
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

.connection-popover {
  position: fixed;
  z-index: var(--z-dialog);
  width: 20rem;
  padding: var(--gap-4);
  color: var(--ink);
  text-align: left;
  background: var(--bg-1);
  border: 1px solid var(--line);
  border-radius: var(--radius-card);
  box-shadow: var(--elev-2);
}

.connection-popover__title {
  margin: 0 0 var(--gap-2);
  font-family: var(--font-ui);
  font-size: var(--text-title);
  font-weight: var(--weight-title);
}

.connection-popover p {
  margin: 0 0 var(--gap-3);
  font-size: var(--text-body);
  line-height: 1.4;
  color: var(--ink-2);
}

.connection-popover__result {
  margin-top: var(--gap-3);
}
</style>
