<template>
  <div class="kiosks">
    <SettingsSection id="kiosks-list" title="Kiosks">
      <div class="kiosks__intro">
        <p v-if="kiosks.length === 0" class="kiosks__empty">
          No kiosks have connected yet. A screen shows up here once it is set up as a kiosk: a
          Raspberry Pi installed with the command under “Add kiosk”, or any browser that opens the
          dashboard with <code>?kiosk=&lt;name&gt;</code> in its address.
        </p>
        <button
          type="button"
          class="kiosks__add"
          data-test="add-kiosk-btn"
          :aria-expanded="addOpen ? 'true' : 'false'"
          @click="addOpen = !addOpen"
        >
          {{ addOpen ? "Hide instructions" : "+ Add kiosk" }}
        </button>
      </div>
      <AddKioskPanel v-if="addOpen" />
      <SettingRow
        v-if="agentKiosks.length > 0"
        class="kiosk-software"
        label="Kiosk software"
        data-test="kiosk-software-summary"
      >
        <template #description>
          <p class="kiosk-software__desc" data-test="kiosk-software-state">
            <template v-if="manifestChecking">Checking for updates…</template>
            <template v-else-if="availableVersion == null">
              Couldn't check for kiosk updates. The kiosks keep working.
            </template>
            <template v-else-if="updatingKiosks.length > 0">{{ updatingCopy }}</template>
            <template v-else-if="blocked.length > 0 && behind.length === 0">
              No kiosk can be updated right now.
              {{ blocked.length }} {{ blocked.length === 1 ? "needs" : "need" }} a newer OS first.
            </template>
            <template v-else-if="behind.length === 0">
              All kiosks are up to date (<span class="kiosk-software__v">{{
                shortVersion(availableVersion)
              }}</span
              >).
            </template>
            <template v-else>
              {{ behindCopy }}
              <span class="kiosk-software__v">{{ shortVersion(availableVersion) }}</span
              >.
            </template>
          </p>
        </template>
        <button
          v-if="manifestChecking === false && availableVersion == null"
          type="button"
          class="kiosk-software__btn"
          data-test="kiosk-software-retry"
          @click="checkManifest"
        >
          Try again
        </button>
        <button
          v-else-if="behind.length > 0"
          type="button"
          class="kiosk-software__btn kiosk-software__btn--primary"
          data-test="kiosk-software-update-all"
          :disabled="updatingKiosks.length > 0"
          @click="updateAll"
        >
          {{ updatingKiosks.length > 0 ? "Updating…" : "Update all" }}
        </button>
      </SettingRow>
      <div v-for="k in kiosks" :key="k.id" class="kiosk-row">
        <button
          type="button"
          class="kiosk-card"
          :class="{ 'is-selected': k.id === selectedId }"
          data-test="kiosk-card"
          @click="select(k.id)"
        >
          <span class="kiosk-card__id">{{ k.id }}</span>
          <span class="kiosk-card__meta-end">
            <span
              v-if="isPending(k)"
              class="kiosk-card__badge"
              data-test="kiosk-pending-badge"
              role="img"
              :aria-label="`${k.id}: offline, hardware config not yet applied`"
              title="Offline — this kiosk hasn't applied the current hardware config yet"
              >⚠</span
            >
            <span class="kiosk-card__status" :class="isOnline(k) ? 'is-online' : 'is-offline'">
              {{ isOnline(k) ? "● Online" : "○ Offline" }}
            </span>
          </span>
          <span class="kiosk-card__meta"
            >{{ k.hostname }} · seen {{ relativeTime(k.lastSeen) }}</span
          >
          <span
            v-if="k.agentVersion != null"
            class="kiosk-card__software"
            :class="softwareClass(k)"
            data-test="kiosk-version-line"
          >
            <template v-if="k.agentUpdateRequested">
              Updating to
              <span class="kiosk-card__v">{{ shortVersion(availableVersion) }}</span
              >…
            </template>
            <template v-else-if="isUpdateBlocked(k)">
              Kiosk software <span class="kiosk-card__v">{{ shortVersion(k.agentVersion) }}</span> ·
              update needs a newer OS
            </template>
            <template v-else-if="hasUpdateError(k)">
              Kiosk software <span class="kiosk-card__v">{{ shortVersion(k.agentVersion) }}</span> ·
              last update failed, kept this version
            </template>
            <template v-else-if="availableVersion == null">
              Kiosk software
              <span class="kiosk-card__v">{{ shortVersion(k.agentVersion) }}</span>
            </template>
            <template v-else-if="!isVersionBehind(k, availableVersion)">
              Kiosk software <span class="kiosk-card__v">{{ shortVersion(k.agentVersion) }}</span> ·
              up to date
            </template>
            <template v-else>
              Kiosk software <span class="kiosk-card__v">{{ shortVersion(k.agentVersion) }}</span> ·
              <span class="kiosk-card__v">{{ shortVersion(availableVersion) }}</span> available
            </template>
          </span>
        </button>
        <div v-if="showUpdateRow(k)" class="kiosk-card__update-row">
          <button
            v-if="k.agentUpdateRequested || showUpdateButton(k)"
            type="button"
            class="kiosk-card__update"
            data-test="kiosk-update-btn"
            :disabled="k.agentUpdateRequested"
            @click.stop="onUpdate(k.id)"
          >
            <template v-if="k.agentUpdateRequested">Updating…</template>
            <template v-else-if="hasUpdateError(k)">Try again</template>
            <template v-else>Update</template>
          </button>
          <span v-if="isUpdateBlocked(k)" class="kiosk-card__reinstall">
            Reinstall this kiosk with a current Raspberry Pi OS, then update.
          </span>
        </div>
      </div>
    </SettingsSection>
    <KioskStatusHeader
      v-if="selectedId"
      :kiosk-id="selectedId"
      :online="selectedKiosk() ? isOnline(selectedKiosk()) : false"
      :last-seen-label="relativeTime(selectedKiosk()?.lastSeen)"
      :applied-version="selectedKiosk()?.lastAppliedVersion ?? null"
      :desired-version="desiredVersions[selectedId] ?? null"
    />
    <SettingsSection
      v-if="selectedId"
      id="kiosks-content"
      :title="`${selectedKioskName} · Content`"
    >
      <p v-if="!hasEnoughScreens" class="kiosks__hint">
        Add more pages in Dashboard › Pages & regions to assign different content per kiosk.
      </p>
      <template v-else>
        <SettingRow label="Pages shown">
          <template #description>
            <KioskScope
              :overridden="availableOverridden"
              reset-test="reset-screens-shown"
              @reset="resetAvailable"
            />
          </template>
          <ChipMultiSelect
            :model-value="effAvailable"
            aria-label="Pages shown"
            :options="screenOptions"
            @update:model-value="setAvailable"
          />
        </SettingRow>
        <SettingRow label="Start page">
          <template #description>
            <KioskScope
              :overridden="defaultOverridden"
              reset-test="reset-default-screen"
              @reset="resetDefaultScreen"
            />
          </template>
          <SelectPill
            :model-value="effDefault"
            aria-label="Start page"
            :options="availableOptions"
            @update:model-value="setDefault"
          />
        </SettingRow>
        <button
          type="button"
          class="kiosks__reset"
          data-test="reset-content"
          :disabled="!contentOverridden"
          @click="resetContent"
        >
          Reset content to global
        </button>
        <p v-if="contentMsg" class="kiosks__saved" role="status" aria-live="polite">
          {{ contentMsg }}
        </p>
      </template>
    </SettingsSection>
    <SettingsSection
      v-if="selectedId"
      id="kiosks-schedule"
      :title="`${selectedKioskName} · Screen on/off schedule`"
    >
      <SettingRow label="Screen on/off schedule">
        <template #description>
          <KioskScope
            :overridden="scheduleEnabledOverridden"
            reset-test="reset-schedule-enabled"
            @reset="resetScheduleEnabled"
          />
        </template>
        <ToggleSwitch
          :model-value="effScheduleEnabled"
          aria-label="Power schedule"
          @update:model-value="setScheduleEnabled"
        />
      </SettingRow>
      <SettingRow v-if="effScheduleEnabled" label="Daily schedule">
        <template #description>
          <KioskScope
            :overridden="scheduleOverridden"
            reset-test="reset-daily-schedule"
            @reset="resetDailySchedule"
          />
        </template>
        <DisplayScheduleGrid :model-value="effSchedule || []" @update:model-value="setSchedule" />
      </SettingRow>
      <button
        type="button"
        class="kiosks__reset"
        data-test="reset-schedule"
        :disabled="!anyScheduleOverridden"
        @click="resetSchedule"
      >
        Reset schedule to global
      </button>
      <p v-if="scheduleMsg" class="kiosks__saved" role="status" aria-live="polite">
        {{ scheduleMsg }}
      </p>
    </SettingsSection>
    <CollapsibleSection
      v-if="selectedId"
      title="Display hardware"
      variant="drawer"
      :expanded="hardwareOpen"
      @update:expanded="hardwareOpen = $event"
    >
      <SettingRow label="Orientation">
        <template #description>
          <KioskScope
            :overridden="orientationOverridden"
            reset-test="reset-orientation-row"
            @reset="resetOrientationRow"
          />
        </template>
        <SegmentedControl
          :model-value="effOrientation"
          aria-label="Orientation"
          :options="[
            { value: 'landscape', label: 'Landscape' },
            { value: 'portrait', label: 'Portrait' },
          ]"
          @update:model-value="setOrientation"
        />
      </SettingRow>
      <SettingRow label="Upside down">
        <template #description>
          <KioskScope :overridden="flipOverridden" reset-test="reset-flip" @reset="resetFlip" />
        </template>
        <ToggleSwitch
          :model-value="effFlipped"
          aria-label="Upside down"
          @update:model-value="setFlipped"
        />
      </SettingRow>
      <SettingRow label="Rotate the screen output">
        <template #description>
          <KioskScope
            :overridden="applyOverridden"
            reset-test="reset-apply-rotation"
            @reset="resetApply"
          />
        </template>
        <ToggleSwitch
          :model-value="effApply"
          aria-label="Rotate the screen output"
          @update:model-value="setApply"
        />
      </SettingRow>
      <button
        type="button"
        class="kiosks__reset"
        data-test="reset-orientation"
        :disabled="!orientationOverridden && !flipOverridden && !applyOverridden"
        @click="resetOrientation"
      >
        Reset to global
      </button>
      <p v-if="savedMsg" class="kiosks__saved" role="status" aria-live="polite">{{ savedMsg }}</p>
    </CollapsibleSection>
    <CollapsibleSection
      v-if="selectedId"
      title="Touch & keyboard"
      variant="drawer"
      :expanded="touchKeyboardOpen"
      @update:expanded="touchKeyboardOpen = $event"
    >
      <SettingRow label="On-screen keyboard">
        <template #description>
          <KioskScope
            :overridden="oskOverridden"
            reset-test="osk-use-shared"
            @reset="useSharedOsk"
          />
        </template>
        <SegmentedControl
          :model-value="effOsk"
          aria-label="On-screen keyboard"
          :options="[
            { value: 'auto', label: 'Auto' },
            { value: 'on', label: 'Always' },
            { value: 'off', label: 'Never' },
          ]"
          @update:model-value="setOsk"
        />
      </SettingRow>
      <p v-if="keyboardMsg" class="kiosks__saved" role="status" aria-live="polite">
        {{ keyboardMsg }}
      </p>
    </CollapsibleSection>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from "vue";
