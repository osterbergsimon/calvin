<!-- frontend/src/components/settings/categories/DefaultScreenSettings.vue -->
<template>
  <div class="default-screen-settings" data-test="default-screen-page">
    <ScreensWithOwnSettings :screens="store.kiosks" @open="id => emit('open-screen', id)" />
    <ScreenSectionIndex :sections="sectionIndex" />

    <SettingsSection id="default-pages" title="Pages">
      <SettingRow label="Pages shown">
        <template #description>
          <span
            >The pages browsers and screens that follow Default show. Pages are shared by all
            screens.</span
          >
          <InlineNote v-if="pages.length === 1" data-test="only-one-page">
            Only one page so far.
          </InlineNote>
        </template>
        <Button data-test="default-edit-pages-btn" @click="editorOpen = true">Edit pages</Button>
      </SettingRow>
      <ListRow
        v-for="page in pages"
        :key="page.id"
        :name="page.name"
        :disabled="!showsPage(page.id)"
        data-test="default-page-row"
        class="screen-page"
      >
        <template #lead>
          <PageThumbnail :page="page" :orientation="effOrientation" size="page" />
        </template>
        <template #meta>
          <InlineNote v-if="!showsPage(page.id)">Not shown here</InlineNote>
        </template>
        <template #actions>
          <ToggleSwitch
            :model-value="showsPage(page.id)"
            :aria-label="`Show ${page.name} to browsers and new screens`"
            @update:model-value="value => togglePage(page.id, value)"
          />
          <Button
            size="sm"
            :variant="startPageId === page.id ? 'primary' : 'secondary'"
            :aria-pressed="startPageId === page.id ? 'true' : 'false'"
            :icon="startPageId === page.id ? mdiCheck : undefined"
            :disabled="!showsPage(page.id)"
            :aria-label="`Start here: ${page.name}`"
            @click="setDefaultPage(page.id)"
          >
            Start here
          </Button>
        </template>
      </ListRow>
      <InlineNote v-if="pagesMsg" class="screens-saved" tone="err" role="status" aria-live="polite">
        {{ pagesMsg }}
      </InlineNote>
    </SettingsSection>

    <SettingsSection id="screen-look" title="Look">
      <template v-for="descriptor in visibleLookDescriptors" :key="descriptor.key">
        <ScreenSettingRow
          :descriptor="descriptor"
          :value="look[descriptor.key]"
          :show-scope="false"
          @set="v => emitChange({ [descriptor.key]: v })"
        />
        <DefaultEditNote
          :note="editNote"
          :setting="descriptor.key"
          @change-them-too="changeThemToo"
          @dismiss="dismissNote"
        />
      </template>
    </SettingsSection>

    <SettingsSection id="layout" title="Display">
      <SettingRow
        label="Orientation"
        description="Which way the screen is mounted. Pages & regions decides how regions stack."
      >
        <SegmentedControl
          :model-value="config.orientation"
          :options="[
            { value: 'landscape', label: 'Landscape' },
            { value: 'portrait', label: 'Portrait' },
          ]"
          aria-label="Orientation"
          @update:model-value="v => emitChange({ orientation: v })"
        />
      </SettingRow>
      <DefaultEditNote
        :note="editNote"
        setting="orientation"
        @change-them-too="changeThemToo"
        @dismiss="dismissNote"
      />
      <SettingRow label="Upside down" description="For screens mounted with the cable on top.">
        <ToggleSwitch
          :model-value="config.orientationFlipped"
          aria-label="Upside down"
          @update:model-value="v => emitChange({ orientationFlipped: v })"
        />
      </SettingRow>
      <DefaultEditNote
        :note="editNote"
        setting="orientationFlipped"
        @change-them-too="changeThemToo"
        @dismiss="dismissNote"
      />
      <SettingRow
        label="Rotate the screen output"
        description="On: Calvin turns the Pi's picture itself. Off: leave it to the OS or the screen."
      >
        <ToggleSwitch
          :model-value="config.applyDisplayRotation"
          aria-label="Rotate the screen output"
          @update:model-value="v => emitChange({ applyDisplayRotation: v })"
        />
      </SettingRow>
      <DefaultEditNote
        :note="editNote"
        setting="applyDisplayRotation"
        @change-them-too="changeThemToo"
        @dismiss="dismissNote"
      />
      <template v-for="descriptor in displaySizeDescriptors" :key="descriptor.key">
        <ScreenSettingRow
          :descriptor="descriptor"
          :value="displaySizes[descriptor.key]"
          :show-scope="false"
          @set="v => emitChange({ [descriptor.key]: v })"
        />
        <DefaultEditNote
          :note="editNote"
          :setting="descriptor.key"
          @change-them-too="changeThemToo"
          @dismiss="dismissNote"
        />
      </template>
    </SettingsSection>

    <SettingsSection id="screen-effects" title="Effects & focus">
      <template v-for="descriptor in visibleEffectsDescriptors" :key="descriptor.key">
        <ScreenSettingRow
          :descriptor="descriptor"
          :value="effects[descriptor.key]"
          :show-scope="false"
          :auto-note="descriptor.key === 'effectsLevel' ? defaultEffectsAutoCopy : ''"
          @set="v => emitChange({ [descriptor.key]: v })"
        />
        <DefaultEditNote
          :note="editNote"
          :setting="descriptor.key"
          @change-them-too="changeThemToo"
          @dismiss="dismissNote"
        />
      </template>
    </SettingsSection>

    <SettingsSection id="screen-controls" title="Controls">
      <template v-for="descriptor in visibleControlDescriptors" :key="descriptor.key">
        <ScreenSettingRow
          :descriptor="descriptor"
          :value="controls[descriptor.key]"
          :show-scope="false"
          @set="v => emitChange({ [descriptor.key]: v })"
        />
        <DefaultEditNote
          :note="editNote"
          :setting="descriptor.key"
          @change-them-too="changeThemToo"
          @dismiss="dismissNote"
        />
      </template>
    </SettingsSection>

    <SettingsSection id="device-power" title="Power">
      <SettingRow
        label="Screen on/off schedule"
        description="Turns the screen off and on at set times."
      >
        <ToggleSwitch
          :model-value="config.displayScheduleEnabled"
          aria-label="Screen on/off schedule"
          @update:model-value="v => emitChange({ displayScheduleEnabled: v })"
        />
      </SettingRow>
      <DefaultEditNote
        :note="editNote"
        setting="displayScheduleEnabled"
        @change-them-too="changeThemToo"
        @dismiss="dismissNote"
      />
      <template v-if="config.displayScheduleEnabled">
        <DisplayScheduleGrid
          :model-value="config.displaySchedule || []"
          :week-start="config.weekStartDay ?? 1"
          :time-format="config.timeFormat || '24h'"
          @update:model-value="v => emitChange({ displaySchedule: v })"
        />
        <DefaultEditNote
          :note="editNote"
          setting="displaySchedule"
          @change-them-too="changeThemToo"
          @dismiss="dismissNote"
        />
        <SettingRow label="Timezone">
          <template #description>
            <InlineNote>Used by the schedule.</InlineNote>
            <DefaultOnlyNote />
          </template>
          <SelectPill
            :model-value="config.timezone || SERVER_TIMEZONE"
            :options="timezoneOptions"
            searchable
            search-label="Search timezones"
            @update:model-value="v => emitChange({ timezone: v === SERVER_TIMEZONE ? null : v })"
          />
        </SettingRow>
      </template>

      <SettingRow label="Turn off when idle">
        <SelectPill
          :model-value="idleValue"
          :options="idleOptions"
          aria-label="Turn off when idle"
          @update:model-value="setIdle"
        />
      </SettingRow>
      <DefaultEditNote
        :note="editNote"
        setting="displayTimeout"
        @change-them-too="changeThemToo"
        @dismiss="dismissNote"
      />

      <InlineNote data-test="default-brightness-note">Brightness is set on each screen.</InlineNote>

      <!-- The reboot combo restarts the Pi, so it sits under Power (decision C)
           and no screen can override it. -->
      <div data-test="default-only-reboot">
        <DefaultOnlyNote block />
        <RebootCombo :config="config" @update:config="patch => emitChange(patch)" />
      </div>
    </SettingsSection>

    <SettingsSection id="device-keyboard" title="Touch & keyboard">
      <SettingRow
        label="Touchscreen"
        description="Shows touch buttons: arrows, page dots and close. Auto works for most screens; choose On if a touch panel acts like a mouse."
      >
        <SegmentedControl
          :model-value="config.touchControls || 'auto'"
          :options="[
            { value: 'auto', label: 'Auto' },
            { value: 'on', label: 'On' },
            { value: 'off', label: 'Off' },
          ]"
          aria-label="Touchscreen"
          @update:model-value="v => emitChange({ touchControls: v })"
        />
      </SettingRow>
      <DefaultEditNote
        :note="editNote"
        setting="touchControls"
        @change-them-too="changeThemToo"
        @dismiss="dismissNote"
      />
      <SettingRow
        label="On-screen keyboard"
        description="Auto shows it on touchscreens when you tap a text field."
      >
        <SegmentedControl
          :model-value="config.onScreenKeyboard || 'auto'"
          :options="[
            { value: 'auto', label: 'Auto' },
            { value: 'on', label: 'Always' },
            { value: 'off', label: 'Never' },
          ]"
          aria-label="On-screen keyboard"
          @update:model-value="v => emitChange({ onScreenKeyboard: v })"
        />
      </SettingRow>
      <DefaultEditNote
        :note="editNote"
        setting="onScreenKeyboard"
        @change-them-too="changeThemToo"
        @dismiss="dismissNote"
      />
      <SettingRow label="Keyboard layout" data-test="osk-layout-row">
        <template #description>
          <span>
            The letters the on-screen keyboard uses. Separate from the language Calvin is shown in.
          </span>
          <DefaultOnlyNote />
        </template>
        <div data-test="osk-layout-control" :inert="oskOff ? '' : undefined">
          <SelectPill
            :model-value="mainLayout"
            :options="layoutOptions"
            :display-label="mainLayoutLabel"
            aria-label="Keyboard layout"
            @update:model-value="onLayoutChange"
          />
          <InlineNote v-if="deviceLayout" data-test="osk-device-layout">
            This screen uses {{ oskLayoutName(deviceLayout) }}, chosen on the keyboard.
            <template #action>
              <Button variant="link" size="sm" @click="useDefaultLayout"> Use default </Button>
            </template>
          </InlineNote>
        </div>
      </SettingRow>
      <SettingRow label="Also switch to" stacked data-test="osk-extra-row">
        <template #description>
          <span>{{ extraLayoutsDescription }}</span>
          <DefaultOnlyNote />
        </template>
        <div data-test="osk-extra-control" :inert="oskOff ? '' : undefined">
          <ChipMultiSelect
            :model-value="extraLayouts"
            :options="extraLayoutOptions"
            aria-label="Also switch to"
            @update:model-value="v => emitChange({ oskExtraLayouts: v })"
          />
        </div>
      </SettingRow>
    </SettingsSection>

    <SettingsSection id="device-behaviour" title="Behaviour">
      <template v-for="descriptor in visibleBehaviourDescriptors" :key="descriptor.key">
        <ScreenSettingRow
          :descriptor="descriptor"
          :value="behaviour[descriptor.key]"
          :show-scope="false"
          @set="value => emitChange({ [descriptor.key]: value })"
        />
        <DefaultEditNote
          :note="editNote"
          :setting="descriptor.key"
          @change-them-too="changeThemToo"
          @dismiss="dismissNote"
        />
      </template>
    </SettingsSection>

    <ScreenRegionEditor
      :config="config"
      :open="editorOpen"
      :initial-preview-kiosk="null"
      @update:config="patch => emit('update:config', patch)"
      @close="editorOpen = false"
    />
  </div>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref } from "vue";
