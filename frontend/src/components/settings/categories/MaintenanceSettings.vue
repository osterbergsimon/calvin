<template>
  <div class="maintenance-settings">
    <SettingsSection id="maintenance-updates" title="Updates">
      <UpdatesTab
        v-if="cap.update_supported"
        :git-repo-url="gitRepoUrl"
        :git-branch="gitBranch"
        @update:git-repo-url="v => emit('update:gitRepoUrl', v)"
        @update:git-branch="v => emit('update:gitBranch', v)"
      />
      <SettingRow
        v-else
        label="Server updates"
        description="This server runs as a Docker container, so updates are applied on the host by pulling the published image."
        stacked
      >
        <div class="maint-guidance" data-test="update-guidance">
          <code class="maint-guidance__cmd">sudo /usr/local/bin/update-calvin.sh</code>
          <p class="maint-guidance__note">
            …or manually: <code>docker compose pull && docker compose up -d</code> in
            <code>/etc/calvin</code>. Kiosk agents are updated below — they don't need a server
            update.
          </p>
        </div>
      </SettingRow>
    </SettingsSection>

    <KioskAgentsSection />

    <SettingsSection id="maintenance-system" title="System">
      <SettingRow
        v-if="cap.restart_backend_supported"
        label="Restart backend"
        description="Restart the backend API server."
      >
        <button
          type="button"
          class="maint-btn"
          data-test="restart-backend"
          @click="askRestartBackend"
        >
          Restart backend
        </button>
      </SettingRow>
      <SettingRow
        v-if="cap.restart_frontend_supported"
        label="Restart frontend"
        description="Restart the frontend service."
      >
        <button
          type="button"
          class="maint-btn"
          data-test="restart-frontend"
          @click="askRestartFrontend"
        >
          Restart frontend
        </button>
      </SettingRow>
      <SettingRow label="Reload UI" description="Reload the browser page.">
        <button type="button" class="maint-btn" data-test="reload-ui" @click="reloadUi">
          Reload UI
        </button>
      </SettingRow>
    </SettingsSection>

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
import { computed, onMounted, reactive, ref } from "vue";
import { useSystem } from "@/composables";
import { getSystemEnvironment } from "@/services/systemApi";
import SettingsSection from "@/components/settings/shell/SettingsSection.vue";
import SettingRow from "@/components/settings/shell/SettingRow.vue";
import ToggleSwitch from "@/components/ui/ToggleSwitch.vue";
import SelectPill from "@/components/ui/SelectPill.vue";
import NumberStepper from "@/components/ui/NumberStepper.vue";
import ConfirmModal from "@/components/settings/shared/ConfirmModal.vue";
import KioskAgentsSection from "@/components/settings/shared/KioskAgentsSection.vue";
import UpdatesTab from "@/components/settings/tabs/system/UpdatesTab.vue";

defineProps({
  config: { type: Object, required: true },
  gitRepoUrl: { type: String, default: "" },
  gitBranch: { type: String, default: "main" },
});
const emit = defineEmits(["update:config", "update:gitRepoUrl", "update:gitBranch"]);

const { restartBackend, restartFrontend } = useSystem();

// Deployment capabilities. null until fetched; on fetch failure we deliberately
// fall back to "show everything" so a transient error can't hide working controls.
const environment = ref(null);
const cap = computed(
  () =>
    environment.value ?? {
      deployment: "unknown",
      update_supported: true,
      restart_backend_supported: true,
      restart_frontend_supported: true,
    }
);

onMounted(async () => {
  try {
    environment.value = await getSystemEnvironment();
  } catch (e) {
    console.error("Failed to load system environment:", e);
  }
});

const confirm = reactive({ show: false, title: "", message: "", action: null });

const askRestartBackend = () => {
  confirm.title = "Restart backend?";
  confirm.message =
    cap.value.deployment === "docker"
      ? "The backend container will restart via its restart policy. The display briefly disconnects."
      : "The display will briefly disconnect while the backend restarts.";
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
.maint-guidance {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
.maint-guidance__cmd {
  display: block;
  padding: 0.6rem 0.75rem;
  background: var(--bg-0);
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  font-family: var(--font-data);
  font-size: var(--fs-sm);
  color: var(--ink);
  user-select: all;
}
.maint-guidance__note {
  margin: 0;
  font-family: var(--font-ui);
  font-size: var(--fs-xs);
  color: var(--ink-3);
  line-height: 1.5;
}
.maint-guidance__note code {
  font-family: var(--font-data);
  font-size: 0.9em;
}
</style>