import { useKiosksStore } from "@/stores/kiosks";
import { useConfigStore } from "@/stores/config";
import { useNotificationsStore } from "@/stores/notifications";
import {
  hasUpdateError,
  isUpdateBlocked,
  isVersionBehind,
  kiosksBehind,
  kiosksBlocked,
  shortVersion,
} from "@/utils/kioskSoftware";
import SettingsSection from "@/components/settings/shell/SettingsSection.vue";
import SettingRow from "@/components/settings/shell/SettingRow.vue";
import SegmentedControl from "@/components/ui/SegmentedControl.vue";
import ToggleSwitch from "@/components/ui/ToggleSwitch.vue";
import ChipMultiSelect from "@/components/ui/ChipMultiSelect.vue";
import SelectPill from "@/components/ui/SelectPill.vue";
import KioskStatusHeader from "@/components/settings/shared/KioskStatusHeader.vue";
import DisplayScheduleGrid from "@/components/settings/shared/DisplayScheduleGrid.vue";
import CollapsibleSection from "@/components/settings/shared/CollapsibleSection.vue";
import AddKioskPanel from "@/components/settings/shared/AddKioskPanel.vue";
import KioskScope from "@/components/settings/shared/KioskScope.vue";

const store = useKiosksStore();
const config = useConfigStore();
const notifications = useNotificationsStore();
const kiosks = computed(() => store.kiosks);
const selectedId = ref(null);
// Section titles use the screen's own name once one is set, else the install id
// (screens-and-kiosks setup §3.3/§7). The name is the displayName override.
const selectedKioskName = computed(() => overrides.value.displayName || selectedId.value);
const overrides = ref({});
const savedMsg = ref("");
const contentMsg = ref("");
const desiredVersions = ref({});
const hardwareOpen = ref(false);
const touchKeyboardOpen = ref(false);
const keyboardMsg = ref("");
// Open by default on a fresh install, where adding a kiosk is the only next step.
const addOpen = ref(false);
const availableVersion = ref(null);
const manifestChecking = ref(true);