import { mdiCheck } from "@mdi/js";
import { useKiosksStore } from "@/stores/kiosks";
import Button from "@/components/ui/Button.vue";
import InlineNote from "@/components/ui/InlineNote.vue";
import ListRow from "@/components/ui/ListRow.vue";
import SettingsSection from "@/components/settings/shell/SettingsSection.vue";
import SettingRow from "@/components/settings/shell/SettingRow.vue";
import DefaultOnlyNote from "@/components/settings/shared/DefaultOnlyNote.vue";
import DefaultEditNote from "@/components/settings/shared/DefaultEditNote.vue";
import ToggleSwitch from "@/components/ui/ToggleSwitch.vue";
import SelectPill from "@/components/ui/SelectPill.vue";
import SegmentedControl from "@/components/ui/SegmentedControl.vue";
import DisplayScheduleGrid from "@/components/settings/shared/DisplayScheduleGrid.vue";
import RebootCombo from "@/components/settings/tabs/layout/keyboard/RebootCombo.vue";
import ChipMultiSelect from "@/components/ui/ChipMultiSelect.vue";
import PageThumbnail from "@/components/settings/shared/PageThumbnail.vue";
import ScreenRegionEditor from "@/components/settings/shared/ScreenRegionEditor.vue";
import ScreenSectionIndex from "@/components/settings/shared/ScreenSectionIndex.vue";
import ScreensWithOwnSettings from "@/components/settings/shared/ScreensWithOwnSettings.vue";
import ScreenSettingRow from "@/components/settings/shared/ScreenSettingRow.vue";
import { effectsLevelLabel, resolveEffectsLevel } from "@/utils/effectsLevel";
import { SERVER_TIMEZONE, buildTimezoneOptions } from "@/utils/timezones";
import { normalizeDashboardScreens } from "@/utils/layout";
import {
  descriptorsForSection,
  screensOverriding,
  visibleDescriptors,
} from "@/utils/screenOverrides";
import { screenLabel } from "@/utils/screenLabel";
import {
  OSK_LAYOUT_CHANGE_EVENT,
  clearStoredOskLayout,
  normalizeOskExtraLayouts,
  oskLayoutName,
  oskLayoutOptions,
  readStoredOskLayout,
  resolveOskMainLayout,
} from "@/utils/oskLayouts";

