<template>
  <div class="clock-bar-items-tab">
    <CollapsibleSection title="Bar Items" icon="🧩" :expanded="true">
      <p class="section-description">
        Pick which plugin tiles appear in the clock bar. Toggling here flips each instance's
        <code>show_in_statusbar</code> flag, so plugins continue to control their own preview and
        data &mdash; this menu just chooses which ones to show.
      </p>

      <div v-if="loading" class="state-message">Loading installed plugins&hellip;</div>

      <div v-else-if="barCapableServices.length === 0" class="state-message empty-state">
        <p>No installed plugins expose a status bar item.</p>
        <p>
          Install a plugin that ships a <code>statusbar_schema</code> to add tiles here. Manage
          installs in the <strong>Plugins</strong> category.
        </p>
      </div>

      <ul v-else class="items-list">
        <li v-for="service in barCapableServices" :key="service.id" class="item-row">
          <div class="preview" :title="`Live preview of ${service.name}`">
            <SchemaStatusbarItem :service-id="service.id" :schema="service.statusbar_schema" />
          </div>
          <div class="meta">
            <div class="title">{{ service.name }}</div>
            <div class="subtitle">{{ service.plugin_name || service.plugin_id }}</div>
          </div>
          <label class="toggle" :class="{ saving: pendingId === service.id }">
            <input
              type="checkbox"
              :checked="isVisible(service)"
              :disabled="pendingId === service.id"
              @change="toggle(service, $event.target.checked)"
            />
            <span>{{ isVisible(service) ? "Shown" : "Hidden" }}</span>
          </label>
        </li>
      </ul>

      <div v-if="errorMessage" class="error-message" role="alert">{{ errorMessage }}</div>
    </CollapsibleSection>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from "vue";
import { useWebServicesStore } from "@/stores/webServices";
import * as pluginsApi from "@/services/pluginsApi";
import { logError } from "@/utils/logger";
import CollapsibleSection from "../../shared/CollapsibleSection.vue";
import SchemaStatusbarItem from "@/components/plugins/SchemaStatusbarItem.vue";

const webServicesStore = useWebServicesStore();

const loading = ref(false);
const pendingId = ref(null);
const errorMessage = ref("");

const barCapableServices = computed(() =>
  webServicesStore.services.filter(s => s.statusbar_schema?.kind)
);

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
}

.section-description {
  margin: 0 0 1rem;
  color: var(--text-secondary);
  font-size: 0.9rem;
  line-height: 1.5;
}

.section-description code {
  padding: 0.05rem 0.35rem;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: 4px;
  font-size: 0.85em;
}

.state-message {
  padding: 1rem;
  color: var(--text-secondary);
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
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: 8px;
}

.preview {
  display: flex;
  align-items: center;
  min-height: 32px;
}

.meta .title {
  font-weight: 600;
  color: var(--text-primary);
}

.meta .subtitle {
  margin-top: 0.15rem;
  font-size: 0.8rem;
  color: var(--text-secondary);
}

.toggle {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  cursor: pointer;
  font-size: 0.9rem;
  color: var(--text-primary);
  user-select: none;
}

.toggle.saving {
  opacity: 0.6;
  cursor: progress;
}

.toggle input {
  cursor: inherit;
}

.error-message {
  margin-top: 0.75rem;
  padding: 0.6rem 0.85rem;
  background: rgba(244, 67, 54, 0.12);
  border: 1px solid rgba(244, 67, 54, 0.4);
  border-radius: 6px;
  color: var(--text-primary);
  font-size: 0.88rem;
}
</style>
