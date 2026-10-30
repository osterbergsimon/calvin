<template>
  <div class="maintenance-settings">
    <SettingsSection id="maintenance-updates" title="Updates">
      <UpdatesTab
        :git-repo-url="gitRepoUrl"
        :git-branch="gitBranch"
        @update:git-repo-url="v => emit('update:gitRepoUrl', v)"
        @update:git-branch="v => emit('update:gitBranch', v)"
      />
      <KioskSoftwarePointer />
    </SettingsSection>

    <SettingsSection id="device-hardware" title="Versions & status">
      <SettingRow label="Backend version" :description="version || 'Unknown'" />
      <SettingRow label="Frontend version" :description="frontendVersion || 'Unknown'" />
      <SettingRow label="System status">
        <span class="maint-status" :class="statusClass">{{ statusText }}</span>
      </SettingRow>
    </SettingsSection>

    <SettingsSection id="maintenance-system" title="Restart">
      <!-- Gate on the real capability: a native Pi with host control but no
           systemctl/helper would answer these with a 500. -->
      <template v-if="restartAvailable">
        <SettingRow
          label="Restart Calvin server"
          description="Restarts Calvin. Screens reconnect on their own in about 15 seconds."
        >
          <button
            type="button"
            class="maint-btn"
            data-test="restart-backend"
            @click="askRestartBackend"
          >
            Restart server
          </button>
        </SettingRow>
        <SettingRow
          label="Restart kiosk browser"
          description="Restarts the browser on this Pi's screen. The server keeps running."
        >
          <button
            type="button"
            class="maint-btn"
            data-test="restart-frontend"
            @click="askRestartFrontend"
          >
            Restart browser
          </button>
        </SettingRow>
      </template>
      <SettingRow label="Reload UI" data-test="reload-ui">
        <template #description>
          <p class="maint-desc">Reload the browser page.</p>
          <p v-if="isContainer" class="maint-hint" data-test="docker-restart-hint">
            To restart the server, restart the Calvin container from Docker (Unraid: Docker tab).
          </p>
        </template>
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
      :confirm-text="confirm.confirmText"
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
import KioskSoftwarePointer from "@/components/settings/shared/KioskSoftwarePointer.vue";
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

// Gate on the capability the backend actually reports, not on deployment or
// host control: a native Pi can control the host yet lack the restart helper.
// A missing environment (request failed) keeps the rows visible; the backend
// guard then answers with the real reason.
const restartAvailable = computed(() => {
  const env = environment.value;
  if (!env) return true;
  return env.capabilities?.restart === true;
});
const isContainer = computed(() => environment.value?.deployment === "docker");
onMounted(loadEnvironment);

const confirm = reactive({
  show: false,
  title: "",
  message: "",
  confirmText: "Restart",
  action: null,
});

const askRestartBackend = () => {
  confirm.title = "Restart the Calvin server?";
  confirm.message = "Settings and screens lose connection for about 15 seconds.";
  confirm.confirmText = "Restart server";
  confirm.action = "backend";
  confirm.show = true;
};
const askRestartFrontend = () => {
  confirm.title = "Restart the kiosk browser?";
  confirm.message = "The screen goes blank for a few seconds.";
  confirm.confirmText = "Restart browser";
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
.maint-desc {
  margin: 0.2rem 0 0;
  font-size: 0.85rem;
  line-height: 1.4;
  color: var(--ink-2);
}
.maint-hint {
  margin: 0.2rem 0 0;
  font-size: var(--fs-sm);
  line-height: 1.4;
  color: var(--ink-2);
}
</style>
