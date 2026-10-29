<template>
  <div class="maintenance-settings">
    <SettingsSection id="maintenance-updates" title="Updates">
      <UpdatesTab
        :git-repo-url="gitRepoUrl"
        :git-branch="gitBranch"
        @update:git-repo-url="v => emit('update:gitRepoUrl', v)"
        @update:git-branch="v => emit('update:gitBranch', v)"
      />
    </SettingsSection>

    <SettingsSection id="device-hardware" title="Versions & status">
      <SettingRow label="Backend version" :description="version || 'Unknown'" />
      <SettingRow label="Frontend version" :description="frontendVersion || 'Unknown'" />
      <SettingRow label="System status">
        <span class="maint-status" :class="statusClass">{{ statusText }}</span>
      </SettingRow>
    </SettingsSection>

    <SettingsSection id="maintenance-system" title="Restart">
      <!-- In Docker the container is restarted from the host (Unraid / compose).
           A native backend that does not own the machine (CALVIN_HOST_CONTROL
           off) refuses these too, so don't offer them. -->
      <template v-if="hostActionsAvailable">
        <SettingRow label="Restart backend" description="Restart the backend API server.">
          <button type="button" class="maint-btn" @click="askRestartBackend">
            Restart backend
          </button>
        </SettingRow>
        <SettingRow label="Restart frontend" description="Restart the frontend service.">
          <button type="button" class="maint-btn" @click="askRestartFrontend">
            Restart frontend
          </button>
        </SettingRow>
      </template>
      <SettingRow label="Reload UI" description="Reload the browser page.">
        <button type="button" class="maint-btn" @click="reloadUi">Reload UI</button>
      </SettingRow>
    </SettingsSection>

    <BackupSettings />

    <SettingsSection id="maintenance-diagnostics" title="Diagnostics">
      <SettingRow
        label="Console logging"
        description="Log to the browser console. When off, only errors are shown."
      >
        <ToggleSwitch
          :model-value="config.consoleLogEnabled ?? true"
          aria-label="Console logging"
          @update:model-value="v => emit('update:config', { consoleLogEnabled: v })"
        />
      </SettingRow>
      <SettingRow
        v-if="config.consoleLogEnabled ?? true"
        label="Log level"
        description="Which messages appear in the browser console."
      >
        <SelectPill
          :model-value="config.consoleLogLevel || 'info'"
          :options="[
            { value: 'error', label: 'Errors only' },
            { value: 'warn', label: 'Warnings & errors' },
            { value: 'info', label: 'Info, warnings & errors' },
            { value: 'debug', label: 'All logs' },
          ]"
          @update:model-value="v => emit('update:config', { consoleLogLevel: v })"
        />
      </SettingRow>
      <SettingRow
        label="Config polling interval"
        description="How often to check for config changes (seconds)."
      >
        <NumberStepper
          :model-value="config.configPollInterval || 30"
          :min="5"
          :max="300"
          :step="1"
          aria-label="Config polling interval in seconds"
          @update:model-value="v => emit('update:config', { configPollInterval: v })"
        />
      </SettingRow>
    </SettingsSection>

    <ConfirmModal
      :show="confirm.show"
      :title="confirm.title"
      :message="confirm.message"
      confirm-text="Restart"
      @confirm="onConfirm"
      @cancel="confirm.show = false"
    />
  </div>
</template>

<script setup>
import { computed, onMounted, reactive } from "vue";
import { useSystem } from "@/composables";
import { useConnectionStore } from "@/stores/connection";
import SettingsSection from "@/components/settings/shell/SettingsSection.vue";
import SettingRow from "@/components/settings/shell/SettingRow.vue";
import ToggleSwitch from "@/components/ui/ToggleSwitch.vue";
import SelectPill from "@/components/ui/SelectPill.vue";
import NumberStepper from "@/components/ui/NumberStepper.vue";
import ConfirmModal from "@/components/settings/shared/ConfirmModal.vue";
import UpdatesTab from "@/components/settings/tabs/system/UpdatesTab.vue";
import BackupSettings from "@/components/settings/categories/BackupSettings.vue";

defineProps({
  config: { type: Object, required: true },
  gitRepoUrl: { type: String, default: "" },
  gitBranch: { type: String, default: "develop" },
  version: { type: String, default: null },
  frontendVersion: { type: String, default: null },
});
const emit = defineEmits(["update:config", "update:gitRepoUrl", "update:gitBranch"]);

const { restartBackend, restartFrontend, environment, loadEnvironment } = useSystem();
const connectionStore = useConnectionStore();

const statusText = computed(() => (connectionStore.isBackendOnline ? "● Online" : "○ Offline"));
const statusClass = computed(() => (connectionStore.isBackendOnline ? "is-online" : "is-offline"));

// A missing environment (request failed) keeps the actions visible; the
// backend guard then answers with the real reason.
const hostActionsAvailable = computed(() => {
  const env = environment.value;
  if (!env) return true;
  return env.deployment !== "docker" && env.host_control !== false;
});
onMounted(loadEnvironment);

const confirm = reactive({ show: false, title: "", message: "", action: null });

const askRestartBackend = () => {
  confirm.title = "Restart backend?";
  confirm.message = "The display will briefly disconnect while the backend restarts.";
  confirm.action = "backend";
  confirm.show = true;
};
const askRestartFrontend = () => {
  confirm.title = "Restart frontend?";
  confirm.message = "The dashboard UI will reload while the frontend restarts.";
  confirm.action = "frontend";
  confirm.show = true;
};
const onConfirm = async () => {
  const action = confirm.action;
  confirm.show = false;
  try {
    if (action === "backend") await restartBackend();
    else if (action === "frontend") await restartFrontend();
  } catch (e) {
    console.error("System action failed:", e);
  }
};
const reloadUi = () => {
  window.location.reload();
};
</script>

<style scoped>
.maintenance-settings {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}
.maint-btn {
  min-height: var(--touch-target);
  padding: 0 1rem;
  font-family: var(--font-ui);
  font-size: 0.95rem;
  font-weight: 500;
  color: var(--ink);
  background: var(--bg-2);
  border: 1px solid var(--line);
  border-radius: 10px;
  cursor: pointer;
}
.maint-btn:hover {
  border-color: var(--focus);
}
.maint-btn:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: 2px;
}
.maint-status {
  font-family: var(--font-data);
  font-weight: 600;
}
.maint-status.is-online {
  color: var(--ok);
}
.maint-status.is-offline {
  color: var(--err);
}
</style>
