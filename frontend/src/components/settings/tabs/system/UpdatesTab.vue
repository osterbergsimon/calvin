<template>
  <SettingRow label="Repository" description="GitHub repository to pull updates from." stacked>
    <input
      v-model="localGitRepoUrl"
      class="field-input"
      type="text"
      placeholder="https://github.com/user/repo.git"
      aria-label="Git repository URL"
      @change="handleGitRepoChange"
      @blur="handleGitRepoChange"
    />
  </SettingRow>

  <SettingRow label="Branch" description="Which branch to track." stacked>
    <select
      class="field-select"
      :value="gitBranch"
      aria-label="Git branch"
      @change="handleGitBranchChange"
    >
      <option v-for="branch in availableBranches" :key="branch" :value="branch">
        {{ branch }}
      </option>
    </select>
  </SettingRow>

  <SettingRow
    label="Install updates"
    description="Pull and apply the latest version from the selected branch."
  >
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

  <SettingRow label="Status" description="Live backend and updater state." stacked>
    <div class="update-readout">
      <div class="readout-line">
        <span
          class="readout-lamp"
          :class="`readout-lamp--${backendLampState}`"
          aria-hidden="true"
        />
        <span class="readout-key">Backend API</span>
        <span class="readout-val">{{ backendHealthLabel }}</span>
        <span v-if="backendHealthCheckedAt" class="readout-meta">
          {{ formatDateTime(backendHealthCheckedAt) }}
        </span>
      </div>
      <div class="readout-line">
        <span
          class="readout-lamp"
          :class="`readout-lamp--${updateLampState}`"
          aria-hidden="true"
        />
        <span class="readout-key">Update state</span>
        <span class="readout-val">{{ updateStatusLabel }}</span>
        <span v-if="updateStatus?.phase" class="readout-meta">
          {{ formatPhase(updateStatus.phase) }}
        </span>
      </div>
      <div v-if="updateStatusCheckedAt" class="readout-line">
        <span class="readout-lamp readout-lamp--muted" aria-hidden="true" />
        <span class="readout-key">Last checked</span>
        <span class="readout-val">{{ formatDateTime(updateStatusCheckedAt) }}</span>
      </div>
      <p v-if="backendHealth?.error" class="readout-note">{{ backendHealth.error }}</p>
    </div>
  </SettingRow>

  <SettingRow v-if="updateStatus && hasUpdateDetails" label="Update details" stacked>
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
          <span v-if="updateStatus.current_commit_msg">— {{ updateStatus.current_commit_msg }}</span>
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
        <dd class="update-detail__err">{{ updateStatus.error }}</dd>
      </template>
    </dl>
  </SettingRow>

  <SettingRow v-if="updateStatus?.last_log" label="Latest log output" stacked>
    <pre class="update-log">{{ updateStatus.last_log }}</pre>
  </SettingRow>
</template>

<script setup>
import { computed, ref, watch, onMounted } from "vue";
import { useSystem } from "@/composables";
import { getGitBranches } from "@/services/configApi";
import SettingRow from "@/components/settings/shell/SettingRow.vue";

const props = defineProps({
  gitRepoUrl: {
    type: String,
    default: "",
  },
  gitBranch: {
    type: String,
    default: "main",
  },
});

const emit = defineEmits(["update:gitRepoUrl", "update:gitBranch"]);

const {
  updating,
  updateStatus,
  updateStatusLoading,
  updateStatusCheckedAt,
  backendHealth,
  backendHealthLoading,
  backendHealthCheckedAt,
  triggerUpdate,
  getUpdateStatus,
  getBackendHealth,
} = useSystem();

const availableBranches = ref([props.gitBranch || "main"]);
const localGitRepoUrl = ref(props.gitRepoUrl || "");
const lastEmittedGitRepoUrl = ref(props.gitRepoUrl || "");
const statusRefreshLoading = computed(
  () => updateStatusLoading.value || backendHealthLoading.value
);