const props = defineProps({
  config: { type: Object, required: true },
});
const emit = defineEmits(["update:config", "open-screen"]);

// The section index uses the same `section-<id>` anchors the deep links use.
const sectionIndex = [
  { id: "default-pages", label: "Pages" },
  { id: "screen-look", label: "Look" },
  { id: "layout", label: "Display" },
  { id: "screen-effects", label: "Effects & focus" },
  { id: "screen-controls", label: "Controls" },
  { id: "device-power", label: "Power" },
  { id: "device-keyboard", label: "Touch & keyboard" },
  { id: "device-behaviour", label: "Behaviour" },
];

// The household Effects row: Auto means Standard on the screens the home has
// set up, and Full in a plain browser.
const defaultEffectsAutoCopy = `Auto (${effectsLevelLabel(
  resolveEffectsLevel({ level: "auto", kiosk: true })
)} on screens, Full in a browser)`;

const store = useKiosksStore();
const editorOpen = ref(false);
const pagesMsg = ref("");

// --- Default editing vs screens that override the same key ------------------
// Changing a Default row only reaches screens that follow it. When a screen has
// its own value for that key, say so under the row, with a way to change them
// all too (Default-is-a-screen §5).
const editNote = ref(null); // { key, names }
let noteTimer = null;
const NOTE_MS = 10000;