// Browser-only kiosks have no agent; the software rows ignore them entirely.
const agentKiosks = computed(() => kiosks.value.filter(k => k.agentVersion != null));
const behind = computed(() => kiosksBehind(agentKiosks.value, availableVersion.value));
const blocked = computed(() => kiosksBlocked(agentKiosks.value, availableVersion.value));
const updatingKiosks = computed(() => agentKiosks.value.filter(k => k.agentUpdateRequested));

const behindCopy = computed(() =>
  behind.value.length === 1
    ? "1 kiosk can be updated to"
    : `${behind.value.length} of ${agentKiosks.value.length} kiosks can be updated to`
);
const updatingCopy = computed(() =>
  updatingKiosks.value.length === 1
    ? "Updating 1 kiosk… It restarts its screen when done."
    : `Updating ${updatingKiosks.value.length} kiosks… They restart their screen when done.`
);

function showUpdateButton(k) {
  return isVersionBehind(k, availableVersion.value) && !isUpdateBlocked(k);
}

function showUpdateRow(k) {
  return k.agentUpdateRequested || isUpdateBlocked(k) || hasUpdateError(k) || showUpdateButton(k);
}

function softwareClass(k) {
  if (isUpdateBlocked(k)) return "is-warn";
  if (hasUpdateError(k)) return "is-err";
  return "";
}

