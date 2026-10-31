<template>
  <div class="backup-settings">
    <SettingsSection id="maintenance-backup" title="Backup">
      <SettingRow
        label="Include plugin packages"
        description="Installed plugins and themes, so a fresh install gets them back without downloading."
      >
        <ToggleSwitch v-model="includePackages" aria-label="Include plugin packages" />
      </SettingRow>
      <SettingRow
        label="Include passwords and API keys"
        description="Without them, sources that need a password come back switched off until you enter it again."
      >
        <ToggleSwitch
          v-model="includeSecrets"
          aria-label="Include passwords and API keys"
          data-test="include-secrets"
        />
      </SettingRow>
      <SettingRow
        label="Include kiosk signing key"
        description="Lets existing kiosks keep accepting updates after a move to a new server. Anyone with the file can sign kiosk updates."
      >
        <ToggleSwitch v-model="includeSigningKey" aria-label="Include kiosk signing key" />
      </SettingRow>
      <SettingRow label="Download a backup">
        <template #description>
          <InlineNote v-if="includeSecrets" tone="warn" data-test="secrets-warning">
            The file will contain passwords and API keys in plain text. Keep it somewhere safe.
          </InlineNote>
          <InlineNote v-if="exportError" tone="err">{{ exportError }}</InlineNote>
        </template>
        <Button
          variant="primary"
          data-test="backup-download"
          :loading="exporting"
          loading-label="Preparing…"
          @click="download"
        >
          Download backup
        </Button>
      </SettingRow>
    </SettingsSection>

    <SettingsSection id="maintenance-restore" title="Restore">
      <SettingRow label="Restore a backup" stacked>
        <template #description>
          <InlineNote>
            Choose a backup file (.zip, or a backup.json). You see what will change before anything
            is written, and the current setup is saved to the backup folder first.
          </InlineNote>
        </template>
        <input
          type="file"
          accept=".zip,.json,application/zip,application/json"
          data-test="restore-file"
          aria-label="Backup file to restore"
          @change="onFile"
        />
        <SegmentedControl
          v-model="mode"
          data-test="restore-mode"
          aria-label="Restore mode"
          :options="[
            { value: 'replace', label: 'Replace' },
            { value: 'merge', label: 'Merge' },
          ]"
        />
        <InlineNote>
          {{
            mode === "replace"
              ? "Replace: this Calvin ends up exactly like the backup. Sources not in it are removed."
              : "Merge: the backup's settings and sources are added; everything else here is kept."
          }}
        </InlineNote>

        <InlineNote v-if="previewing">Checking the file…</InlineNote>
        <InlineNote v-if="restoreError" tone="err" data-test="restore-error">
          {{ restoreError }}
        </InlineNote>

        <Card v-if="plan && !result" data-test="restore-preview">
          <p>
            Made {{ formatDate(plan.created_at) }} on
            <strong>{{ plan.source?.hostname || "an unknown host" }}</strong>
            (Calvin {{ plan.calvin_version || "?" }}).
          </p>
          <ul>
            <li>
              {{ plan.counts.plugin_instances }} sources and services:
              {{ plan.instances.create.length }} new,
              {{ plan.instances.update.length }} updated<span v-if="plan.instances.remove.length"
                >, {{ plan.instances.remove.length }} removed</span
              >
            </li>
            <li>
              {{ plan.counts.config }} settings ({{ plan.config.added }} new,
              {{ plan.config.changed }} changed<span v-if="plan.config.removed"
                >, {{ plan.config.removed }} removed</span
              >)
            </li>
            <li>
              {{ plan.counts.keyboard_mappings }} key bindings, {{ plan.counts.kiosks }} kiosks
            </li>
            <li v-if="plan.packages.install.length || plan.packages.themes_install.length">
              Installs: {{ [...plan.packages.install, ...plan.packages.themes_install].join(", ") }}
            </li>
            <li v-if="plan.stripped_secrets.length">
              Made without passwords: {{ plan.stripped_secrets.length }} to re-enter after restore
            </li>
          </ul>
          <ul v-if="plan.warnings.length">
            <li v-for="w in plan.warnings" :key="w">
              <InlineNote tone="warn">{{ w }}</InlineNote>
            </li>
          </ul>
          <SettingRow
            v-if="plan.signing_key"
            label="Also restore the kiosk signing key"
            description="Only when this server replaces the one the backup came from."
          >
            <ToggleSwitch
              v-model="restoreSigningKey"
              aria-label="Also restore the kiosk signing key"
              data-test="restore-signing-key"
            />
          </SettingRow>
          <Button
            variant="primary"
            data-test="restore-start"
            :loading="restoring"
            loading-label="Restoring…"
            @click="confirmOpen = true"
          >
            Restore this backup
          </Button>
        </Card>

        <Card v-if="result" data-test="restore-result">
          <p>
            <strong>Restored.</strong> {{ result.instances.created.length }} created,
            {{ result.instances.updated.length }} updated,
            {{ result.instances.removed.length }} removed.
          </p>
          <InlineNote v-if="result.safety_backup">
            The previous setup was saved as {{ result.safety_backup }}.
          </InlineNote>
          <InlineNote v-if="result.needs_credentials.length" tone="warn">
            Switched off until you enter their passwords again:
            {{ result.needs_credentials.join(", ") }}
          </InlineNote>
          <ul v-if="result.warnings.length || result.errors.length">
            <li v-for="e in result.errors" :key="'e' + e">
              <InlineNote tone="err">{{ e }}</InlineNote>
            </li>
            <li v-for="w in result.warnings" :key="'w' + w">
              <InlineNote tone="warn">{{ w }}</InlineNote>
            </li>
          </ul>
          <Button variant="primary" data-test="restore-reload" @click="reload()">
            Reload Calvin
          </Button>
        </Card>
      </SettingRow>
    </SettingsSection>

    <SettingsSection id="maintenance-auto-backup" title="Automatic backups">
      <template #action>
        <Button :disabled="saving" :loading="saving" loading-label="Saving…" @click="saveNow">
          Save a backup now
        </Button>
      </template>
      <SettingRow
        label="Automatic backups"
        description="Saves a backup to the backup folder on this server at a regular interval."
      >
        <ToggleSwitch
          :model-value="schedule.enabled"
          aria-label="Automatic backups"
          data-test="auto-backup-toggle"
          @update:model-value="v => saveSchedule({ enabled: v })"
        />
      </SettingRow>
      <SettingRow v-if="schedule.enabled" label="Back up every">
        <NumberStepper
          :model-value="schedule.interval_hours"
          :min="1"
          :max="720"
          unit=" hours"
          aria-label="Back up every, in hours"
          @update:model-value="v => saveSchedule({ interval_hours: v })"
        />
      </SettingRow>
      <SettingRow v-if="schedule.enabled" label="Keep the last">
        <NumberStepper
          :model-value="schedule.retention"
          :min="1"
          :max="365"
          unit=" backups"
          aria-label="Keep the last, in backups"
          @update:model-value="v => saveSchedule({ retention: v })"
        />
      </SettingRow>
      <SettingRow
        label="Stored backups"
        :description="`Stored in ${directory || 'the backup folder'}`"
        stacked
      >
        <ul>
          <li v-for="f in files" :key="f.name" data-test="stored-backup">
            <a :href="`/api/backup/files/${encodeURIComponent(f.name)}`" download>{{ f.name }}</a>
            <InlineNote>{{ formatSize(f.size) }} · {{ formatDate(f.modified) }}</InlineNote>
          </li>
          <li v-if="!files.length">
            <InlineNote>No stored backups yet.</InlineNote>
          </li>
        </ul>
      </SettingRow>
    </SettingsSection>

    <ConfirmModal
      :show="confirmOpen"
      title="Restore this backup?"
      :message="
        mode === 'replace'
          ? 'This Calvin will be changed to match the backup. Sources not in the backup are removed.'
          : 'The backup will be merged into this Calvin.'
      "
      confirm-text="Restore"
      :danger="true"
      @confirm="runRestore"
      @cancel="confirmOpen = false"
    />
  </div>
