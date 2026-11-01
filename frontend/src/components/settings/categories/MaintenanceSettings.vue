<template>
  <div class="maintenance-settings">
    <SettingsSection id="maintenance-updates" title="Updates">
      <UpdatesTab :git-branch="gitBranch" />
      <KioskSoftwarePointer />
    </SettingsSection>

    <SettingsSection id="device-hardware" title="Versions & status">
      <SettingRow label="Version">
        <span data-test="version-readout">
          {{ version || "Not available" }}
          <span v-if="screenVersion">(screen {{ screenVersion }})</span>
        </span>
      </SettingRow>
      <SettingRow label="System status">
        <Tag :tone="connectionStore.isBackendOnline ? 'ok' : 'err'">{{ statusText }}</Tag>
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
          <Button data-test="restart-backend" @click="askRestartBackend">Restart server</Button>
        </SettingRow>
        <SettingRow
          label="Restart this screen"
          description="Reloads this screen's browser. Calvin keeps running."
        >
          <Button data-test="restart-frontend" @click="askRestartFrontend">
            Restart browser
          </Button>
        </SettingRow>
      </template>
      <!-- "Screen now" left Screens (Default-is-a-screen §3): it drives the
           server's own display, so it belongs with the other host actions and
           only where Calvin controls the host. -->
      <SettingRow
        v-if="displayControlAvailable"
        label="This server's screen"
        data-test="server-display-row"
      >
        <Button data-test="server-display-off" @click="onDisplayOff">Turn off</Button>
        <Button data-test="server-display-on" @click="onDisplayOn">Turn on</Button>
      </SettingRow>
      <SettingRow label="Reload this screen" data-test="reload-ui">
        <template #description>
          <InlineNote v-if="isContainer" data-test="docker-restart-hint">
            To restart Calvin, restart its container in Docker (on Unraid: the Docker tab).
          </InlineNote>
        </template>
        <Button @click="reloadUi">Reload</Button>
      </SettingRow>
    </SettingsSection>

    <BackupSettings />

    <!-- Advanced: installer-facing rows, closed by default (§4). Search still
         finds them and opens this section. -->
    <CollapsibleSettingsSection id="maintenance-advanced" title="Advanced">
      <UpdateSourceRows
        v-if="!isContainer"
        :git-repo-url="gitRepoUrl"
        :git-branch="gitBranch"
        @update:git-repo-url="v => emit('update:gitRepoUrl', v)"
        @update:git-branch="v => emit('update:gitBranch', v)"
      />
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
        label="Check for setting changes every"
        description="How fast other screens pick up a change."
      >
        <NumberStepper
          :model-value="config.configPollInterval || 30"
          :min="5"
          :max="300"
          :step="1"
          unit=" s"
          aria-label="Check for setting changes every, in seconds"
          @update:model-value="v => emit('update:config', { configPollInterval: v })"
        />
      </SettingRow>
    </CollapsibleSettingsSection>

    <ConfirmModal
      :show="confirm.show"
      :title="confirm.title"
      :message="confirm.message"
      :confirm-text="confirm.confirmText"
      :danger="true"
      @confirm="onConfirm"
      @cancel="confirm.show = false"
    />
  </div>
</template>

<script setup>
import { reloadWithLight } from "@/utils/reloadWithLight";
import { computed, onMounted, reactive } from "vue";
import { useSystem } from "@/composables";
import { useConnectionStore } from "@/stores/connection";
import Button from "@/components/ui/Button.vue";
import InlineNote from "@/components/ui/InlineNote.vue";
import Tag from "@/components/ui/Tag.vue";
import SettingsSection from "@/components/settings/shell/SettingsSection.vue";
import SettingRow from "@/components/settings/shell/SettingRow.vue";
import CollapsibleSettingsSection from "@/components/settings/shell/CollapsibleSettingsSection.vue";
import ToggleSwitch from "@/components/ui/ToggleSwitch.vue";
import SelectPill from "@/components/ui/SelectPill.vue";
import NumberStepper from "@/components/ui/NumberStepper.vue";
import ConfirmModal from "@/components/settings/shared/ConfirmModal.vue";
import UpdatesTab from "@/components/settings/tabs/system/UpdatesTab.vue";
import UpdateSourceRows from "@/components/settings/tabs/system/UpdateSourceRows.vue";
import KioskSoftwarePointer from "@/components/settings/shared/KioskSoftwarePointer.vue";
import BackupSettings from "@/components/settings/categories/BackupSettings.vue";

const props = defineProps({
  config: { type: Object, required: true },
  gitRepoUrl: { type: String, default: "" },
  gitBranch: { type: String, default: "develop" },
  version: { type: String, default: null },
  frontendVersion: { type: String, default: null },
});
const emit = defineEmits(["update:config", "update:gitRepoUrl", "update:gitBranch"]);

const {
  restartBackend,
  restartFrontend,
  environment,
  loadEnvironment,
  turnDisplayOn,
  turnDisplayOff,
} = useSystem();
const connectionStore = useConnectionStore();

// One version row: the server's version, plus the screen's own bundle only when
// it differs (a stale cached frontend is worth seeing; a matching one is noise).
const screenVersion = computed(() => {
  if (!props.frontendVersion) return null;
  return props.frontendVersion === props.version ? null : props.frontendVersion;
});

const statusText = computed(() => (connectionStore.isBackendOnline ? "Online" : "Offline"));

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
// The server's own display can be turned off and on only where Calvin owns the
// host (native, host control). A container or a dev backend reports no reboot
// capability, and its display is not ours to switch.
const displayControlAvailable = computed(() => environment.value?.capabilities?.reboot === true);
const onDisplayOn = async () => {
  try {
    await turnDisplayOn?.();
  } catch (e) {
    console.error("Failed to turn the display on:", e);
  }
};
const onDisplayOff = async () => {
  try {
    await turnDisplayOff?.();
  } catch (e) {
    console.error("Failed to turn the display off:", e);
  }
};
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
// The app loading light covers the wait until the new page is up (CLV-115).
const reloadUi = () => {
  reloadWithLight();
};
</script>
