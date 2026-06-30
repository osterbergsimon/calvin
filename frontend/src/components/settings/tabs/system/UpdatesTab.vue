<template>
  <div class="updates-tab">
    <CollapsibleSection title="Update Settings" icon="🔄" :expanded="true">
      <SettingItem label="Git Repository URL" help="GitHub repository URL for updates">
        <input
          v-model="localGitRepoUrl"
          type="text"
          placeholder="https://github.com/user/repo.git"
          @change="handleGitRepoChange"
          @blur="handleGitRepoChange"
        />
      </SettingItem>

      <SettingItem label="Git Branch" help="Branch to update from">
        <select :value="gitBranch" @change="handleGitBranchChange">
          <option v-for="branch in availableBranches" :key="branch" :value="branch">
            {{ branch }}
          </option>
        </select>
      </SettingItem>

      <SettingItem label="Update Actions" help="Trigger system update">
        <div class="button-group">
          <button
            class="btn-secondary"
            :disabled="statusRefreshLoading"
            @click="refreshSystemStatus"
          >
            {{ statusRefreshLoading ? "Checking..." : "Check status" }}
          </button>
          <button class="btn-primary" :disabled="updating" @click="handleTriggerUpdate">
            {{ updating ? "Updating..." : "🔄 Trigger Update" }}
          </button>
        </div>
      </SettingItem>

      <div v-if="updateMessage" :class="updateMessageClass" class="update-message">
        {{ updateMessage }}
      </div>

      <div class="health-summary" aria-label="System health summary">
        <div class="status-tile">
          <span class="status-label">Backend API</span>
          <span class="status-pill" :class="backendHealthClass">
            {{ backendHealthLabel }}
          </span>
          <span v-if="backendHealthCheckedAt" class="status-meta">
            {{ formatDateTime(backendHealthCheckedAt) }}
          </span>
        </div>
        <div class="status-tile">
          <span class="status-label">Update state</span>
          <span class="status-pill" :class="updateStatusClass">
            {{ updateStatusLabel }}
          </span>
          <span v-if="updateStatus?.phase" class="status-meta">
            {{ formatPhase(updateStatus.phase) }}
          </span>
        </div>
        <div v-if="updateStatusCheckedAt" class="status-tile">
          <span class="status-label">Last checked</span>
          <span class="status-value">{{ formatDateTime(updateStatusCheckedAt) }}</span>
        </div>
      </div>

      <div v-if="backendHealth?.error" class="update-message warning">
        {{ backendHealth.error }}
      </div>

      <div v-if="updateStatus" class="update-status">
        <SettingItem label="Update Status">
          <div class="status-details">
            <p><strong>Status:</strong> {{ updateStatus.status }}</p>
            <p v-if="updateStatus.phase">
              <strong>Phase:</strong> {{ formatPhase(updateStatus.phase) }}
            </p>
            <p v-if="updateStatus.message"><strong>Message:</strong> {{ updateStatus.message }}</p>
            <p v-if="updateStatus.progress !== undefined">
              <strong>Progress:</strong> {{ updateStatus.progress }}%
            </p>
            <p v-if="updateStatus.started_at">
              <strong>Started:</strong> {{ formatDateTime(updateStatus.started_at) }}
            </p>
            <p v-if="updateStatus.finished_at">
              <strong>Finished:</strong> {{ formatDateTime(updateStatus.finished_at) }}
            </p>
            <p v-if="updateStatus.log_file">
              <strong>Log file:</strong> {{ updateStatus.log_file }}
            </p>
            <p v-if="updateStatus.error"><strong>Error:</strong> {{ updateStatus.error }}</p>
          </div>
        </SettingItem>

        <SettingItem v-if="updateStatus.last_log" label="Latest log output">
          <pre class="update-log">{{ updateStatus.last_log }}</pre>
        </SettingItem>

        <SettingItem
          v-if="updateStatus.current_commit_short || updateStatus.new_commit_short"
          label="Commit info"
        >
          <div class="status-details">
            <p v-if="updateStatus.current_commit_short">
              <strong>Current:</strong>
              {{ updateStatus.current_commit_short }}
              <span v-if="updateStatus.current_commit_msg">
                — {{ updateStatus.current_commit_msg }}
              </span>
            </p>
            <p v-if="updateStatus.new_commit_short">
              <strong>Latest:</strong>
              {{ updateStatus.new_commit_short }}
              <span v-if="updateStatus.new_commit_msg"> — {{ updateStatus.new_commit_msg }} </span>
            </p>
          </div>
        </SettingItem>
      </div>
    </CollapsibleSection>
  </div>
