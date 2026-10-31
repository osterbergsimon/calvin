<template>
  <SettingRow
    v-if="isContainer"
    label="How to update"
    description="Calvin runs in Docker, so you update it there: pull the new image and restart the container."
    stacked
  >
    <dl class="update-detail">
      <dt>Unraid</dt>
      <dd>Docker tab → <strong>Check for Updates</strong> → apply update on Calvin.</dd>
      <dt>Compose</dt>
      <dd><code class="update-cmd">docker compose pull &amp;&amp; docker compose up -d</code></dd>
    </dl>
  </SettingRow>

  <template v-else>
    <SettingRow label="Install updates" description="Download and install the latest Calvin.">
      <div class="update-actions">
        <button
          type="button"
          class="update-btn"
          :disabled="statusRefreshLoading"
          @click="refreshSystemStatus"
        >
          {{ statusRefreshLoading ? "Checking…" : "Check status" }}
        </button>
        <button
          type="button"
          class="update-btn update-btn--primary"
          :disabled="updating"
          @click="handleTriggerUpdate"
        >
          {{ updating ? "Updating…" : "Update now" }}
        </button>
      </div>
    </SettingRow>
  </template>

  <SettingRow
    label="Status"
    description="Whether Calvin is running and if an update is under way."
    stacked
  >
    <div class="update-readout">
      <div class="readout-line">
        <span
          class="readout-lamp"
          :class="`readout-lamp--${backendLampState}`"
          aria-hidden="true"
        />
        <span class="readout-key">Calvin</span>
        <span class="readout-val">{{ backendHealthLabel }}</span>
        <span v-if="backendHealthCheckedAt" class="readout-meta">
          {{ formatDateTime(backendHealthCheckedAt) }}
        </span>
      </div>
      <div v-if="!isContainer" class="readout-line">
        <span class="readout-lamp" :class="`readout-lamp--${updateLampState}`" aria-hidden="true" />
        <span class="readout-key">Updates</span>
        <span class="readout-val">{{ updateStatusLabel }}</span>
        <span v-if="updatePhaseLabel" class="readout-meta">{{ updatePhaseLabel }}</span>
      </div>
      <div v-if="updateStatusCheckedAt" class="readout-line">
        <span class="readout-lamp readout-lamp--muted" aria-hidden="true" />
        <span class="readout-key">Last checked</span>
        <span class="readout-val">{{ formatDateTime(updateStatusCheckedAt) }}</span>
      </div>
      <p v-if="backendHealth?.error" class="readout-note">{{ backendHealth.errorText }}</p>
      <details v-if="backendHealth?.error" class="readout-details">
        <summary>Details</summary>
        <p class="readout-detail-text">{{ backendHealth.error }}</p>
      </details>
    </div>
  </SettingRow>

  <SettingRow
    v-if="!isContainer && updateStatus && hasUpdateDetails"
    label="Update details"
    stacked
  >
    <dl class="update-detail">
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
        <dd class="update-detail__err">
          <details class="readout-details">
            <summary>Details</summary>
            <p class="readout-detail-text">{{ updateStatus.error }}</p>
          </details>
        </dd>
      </template>
    </dl>
  </SettingRow>

  <SettingRow v-if="!isContainer && updateStatus?.last_log" label="Latest log output" stacked>
    <pre class="update-log">{{ updateStatus.last_log }}</pre>
  </SettingRow>
</template>

<script setup>
import { computed, onMounted } from "vue";
import { useSystem } from "@/composables";
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
  return "Not checked yet";
});

