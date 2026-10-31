<template>
  <SettingRow
    label="Update source"
    description="Where Calvin downloads updates from. Leave as is unless you run your own copy."
    stacked
  >
    <TextField
      v-model="localGitRepoUrl"
      label="Update source address"
      input-id="update-source-url"
      placeholder="https://github.com/user/repo.git"
      @blur="handleGitRepoChange"
      @keyup.enter="handleGitRepoChange"
    />
  </SettingRow>

  <SettingRow label="Release channel" description="Which line of updates to follow." stacked>
    <SelectPill
      :model-value="gitBranch"
      :options="availableBranches.map(branch => ({ value: branch, label: branch }))"
      aria-label="Release channel"
      data-test="release-channel"
      @update:model-value="handleGitBranchChange"
    />
  </SettingRow>
</template>

<script setup>
// Where updates come from. These two rows live in System › Advanced (settings
// copy audit §4): a family member never needs them, and search still finds them.
import { ref, watch } from "vue";
import SettingRow from "@/components/settings/shell/SettingRow.vue";
import SelectPill from "@/components/ui/SelectPill.vue";
import TextField from "@/components/ui/TextField.vue";
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

const handleGitBranchChange = value => {
  emit("update:gitBranch", value);
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
