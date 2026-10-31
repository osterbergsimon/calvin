<template>
  <SettingsSection id="security-api-keys" title="API keys">
    <template v-if="store.keys.length && !formOpen && !secret" #action>
      <Button data-test="api-keys-create" @click="openForm">Create key</Button>
    </template>

    <template #description>
      Let apps and scripts, like Home Assistant, use Calvin without the admin password. Give each
      one its own key.
      <InlineNote aria-live="polite" data-test="api-key-live">{{ liveMessage }}</InlineNote>
    </template>

    <!-- Show once -->
    <SettingRow v-if="secret" label="New key" stacked>
      <Card data-test="api-key-result">
        <h3 ref="resultTitle" tabindex="-1" data-test="api-key-result-title">Copy your key now</h3>
        <InlineNote>
          You won't be able to see it again. If you lose it, revoke it and create a new one.
        </InlineNote>
        <TextField
          ref="secretInput"
          :model-value="secret"
          :label="`New API key for ${createdKey?.name}`"
          input-id="api-key-secret"
          readonly
          @focusin="selectSecret"
          @click="selectSecret"
        />
        <Button
          data-test="api-key-copy"
          :icon="copyState === 'copied' ? mdiCheck : null"
          @click="copySecret"
        >
          {{ copyLabel }}
        </Button>
        <InlineNote v-if="copyState === 'failed'">
          Press Ctrl+C (or long-press → Copy) to copy the selected key.
        </InlineNote>
        <InlineNote> Send it as <code>Authorization: Bearer &lt;key&gt;</code> </InlineNote>
        <Button data-test="api-key-done" @click="done">Done</Button>
      </Card>
    </SettingRow>

    <!-- Create form -->
    <SettingRow v-else-if="formOpen" label="Create a key" stacked>
      <form data-test="api-key-form" novalidate @submit.prevent="submit">
        <TextField
          v-model="name"
          label="Name"
          input-id="api-key-name"
          maxlength="40"
          placeholder="Home Assistant"
          hint="So you know which app uses it."
          :error="nameError"
        />

        <fieldset>
          <legend>What it can do</legend>
          <ListRow
            v-for="option in scopeOptions"
            :key="option.value"
            :name="option.label"
            :selected="scope === option.value"
            :disabled="isDisabled(option)"
            :data-test="`scope-card-${option.value}`"
            @click="selectScope(option)"
          >
            <template #lead>
              <input
                v-model="scope"
                type="radio"
                name="api-key-scope"
                :value="option.value"
                :disabled="isDisabled(option)"
                :aria-label="option.label"
                :aria-describedby="`api-key-scope-${option.value}-desc`"
                :data-test="`scope-${option.value}`"
              />
            </template>
            <template #meta>
              <span :id="`api-key-scope-${option.value}-desc`">
                {{ isDisabled(option) ? HOST_UNAVAILABLE : option.description }}
              </span>
              <InlineNote v-if="option.value === 'host' && !isDisabled(option)" tone="err">
                Anyone with this key can reboot the machine Calvin runs on.
              </InlineNote>
            </template>
          </ListRow>
        </fieldset>

        <label v-if="scope === 'host'">
          <input v-model="hostAck" type="checkbox" data-test="api-key-host-ack" />
          I understand this key can reboot this machine.
        </label>

        <InlineNote v-if="showTouchHint">
          Easier on the computer where you'll paste it: the key is only shown once.
        </InlineNote>

        <Button
          type="submit"
          variant="primary"
          data-test="api-key-submit"
          :disabled="scope === 'host' && !hostAck"
          :loading="creating"
          loading-label="Creating…"
        >
          Create key
        </Button>
        <Button data-test="api-key-cancel" :disabled="creating" @click="closeForm">Cancel</Button>
        <InlineNote v-if="createError" tone="err" role="alert">{{ createError }}</InlineNote>
      </form>
    </SettingRow>

    <!-- Loading / error / empty / list -->
    <SettingRow v-if="store.loading && !store.keys.length" label="Loading keys" stacked>
      <Card v-for="n in 3" :key="n" data-test="api-keys-skeleton" aria-hidden="true" />
    </SettingRow>

    <SettingRow
      v-else-if="store.loadFailed && !store.keys.length"
      label="API keys"
      description="Couldn't load API keys."
    >
      <Button data-test="api-keys-retry" @click="load">Try again</Button>
    </SettingRow>

    <SettingRow
      v-else-if="!store.keys.length && !formOpen && !secret"
      label="No API keys yet."
      description="Create one to let Home Assistant or a script read or change Calvin."
      data-test="api-keys-empty"
    >
      <Button variant="primary" data-test="api-keys-create" @click="openForm">Create key</Button>
    </SettingRow>

    <SettingRow v-if="store.keys.length" label="Your keys" stacked>
      <ListRow
        v-for="item in store.keys"
        :key="item.id"
        :name="item.name"
        :meta="[keyMeta(item)]"
        data-test="api-key-row"
      >
        <InlineNote v-if="item.scope === 'host' && environment?.host_control === false">
          Host actions are blocked: this Calvin doesn't control its machine.
        </InlineNote>
        <InlineNote v-if="rowErrors[item.id]" tone="err" data-test="api-key-row-error">
          Couldn't revoke this key. Try again.
        </InlineNote>
        <template #actions>
          <Tag
            :tone="item.scope === 'host' ? 'err' : 'neutral'"
            :icon="item.scope === 'host' ? mdiAlert : null"
            data-test="api-key-scope"
          >
            {{ scopeChip(item.scope) }}
          </Tag>
          <Button variant="danger" size="sm" data-test="api-key-revoke" @click="askRevoke(item)">
            Revoke
          </Button>
        </template>
      </ListRow>
    </SettingRow>

    <ConfirmModal
      :show="Boolean(revoking)"
      :title="`Revoke &quot;${revoking?.name}&quot;?`"
      message="Apps using this key stop working right away. This can't be undone."
      confirm-text="Revoke key"
      :danger="true"
      @confirm="revoke"
      @cancel="revoking = null"
    />
  </SettingsSection>
