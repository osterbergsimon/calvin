<template>
  <SettingRow
    v-if="isContainer"
    label="How to update"
    description="Calvin runs in Docker, so you update it there: pull the new image and restart the container."
    stacked
  >
    <dl>
      <dt>Unraid</dt>
      <dd>Docker tab → <strong>Check for Updates</strong> → apply update on Calvin.</dd>
      <dt>Compose</dt>
      <dd><code>docker compose pull &amp;&amp; docker compose up -d</code></dd>
    </dl>
  </SettingRow>

  <template v-else>
    <SettingRow label="Install updates" description="Download and install the latest Calvin.">
      <Button
        :disabled="statusRefreshLoading"
        :loading="statusRefreshLoading"
        @click="refreshSystemStatus"
      >
        Check status
      </Button>
      <Button
        variant="primary"
        :disabled="updating"
        :loading="updating"
        loading-label="Updating…"
        @click="handleTriggerUpdate"
      >
        Update now
      </Button>
    </SettingRow>
  </template>

  <SettingRow label="Calvin" data-test="readout-calvin">
    <template #description>
      <InlineNote>Whether Calvin is running and if an update is under way.</InlineNote>
      <InlineNote v-if="backendHealth?.error" tone="err" data-test="readout-note">
        {{ backendHealth.errorText }}
      </InlineNote>
      <details v-if="backendHealth?.error" data-test="readout-details">
        <summary>Details</summary>
        <p>{{ backendHealth.error }}</p>
      </details>
    </template>
    <Tag :tone="backendTone" data-test="backend-health-value">{{ backendHealthLabel }}</Tag>
  </SettingRow>
  <SettingRow
    v-if="!isContainer"
    label="Updates"
    :description="updatePhaseLabel"
    data-test="readout-updates"
  >
    <Tag :tone="updateTone" data-test="update-status-value">{{ updateStatusLabel }}</Tag>
  </SettingRow>
  <SettingRow v-if="updateStatusCheckedAt" label="Last checked" data-test="readout-last-checked">
    <span>{{ formatDateTime(updateStatusCheckedAt) }}</span>
  </SettingRow>

  <SettingRow
    v-if="!isContainer && updateStatus && hasUpdateDetails"
    label="Update details"
    stacked
  >
    <dl>
      <template v-if="updateStatus.message">
        <dt>Message</dt>
        <dd>{{ updateStatus.message }}</dd>
      </template>
      <template v-if="updateStatus.progress !== undefined">
        <dt>Progress</dt>
        <dd>{{ updateStatus.progress }}%</dd>
      </template>
      <template v-if="updateStatus.started_at">
        <dt>Started</dt>
        <dd>{{ formatDateTime(updateStatus.started_at) }}</dd>
      </template>
      <template v-if="updateStatus.finished_at">
        <dt>Finished</dt>
        <dd>{{ formatDateTime(updateStatus.finished_at) }}</dd>
      </template>
      <template v-if="updateStatus.current_commit_short">
        <dt>Current</dt>
        <dd>
          {{ updateStatus.current_commit_short }}
          <span v-if="updateStatus.current_commit_msg"
            >— {{ updateStatus.current_commit_msg }}</span
          >
        </dd>
      </template>
      <template v-if="updateStatus.new_commit_short">
        <dt>Latest</dt>
        <dd>
          {{ updateStatus.new_commit_short }}
          <span v-if="updateStatus.new_commit_msg">— {{ updateStatus.new_commit_msg }}</span>
        </dd>
      </template>
      <template v-if="updateStatus.log_file">
        <dt>Log file</dt>
        <dd>{{ updateStatus.log_file }}</dd>
      </template>
      <template v-if="updateStatus.error">
        <dt>Error</dt>
        <dd>
          <details data-test="update-error-details">
            <summary>Details</summary>
            <p>{{ updateStatus.error }}</p>
          </details>
        </dd>
      </template>
    </dl>
  </SettingRow>

  <SettingRow v-if="!isContainer && updateStatus?.last_log" label="Latest log output" stacked>
    <pre data-test="update-log">{{ updateStatus.last_log }}</pre>
  </SettingRow>
</template>

<script setup>
import { computed, onMounted } from "vue";
import { useSystem } from "@/composables";
import Button from "@/components/ui/Button.vue";
import InlineNote from "@/components/ui/InlineNote.vue";
import Tag from "@/components/ui/Tag.vue";
import SettingRow from "@/components/settings/shell/SettingRow.vue";

const {
  updating,
  updateStatus,
  updateStatusLoading,
  updateStatusCheckedAt,
  backendHealth,
  backendHealthLoading,
  backendHealthCheckedAt,
  environment,
  loadEnvironment,
  triggerUpdate,
  getUpdateStatus,
  getBackendHealth,
} = useSystem();

// In Docker the git updater and update-script status don't apply.
const isContainer = computed(() => environment.value?.deployment === "docker");

const statusRefreshLoading = computed(
  () => updateStatusLoading.value || backendHealthLoading.value
);

const backendHealthLabel = computed(() => {
  if (backendHealthLoading.value) return "Checking…";
  const status = backendHealth.value?.status;
  if (status === "healthy") return "Running";
  if (status === "unhealthy") return "Not responding";
  // A completed check can't be "not checked": say we don't know the state
  // rather than contradict the time beside it.
  return backendHealthCheckedAt.value ? "Unknown" : "Not checked yet";
});

// The Tag tone is the status: ok (green) · warn (in-flight) · err (red) ·
// neutral (unknown/idle).
const backendTone = computed(() => {
  if (backendHealthLoading.value) return "warn";
  if (backendHealth.value?.status === "healthy") return "ok";
  if (backendHealth.value?.status === "unhealthy") return "err";
  return "neutral";
});

// Statuses and phases are server vocabulary; the screen shows plain words and
// never the raw value (CLV-63).
const updateStatusLabel = computed(() => {
  if (updateStatusLoading.value) return "Checking…";
  const status = updateStatus.value?.status;
  if (status === "idle") return "Up to date";
  if (status === "running") return "Updating";
  if (status === "error") return "Update failed";
  return "Not checked yet";
});

const updateTone = computed(() => {
  if (updateStatusLoading.value) return "warn";
  const status = updateStatus.value?.status;
  if (status === "idle") return "ok";
  if (status === "running") return "warn";
  if (status === "error") return "err";
  return "neutral";
});

const PHASE_LABELS = {
  pulling: "Downloading",
  pulling_code: "Downloading",
  downloading: "Downloading",
  deps: "Installing",
  installing: "Installing",
  dependencies: "Installing",
  building: "Preparing the screens",
  building_frontend: "Preparing the screens",
  restarting: "Restarting",
};

const updatePhaseLabel = computed(() => {
  const phase = updateStatus.value?.phase;
  if (!phase) return "";
  return PHASE_LABELS[String(phase).toLowerCase()] || "";
});

const hasUpdateDetails = computed(() => {
  const s = updateStatus.value;
  if (!s) return false;
  return Boolean(
    s.message ||
      s.progress !== undefined ||
      s.started_at ||
      s.finished_at ||
      s.current_commit_short ||
      s.new_commit_short ||
      s.log_file ||
      s.error
  );
});

const formatDateTime = value => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const handleTriggerUpdate = async () => {
  await triggerUpdate();
};

const refreshSystemStatus = async () => {
  if (isContainer.value) {
    await getBackendHealth();
    return;
  }
  await Promise.allSettled([getBackendHealth(), getUpdateStatus()]);
};

onMounted(async () => {
  await loadEnvironment();
  refreshSystemStatus();
});
</script>