async function checkManifest() {
  manifestChecking.value = true;
  try {
    availableVersion.value = await store.fetchAvailableAgentVersion();
  } finally {
    manifestChecking.value = false;
  }
}

async function onUpdate(id) {
  await store.triggerUpdate(id);
}

async function updateAll() {
  // Offline kiosks get the request too: the flag waits for their next poll.
  const ids = behind.value.map(k => k.id);
  const results = await Promise.allSettled(ids.map(id => store.triggerUpdate(id)));
  results.forEach((result, index) => {
    if (result.status === "rejected") {
      notifications.notify({
        severity: "error",
        eyebrow: "Kiosks",
        message: `Couldn't start the update on ${ids[index]}.`,
      });
    }
  });
  await store.loadKiosks();
}

const ONLINE_WINDOW_MS = 120000; // 2 minutes

const ORI_KEYS = ["orientation", "orientationFlipped", "applyDisplayRotation"];

const orientationOverridden = computed(() => "orientation" in overrides.value);
const flipOverridden = computed(() => "orientationFlipped" in overrides.value);
const applyOverridden = computed(() => "applyDisplayRotation" in overrides.value);

const effOrientation = computed(() =>
  orientationOverridden.value ? overrides.value.orientation : config.orientation
);
const effFlipped = computed(() =>
  flipOverridden.value ? overrides.value.orientationFlipped : config.orientationFlipped
);
const effApply = computed(() =>
  applyOverridden.value
    ? overrides.value.applyDisplayRotation
    : (config.applyDisplayRotation ?? true)
);

