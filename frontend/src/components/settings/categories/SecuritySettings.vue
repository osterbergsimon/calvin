<template>
  <section id="section-security-origins" class="security-settings">
    <div class="security-settings__sealed">
      <label class="security-settings__sealed-label">
        <input
          type="checkbox"
          data-test="sealed-mode-toggle"
          :checked="sealed"
          @change="onSealedToggle($event.target.checked)"
        />
        <span>Sealed mode</span>
      </label>
      <p class="security-settings__intro">
        Locks the kiosk to your Calvin server only — no external embeds, allowed origins, or plugins
        that reach outside. Calendars, photos, and local-data plugins keep working.
      </p>
    </div>

    <h2>Allowed origins</h2>
    <p v-if="sealed" data-test="allowlist-inactive" class="security-settings__inactive">
      Ignored while sealed mode is on.
    </p>
    <p class="security-settings__intro">
      Origins the kiosk may embed, load images from, or connect to. Everything else is blocked. Use
      a domain (grafana.lab), a wildcard (*.lab.example.com), a host:port, or an http(s):// URL. IP
      ranges (CIDR) are not supported.
    </p>

    <ul class="security-settings__list">
      <li v-for="origin in origins" :key="origin" class="security-settings__row">
        <span class="security-settings__origin">{{ origin }}</span>
        <button type="button" data-test="origin-remove" @click="remove(origin)">Remove</button>
      </li>
      <li v-if="origins.length === 0" class="security-settings__empty">No allowed origins.</li>
    </ul>

    <div class="security-settings__add">
      <input
        v-model="draft"
        data-test="origin-input"
        placeholder="grafana.lab or *.lab.example.com"
        @keyup.enter="add"
      />
      <button type="button" data-test="origin-add" @click="add">Add</button>
    </div>
    <p v-if="error" class="security-settings__error" data-test="origin-error">{{ error }}</p>

    <button type="button" data-test="origins-save" :disabled="saving" @click="save">
      {{ saving ? "Saving…" : "Save" }}
    </button>
  </section>
</template>

<script setup>
import { onMounted, ref } from "vue";
import { useSecurityStore } from "@/stores/security";
import { logError } from "@/utils/logger";

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
