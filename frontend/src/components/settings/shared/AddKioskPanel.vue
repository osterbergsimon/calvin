<template>
  <div class="add-kiosk" data-test="add-kiosk-panel">
    <Card title="Raspberry Pi">
      <div class="add-kiosk__block">
        <InlineNote>
          On a fresh Raspberry Pi OS, open a terminal (or SSH in) and run the command below. The Pi
          installs the kiosk, pairs itself, reboots into the dashboard and shows up in this list.
        </InlineNote>
        <div class="add-kiosk__cmd-row">
          <code
            class="add-kiosk__cmd"
            :class="{ 'add-kiosk__cmd--waiting': installState === 'loading' }"
            data-test="add-kiosk-command"
            >{{ installCommand }}</code
          >
          <Button
            ref="copyButton"
            data-test="add-kiosk-copy"
            :disabled="!serverUrl || installState === 'loading' || installState === 'expired'"
            @click="copyCommand"
          >
            {{ copied ? "Copied" : "Copy" }}
          </Button>
        </div>
        <InlineNote
          v-if="codeNote"
          :tone="codeNote.tone"
          data-test="add-kiosk-code-note"
          role="status"
        >
          {{ codeNote.text }}
          <template #action>
            <Button
              v-if="codeNote.action"
              ref="codeAction"
              variant="link"
              size="sm"
              data-test="install-new-code"
              @click="mintInstallCode"
            >
              {{ codeNote.action }}
            </Button>
          </template>
        </InlineNote>
      </div>
    </Card>

    <Card title="Any other screen (tablet, TV, laptop)">
      <div class="add-kiosk__block">
        <InlineNote>
          Give it a name, then open this address in its browser — or scan the code with a tablet. It
          registers as a kiosk the first time it loads. A few minutes later it shows a code at the
          bottom: type it in Pair a screen.
        </InlineNote>
        <TextField
          v-model="name"
          label="Kiosk name"
          input-test="add-kiosk-name"
          maxlength="64"
          autocomplete="off"
        />
        <PhoneSetupCard
          v-if="kioskUrl"
          compact
          :url="kioskUrl"
          title="Open on the new screen"
          hint="Use the same network as this server."
        />
      </div>
    </Card>
  </div>
</template>

<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref } from "vue";
import Button from "@/components/ui/Button.vue";
import Card from "@/components/ui/Card.vue";
import InlineNote from "@/components/ui/InlineNote.vue";
import TextField from "@/components/ui/TextField.vue";
import PhoneSetupCard from "@/components/ui/PhoneSetupCard.vue";
import { resolveServerUrl } from "@/utils/serverUrl";
import { formatDataFrom } from "@/utils/connectionTime";
import { useKiosksStore } from "@/stores/kiosks";
import { friendlyError } from "@/utils/friendlyError";

// "Add kiosk" (F6): the two real ways a screen becomes a kiosk — the one-command
// Pi installer (CLV-3) and a browser opening the dashboard with ?kiosk=<name>.
// The Pi command carries a one-time code, minted each time the panel opens.
const props = defineProps({
  timeFormat: { type: String, default: "24h" },
  timezone: { type: String, default: null },
});

const store = useKiosksStore();
const serverUrl = ref("");
const name = ref("kiosk-1");
const copied = ref(false);
const installState = ref("loading"); // loading | ready | expired | failed | unauthorized
const installCode = ref(null);
const installError = ref(null);
const codeAction = ref(null);
const copyButton = ref(null);
let expiryTimer = null;
let focusAction = false;

// Mirrors the server's kiosk-id allowlist ([A-Za-z0-9._-]{1,64}).
const safeName = computed(() =>
  name.value
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^A-Za-z0-9._-]/g, "")
    .slice(0, 64)
);

const plainCommand = computed(() =>
  serverUrl.value
    ? `curl -fsSL ${serverUrl.value}/api/kiosks/install.sh | sudo bash`
    : "Finding this server's address…"
);

const installCommand = computed(() => {
  if (installState.value === "loading") return "Getting a one-time code…";
  if (installState.value === "ready" || installState.value === "expired") {
    return installCode.value?.command || plainCommand.value;
  }
  return plainCommand.value;
});