</template>

<script setup>
import { onMounted, reactive, ref, watch } from "vue";
import { useBackupStore } from "@/stores/backup";
import { logError } from "@/utils/logger";
import Button from "@/components/ui/Button.vue";
import Card from "@/components/ui/Card.vue";
import InlineNote from "@/components/ui/InlineNote.vue";
import SettingsSection from "@/components/settings/shell/SettingsSection.vue";
import SettingRow from "@/components/settings/shell/SettingRow.vue";
import ToggleSwitch from "@/components/ui/ToggleSwitch.vue";
import SegmentedControl from "@/components/ui/SegmentedControl.vue";
import NumberStepper from "@/components/ui/NumberStepper.vue";
import ConfirmModal from "@/components/settings/shared/ConfirmModal.vue";

const props = defineProps({
  // Injectable for tests; default to the browser's download and reload.
  saveBlob: {
    type: Function,
    default: (blob, filename) => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    },
  },
  reload: { type: Function, default: () => window.location.reload() },
});

const store = useBackupStore();

const includePackages = ref(true);
const includeSecrets = ref(true);
const includeSigningKey = ref(false);
const exporting = ref(false);
const exportError = ref("");

const file = ref(null);
const mode = ref("replace");
const plan = ref(null);
const result = ref(null);
const previewing = ref(false);
const restoring = ref(false);
const restoreError = ref("");
const restoreSigningKey = ref(false);
const confirmOpen = ref(false);