const CONTENT_KEYS = ["availableScreens", "defaultScreenId"];

const screenCatalog = computed(() => config.dashboardScreens?.screens ?? []);
const screenOptions = computed(() =>
  screenCatalog.value.map(s => ({ value: s.id, label: s.name }))
);
const hasEnoughScreens = computed(() => screenCatalog.value.length >= 2);

const availableOverridden = computed(() => "availableScreens" in overrides.value);
const effAvailable = computed(() =>
  availableOverridden.value ? overrides.value.availableScreens : screenCatalog.value.map(s => s.id)
);

async function persistContent(next) {
  // Optimistic set with snapshot revert so a failed save doesn't leave the UI
  // showing apparently-applied values under the error banner (calvin-dd9.13).
  const kioskId = selectedId.value;
  const prior = overrides.value;
  overrides.value = next;
  try {
    await store.saveOverrides(kioskId, next);
    const online = selectedKiosk() ? isOnline(selectedKiosk()) : false;
    contentMsg.value = online
      ? "Saved. This kiosk picks up content changes at its next check-in (~30s)."
      : "Saved. Changes apply when this kiosk reconnects.";
  } catch {
    if (selectedId.value === kioskId) overrides.value = prior;
    contentMsg.value = "Couldn't save to the server. Check the connection and try again.";
  }
}

const defaultOverridden = computed(() => "defaultScreenId" in overrides.value);
const effDefault = computed(() =>
  defaultOverridden.value
    ? overrides.value.defaultScreenId
    : (config.dashboardScreens?.activeScreenId ?? null)
);
const availableOptions = computed(() =>
  screenOptions.value.filter(o => effAvailable.value.includes(o.value))
);

function setDefault(id) {
  persistContent({ ...overrides.value, defaultScreenId: id });
}

const contentOverridden = computed(() => availableOverridden.value || defaultOverridden.value);

function resetContent() {
  const next = { ...overrides.value };
  for (const k of CONTENT_KEYS) delete next[k];
  persistContent(next);
}

function resetAvailable() {
  // Back to every screen. Drop a default that was only valid while some
  // screens were hidden.
  const next = { ...overrides.value };
  delete next.availableScreens;
  if ("defaultScreenId" in next && !screenCatalog.value.some(s => s.id === next.defaultScreenId)) {
    delete next.defaultScreenId;
  }
  persistContent(next);
}

function resetDefaultScreen() {
  const next = { ...overrides.value };
  delete next.defaultScreenId;
  persistContent(next);
}

function setAvailable(ids) {
  if (ids.length === 0) {
    contentMsg.value = "Pick at least one screen, or Reset to show all.";
    return;
  }
  const next = { ...overrides.value };
  const allIds = screenCatalog.value.map(s => s.id);
  if (ids.length === allIds.length) {
    delete next.availableScreens;
  } else {
    next.availableScreens = ids;
  }
  const effIds = "availableScreens" in next ? next.availableScreens : allIds;
  if ("defaultScreenId" in next && !effIds.includes(next.defaultScreenId)) {
    delete next.defaultScreenId;
  }
  persistContent(next);
}