</template>

<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import { mdiAlert, mdiCheck } from "@mdi/js";
import Tag from "@/components/ui/Tag.vue";
import { useApiKeysStore } from "@/stores/apiKeys";
import { useSystem } from "@/composables/useSystem";
import { useTouchCapability } from "@/composables/useTouchCapability";
import { formatKeyDate, formatLastUsed } from "@/utils/apiKeyFormat";
import { logError } from "@/utils/logger";
import Button from "@/components/ui/Button.vue";
import Card from "@/components/ui/Card.vue";
import InlineNote from "@/components/ui/InlineNote.vue";
import ListRow from "@/components/ui/ListRow.vue";
import TextField from "@/components/ui/TextField.vue";
import SettingsSection from "@/components/settings/shell/SettingsSection.vue";
import SettingRow from "@/components/settings/shell/SettingRow.vue";
import ConfirmModal from "@/components/settings/shared/ConfirmModal.vue";

const HOST_UNAVAILABLE = "Not available: this Calvin doesn't control its machine.";
const scopeOptions = [
  {
    value: "read",
    label: "Read",
    description: "See calendars, photos, settings and status. Can't change anything.",
  },
  {
    value: "admin",
    label: "Admin",
    description: "Everything Read can, plus change settings and content, like signing in as admin.",
  },
  {
    value: "host",
    label: "Host control",
    description:
      "Everything Admin can, plus restart Calvin, reboot this machine and install updates.",
  },
];

const store = useApiKeysStore();
const { environment, loadEnvironment } = useSystem();
const { isTouch } = useTouchCapability();

const formOpen = ref(false);
const name = ref("");
const scope = ref("read");
const hostAck = ref(false);
const nameError = ref("");
const createError = ref("");
const creating = ref(false);
const liveMessage = ref("");
const rowErrors = ref({});
const revoking = ref(null);

// The secret exists only in these two refs, from the POST response until Done.
const secret = ref("");
const createdKey = ref(null);
const copyState = ref("idle"); // idle | copied | failed
const resultTitle = ref(null);
const secretInput = ref(null);
let copiedTimer = null;

const width = ref(typeof window === "undefined" ? 1024 : window.innerWidth);
const onResize = () => {
  width.value = window.innerWidth;
};
const showTouchHint = computed(() => isTouch.value && width.value >= 720);
const hostUnavailable = computed(() => environment.value?.host_control === false);
const copyLabel = computed(() =>
  copyState.value === "copied"
    ? "Copied"
    : copyState.value === "failed"
      ? "Select and copy"
      : "Copy"
);