const schedule = reactive({ enabled: false, interval_hours: 24, retention: 7 });
const files = ref([]);
const directory = ref("");
const saving = ref(false);

const detail = (err, fallback) => err?.response?.data?.detail || fallback;

async function download() {
  exporting.value = true;
  exportError.value = "";
  try {
    const { blob, filename } = await store.exportBackup({
      includePackages: includePackages.value,
      includeSecrets: includeSecrets.value,
      includeSigningKey: includeSigningKey.value,
    });
    props.saveBlob(blob, filename);
  } catch (err) {
    exportError.value = detail(err, "Could not create the backup.");
    logError("[BackupSettings]", "export failed", err);
  } finally {
    exporting.value = false;
  }
}

async function preview() {
  if (!file.value) return;
  previewing.value = true;
  restoreError.value = "";
  plan.value = null;
  result.value = null;
  try {
    plan.value = await store.previewRestore(file.value, mode.value);
  } catch (err) {
    restoreError.value = detail(err, "This file could not be read as a Calvin backup.");
    logError("[BackupSettings]", "preview failed", err);
  } finally {
    previewing.value = false;
  }
}

function onFile(event) {
  file.value = event.target.files?.[0] || null;
  restoreSigningKey.value = false;
  preview();
}

watch(mode, preview);

async function runRestore() {
  confirmOpen.value = false;
  restoring.value = true;
  restoreError.value = "";
  try {
    result.value = await store.restore(file.value, mode.value, restoreSigningKey.value);
    loadFiles();
  } catch (err) {
    restoreError.value = detail(err, "The restore failed.");
    logError("[BackupSettings]", "restore failed", err);
  } finally {
    restoring.value = false;
  }
}

async function loadFiles() {
  try {
    const data = await store.listFiles();
    files.value = data.files || [];
    directory.value = data.directory || "";
  } catch (err) {
    logError("[BackupSettings]", "listing backups failed", err);
  }
}

async function saveSchedule(change) {
  const previous = { ...schedule };
  Object.assign(schedule, change);
  try {
    Object.assign(schedule, await store.saveSchedule({ ...schedule }));
  } catch (err) {
    Object.assign(schedule, previous);
    logError("[BackupSettings]", "saving schedule failed", err);
  }
}

async function saveNow() {
  saving.value = true;
  try {
    await store.createFile();
    await loadFiles();
  } catch (err) {
    logError("[BackupSettings]", "saving backup failed", err);
  } finally {
    saving.value = false;
  }
}

const formatDate = iso => (iso ? new Date(iso).toLocaleString() : "at an unknown time");
const formatSize = bytes =>
  bytes >= 1024 * 1024
    ? `${(bytes / 1024 / 1024).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`;

onMounted(async () => {
  try {
    Object.assign(schedule, await store.fetchSchedule());
  } catch (err) {
    logError("[BackupSettings]", "loading schedule failed", err);
  }
  loadFiles();
});
</script>
