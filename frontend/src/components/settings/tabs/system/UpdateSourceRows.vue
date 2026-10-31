<template>
  <SettingRow
    label="Update source"
    description="Where Calvin downloads updates from. Leave as is unless you run your own copy."
    stacked
  >
    <input
      v-model="localGitRepoUrl"
      class="field-input"
      type="text"
      placeholder="https://github.com/user/repo.git"
      aria-label="Update source address"
      @change="handleGitRepoChange"
      @blur="handleGitRepoChange"
    />
  </SettingRow>

  <SettingRow label="Release channel" description="Which line of updates to follow." stacked>
    <select
      class="field-select"
      :value="gitBranch"
      aria-label="Release channel"
      @change="handleGitBranchChange"
    >
      <option v-for="branch in availableBranches" :key="branch" :value="branch">
        {{ branch }}
      </option>
    </select>
  </SettingRow>
</template>

<script setup>
// Where updates come from. These two rows live in System › Advanced (settings
// copy audit §4): a family member never needs them, and search still finds them.
import { ref, watch } from "vue";
import SettingRow from "@/components/settings/shell/SettingRow.vue";
import { getGitBranches } from "@/services/configApi";

const props = defineProps({
  gitRepoUrl: { type: String, default: "" },
  gitBranch: { type: String, default: "develop" },
});

const emit = defineEmits(["update:gitRepoUrl", "update:gitBranch"]);

const availableBranches = ref([props.gitBranch || "develop"]);
const localGitRepoUrl = ref(props.gitRepoUrl || "");
const lastEmittedGitRepoUrl = ref(props.gitRepoUrl || "");

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

const loadBranches = async () => {
  try {
    const branches = await getGitBranches();
    availableBranches.value = branches.branches || [props.gitBranch || "develop"];
  } catch (error) {
    console.error("Failed to load branches:", error);
  }
};

loadBranches();

watch(
  () => props.gitRepoUrl,
  repoUrl => {
    localGitRepoUrl.value = repoUrl || "";
    lastEmittedGitRepoUrl.value = repoUrl || "";
    if (repoUrl) loadBranches();
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
</style>