function isPending(k) {
  const desired = desiredVersions.value[k.id];
  return !isOnline(k) && !!desired && k.lastAppliedVersion !== desired;
}

function isOnline(k) {
  if (!k.lastSeen) return false;
  return Date.now() - Date.parse(k.lastSeen) < ONLINE_WINDOW_MS;
}

function relativeTime(iso) {
  if (!iso) return "never";
  const secs = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 1000));
  if (secs < 60) return `${secs}s ago`;
  if (secs < 3600) return `${Math.round(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.round(secs / 3600)}h ago`;
  return `${Math.round(secs / 86400)}d ago`;
}

function selectedKiosk() {
  return kiosks.value.find(k => k.id === selectedId.value);
}

async function refreshDesiredVersion(id) {
  const v = await store.fetchDeviceConfigVersion(id);
  if (v) desiredVersions.value = { ...desiredVersions.value, [id]: v };
}

async function persist(next) {
  // Snapshot + revert on failure (calvin-dd9.13), see persistContent.
  const kioskId = selectedId.value;
  const prior = overrides.value;
  overrides.value = next;
  try {
    await store.saveOverrides(kioskId, next);
    const online = selectedKiosk() ? isOnline(selectedKiosk()) : false;
    savedMsg.value = online
      ? "Saved. This kiosk applies orientation at its next check-in (~30s)."
      : "Saved. Changes apply when this kiosk reconnects.";
    await refreshDesiredVersion(kioskId);
  } catch {
    if (selectedId.value === kioskId) overrides.value = prior;
    savedMsg.value = "Couldn't save to the server. Check the connection and try again.";
  }
}

function setOrientation(value) {
  persist({ ...overrides.value, orientation: value });
}
function setFlipped(value) {
  persist({ ...overrides.value, orientationFlipped: value });
}
function setApply(value) {
  persist({ ...overrides.value, applyDisplayRotation: value });
}

function resetOrientation() {
  const next = { ...overrides.value };
  for (const k of ORI_KEYS) delete next[k];
  persist(next);
}

// One row back to the shared value (the row's "Use the shared setting").
function resetOrientationRow() {
  const next = { ...overrides.value };
  delete next.orientation;
  persist(next);
}
function resetFlip() {
  const next = { ...overrides.value };
  delete next.orientationFlipped;
  persist(next);
}
function resetApply() {
  const next = { ...overrides.value };
  delete next.applyDisplayRotation;
  persist(next);
}

// --- Touch & keyboard: the kiosk's on-screen keyboard mode (CLV-27 §6) ------
const oskOverridden = computed(() => "onScreenKeyboard" in overrides.value);
const effOsk = computed(() =>
  oskOverridden.value ? overrides.value.onScreenKeyboard : (config.onScreenKeyboard ?? "auto")
);

async function persistKeyboard(next) {
  // Snapshot + revert on failure (calvin-dd9.13), see persistContent.
  const kioskId = selectedId.value;
  const prior = overrides.value;
  overrides.value = next;
  try {
    await store.saveOverrides(kioskId, next);
    const online = selectedKiosk() ? isOnline(selectedKiosk()) : false;
    keyboardMsg.value = online
      ? "Saved. This kiosk picks up keyboard changes at its next check-in (~30s)."
      : "Saved. Changes apply when this kiosk reconnects.";
    await refreshDesiredVersion(kioskId);
  } catch {
    if (selectedId.value === kioskId) overrides.value = prior;
    keyboardMsg.value = "Couldn't save to the server. Check the connection and try again.";
  }
}

function setOsk(value) {
  persistKeyboard({ ...overrides.value, onScreenKeyboard: value });
}

function useSharedOsk() {
  const next = { ...overrides.value };
  delete next.onScreenKeyboard;
  persistKeyboard(next);
}

const SCHED_KEYS = ["displayScheduleEnabled", "displaySchedule"];
const scheduleMsg = ref("");