function clearNoteTimer() {
  if (noteTimer !== null) {
    clearTimeout(noteTimer);
    noteTimer = null;
  }
}
function dismissNote() {
  clearNoteTimer();
  editNote.value = null;
}
function showNote(key) {
  const names = screensOverriding(store.kiosks, key).map(screenLabel);
  if (names.length === 0) {
    editNote.value = null;
    clearNoteTimer();
    return;
  }
  editNote.value = { key, names };
  clearNoteTimer();
  noteTimer = setTimeout(dismissNote, NOTE_MS);
}
onUnmounted(clearNoteTimer);

// Every Default write goes through here so the note can name the screens that
// will not pick the change up.
function emitChange(patch) {
  emit("update:config", patch);
  const key = Object.keys(patch || {})[0];
  if (!key) return;
  // The idle row writes two keys; either one means the same note.
  const noteKey = key === "displayTimeoutEnabled" ? "displayTimeout" : key;
  showNote(noteKey);
}

// "Change them too" drops that key from every screen that overrides it.
async function changeThemToo(key) {
  const targets = screensOverriding(store.kiosks, key);
  dismissNote();
  for (const kiosk of targets) {
    const next = { ...(kiosk.overrides || {}) };
    delete next[key];
    try {
      await store.saveOverrides(kiosk.id, next);
      store.setKioskOverrides(kiosk.id, next);
    } catch {
      // Leave the screen as it is; the note can be raised again on the next edit.
    }
  }
}