const backendHealthLabel = computed(() => {
  if (backendHealthLoading.value) return "Checking";
  return backendHealth.value?.status || "Unknown";
});

// Lamp state maps health/updater status onto the instrument-readout palette:
// ok (green) · info (amber, in-flight) · err (red) · muted (unknown/idle meta).
const backendLampState = computed(() => {
  if (backendHealthLoading.value) return "info";
  if (backendHealth.value?.status === "healthy") return "ok";
  if (backendHealth.value?.status === "unhealthy") return "err";
  return "muted";
});

const updateStatusLabel = computed(() => {
  if (updateStatusLoading.value) return "Checking";
  return updateStatus.value?.status || "Unknown";
});

const updateLampState = computed(() => {
  if (updateStatusLoading.value) return "info";
  const status = updateStatus.value?.status;
  if (status === "idle") return "ok";
  if (status === "running") return "info";
  if (status === "error") return "err";
  return "muted";
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

const formatPhase = phase => {
  if (!phase) return "";
  return String(phase)
    .replace(/_/g, " ")
    .replace(/\b\w/g, char => char.toUpperCase());
};

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

const handleGitRepoChange = () => {
  if (
    localGitRepoUrl.value !== props.gitRepoUrl &&
    localGitRepoUrl.value !== lastEmittedGitRepoUrl.value
  ) {
    lastEmittedGitRepoUrl.value = localGitRepoUrl.value;
    emit("update:gitRepoUrl", localGitRepoUrl.value);
  }
};

const handleGitBranchChange = event => {
  emit("update:gitBranch", event.target.value);
};

const handleTriggerUpdate = async () => {
  await triggerUpdate();
};

const refreshSystemStatus = async () => {
  await Promise.allSettled([getBackendHealth(), getUpdateStatus()]);
};

const loadBranches = async () => {
  try {
    const branches = await getGitBranches();
    availableBranches.value = branches.branches || [props.gitBranch || "main"];
  } catch (error) {
    console.error("Failed to load branches:", error);
  }
};

onMounted(() => {
  loadBranches();
  refreshSystemStatus();
});

watch(
  () => props.gitRepoUrl,
  repoUrl => {
    localGitRepoUrl.value = repoUrl || "";
    lastEmittedGitRepoUrl.value = repoUrl || "";
    if (repoUrl) {
      loadBranches();
    }
  }
);
</script>

<style scoped>
/* Full-width inputs for the stacked config rows. */
.field-input,
.field-select {
  width: 100%;
  min-height: var(--touch-target);
  padding: 0.5rem 0.75rem;
  background: var(--bg-2);
  color: var(--ink);
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  font-family: var(--font-ui);
  font-size: var(--fs-control);
  transition:
    border-color 0.2s,
    box-shadow 0.2s;
}
.field-input:hover,
.field-select:hover {
  border-color: var(--focus-edge);
}
.field-input:focus,
.field-select:focus {
  outline: none;
  border-color: var(--focus);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--focus) 20%, transparent);
}
.field-select {
  cursor: pointer;
  appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%2393a0a9' d='M6 9L1 4h10z'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 0.75rem center;
  padding-right: 2.5rem;
}

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
  font-family: var(--font-data);
  font-size: var(--fs-micro);
  font-weight: 600;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--ink-3);
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
  color: var(--err);
  line-height: 1.4;
}

/* Verbose detail — mono key/value grid. */
.update-detail {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 0.35rem 1rem;
  margin: 0;
}
.update-detail dt {
  font-family: var(--font-data);
  font-size: var(--fs-micro);
  font-weight: 600;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--ink-3);
  padding-top: 0.1rem;
}
.update-detail dd {
  margin: 0;
  font-family: var(--font-ui);
  font-size: var(--fs-sm);
  color: var(--ink);
  overflow-wrap: anywhere;
}
.update-detail__err {
  color: var(--err);
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