const scheduleEnabledOverridden = computed(() => "displayScheduleEnabled" in overrides.value);
const scheduleOverridden = computed(() => "displaySchedule" in overrides.value);
const anyScheduleOverridden = computed(
  () => scheduleEnabledOverridden.value || scheduleOverridden.value
);
const effScheduleEnabled = computed(() =>
  scheduleEnabledOverridden.value
    ? overrides.value.displayScheduleEnabled
    : config.displayScheduleEnabled
);
const effSchedule = computed(() =>
  scheduleOverridden.value ? overrides.value.displaySchedule : config.displaySchedule
);

async function persistSchedule(next) {
  // Snapshot + revert on failure (calvin-dd9.13), see persistContent.
  const kioskId = selectedId.value;
  const prior = overrides.value;
  overrides.value = next;
  try {
    await store.saveOverrides(kioskId, next);
    const online = selectedKiosk() ? isOnline(selectedKiosk()) : false;
    scheduleMsg.value = online
      ? "Saved. This kiosk applies the schedule at its next check-in (~30s)."
      : "Saved. Changes apply when this kiosk reconnects.";
    await refreshDesiredVersion(kioskId);
  } catch {
    if (selectedId.value === kioskId) overrides.value = prior;
    scheduleMsg.value = "Couldn't save to the server. Check the connection and try again.";
  }
}

function setScheduleEnabled(value) {
  persistSchedule({ ...overrides.value, displayScheduleEnabled: value });
}
function setSchedule(value) {
  persistSchedule({ ...overrides.value, displaySchedule: value });
}
function resetSchedule() {
  const next = { ...overrides.value };
  for (const k of SCHED_KEYS) delete next[k];
  persistSchedule(next);
}
function resetScheduleEnabled() {
  const next = { ...overrides.value };
  delete next.displayScheduleEnabled;
  persistSchedule(next);
}
function resetDailySchedule() {
  const next = { ...overrides.value };
  delete next.displaySchedule;
  persistSchedule(next);
}

async function select(id) {
  selectedId.value = id;
  savedMsg.value = "";
  contentMsg.value = "";
  scheduleMsg.value = "";
  hardwareOpen.value = false;
  touchKeyboardOpen.value = false;
  keyboardMsg.value = "";
  const fetched = await store.fetchOverrides(id);
  // Guard the stale-selection race: clicking kiosk A then B before A's fetch
  // resolves must not land A's overrides under B's selection (calvin-vk3).
  if (selectedId.value !== id) return;
  overrides.value = fetched;
  await refreshDesiredVersion(id);
}

onMounted(async () => {
  await store.loadKiosks();
  if (kiosks.value.length === 0) addOpen.value = true;
  // Fetch all versions concurrently, then commit ONCE — writing the map inside
  // each concurrent callback races (each spreads a stale base, last write wins,
  // dropping entries).
  const [entries] = await Promise.all([
    Promise.all(kiosks.value.map(async k => [k.id, await store.fetchDeviceConfigVersion(k.id)])),
    checkManifest(),
  ]);
  const next = { ...desiredVersions.value };
  for (const [id, v] of entries) if (v) next[id] = v;
  desiredVersions.value = next;
});
</script>

