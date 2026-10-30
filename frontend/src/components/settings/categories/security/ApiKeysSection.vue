<template>
  <SettingsSection id="security-api-keys" title="API keys">
    <div class="api-keys">
      <p class="api-keys__intro">
        Let apps and scripts, like Home Assistant, use Calvin without the admin password. Give each
        one its own key.
      </p>

      <p class="api-keys__live" aria-live="polite" data-test="api-key-live">{{ liveMessage }}</p>

      <!-- Show once -->
      <div v-if="secret" class="api-keys__result" data-test="api-key-result">
        <h4
          ref="resultTitle"
          class="api-keys__result-title"
          tabindex="-1"
          data-test="api-key-result-title"
        >
          Copy your key now
        </h4>
        <p class="api-keys__muted">
          You won't be able to see it again. If you lose it, revoke it and create a new one.
        </p>
        <div class="api-keys__secret-row">
          <input
            ref="secretInput"
            class="api-keys__secret"
            type="text"
            readonly
            spellcheck="false"
            autocomplete="off"
            :value="secret"
            :aria-label="`New API key for ${createdKey.name}`"
            data-test="api-key-secret"
            @focus="selectSecret"
            @click="selectSecret"
          />
          <button type="button" class="security-btn" data-test="api-key-copy" @click="copySecret">
            {{ copyLabel }}
          </button>
        </div>
        <p v-if="copyState === 'failed'" class="api-keys__muted api-keys__hint">
          Press Ctrl+C (or long-press → Copy) to copy the selected key.
        </p>
        <p class="api-keys__muted api-keys__small">
          Send it as <code>Authorization: Bearer &lt;key&gt;</code>
        </p>
        <button type="button" class="security-btn" data-test="api-key-done" @click="done">
          Done
        </button>
      </div>

      <!-- Create form -->
      <form
        v-else-if="formOpen"
        class="api-keys__form"
        novalidate
        data-test="api-key-form"
        @submit.prevent="submit"
      >
        <div class="api-keys__field">
          <label class="api-keys__label" for="api-key-name">Name</label>
          <input
            id="api-key-name"
            v-model="name"
            class="api-keys__input"
            type="text"
            maxlength="40"
            placeholder="Home Assistant"
            autocomplete="off"
            :aria-invalid="nameError ? 'true' : 'false'"
            aria-describedby="api-key-name-hint"
            data-test="api-key-name"
          />
          <p id="api-key-name-hint" class="api-keys__muted api-keys__small">
            So you know which app uses it.
          </p>
          <p v-if="nameError" class="api-keys__error" role="alert">{{ nameError }}</p>
        </div>

        <fieldset class="api-keys__scopes">
          <legend class="api-keys__label">What it can do</legend>
          <div class="api-keys__cards">
            <label
              v-for="option in scopeOptions"
              :key="option.value"
              class="api-keys__card"
              :class="{
                'api-keys__card--host': option.value === 'host',
                'api-keys__card--selected': scope === option.value,
                'api-keys__card--disabled': isDisabled(option),
              }"
              :aria-disabled="isDisabled(option) ? 'true' : undefined"
              :data-test="`scope-card-${option.value}`"
            >
              <input
                v-model="scope"
                type="radio"
                name="api-key-scope"
                class="api-keys__radio"
                :value="option.value"
                :disabled="isDisabled(option)"
                :aria-describedby="`api-key-scope-${option.value}-desc`"
                :data-test="`scope-${option.value}`"
              />
              <span class="api-keys__card-label">
                <template v-if="option.value === 'host'">⚠ </template>{{ option.label }}
              </span>
              <span :id="`api-key-scope-${option.value}-desc`" class="api-keys__card-desc">
                {{ isDisabled(option) ? HOST_UNAVAILABLE : option.description }}
              </span>
              <span
                v-if="option.value === 'host' && !isDisabled(option)"
                class="api-keys__card-warn"
              >
                Anyone with this key can reboot the machine Calvin runs on.
              </span>
            </label>
          </div>
        </fieldset>

        <label v-if="scope === 'host'" class="api-keys__ack">
          <input v-model="hostAck" type="checkbox" data-test="api-key-host-ack" />
          I understand this key can reboot this machine.
        </label>

        <p v-if="showTouchHint" class="api-keys__muted api-keys__small">
          Easier on the computer where you'll paste it: the key is only shown once.
        </p>

        <div class="api-keys__actions">
          <button
            type="submit"
            class="security-btn security-btn--primary"
            data-test="api-key-submit"
            :disabled="creating || (scope === 'host' && !hostAck)"
          >
            {{ creating ? "Creating…" : "Create key" }}
          </button>
          <button
            type="button"
            class="security-btn"
            data-test="api-key-cancel"
            :disabled="creating"
            @click="closeForm"
          >
            Cancel
          </button>
        </div>
        <p v-if="createError" class="api-keys__error" role="alert">{{ createError }}</p>
      </form>

      <!-- Loading / error / empty / list -->
      <template v-if="store.loading && !store.keys.length">
        <div
          v-for="n in 3"
          :key="n"
          class="api-keys__skeleton"
          data-test="api-keys-skeleton"
          aria-hidden="true"
        ></div>
      </template>

      <div v-else-if="store.loadFailed && !store.keys.length" class="api-keys__empty">
        <p>Couldn't load API keys.</p>
        <button type="button" class="security-btn" data-test="api-keys-retry" @click="load">
          Try again
        </button>
      </div>

      <div
        v-else-if="!store.keys.length && !formOpen && !secret"
        class="api-keys__empty"
        data-test="api-keys-empty"
      >
        <p class="api-keys__empty-title">No API keys yet.</p>
        <p class="api-keys__muted">
          Create one to let Home Assistant or a script read or change Calvin.
        </p>
        <button
          type="button"
          class="security-btn security-btn--primary"
          data-test="api-keys-create"
          @click="openForm"
        >
          Create key
        </button>
      </div>

      <template v-if="store.keys.length">
        <SettingRow
          v-for="item in store.keys"
          :key="item.id"
          :stacked="isPhone"
          :label="item.name"
          data-test="api-key-row"
        >
          <template #label-extra>
            <Tag
              class="api-keys__chip"
              :tone="item.scope === 'host' ? 'err' : 'neutral'"
              :icon="item.scope === 'host' ? mdiAlert : null"
              data-test="api-key-scope"
            >
              {{ scopeChip(item.scope) }}
            </Tag>
          </template>
          <template #description>
            <p class="setting-row__desc">
              <span class="api-keys__prefix">{{ item.prefix }}…</span>
              · Created {{ formatKeyDate(item.createdAt, now()) }} ·
              {{
                item.lastUsedAt
                  ? `Last used ${formatLastUsed(item.lastUsedAt, now())}`
                  : "Never used"
              }}
            </p>
            <p
              v-if="item.scope === 'host' && environment?.host_control === false"
              class="api-keys__muted api-keys__small"
            >
              Host actions are blocked: this Calvin doesn't control its machine.
            </p>
            <p v-if="rowErrors[item.id]" class="api-keys__row-error" data-test="api-key-row-error">
              Couldn't revoke this key. Try again.
            </p>
          </template>
          <button
            type="button"
            class="security-btn api-keys__revoke"
            data-test="api-key-revoke"
            @click="askRevoke(item)"
          >
            Revoke
          </button>
        </SettingRow>
        <div v-if="!formOpen && !secret" class="api-keys__more">
          <button type="button" class="security-btn" data-test="api-keys-create" @click="openForm">
            Create key
          </button>
        </div>
      </template>
    </div>

    <ConfirmModal
      :show="Boolean(revoking)"
      :title="`Revoke &quot;${revoking?.name}&quot;?`"
      message="Apps using this key stop working right away. This can't be undone."
      confirm-text="Revoke key"
      @confirm="revoke"
      @cancel="revoking = null"
    />
  </SettingsSection>
