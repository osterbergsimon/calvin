<template>
  <SettingsSection v-if="kiosks.length > 0" id="maintenance-kiosk-agents" title="Kiosk agents">
    <p class="agents__hint">
      Remote kiosk Pis run a small display agent. Updates are fetched from this server — the kiosk
      needs no internet access.
    </p>
    <div v-for="k in kiosks" :key="k.id" class="agent-row" data-test="agent-row">
      <span
        class="agent-row__dot"
        :class="isOnline(k) ? 'is-online' : 'is-offline'"
        aria-hidden="true"
      />
      <span class="agent-row__id">{{ k.id }}</span>
      <span class="agent-row__version">
        <template v-if="k.agentVersion">agent {{ k.agentVersion }}</template>
        <template v-else>agent version unknown</template>
        <template v-if="updateAvailable(k)"> → {{ availableVersion }}</template>
        <template v-else-if="isCurrent(k)"> · up to date</template>
      </span>
      <span class="agent-row__end">
        <span v-if="hasAgentError(k)" class="agent-row__error">needs OS update</span>
        <button
          v-if="updateAvailable(k) || k.agentUpdateRequested"
          type="button"
          class="agent-row__update"
          data-test="agent-update-btn"
          :disabled="k.agentUpdateRequested"
          @click="onUpdate(k.id)"
        >
          {{ k.agentUpdateRequested ? "Updating…" : "Update" }}
        </button>
      </span>
    </div>
  </SettingsSection>
</template>

<script setup>
import { computed, onMounted, ref } from "vue";
import { useKiosksStore } from "@/stores/kiosks";
import SettingsSection from "@/components/settings/shell/SettingsSection.vue";

const store = useKiosksStore();
const kiosks = computed(() => store.kiosks);
const availableVersion = ref(null);

const ONLINE_WINDOW_MS = 120000; // 2 minutes, matches KiosksSettings

function isOnline(k) {
  if (!k.lastSeen) return false;
  return Date.now() - Date.parse(k.lastSeen) < ONLINE_WINDOW_MS;
}

function updateAvailable(k) {
  return (
    availableVersion.value != null &&
    k.agentVersion != null &&
    k.agentVersion !== availableVersion.value
  );
}

function isCurrent(k) {
  return availableVersion.value != null && k.agentVersion === availableVersion.value;
}

function hasAgentError(k) {
  return typeof k.agentUpdateStatus === "string" && k.agentUpdateStatus.startsWith("error");
}

async function onUpdate(id) {
  await store.triggerUpdate(id);
}

onMounted(async () => {
  await store.loadKiosks();
  availableVersion.value = await store.fetchAvailableAgentVersion();
});
</script>

<style scoped>
.agents__hint {
  margin: 0 0 0.5rem;
  font-family: var(--font-ui);
  font-size: var(--fs-xs);
  color: var(--ink-3);
  line-height: 1.5;
}
.agent-row {
  display: grid;
  grid-template-columns: auto auto 1fr auto;
  align-items: center;
  gap: 0.65rem;
  padding: 0.5rem 0;
}
.agent-row + .agent-row {
  border-top: 1px solid var(--line-soft);
}
.agent-row__dot {
  width: 0.55rem;
  height: 0.55rem;
  border-radius: 50%;
  background: var(--ink-3);
}
.agent-row__dot.is-online {
  background: var(--ok);
}
.agent-row__id {
  font-family: var(--font-ui);
  font-size: var(--fs-sm);
  font-weight: 600;
  color: var(--ink);
}
.agent-row__version {
  font-family: var(--font-data);
  font-size: var(--fs-xs);
  color: var(--ink-2);
}
.agent-row__end {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
}
.agent-row__error {
  font-family: var(--font-ui);
  font-size: var(--fs-xs);
  color: var(--warn);
}
.agent-row__update {
  min-height: var(--touch-target);
  padding: 0 1rem;
  font-family: var(--font-ui);
  font-size: var(--fs-control);
  font-weight: 500;
  color: var(--focus);
  background: transparent;
  border: 1px solid var(--focus);
  border-radius: var(--radius-md);
  cursor: pointer;
}
.agent-row__update:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}
.agent-row__update:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: 2px;
}
</style>
