<template>
  <div class="security-settings">
    <SettingsSection id="security-sealed" title="Sealed mode">
      <SettingRow
        label="Sealed mode"
        description="Locks the kiosk to your Calvin server only — no external embeds, allowed origins, or plugins that reach outside. Calendars, photos, and local-data plugins keep working."
      >
        <ToggleSwitch
          :model-value="sealed"
          aria-label="Sealed mode"
          data-test="sealed-mode-toggle"
          @update:model-value="onSealedToggle"
        />
      </SettingRow>
    </SettingsSection>

    <SettingsSection id="security-origins" title="Allowed origins">
      <div class="security-origins">
        <p v-if="sealed" data-test="allowlist-inactive" class="security-origins__inactive">
          Ignored while sealed mode is on.
        </p>
        <p class="security-origins__intro">
          Origins the kiosk may embed, load images from, or connect to. Everything else is blocked.
          Use a domain (grafana.lab), a wildcard (*.lab.example.com), a host:port, or an http(s)://
          URL. IP ranges (CIDR) are not supported.
        </p>

        <ul class="security-origins__list">
          <li v-for="origin in origins" :key="origin" class="security-origins__row">
            <span class="security-origins__origin">{{ origin }}</span>
            <button
              type="button"
              class="security-btn"
              data-test="origin-remove"
              @click="remove(origin)"
            >
              Remove
            </button>
          </li>
          <li v-if="origins.length === 0" class="security-origins__empty">No allowed origins.</li>
        </ul>

        <div class="security-origins__add">
          <input
            v-model="draft"
            class="security-origins__input"
            data-test="origin-input"
            placeholder="grafana.lab or *.lab.example.com"
            @keyup.enter="add"
          />
          <button type="button" class="security-btn" data-test="origin-add" @click="add">
            Add
          </button>
        </div>
        <p v-if="error" class="security-origins__error" data-test="origin-error">{{ error }}</p>

        <button
          type="button"
          class="security-btn security-btn--primary"
          data-test="origins-save"
          :disabled="saving"
          @click="save"
        >
          {{ saving ? "Saving…" : "Save" }}
        </button>
      </div>
    </SettingsSection>
  </div>
</template>

<script setup>
import { onMounted, ref } from "vue";
import { useSecurityStore } from "@/stores/security";
import { logError } from "@/utils/logger";
import SettingsSection from "@/components/settings/shell/SettingsSection.vue";
import SettingRow from "@/components/settings/shell/SettingRow.vue";
import ToggleSwitch from "@/components/ui/ToggleSwitch.vue";

const store = useSecurityStore();
const origins = ref([]);
const draft = ref("");
const error = ref("");
const saving = ref(false);
const sealed = ref(false);

onMounted(async () => {
  try {
    origins.value = await store.fetchAllowedOrigins();
    sealed.value = await store.fetchSealedMode();
  } catch (err) {
    logError("[SecuritySettings]", "load failed", err);
  }
});

async function onSealedToggle(value) {
  sealed.value = value;
  try {
    await store.saveSealedMode(value);
  } catch (err) {
    error.value = err?.response?.data?.detail || "Failed to save sealed mode.";
    logError("[SecuritySettings]", "sealed save failed", err);
    sealed.value = !value; // revert optimistic toggle on failure
  }
}

// Light client-side check for instant feedback; the server validator is authoritative.
function inputError(value) {
  const v = (value || "").trim();
  if (!v) return "Enter a domain, wildcard, host:port, or http(s):// URL.";
  const hostPart = v.includes("://") ? v.split("://")[1] : v;
  if (hostPart.includes("/")) {
    return "IP ranges (CIDR) and paths aren't supported — use a wildcard domain like *.lab.example.com.";
  }
  if (/[\s?#]/.test(hostPart)) return "Origins can't contain spaces, query, or fragment.";
  return "";
}

function add() {
  const v = draft.value.trim();
  const err = inputError(v);
  if (err) {
    error.value = err;
    return;
  }
  if (!origins.value.includes(v)) origins.value = [...origins.value, v];
  draft.value = "";
  error.value = "";
}

function remove(origin) {
  origins.value = origins.value.filter(o => o !== origin);
}

async function save() {
  saving.value = true;
  error.value = "";
  try {
    await store.saveAllowedOrigins(origins.value);
  } catch (err) {
    error.value = err?.response?.data?.detail || "Failed to save.";
    logError("[SecuritySettings]", "save failed", err);
  } finally {
    saving.value = false;
  }
}
</script>

<style scoped>
.security-settings {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.security-origins {
  padding: 0.75rem 1.25rem 1rem;
}
.security-origins__inactive {
  margin: 0 0 0.5rem;
  font-size: 0.85rem;
  font-weight: 500;
  color: var(--warn);
}
.security-origins__intro {
  margin: 0 0 0.75rem;
  font-size: 0.85rem;
  line-height: 1.4;
  color: var(--ink-2);
}

.security-origins__list {
  list-style: none;
  margin: 0 0 0.75rem;
  padding: 0;
  border: 1px solid var(--line);
  border-radius: var(--radius-md);
  overflow: hidden;
}
.security-origins__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  min-height: var(--touch-target);
  padding: 0.35rem 0.75rem;
}
.security-origins__row + .security-origins__row,
.security-origins__row + .security-origins__empty {
  border-top: 1px solid var(--line-soft);
}
.security-origins__origin {
  font-family: var(--font-data);
  font-size: 0.9rem;
  color: var(--ink);
  overflow-wrap: anywhere;
}
.security-origins__empty {
  padding: 0.65rem 0.75rem;
  font-size: 0.85rem;
  color: var(--ink-2);
}

.security-origins__add {
  display: flex;
  gap: 0.5rem;
  margin-bottom: 0.75rem;
}
.security-origins__input {
  flex: 1;
  min-width: 0;
  min-height: var(--touch-target);
  padding: 0.5rem 0.75rem;
  background: var(--bg-2);
  color: var(--ink);
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  font-family: var(--font-ui);
  font-size: var(--fs-control);
  transition:
    border-color 0.2s,
    box-shadow 0.2s;
}
.security-origins__input:hover {
  border-color: var(--focus-edge);
}
.security-origins__input:focus {
  outline: none;
  border-color: var(--focus);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--focus) 20%, transparent);
}

.security-btn {
  min-height: var(--touch-target);
  padding: 0 1rem;
  font-family: var(--font-ui);
  font-size: var(--fs-control);
  font-weight: 500;
  color: var(--ink);
  background: var(--bg-2);
  border: 1px solid var(--line);
  border-radius: var(--radius-md);
  cursor: pointer;
  transition:
    border-color 0.2s,
    background 0.2s,
    filter 0.2s;
}
.security-btn:hover:not(:disabled) {
  border-color: var(--focus);
}
.security-btn:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: 2px;
}
.security-btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}
.security-btn--primary {
  background: var(--focus);
  color: var(--focus-ink);
  border-color: var(--focus);
  font-weight: 600;
}
.security-btn--primary:hover:not(:disabled) {
  filter: brightness(1.08);
}

.security-origins__error {
  margin: 0 0 0.75rem;
  font-size: 0.85rem;
  color: var(--err);
}
</style>