</template>

<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import { mdiAlert } from "@mdi/js";
import Tag from "@/components/ui/Tag.vue";
import { useApiKeysStore } from "@/stores/apiKeys";
import { useSystem } from "@/composables/useSystem";
import { useTouchCapability } from "@/composables/useTouchCapability";
import { formatKeyDate, formatLastUsed } from "@/utils/apiKeyFormat";
import { logError } from "@/utils/logger";
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
const isPhone = computed(() => width.value < 480);
const showTouchHint = computed(() => isTouch.value && width.value >= 720);
const hostUnavailable = computed(() => environment.value?.host_control === false);
const copyLabel = computed(() =>
  copyState.value === "copied"
    ? "✓ Copied"
    : copyState.value === "failed"
      ? "Select and copy"
      : "Copy"
);

const now = () => new Date();
const scopeChip = value =>
  value === "host" ? "Host control" : (scopeOptions.find(o => o.value === value)?.label ?? value);
const isDisabled = option => option.value === "host" && hostUnavailable.value;

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

<style scoped>
.api-keys {
  padding: 0.75rem 0 0.25rem;
}
.api-keys__intro {
  margin: 0 1.25rem 0.75rem;
  font-size: var(--fs-sm);
  color: var(--ink-2);
}
.api-keys__live {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
}
.api-keys__muted {
  margin: 0.25rem 0 0;
  font-size: var(--fs-sm);
  color: var(--ink-2);
}
.api-keys__small {
  font-size: var(--fs-xs);
}
.api-keys__hint {
  margin-bottom: 0.5rem;
}
.api-keys__error,
.api-keys__row-error {
  margin: 0.4rem 0 0;
  font-size: var(--fs-xs);
  color: var(--err);
}
.api-keys__empty {
  padding: 0.75rem 1.25rem 1.25rem;
  border-top: 1px solid var(--line-soft);
}
.api-keys__empty-title {
  margin: 0;
  font-weight: 600;
  color: var(--ink);
}
.api-keys__empty .security-btn {
  margin-top: 0.75rem;
}
.api-keys__skeleton {
  height: 3.5rem;
  margin: 0.5rem 1.25rem;
  border-radius: var(--radius-md);
  background: var(--bg-2);
}
.api-keys__more {
  padding: 0.75rem 1.25rem 1rem;
  border-top: 1px solid var(--line-soft);
}

