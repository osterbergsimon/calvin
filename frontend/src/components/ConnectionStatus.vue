<template>
  <div
    v-if="visible"
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
    <Popover
      v-if="hasPill"
      v-model="open"
      :label="popoverTitle"
      role="dialog"
      initial-focus="[data-test='connection-try-now']"
      @close="open = false"
    >
      <template #trigger="{ attrs }">
        <Button
          v-if="!compact"
          variant="secondary"
          size="sm"
          shape="pill"
          data-test="connection-pill"
          v-bind="attrs"
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
          v-else
          variant="ghost"
          size="sm"
          shape="circle"
          :label="pillText"
          data-test="connection-pill"
          v-bind="attrs"
        >
          <svg class="connection-status__icon" viewBox="0 0 24 24" aria-hidden="true">
            <path :d="iconPath" />
          </svg>
        </IconButton>
      </template>

      <div class="connection-popover" data-test="connection-popover">
        <h2 id="connection-popover-title" class="connection-popover__title">{{ popoverTitle }}</h2>
        <p>{{ popoverDataLine }}</p>
        <p v-if="status === 'unreachable'">
          Check that the Calvin server is on and that this screen is on the same network.
        </p>
        <p v-else>It isn't connected to the network. Check its Wi-Fi or cable.</p>
        <Button
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
    </Popover>
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
  </div>
</template>

<script setup>
import { computed, onUnmounted, ref, watch } from "vue";
import { mdiCloudOffOutline, mdiLanDisconnect } from "@mdi/js";
import { useConfigStore } from "../stores/config";
import { useConnectionStore } from "../stores/connection";
import { formatDataFrom } from "../utils/connectionTime";
import Button from "./ui/Button.vue";
import IconButton from "./ui/IconButton.vue";
import InlineNote from "./ui/InlineNote.vue";
import Popover from "./ui/Popover.vue";

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

const open = ref(false);
const trying = ref(false);
const tryFailed = ref(false);
const startingElapsed = ref(false);

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

const closePopover = () => {
  open.value = false;
};

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

/* The floating shell (surface, border, radius, elevation, placement, Escape
   and outside close) comes from ui/Popover; this is the panel's inset. */
.connection-popover {
  width: 20rem;
  padding: var(--gap-4);
  text-align: left;
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
