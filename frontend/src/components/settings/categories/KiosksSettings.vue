<template>
  <div class="kiosks">
    <SettingsSection id="kiosks-list" title="Kiosks">
      <p v-if="kiosks.length === 0" class="kiosks__empty">
        No kiosks have connected yet. A kiosk registers itself the first time it loads the
        dashboard.
      </p>
      <button
        v-for="k in kiosks"
        :key="k.id"
        type="button"
        class="kiosk-card"
        :class="{ 'is-selected': k.id === selectedId }"
        data-test="kiosk-card"
        @click="select(k.id)"
      >
        <span class="kiosk-card__id">{{ k.id }}</span>
        <span class="kiosk-card__status" :class="isOnline(k) ? 'is-online' : 'is-offline'">
          {{ isOnline(k) ? "● Online" : "○ Offline" }}
        </span>
        <span class="kiosk-card__meta">{{ k.hostname }} · seen {{ relativeTime(k.lastSeen) }}</span>
      </button>
    </SettingsSection>
    <SettingsSection
      v-if="selectedId"
      id="kiosks-orientation"
      :title="`${selectedId} — Orientation`"
    >
      <SettingRow
        label="Orientation"
        :description="orientationOverridden ? '‹set for this kiosk›' : '‹inherited from global›'"
      >
        <SegmentedControl
          :model-value="effOrientation"
          aria-label="Orientation"
          :options="[
            { value: 'landscape', label: 'Landscape' },
            { value: 'portrait', label: 'Portrait' },
          ]"
          @update:model-value="setOrientation"
        />
      </SettingRow>
      <SettingRow
        label="Flip 180°"
        :description="flipOverridden ? '‹set for this kiosk›' : '‹inherited from global›'"
      >
        <ToggleSwitch
          :model-value="effFlipped"
          aria-label="Flip 180 degrees"
          @update:model-value="setFlipped"
        />
      </SettingRow>
      <SettingRow
        label="Apply rotation"
        :description="applyOverridden ? '‹set for this kiosk›' : '‹inherited from global›'"
      >
        <ToggleSwitch
          :model-value="effApply"
          aria-label="Apply rotation"
          @update:model-value="setApply"
        />
      </SettingRow>
      <button
        type="button"
        class="kiosks__reset"
        data-test="reset-orientation"
        :disabled="!orientationOverridden && !flipOverridden && !applyOverridden"
        @click="resetOrientation"
      >
        Reset to global
      </button>
      <p v-if="savedMsg" class="kiosks__saved" role="status" aria-live="polite">{{ savedMsg }}</p>
    </SettingsSection>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from "vue";
import { useKiosksStore } from "@/stores/kiosks";
import { useConfigStore } from "@/stores/config";
import SettingsSection from "@/components/settings/shell/SettingsSection.vue";
import SettingRow from "@/components/settings/shell/SettingRow.vue";
import SegmentedControl from "@/components/ui/SegmentedControl.vue";
import ToggleSwitch from "@/components/ui/ToggleSwitch.vue";

const store = useKiosksStore();
const config = useConfigStore();
const kiosks = computed(() => store.kiosks);
const selectedId = ref(null);
const overrides = ref({});
const savedMsg = ref("");

const ONLINE_WINDOW_MS = 120000; // 2 minutes

const ORI_KEYS = ["orientation", "orientationFlipped", "applyDisplayRotation"];

const orientationOverridden = computed(() => "orientation" in overrides.value);
const flipOverridden = computed(() => "orientationFlipped" in overrides.value);
const applyOverridden = computed(() => "applyDisplayRotation" in overrides.value);

const effOrientation = computed(() =>
  orientationOverridden.value ? overrides.value.orientation : config.orientation
);
const effFlipped = computed(() =>
  flipOverridden.value ? overrides.value.orientationFlipped : config.orientationFlipped
);
const effApply = computed(() =>
  applyOverridden.value
    ? overrides.value.applyDisplayRotation
    : (config.applyDisplayRotation ?? true)
);

function isOnline(k) {
  if (!k.lastSeen) return false;
  return Date.now() - Date.parse(k.lastSeen) < ONLINE_WINDOW_MS;
}

function relativeTime(iso) {
  if (!iso) return "never";
  const secs = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 1000));
  if (secs < 60) return `${secs}s ago`;
  if (secs < 3600) return `${Math.round(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.round(secs / 3600)}h ago`;
  return `${Math.round(secs / 86400)}d ago`;
}

function selectedKiosk() {
  return kiosks.value.find(k => k.id === selectedId.value);
}

async function persist(next) {
  overrides.value = next;
  try {
    await store.saveOverrides(selectedId.value, next);
    const online = selectedKiosk() ? isOnline(selectedKiosk()) : false;
    savedMsg.value = online
      ? "Saved. This kiosk applies orientation at its next check-in (~30s)."
      : "Saved. Changes apply when this kiosk reconnects.";
  } catch {
    savedMsg.value = "Couldn't save to the server. Check the connection and try again.";
  }
}

function setOrientation(value) {
  persist({ ...overrides.value, orientation: value });
}
function setFlipped(value) {
  persist({ ...overrides.value, orientationFlipped: value });
}
function setApply(value) {
  persist({ ...overrides.value, applyDisplayRotation: value });
}

function resetOrientation() {
  const next = { ...overrides.value };
  for (const k of ORI_KEYS) delete next[k];
  persist(next);
}

async function select(id) {
  selectedId.value = id;
  savedMsg.value = "";
  overrides.value = await store.fetchOverrides(id);
}

onMounted(async () => {
  await store.loadKiosks();
});
</script>

<style scoped>
.kiosks__empty {
  opacity: 0.7;
}
.kiosk-card {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 4px 12px;
  width: 100%;
  text-align: left;
  padding: 10px 12px;
  margin-bottom: 8px;
  border: 1px solid var(--border-color, rgba(255, 255, 255, 0.12));
  border-radius: 10px;
  background: transparent;
  color: inherit;
  cursor: pointer;
}
.kiosk-card.is-selected {
  border-color: var(--accent-color, #6ea8fe);
}
.kiosk-card__id {
  font-weight: 600;
}
.kiosk-card__status {
  justify-self: end;
  font-size: 0.85em;
}
.kiosk-card__status.is-online {
  color: #4ade80;
}
.kiosk-card__status.is-offline {
  color: rgba(255, 255, 255, 0.45);
}
.kiosk-card__meta {
  grid-column: 1 / -1;
  font-size: 0.85em;
  opacity: 0.7;
}
.kiosks__reset {
  margin-top: 8px;
  padding: 6px 14px;
  border: 1px solid var(--border-color, rgba(255, 255, 255, 0.12));
  border-radius: 6px;
  background: transparent;
  color: inherit;
  cursor: pointer;
  font-size: 0.9em;
}
.kiosks__reset:disabled {
  opacity: 0.4;
  cursor: default;
}
.kiosks__saved {
  margin-top: 8px;
  font-size: 0.85em;
  opacity: 0.7;
}
</style>