.api-keys__form,
.api-keys__result {
  margin: 0 1.25rem 1rem;
}
.api-keys__form {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}
.api-keys__label {
  display: block;
  margin-bottom: 0.35rem;
  font-size: var(--fs-md);
  font-weight: 500;
  color: var(--ink);
}
.api-keys__input,
.api-keys__secret {
  box-sizing: border-box;
  width: 100%;
  min-height: var(--touch-target);
  padding: 0.5rem 0.75rem;
  background: var(--bg-2);
  color: var(--ink);
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  font-family: var(--font-ui);
  font-size: var(--fs-control);
}
.api-keys__input:focus,
.api-keys__secret:focus {
  outline: none;
  border-color: var(--focus);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--focus) 20%, transparent);
}
.api-keys__scopes {
  margin: 0;
  padding: 0;
  border: 0;
  min-width: 0;
}
.api-keys__cards {
  display: grid;
  grid-template-columns: 1fr;
  gap: 0.6rem;
}
@media (min-width: 600px) {
  .api-keys__cards {
    grid-template-columns: repeat(3, 1fr);
  }
}
.api-keys__card {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  min-height: 44px;
  padding: 0.75rem 0.85rem 0.75rem 2.2rem;
  border: 1px solid var(--line);
  border-radius: var(--radius-md);
  cursor: pointer;
}
.api-keys__card--selected {
  border-color: var(--focus);
}
.api-keys__card--host.api-keys__card--selected {
  border-color: var(--err);
  background: color-mix(in srgb, var(--err) 6%, transparent);
}
.api-keys__card--disabled {
  opacity: 0.55;
  cursor: not-allowed;
}
.api-keys__radio {
  position: absolute;
  top: 0.9rem;
  left: 0.8rem;
  margin: 0;
}
.api-keys__card-label {
  font-weight: 600;
  color: var(--ink);
}
.api-keys__card--host .api-keys__card-label {
  color: var(--err);
}
.api-keys__card-desc {
  font-size: var(--fs-sm);
  color: var(--ink-2);
}
.api-keys__card-warn {
  font-size: var(--fs-xs);
  font-weight: 500;
  color: var(--err);
}
.api-keys__ack {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  min-height: 44px;
  font-size: var(--fs-md);
  color: var(--ink);
}
.api-keys__actions {
  display: flex;
  gap: 10px;
}

.api-keys__result {
  padding: 1.25rem;
  border: 1px solid var(--focus);
  border-radius: var(--radius-xl);
}
.api-keys__result-title {
  margin: 0;
  font-size: var(--fs-md);
  font-weight: 600;
  color: var(--ink);
}
.api-keys__result-title:focus {
  outline: none;
}
.api-keys__secret-row {
  display: flex;
  gap: 0.5rem;
  margin: 0.75rem 0;
}
.api-keys__secret {
  flex: 1;
  min-width: 0;
  font-family: var(--font-data);
  font-size: var(--fs-md);
}
.api-keys__result .security-btn:last-child {
  margin-top: 0.75rem;
}

.api-keys__chip {
  margin-left: var(--space-sm);
}
.api-keys__prefix {
  font-family: var(--font-data);
}
.api-keys__revoke {
  color: var(--err);
}
</style>