// Lamp state maps health/updater status onto the instrument-readout palette:
// ok (green) · info (amber, in-flight) · err (red) · muted (unknown/idle meta).
const backendLampState = computed(() => {
  if (backendHealthLoading.value) return "info";
  if (backendHealth.value?.status === "healthy") return "ok";
  if (backendHealth.value?.status === "unhealthy") return "err";
  return "muted";
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

const updateLampState = computed(() => {
  if (updateStatusLoading.value) return "info";
  const status = updateStatus.value?.status;
  if (status === "idle") return "ok";
  if (status === "running") return "info";
  if (status === "error") return "err";
  return "muted";
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

<style scoped>
/* Action buttons — the maintenance button vocabulary + a primary variant. */
.update-actions {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
}
.update-btn {
  min-height: var(--touch-target);
  padding: 0 1rem;
  font-family: var(--font-ui);
  font-size: var(--fs-control);
  font-weight: 500;
  color: var(--ink);
  background: var(--bg-2);
  border: 1px solid var(--line);
  border-radius: var(--radius-md);
  cursor: pointer;
  transition:
    border-color 0.2s,
    background 0.2s,
    filter 0.2s;
}
.update-btn:hover:not(:disabled) {
  border-color: var(--focus);
}
.update-btn:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: 2px;
}
.update-btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}
.update-btn--primary {
  background: var(--focus);
  color: var(--focus-ink);
  border-color: var(--focus);
  font-weight: 600;
}
.update-btn--primary:hover:not(:disabled) {
  filter: brightness(1.08);
}

/* Instrument readout — lamp + tracked key + value, hairline-ruled. */
.update-readout {
  display: flex;
  flex-direction: column;
}
.readout-line {
  display: grid;
  grid-template-columns: auto minmax(6.5rem, auto) 1fr auto;
  align-items: center;
  gap: 0.65rem;
  padding: 0.5rem 0;
}
.readout-line + .readout-line {
  border-top: 1px solid var(--line-soft);
}
.readout-lamp {
  width: 0.55rem;
  height: 0.55rem;
  border-radius: 2px;
  background: var(--lamp, var(--ink-3));
  box-shadow:
    0 0 5px 0 var(--lamp, transparent),
    0 0 12px 1px color-mix(in srgb, var(--lamp, transparent) 50%, transparent);
}
.readout-lamp--ok {
  --lamp: var(--ok);
}
.readout-lamp--info {
  --lamp: var(--focus);
}
.readout-lamp--err {
  --lamp: var(--err);
}
.readout-lamp--muted {
  --lamp: var(--ink-3);
  box-shadow: none;
}
.readout-key {
  font-family: var(--font-ui);
  font-size: var(--fs-sm);
  font-weight: 600;
  color: var(--ink-2);
}
.readout-val {
  font-family: var(--font-ui);
  font-size: var(--fs-sm);
  color: var(--ink);
  text-transform: capitalize;
}
.readout-meta {
  font-family: var(--font-data);
  font-variant-numeric: tabular-nums;
  font-size: var(--fs-micro);
  color: var(--ink-3);
  white-space: nowrap;
}
.readout-note {
  margin: 0.5rem 0 0;
  font-family: var(--font-ui);
  font-size: var(--fs-xs);
  color: var(--err-text);
  line-height: 1.4;
}

/* Raw server detail belongs behind a Details disclosure, never on the line. */
.readout-details {
  margin-top: 0.35rem;
  font-size: var(--fs-xs);
  color: var(--ink-3);
}
.readout-details summary {
  cursor: pointer;
  font-family: var(--font-ui);
}
.readout-detail-text {
  margin: 0.25rem 0 0;
  font-family: var(--font-data);
  font-size: var(--fs-xs);
  color: var(--ink-3);
  overflow-wrap: anywhere;
  white-space: pre-wrap;
}

/* Verbose detail — mono key/value grid. */
.update-detail {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 0.35rem 1rem;
  margin: 0;
}
.update-detail dt {
  font-family: var(--font-ui);
  font-size: var(--fs-sm);
  font-weight: 600;
  color: var(--ink-2);
  padding-top: 0.1rem;
}
.update-detail dd {
  margin: 0;
  font-family: var(--font-ui);
  font-size: var(--fs-sm);
  color: var(--ink);
  overflow-wrap: anywhere;
}
.update-cmd {
  font-family: var(--font-data);
  font-size: var(--fs-xs);
  overflow-wrap: anywhere;
}
.update-detail__err {
  color: var(--err-text);
}

.update-log {
  max-height: 260px;
  overflow: auto;
  margin: 0;
  background: var(--bg-0);
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  padding: 0.75rem;
  white-space: pre-wrap;
  font-family: var(--font-data);
  font-size: var(--fs-2xs);
  line-height: 1.3;
  color: var(--ink-2);
}
</style>