// --- Pages (global availableScreens / defaultScreenId) ---------------------
const catalog = computed(() => normalizeDashboardScreens(props.config.dashboardScreens));
const pages = computed(() => catalog.value.screens);
const shownPageIds = computed(() =>
  Array.isArray(props.config.availableScreens)
    ? props.config.availableScreens
    : pages.value.map(page => page.id)
);
const showsPage = pageId => shownPageIds.value.includes(pageId);
const startPageId = computed(() => {
  const ids = shownPageIds.value;
  const def = props.config.defaultScreenId;
  if (def && ids.includes(def)) return def;
  if (catalog.value.activeScreenId && ids.includes(catalog.value.activeScreenId)) {
    return catalog.value.activeScreenId;
  }
  return ids[0] ?? null;
});
const effOrientation = computed(() => props.config.orientation ?? "landscape");

function togglePage(pageId, checked) {
  const ids = new Set(shownPageIds.value);
  if (checked) ids.add(pageId);
  else ids.delete(pageId);
  if (ids.size === 0) {
    pagesMsg.value = "Pick at least one page.";
    return;
  }
  const allIds = pages.value.map(page => page.id);
  const patch = {
    availableScreens: ids.size === allIds.length ? null : allIds.filter(id => ids.has(id)),
  };
  if (props.config.defaultScreenId && !ids.has(props.config.defaultScreenId)) {
    patch.defaultScreenId = null;
  }
  pagesMsg.value = "";
  emit("update:config", patch);
}
function setDefaultPage(pageId) {
  pagesMsg.value = "";
  emit("update:config", { defaultScreenId: pageId });
}

// --- Turning the screen off when idle --------------------------------------
const IDLE_OPTIONS = [
  { value: 0, label: "Never" },
  { value: 300, label: "5 min" },
  { value: 900, label: "15 min" },
  { value: 1800, label: "30 min" },
  { value: 3600, label: "1 hour" },
  { value: 7200, label: "2 hours" },
];
const idleLabel = seconds => {
  if (seconds < 60) return `${seconds} s`;
  if (seconds % 3600 === 0) {
    const hours = seconds / 3600;
    return `${hours} hour${hours === 1 ? "" : "s"}`;
  }
  if (seconds % 60 === 0) return `${seconds / 60} min`;
  return `${seconds} s`;
};
const idleValue = computed(() => {
  if (!props.config.displayTimeoutEnabled) return 0;
  return Number(props.config.displayTimeout) || 0;
});
const idleOptions = computed(() => {
  const current = idleValue.value;
  if (IDLE_OPTIONS.some(option => option.value === current)) return IDLE_OPTIONS;
  return [...IDLE_OPTIONS, { value: current, label: idleLabel(current) }].sort(
    (a, b) => a.value - b.value
  );
});
const setIdle = seconds => {
  if (!seconds) {
    emitChange({ displayTimeoutEnabled: false });
    return;
  }
  emitChange({ displayTimeoutEnabled: true, displayTimeout: seconds });
};

// --- On-screen keyboard layout (spec §7, K7) -------------------------------
// The layout is its own setting: never derived from, never changing, the
// language Calvin's UI is shown in. No screen overrides it (§3).
const layoutOptions = oskLayoutOptions();
const oskOff = computed(() => (props.config.onScreenKeyboard || "auto") === "off");
const layoutHint = resolveOskMainLayout(null);
const mainLayout = computed(() => resolveOskMainLayout(props.config.oskLayout ?? layoutHint));
const mainLayoutLabel = computed(() =>
  props.config.oskLayout ? "" : `${oskLayoutName(mainLayout.value)} (suggested)`
);
const extraLayouts = computed(() =>
  normalizeOskExtraLayouts(props.config.oskExtraLayouts ?? [], mainLayout.value)
);
const extraLayoutOptions = computed(() =>
  layoutOptions.filter(option => option.value !== mainLayout.value)
);
const extraLayoutsDescription = computed(
  () =>
    `Adds a key to the keyboard that switches between these and ${oskLayoutName(mainLayout.value)}.`
);
const onLayoutChange = value => {
  emitChange({
    oskLayout: value,
    oskExtraLayouts: extraLayouts.value.filter(id => id !== value),
  });
};

