<template>
  <div class="clock-bar-items-tab">
    <p class="section-description">
      Choose which plugin tiles appear in the clock bar. Each tile keeps its own preview and live
      data — toggling here just controls whether it's shown.
    </p>

    <div v-if="loading" class="state-message">Loading installed plugins&hellip;</div>

    <div v-else-if="barCapableServices.length === 0" class="state-message empty-state">
      <p>No installed plugins expose a clock bar tile.</p>
      <p>
        Install a plugin that ships a status bar item to add tiles here. Manage installs in the
        <strong>Plugins</strong> category.
      </p>
    </div>

    <template v-else>
      <p class="items-summary">
        <strong>{{ visibleCount }}</strong> of {{ barCapableServices.length }} tile{{
          barCapableServices.length === 1 ? "" : "s"
        }}
        shown
      </p>

      <ul class="items-list">
        <li
          v-for="service in barCapableServices"
          :key="service.id"
          class="item-row"
          :class="{ 'item-row-hidden': !isVisible(service) }"
        >
          <div class="preview" :title="`Live preview of ${service.name}`">
            <SchemaStatusbarItem :service-id="service.id" :schema="service.statusbar_schema" />
          </div>
          <div class="meta">
            <div class="title">{{ service.name }}</div>
            <div class="subtitle">{{ service.plugin_name || service.plugin_id }}</div>
          </div>
          <label
            class="switch"
            :class="{ 'switch-on': isVisible(service), saving: pendingId === service.id }"
            :title="isVisible(service) ? 'Click to hide' : 'Click to show'"
          >
            <input
              type="checkbox"
              :checked="isVisible(service)"
              :disabled="pendingId === service.id"
              @change="toggle(service, $event.target.checked)"
            />
            <span class="switch-track" aria-hidden="true">
              <span class="switch-thumb" />
            </span>
            <span class="switch-label">{{ isVisible(service) ? "Shown" : "Hidden" }}</span>
          </label>
        </li>
      </ul>
    </template>

    <div v-if="errorMessage" class="error-message" role="alert">{{ errorMessage }}</div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from "vue";
import { useWebServicesStore } from "@/stores/webServices";
import * as pluginsApi from "@/services/pluginsApi";
import { logError } from "@/utils/logger";
import SchemaStatusbarItem from "@/components/plugins/SchemaStatusbarItem.vue";

const webServicesStore = useWebServicesStore();

const loading = ref(false);
const pendingId = ref(null);
const errorMessage = ref("");

const barCapableServices = computed(() =>
  webServicesStore.services.filter(s => s.statusbar_schema?.kind)
);

const visibleCount = computed(() => barCapableServices.value.filter(isVisible).length);

function asBoolean(value) {
  if (typeof value === "string") {
    return ["true", "1", "yes", "on"].includes(value.trim().toLowerCase());
  }
  return value === true || value === 1;
}

function isVisible(service) {
  const cfg = service.config || {};
  if ("show_in_statusbar" in cfg) return asBoolean(cfg.show_in_statusbar);
  return true;
}

async function toggle(service, nextValue) {
  pendingId.value = service.id;
  errorMessage.value = "";
  try {
    await pluginsApi.updatePluginInstance(service.id, {
      name: service.name,
      enabled: service.enabled !== false,
      plugin_id: service.plugin_id,
      config: {
        ...(service.config || {}),
        show_in_statusbar: nextValue,
      },
    });
    await webServicesStore.fetchServices();
  } catch (err) {
    errorMessage.value = `Failed to update ${service.name}: ${err.message}`;
    logError("[ClockBarItemsTab]", "Failed to toggle show_in_statusbar:", err);
  } finally {
    pendingId.value = null;
  }
}

onMounted(async () => {
  if (webServicesStore.services.length === 0) {
    loading.value = true;
    try {
      await webServicesStore.fetchServices();
    } finally {
      loading.value = false;
    }
  }
});
</script>

<style scoped>
.clock-bar-items-tab {
  width: 100%;
  padding: 1.25rem;
}

.section-description {
  margin: 0 0 1rem;
  color: var(--ink-2);
  font-size: 0.9rem;
  line-height: 1.5;
}

.section-description code {
  padding: 0.05rem 0.35rem;
  background: var(--bg-2);
  border: 1px solid var(--line);
  border-radius: 4px;
  font-size: 0.85em;
}

.state-message {
  padding: 1rem;
  color: var(--ink-3);
  font-size: 0.9rem;
}

.empty-state p {
  margin: 0 0 0.5rem;
}

.items-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.item-row {
  display: grid;
  grid-template-columns: minmax(80px, auto) 1fr auto;
  gap: 1rem;
  align-items: center;
  padding: 0.75rem 1rem;
  min-height: var(--touch-target);
  background: var(--bg-2);
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
}

.preview {
  display: flex;
  align-items: center;
  min-height: 32px;
}

.meta .title {
  font-family: var(--font-ui);
  font-weight: 600;
  color: var(--ink);
}

.meta .subtitle {
  margin-top: 0.15rem;
  font-size: 0.8rem;
  font-family: var(--font-ui);
  color: var(--ink-2);
}

.items-summary {
  margin: 0 0 0.6rem;
  font-size: 0.85rem;
  color: var(--ink-2);
}

.items-summary strong {
  color: var(--ink);
}

.item-row-hidden {
  opacity: 0.55;
}

.switch {
  display: inline-flex;
  align-items: center;
  gap: 0.55rem;
  cursor: pointer;
  font-size: 0.85rem;
  font-family: var(--font-ui);
  color: var(--ink);
  user-select: none;
  min-height: var(--touch-target);
}

.switch input {
  position: absolute;
  opacity: 0;
  pointer-events: none;
  width: 0;
  height: 0;
}

.switch-track {
  position: relative;
  width: 2.2rem;
  height: 1.2rem;
  border-radius: 999px;
  background: var(--line);
  transition: background 0.15s ease;
  flex-shrink: 0;
}

.switch-thumb {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 1rem;
  height: 1rem;
  border-radius: 50%;
  background: var(--bg-1);
  box-shadow: 0 1px 2px var(--shadow);
  transition: transform 0.15s ease;
}

.switch-on .switch-track {
  background: var(--focus);
}

.switch-on .switch-thumb {
  transform: translateX(1rem);
}

.switch-label {
  min-width: 3.2rem;
}

.switch.saving {
  opacity: 0.6;
  cursor: progress;
}

.switch input:focus-visible + .switch-track {
  outline: 2px solid var(--focus);
  outline-offset: 2px;
}

.error-message {
  margin-top: 0.75rem;
  padding: 0.6rem 0.85rem;
  background: color-mix(in srgb, var(--err) 12%, transparent);
  border: 1px solid color-mix(in srgb, var(--err) 40%, transparent);
  border-radius: 6px;
  color: var(--ink);
  font-size: 0.88rem;
}
</style>
