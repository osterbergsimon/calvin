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

    <CollapsibleSection title="System" icon="🛠️" :expanded="false">
      <SettingItem label="Restart Backend" help="Restart the backend API server">
        <button class="btn-secondary" @click="openConfirm('backend')">Restart Backend</button>
      </SettingItem>

      <SettingItem label="Restart Frontend" help="Restart the frontend service">
        <button class="btn-secondary" @click="openConfirm('frontend')">Restart Frontend</button>
      </SettingItem>

      <SettingItem label="Reload UI" help="Reload the browser page">
        <button class="btn-secondary" @click="reloadUI">Reload UI</button>
      </SettingItem>
    </CollapsibleSection>

    <ConfirmModal
      :show="showConfirm"
      :title="confirmTitle"
      :message="confirmMessage"
      :confirm-text="confirmButtonText"
      @confirm="handleConfirm"
      @cancel="showConfirm = false"
    />
  </div>
</template>

<script setup>
import { computed, ref, watch, onMounted } from "vue";
import { useSystem } from "@/composables";
import { getGitBranches } from "@/services/configApi";
import CollapsibleSection from "../../shared/CollapsibleSection.vue";
import SettingItem from "../../shared/SettingItem.vue";
import ConfirmModal from "../../shared/ConfirmModal.vue";

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
  restartBackend,
  restartFrontend,
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

// System section — confirm modal state
const showConfirm = ref(false);
const pendingAction = ref(null);
const confirmTitle = ref("");
const confirmMessage = ref("");
const confirmButtonText = ref("Confirm");

const openConfirm = target => {
  if (target === "backend") {
    confirmTitle.value = "Restart Backend";
    confirmMessage.value =
      "Restart the backend server? The display will briefly disconnect.";
    confirmButtonText.value = "Restart";
    pendingAction.value = restartBackend;
  } else if (target === "frontend") {
    confirmTitle.value = "Restart Frontend";
    confirmMessage.value =
      "Restart the frontend service? The page will reload once it comes back.";
    confirmButtonText.value = "Restart";
    pendingAction.value = restartFrontend;
  }
  showConfirm.value = true;
};

const handleConfirm = async () => {
  showConfirm.value = false;
  if (pendingAction.value) {
    await pendingAction.value();
    pendingAction.value = null;
  }
};

const reloadUI = () => {
  window.location.reload();
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
}

.btn-primary {
  background: var(--accent-primary);
  color: white;
  border: none;
}

.btn-secondary {
  background: var(--bg-secondary);
  color: var(--text-primary);
  border: 1px solid var(--border-color);
}

.btn-primary:hover:not(:disabled) {
  background: var(--accent-secondary);
  transform: translateY(-1px);
  box-shadow: 0 2px 4px var(--shadow);
}

.btn-secondary:hover:not(:disabled) {
  border-color: var(--accent-primary);
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
  background: rgba(40, 167, 69, 0.1);
  border: 1px solid rgba(40, 167, 69, 0.3);
  color: #28a745;
}

.update-message.error {
  background: rgba(220, 53, 69, 0.1);
  border: 1px solid rgba(220, 53, 69, 0.3);
  color: #dc3545;
}

.update-message.info {
  background: rgba(23, 162, 184, 0.1);
  border: 1px solid rgba(23, 162, 184, 0.3);
  color: #0c5460;
}

.update-message.warning {
  background: rgba(255, 193, 7, 0.1);
  border: 1px solid rgba(255, 193, 7, 0.3);
  color: #856404;
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
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: 6px;
}

.status-label,
.status-meta {
  color: var(--text-secondary);
  font-size: 0.78rem;
}

.status-value {
  color: var(--text-primary);
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
  background: color-mix(in srgb, var(--accent-secondary) 18%, transparent);
  color: var(--accent-secondary);
}

.status-pill.info {
  background: color-mix(in srgb, var(--accent-primary) 18%, transparent);
  color: var(--accent-primary);
}

.status-pill.error {
  background: color-mix(in srgb, var(--accent-error) 18%, transparent);
  color: var(--accent-error);
}

.status-pill.neutral {
  background: var(--bg-tertiary);
  color: var(--text-secondary);
}

.status-details {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.status-details p {
  margin: 0;
  font-size: 0.875rem;
  color: var(--text-primary);
}

.status-details strong {
  color: var(--text-primary);
}

.update-log {
  max-height: 260px;
  overflow: auto;
  background: rgba(0, 0, 0, 0.05);
  border: 1px solid var(--border-color, rgba(0, 0, 0, 0.1));
  border-radius: 4px;
  padding: 0.75rem;
  white-space: pre-wrap;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 0.8rem;
  line-height: 1.25rem;
}
</style>
