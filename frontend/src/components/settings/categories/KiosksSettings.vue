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
    <!-- Task 3 inserts the orientation editor here, guarded by v-if="selectedId" -->
  </div>
</template>

<script setup>
import { ref, onMounted } from "vue";
import { useKiosksStore } from "@/stores/kiosks";
import SettingsSection from "@/components/settings/shell/SettingsSection.vue";

const store = useKiosksStore();
const kiosks = ref([]);
const selectedId = ref(null);

const ONLINE_WINDOW_MS = 120000; // 2 minutes

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

function select(id) {
  selectedId.value = id;
}

onMounted(async () => {
  await store.loadKiosks();
  kiosks.value = store.kiosks;
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
</style>
