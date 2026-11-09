<template>
  <div class="security-settings">
    <AdminAccessSection />

    <ApiKeysSection />

    <SettingsSection id="security-sealed" title="Sealed mode">
      <SettingRow
        label="Sealed mode"
        description="Only this Calvin server is reachable: no outside embeds, sites or plugins that go online. Calendars, photos and local plugins keep working."
      >
        <ToggleSwitch
          :model-value="sealed"
          aria-label="Sealed mode"
          data-test="sealed-mode-toggle"
          @update:model-value="onSealedToggle"
        />
      </SettingRow>
    </SettingsSection>

    <SettingsSection id="security-origins" title="Allowed sites">
      <SettingRow label="Sites" stacked>
        <template #description>
          <InlineNote>
            Sites this dashboard may show or load from. Everything else is blocked. Use a domain
            like grafana.lab or *.lab.example.com, or a full address.
          </InlineNote>
          <InlineNote v-if="sealed" tone="warn" data-test="allowlist-inactive">
            Ignored while sealed mode is on.
          </InlineNote>
          <InlineNote v-if="!origins.length">No sites allowed.</InlineNote>
          <InlineNote v-if="error" tone="err" data-test="origin-error">{{ error }}</InlineNote>
          <InlineNote v-if="savedNote" role="status" data-test="origins-saved">
            {{ savedNote }}
          </InlineNote>
        </template>
        <TextField
          v-model="draft"
          label="Add a site"
          input-id="origin-input"
          placeholder="grafana.lab or *.lab.example.com"
          @keyup.enter="add"
        />
        <Button data-test="origin-add" :disabled="saving" @click="add">Add</Button>
      </SettingRow>

      <SettingRow v-for="origin in origins" :key="origin" :label="origin">
        <Button size="sm" data-test="origin-remove" :disabled="saving" @click="remove(origin)">
          Remove
        </Button>
      </SettingRow>
    </SettingsSection>
  </div>
</template>

<script setup>
import { onMounted, ref } from "vue";
import { useSecurityStore } from "@/stores/security";
import { logError } from "@/utils/logger";
import { friendlyError } from "@/utils/friendlyError";
import SettingsSection from "@/components/settings/shell/SettingsSection.vue";
import SettingRow from "@/components/settings/shell/SettingRow.vue";
import Button from "@/components/ui/Button.vue";
import InlineNote from "@/components/ui/InlineNote.vue";
import TextField from "@/components/ui/TextField.vue";
import ToggleSwitch from "@/components/ui/ToggleSwitch.vue";
import AdminAccessSection from "@/components/settings/categories/security/AdminAccessSection.vue";
import ApiKeysSection from "@/components/settings/categories/security/ApiKeysSection.vue";

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
    error.value = friendlyError(err, "change sealed mode");
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
  if (/[\s?#]/.test(hostPart)) return "Sites can't contain spaces, query, or fragment.";
  return "";
}

// Add and Remove persist at once (like the rest of Settings), so a listed site
// is always an applied one. A failed save rolls the list back.
const savedNote = ref("");

async function persist(next) {
  const previous = origins.value;
  origins.value = next;
  saving.value = true;
  error.value = "";
  savedNote.value = "";
  try {
    await store.saveAllowedOrigins(next);
    savedNote.value = sealed.value
      ? "Saved."
      : "Saved. Screens already open need a reload to apply this.";
    return true;
  } catch (err) {
    origins.value = previous;
    error.value = friendlyError(err, "save the allowed sites");
    logError("[SecuritySettings]", "save failed", err);
    return false;
  } finally {
    saving.value = false;
  }
}

async function add() {
  if (saving.value) return;
  const v = draft.value.trim();
  const err = inputError(v);
  if (err) {
    error.value = err;
    return;
  }
  if (origins.value.includes(v)) {
    draft.value = "";
    error.value = "";
    return;
  }
  draft.value = "";
  const ok = await persist([...origins.value, v]);
  if (!ok) draft.value = v; // keep what was typed
}

function remove(origin) {
  if (saving.value) return;
  return persist(origins.value.filter(o => o !== origin));
}
</script>