// A layout picked on the keyboard is a device choice, not server config
// (CLV-21 §5). Show it here so its origin is clear, with a way back.
const deviceLayout = ref(readStoredOskLayout());
const refreshDeviceLayout = () => {
  deviceLayout.value = readStoredOskLayout();
};
const useDefaultLayout = () => {
  clearStoredOskLayout();
  refreshDeviceLayout();
};
onMounted(() => window.addEventListener(OSK_LAYOUT_CHANGE_EVENT, refreshDeviceLayout));
onUnmounted(() => window.removeEventListener(OSK_LAYOUT_CHANGE_EVENT, refreshDeviceLayout));

const timezoneOptions = computed(() => buildTimezoneOptions(props.config.timezone));

// --- Look: theme, light or dark and font (settings-scope §7 item 6) --------
// Default is the household value. A screen page writes the same keys into that
// screen's overrides instead, so choosing a look here reaches every screen that
// follows Default and no screen that has its own.
const lookDescriptors = descriptorsForSection("look");
const look = computed(() =>
  Object.fromEntries(
    lookDescriptors.map(descriptor => [
      descriptor.key,
      props.config[descriptor.key] ?? descriptor.defaultValue,
    ])
  )
);
const visibleLookDescriptors = computed(() => visibleDescriptors(lookDescriptors, look.value));

// Display sizes moved in from Dashboard (§7 item 6). The other Display rows
// are older hand-written rows above; these two are descriptor-driven.
const DISPLAY_SIZE_KEYS = ["touchControlSize", "uiSize"];
const displaySizeDescriptors = descriptorsForSection("display").filter(descriptor =>
  DISPLAY_SIZE_KEYS.includes(descriptor.key)
);
const displaySizes = computed(() =>
  Object.fromEntries(
    displaySizeDescriptors.map(descriptor => [
      descriptor.key,
      props.config[descriptor.key] ?? descriptor.defaultValue,
    ])
  )
);

// --- Behaviour: household values (settings-scope §7 items 2–3) --------------
// Default is the household value for these rows. They used to reuse
// useScreenSetting, so a change here wrote this browser's localStorage (or this
// kiosk's own override) and the Default page never changed the household at all
// (F1). Descriptor rows write `update:config` instead; a screen page keeps
// writing its own overrides.
const effectsDescriptors = descriptorsForSection("effects");
const effects = computed(() =>
  Object.fromEntries(
    effectsDescriptors.map(descriptor => [
      descriptor.key,
      props.config[descriptor.key] ?? descriptor.defaultValue,
    ])
  )
);
const visibleEffectsDescriptors = computed(() =>
  visibleDescriptors(effectsDescriptors, effects.value)
);

const controlDescriptors = descriptorsForSection("controls");
const controls = computed(() =>
  Object.fromEntries(
    controlDescriptors.map(descriptor => [
      descriptor.key,
      props.config[descriptor.key] ?? descriptor.defaultValue,
    ])
  )
);
const visibleControlDescriptors = computed(() =>
  visibleDescriptors(controlDescriptors, controls.value)
);

const behaviourDescriptors = descriptorsForSection("behaviour");
// Every Behaviour descriptor reads its household value, so a row added to the
// section (Show each photo for) shows the stored value, not its default.
const behaviour = computed(() =>
  Object.fromEntries(
    behaviourDescriptors.map(descriptor => [
      descriptor.key,
      props.config[descriptor.key] ?? descriptor.defaultValue,
    ])
  )
);
const visibleBehaviourDescriptors = computed(() =>
  visibleDescriptors(behaviourDescriptors, behaviour.value)
);
</script>