const now = () => new Date();
// One meta line in ListRow's own meta role, so it keeps --text-meta/--ink-2.
// Empty parts are dropped: a bad date must never leave "Created ·" behind.
const keyMeta = item => {
  const created = formatKeyDate(item.createdAt, now());
  return [
    `${item.prefix}…`,
    created ? `Created ${created}` : "",
    item.lastUsedAt ? `Last used ${formatLastUsed(item.lastUsedAt, now())}` : "Never used",
  ]
    .filter(Boolean)
    .join(" · ");
};
const scopeChip = value =>
  value === "host" ? "Host control" : (scopeOptions.find(o => o.value === value)?.label ?? value);
const isDisabled = option => option.value === "host" && hostUnavailable.value;
const selectScope = option => {
  if (!isDisabled(option)) scope.value = option.value;
};

watch(scope, () => {
  hostAck.value = false;
});
watch(name, () => {
  nameError.value = "";
});

async function load() {
  try {
    await store.fetchKeys();
  } catch (err) {
    logError("[ApiKeysSection]", "load failed", err);
  }
}

onMounted(() => {
  window.addEventListener("resize", onResize);
  loadEnvironment();
  load();
});
onUnmounted(() => {
  window.removeEventListener("resize", onResize);
  clearTimeout(copiedTimer);
  secret.value = "";
});

function openForm() {
  formOpen.value = true;
  createError.value = "";
}

function closeForm() {
  formOpen.value = false;
  name.value = "";
  scope.value = "read";
  hostAck.value = false;
  nameError.value = "";
  createError.value = "";
}

async function submit() {
  if (creating.value) return;
  const trimmed = name.value.trim();
  if (!trimmed) {
    nameError.value = "Give the key a name.";
    return;
  }
  if (store.keys.some(k => k.name.toLowerCase() === trimmed.toLowerCase())) {
    nameError.value = `You already have a key called ${trimmed}.`;
    return;
  }
  if (scope.value === "host" && !hostAck.value) return;

  creating.value = true;
  createError.value = "";
  try {
    const data = await store.createKey(trimmed, scope.value);
    secret.value = data.secret;
    createdKey.value = data.key;
    copyState.value = "idle";
    formOpen.value = false;
    await nextTick();
    resultTitle.value?.focus();
  } catch (err) {
    const status = err?.response?.status;
    if (status === 409) {
      nameError.value = `You already have a key called ${trimmed}.`;
    } else if (status === 401) {
      // The global sign-in dialog opens; keep the form so nothing is lost.
    } else {
      createError.value = "Couldn't create the key. Try again.";
      logError("[ApiKeysSection]", "create failed", status);
    }
  } finally {
    creating.value = false;
  }
}

function selectSecret() {
  secretInput.value?.select();
}

function markCopied() {
  copyState.value = "copied";
  liveMessage.value = "Key copied.";
  clearTimeout(copiedTimer);
  copiedTimer = setTimeout(() => {
    copyState.value = "idle";
    liveMessage.value = "";
  }, 2000);
}

async function copySecret() {
  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(secret.value);
      markCopied();
      return;
    } catch {
      // Fall through to the selection-based copy.
    }
  }
  selectSecret();
  let ok = false;
  try {
    ok = document.execCommand("copy");
  } catch {
    ok = false;
  }
  if (ok) markCopied();
  else copyState.value = "failed";
}

function done() {
  const key = createdKey.value;
  secret.value = "";
  createdKey.value = null;
  copyState.value = "idle";
  clearTimeout(copiedTimer);
  liveMessage.value = "";
  if (key) store.addKey(key);
  name.value = "";
  scope.value = "read";
  hostAck.value = false;
}

function askRevoke(item) {
  rowErrors.value = { ...rowErrors.value, [item.id]: false };
  revoking.value = item;
}

async function revoke() {
  const item = revoking.value;
  revoking.value = null;
  if (!item) return;
  try {
    await store.revokeKey(item.id);
    liveMessage.value = `${item.name} revoked.`;
  } catch (err) {
    if (err?.response?.status !== 401) {
      rowErrors.value = { ...rowErrors.value, [item.id]: true };
      logError("[ApiKeysSection]", "revoke failed", err?.response?.status);
    }
  }
}
</script>