<style scoped>
.kiosks__intro {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  flex-wrap: wrap;
  padding: 0.75rem 1.25rem;
}
.kiosks__empty {
  flex: 1 1 20rem;
  margin: 0;
  opacity: 0.8;
}
.kiosks__add {
  min-height: var(--touch-target);
  padding: 0 1.1rem;
  font-family: var(--font-ui);
  font-weight: 600;
  color: var(--focus-ink);
  background: var(--focus);
  border: 0;
  border-radius: 10px;
  cursor: pointer;
}
.kiosks__hint {
  opacity: 0.7;
  font-size: 0.9em;
}
.kiosk-card {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 4px 12px;
  width: 100%;
  text-align: left;
  padding: 10px 12px;
  border: 1px solid var(--border-color, rgba(255, 255, 255, 0.12));
  border-radius: 10px;
  background: transparent;
  color: inherit;
  cursor: pointer;
}
.kiosk-card.is-selected {
  border-color: var(--accent-color, #6ea8fe);
}
.kiosk-card__id {
  font-weight: 600;
}
.kiosk-card__meta-end {
  justify-self: end;
  display: inline-flex;
  align-items: baseline;
  gap: 6px;
}
.kiosk-card__status {
  font-size: 0.85em;
}
.kiosk-card__status.is-online {
  color: #4ade80;
}
.kiosk-card__status.is-offline {
  color: rgba(255, 255, 255, 0.45);
}
.kiosk-card__badge {
  font-size: 0.85em;
  color: var(--warn);
}
.kiosk-card__meta {
  grid-column: 1 / -1;
  font-size: 0.85em;
  opacity: 0.7;
}
.kiosk-card__software {
  grid-column: 1 / -1;
  font-size: var(--fs-sm);
  color: var(--ink-2);
}
.kiosk-card__software.is-warn {
  color: var(--warn);
}
.kiosk-card__software.is-err {
  color: var(--err);
}
.kiosk-card__v {
  font-family: var(--font-data);
}
.kiosk-card__reinstall {
  font-size: var(--fs-sm);
  color: var(--ink-2);
}
/* Kiosk software summary row (CLV-19). */
.kiosk-software__desc {
  margin: 0.2rem 0 0;
  font-size: 0.85rem;
  line-height: 1.4;
  color: var(--ink-2);
}
.kiosk-software__v {
  font-family: var(--font-data);
}
.kiosk-software__btn {
  min-height: var(--touch-target);
  padding: 0 1rem;
  font-family: var(--font-ui);
  font-size: 0.95rem;
  font-weight: 500;
  color: var(--ink);
  background: var(--bg-2);
  border: 1px solid var(--line);
  border-radius: 10px;
  cursor: pointer;
}
.kiosk-software__btn:hover:not(:disabled) {
  border-color: var(--focus);
}
.kiosk-software__btn--primary {
  color: var(--focus-ink);
  background: var(--focus);
  border-color: var(--focus);
  font-weight: 600;
}
.kiosk-software__btn--primary:hover:not(:disabled) {
  filter: brightness(1.08);
}
.kiosk-software__btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}
.kiosks__reset {
  margin-top: 8px;
  padding: 6px 14px;
  border: 1px solid var(--border-color, rgba(255, 255, 255, 0.12));
  border-radius: 6px;
  background: transparent;
  color: inherit;
  cursor: pointer;
  font-size: 0.9em;
}
.kiosks__reset:disabled {
  opacity: 0.4;
  cursor: default;
}
.kiosks__saved {
  margin-top: 8px;
  font-size: 0.85em;
  opacity: 0.7;
}
.kiosks-osk {
  display: flex;
  align-items: center;
  gap: 1rem;
}
.kiosks__link {
  padding: 0;
  background: none;
  border: none;
  color: var(--ink);
  font-family: var(--font-ui);
  font-size: 0.85rem;
  font-weight: 500;
  text-decoration: underline;
  text-underline-offset: 3px;
  cursor: pointer;
}
.kiosks__link:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: 2px;
}
.kiosk-row {
  margin-bottom: 8px;
}
.kiosk-row .kiosk-card {
  margin-bottom: 0;
}
.kiosk-card__update-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 12px 6px;
}
.kiosk-card__update {
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
}
.kiosk-card__update:hover:not(:disabled) {
  border-color: var(--focus);
}
.kiosk-card__update:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: 2px;
}
.kiosk-card__update:disabled {
  opacity: 0.5;
  cursor: default;
}
/* The summary row stacks its control full-width on phone-sized screens. */
@media (max-width: 480px) {
  .kiosk-software {
    flex-direction: column;
    align-items: stretch;
    gap: 0.75rem;
  }
  .kiosk-software :deep(.setting-row__control) {
    width: 100%;
  }
  .kiosk-software__btn {
    width: 100%;
  }
}
</style>