</template>

<script setup>
import { computed, ref, watch, onMounted } from "vue";
import { useSystem } from "@/composables";
import { getGitBranches } from "@/services/configApi";
import CollapsibleSection from "../../shared/CollapsibleSection.vue";
import SettingItem from "../../shared/SettingItem.vue";

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
  updateMessage,
  updateMessageClass,
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

const backendHealthClass = computed(() => ({
  success: backendHealth.value?.status === "healthy",
  error: backendHealth.value?.status === "unhealthy",
  neutral: !backendHealth.value,
}));

const updateStatusLabel = computed(() => {
  if (updateStatusLoading.value) return "Checking";
  return updateStatus.value?.status || "Unknown";
});

const updateStatusClass = computed(() => ({
  success: updateStatus.value?.status === "idle",
  info: updateStatus.value?.status === "running",
  error: updateStatus.value?.status === "error",
  neutral: !updateStatus.value || updateStatus.value?.status === "unknown",
}));

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
.updates-tab {
  width: 100%;
}

.button-group {
  display: flex;
  gap: 0.75rem;
  flex-wrap: wrap;
}

.btn-primary,
.btn-secondary {
  padding: 0.5rem 1rem;
  border-radius: 4px;
  font-size: 0.9rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  min-height: 44px;
  font-family: var(--font-ui);
}

.btn-primary {
  background: var(--focus);
  color: white;
  border: none;
}

.btn-secondary {
  background: var(--bg-2);
  color: var(--ink);
  border: 1px solid var(--line);
}

.btn-primary:hover:not(:disabled) {
  background: var(--focus);
  filter: brightness(1.1);
  transform: translateY(-1px);
  box-shadow: 0 2px 4px var(--shadow);
}

.btn-secondary:hover:not(:disabled) {
  border-color: var(--focus);
}

.btn-primary:focus-visible,
.btn-secondary:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: 2px;
}

.btn-primary:disabled,
.btn-secondary:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.update-message {
  margin-top: 1rem;
  padding: 0.75rem;
  border-radius: 4px;
  font-size: 0.875rem;
}

.update-message.success {
  background: color-mix(in srgb, var(--ok) 10%, transparent);
  border: 1px solid color-mix(in srgb, var(--ok) 30%, transparent);
  color: var(--ok);
}

.update-message.error {
  background: color-mix(in srgb, var(--err) 10%, transparent);
  border: 1px solid color-mix(in srgb, var(--err) 30%, transparent);
  color: var(--err);
}

.update-message.info {
  background: color-mix(in srgb, var(--focus) 10%, transparent);
  border: 1px solid color-mix(in srgb, var(--focus) 30%, transparent);
  color: var(--focus);
}

.update-message.warning {
  background: color-mix(in srgb, var(--warn) 10%, transparent);
  border: 1px solid color-mix(in srgb, var(--warn) 30%, transparent);
  color: var(--warn);
}

.update-status {
  margin-top: 1rem;
}

.health-summary {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 0.75rem;
  margin-top: 1rem;
}

.status-tile {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  min-width: 0;
  padding: 0.75rem;
  background: var(--bg-2);
  border: 1px solid var(--line);
  border-radius: 6px;
}

.status-label,
.status-meta {
  color: var(--ink-2);
  font-size: 0.78rem;
  font-family: var(--font-ui);
}

.status-value {
  color: var(--ink);
  font-size: 0.875rem;
  overflow-wrap: anywhere;
}

.status-pill {
  align-self: flex-start;
  padding: 0.2rem 0.5rem;
  border-radius: 999px;
  font-size: 0.78rem;
  font-weight: 700;
  text-transform: capitalize;
}

.status-pill.success {
  background: color-mix(in srgb, var(--ok) 18%, transparent);
  color: var(--ok);
}

.status-pill.info {
  background: color-mix(in srgb, var(--warn) 18%, transparent);
  color: var(--warn);
}

.status-pill.error {
  background: color-mix(in srgb, var(--err) 18%, transparent);
  color: var(--err);
}

.status-pill.neutral {
  background: var(--bg-2);
  color: var(--ink-2);
}

.status-details {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.status-details p {
  margin: 0;
  font-size: 0.875rem;
  color: var(--ink);
}

.status-details strong {
  color: var(--ink);
}

.update-log {
  max-height: 260px;
  overflow: auto;
  background: var(--bg-2);
  border: 1px solid var(--line);
  border-radius: 4px;
  padding: 0.75rem;
  white-space: pre-wrap;
  font-family: var(--font-data);
  font-size: 0.8rem;
  line-height: 1.25rem;
}
</style>