const expiresLabel = computed(() =>
  formatDataFrom(installCode.value?.expiresAt, {
    timeFormat: props.timeFormat,
    timezone: props.timezone,
  })
);

const codeNote = computed(() => {
  if (installState.value === "ready") {
    return {
      tone: "neutral",
      text: `This command works once, for 30 minutes (until ${expiresLabel.value}).`,
      action: "New code",
    };
  }
  if (installState.value === "expired") {
    return {
      tone: "warn",
      text: "This code has run out. Get a new one before you run the command.",
      action: "New code",
    };
  }
  if (installState.value === "failed") {
    return {
      tone: "warn",
      text: "Couldn't get a one-time code. This command still works: the screen then shows a code to type in Pair a screen.",
      action: "Try again",
    };
  }
  if (installState.value === "unauthorized") {
    return {
      tone: "warn",
      text: friendlyError(installError.value, "make a one-time code"),
      action: null,
    };
  }
  return null;
});

const kioskUrl = computed(() =>
  serverUrl.value && safeName.value
    ? `${serverUrl.value}/?kiosk=${encodeURIComponent(safeName.value)}`
    : ""
);

function clearExpiryTimer() {
  if (expiryTimer !== null) {
    clearTimeout(expiryTimer);
    expiryTimer = null;
  }
}

function armExpiry(expiresAt) {
  clearExpiryTimer();
  const delay = Math.max(0, Date.parse(expiresAt) - Date.now());
  expiryTimer = setTimeout(() => {
    expiryTimer = null;
    installState.value = "expired";
  }, delay);
}

async function focusCodeAction() {
  const wanted = focusAction;
  focusAction = false;
  if (!wanted) return;
  await nextTick();
  // New code / Try again unmount while the answer loads. A refusal (401/403)
  // has no action at all, so focus lands on Copy rather than the page body.
  (codeAction.value?.$el ?? copyButton.value?.$el)?.focus?.();
}

async function mintInstallCode() {
  focusAction = document.activeElement === codeAction.value?.$el;
  clearExpiryTimer();
  copied.value = false;
  installState.value = "loading";
  installError.value = null;
  try {
    installCode.value = await store.newInstallCode();
    installState.value = "ready";
    if (installCode.value?.expiresAt) armExpiry(installCode.value.expiresAt);
  } catch (err) {
    installError.value = err;
    installState.value =
      err?.response?.status === 401 || err?.response?.status === 403 ? "unauthorized" : "failed";
  }
  await focusCodeAction();
}

const copyCommand = async () => {
  try {
    await navigator.clipboard.writeText(installCommand.value);
    copied.value = true;
    setTimeout(() => {
      copied.value = false;
    }, 2000);
  } catch {
    // No clipboard (plain-HTTP origin) — the command stays selectable on screen.
  }
};

onMounted(async () => {
  serverUrl.value = await resolveServerUrl();
  await mintInstallCode();
});

onUnmounted(clearExpiryTimer);
</script>

<style scoped>
.add-kiosk {
  display: flex;
  flex-direction: column;
  gap: var(--gap-6);
  padding: var(--panel-pad-y) var(--panel-pad-x);
}

.add-kiosk__block {
  display: flex;
  flex-direction: column;
  gap: var(--gap-3);
}

.add-kiosk__cmd-row {
  display: flex;
  align-items: stretch;
  gap: var(--gap-inline);
}

.add-kiosk__cmd {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  padding: var(--gap-2) var(--gap-3);
  overflow-wrap: anywhere;
  user-select: all;
  font-family: var(--font-data);
  font-size: var(--text-meta);
  color: var(--ink);
  background: var(--bg-0);
  border: 1px solid var(--line);
  border-radius: var(--radius-control);
}

.add-kiosk__cmd--waiting {
  /* "Getting a one-time code…" keeps the block's place and swaps the data face
     for the UI face (the mock's F2). */
  font-family: var(--font-ui);
  color: var(--ink-2);
  user-select: none;
}
</style>
