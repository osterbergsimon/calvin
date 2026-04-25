<template>
  <div class="updates-tab">
    <CollapsibleSection title="Update Settings" icon="🔄" :expanded="true">
      <SettingItem label="Git Repository URL" help="GitHub repository URL for updates">
        <input
          :value="gitRepoUrl"
          type="text"
          placeholder="https://github.com/user/repo.git"
          @input="handleGitRepoInput"
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
          <button class="btn-primary" :disabled="updating" @click="handleTriggerUpdate">
            {{ updating ? "Updating..." : "🔄 Trigger Update" }}
          </button>
        </div>
      </SettingItem>

      <div v-if="updateMessage" :class="updateMessageClass" class="update-message">
        {{ updateMessage }}
      </div>

      <div v-if="updateStatus" class="update-status">
        <SettingItem label="Update Status">
          <div class="status-details">
            <p><strong>Status:</strong> {{ updateStatus.status }}</p>
            <p v-if="updateStatus.message"><strong>Message:</strong> {{ updateStatus.message }}</p>
            <p v-if="updateStatus.progress !== undefined">
              <strong>Progress:</strong> {{ updateStatus.progress }}%
            </p>
            <p v-if="updateStatus.log_file">
              <strong>Log file:</strong> {{ updateStatus.log_file }}
            </p>
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
import { ref, watch, onMounted } from "vue";
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

const { updating, updateStatus, updateMessage, updateMessageClass, triggerUpdate } = useSystem();

const availableBranches = ref([props.gitBranch || "main"]);

const handleGitRepoInput = event => {
  emit("update:gitRepoUrl", event.target.value);
};

const handleGitBranchChange = () => {
  emit("update:gitBranch", props.gitBranch);
};

const handleTriggerUpdate = async () => {
  await triggerUpdate();
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
});

watch(
  () => props.gitRepoUrl,
  () => {
    if (props.gitRepoUrl) {
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
}

.btn-primary {
  padding: 0.5rem 1rem;
  background: var(--accent-primary);
  color: white;
  border: none;
  border-radius: 4px;
  font-size: 0.9rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-primary:hover:not(:disabled) {
  background: var(--accent-secondary);
  transform: translateY(-1px);
  box-shadow: 0 2px 4px var(--shadow);
}

.btn-primary:disabled {
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
