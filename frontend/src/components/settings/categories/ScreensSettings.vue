<!-- frontend/src/components/settings/categories/ScreensSettings.vue -->
<template>
  <ScreensLayout :detail="Boolean(selection)" :narrow="narrow" data-test="screens-category">
    <template #list>
      <div data-test="screens-list">
        <SettingsSection id="screens-list" title="Screens">
          <template #action>
            <Button
              data-test="add-screen-btn"
              :aria-expanded="addOpen ? 'true' : 'false'"
              @click="addOpen = !addOpen"
            >
              {{ addOpen ? "Hide instructions" : "+ Add a screen" }}
            </Button>
          </template>
          <EmptyState
            v-if="kiosks.length === 0"
            compact
            class="screens-empty"
            data-test="screens-empty"
            :icon="mdiMonitorDashboard"
            title="No screens have connected yet"
            help="A screen shows up here once it is set up as a kiosk: a Raspberry Pi installed with the command under “Add a screen”, or any browser that opens the dashboard with ?kiosk=<name> in its address."
          />
          <AddKioskPanel v-if="addOpen" />
          <SettingRow
            v-if="agentKiosks.length > 0"
            class="kiosk-software"
            label="Kiosk software"
            data-test="kiosk-software-summary"
          >
            <template #description>
              <InlineNote data-test="kiosk-software-state">
                <template v-if="manifestChecking">Checking for updates…</template>
                <template v-else-if="availableVersion == null">
                  Couldn't check for kiosk updates. The kiosks keep working.
                </template>
                <template v-else-if="updatingKiosks.length > 0">{{ updatingCopy }}</template>
                <template v-else-if="blocked.length > 0 && behind.length === 0">
                  No kiosk can be updated right now.
                  {{ blocked.length }} {{ blocked.length === 1 ? "needs" : "need" }} a newer OS
                  first.
                </template>
                <template v-else-if="behind.length === 0">
                  All kiosks are up to date ({{ shortVersion(availableVersion) }}).
                </template>
                <template v-else>
                  {{ behindCopy }}
                  {{ shortVersion(availableVersion) }}.
                </template>
              </InlineNote>
            </template>
            <Button
              v-if="manifestChecking === false && availableVersion == null"
              data-test="kiosk-software-retry"
              @click="checkManifest"
            >
              Try again
            </Button>
            <Button
              v-else-if="behind.length > 0"
              data-test="kiosk-software-update-all"
              variant="primary"
              :disabled="updatingKiosks.length > 0"
              @click="updateAll"
            >
              {{ updatingKiosks.length > 0 ? "Updating…" : "Update all" }}
            </Button>
          </SettingRow>

          <div class="screens-list-items">
            <!-- The Default is a screen too, edited on its own page (§2). -->
            <ListRow
              class="screen-card screen-card--default"
              :name="'Default'"
              :selected="defaultOpen"
              data-test="screen-default-card"
              role="button"
              tabindex="0"
              @click="openDefault"
              @keydown.enter="openDefault"
              @keydown.space.prevent="openDefault"
            >
              <template #lead>
                <PageThumbnail
                  :page="startPage(null)"
                  :orientation="orientationFor(null)"
                  data-test="all-screens-thumbnail"
                />
              </template>
              <template #meta>
                <InlineNote>
                  Used by new screens and by browsers that aren't set up as a screen
                </InlineNote>
                <InlineNote data-test="default-summary">{{ defaultSummary }}</InlineNote>
              </template>
            </ListRow>

            <ListRow
              v-for="k in kiosks"
              :key="k.id"
              class="screen-card"
              :name="screenLabel(k)"
              :selected="k.id === selectedId"
              data-test="screen-card"
              role="button"
              tabindex="0"
              @click="select(k.id)"
              @keydown.enter="select(k.id)"
              @keydown.space.prevent="select(k.id)"
            >
              <template #lead>
                <PageThumbnail
                  :page="startPage(k)"
                  :orientation="orientationFor(k)"
                  :aria-label="`${screenLabel(k)} start page`"
                />
              </template>
              <template #meta>
                <InlineNote data-test="screen-id">{{ k.id }}</InlineNote>
                <InlineNote data-test="screen-summary">{{ summaryFor(k) }}</InlineNote>
                <InlineNote
                  v-if="changedSettingCount(k.overrides) > 0"
                  data-test="screen-changed-count"
                >
                  {{ changedSettingCount(k.overrides) }}
                  {{ changedSettingCount(k.overrides) === 1 ? "setting" : "settings" }} changed
                </InlineNote>
                <InlineNote
                  v-if="softwareLine(k)"
                  :tone="softwareTone(k)"
                  data-test="kiosk-version-line"
                >
                  {{ softwareLine(k) }}
                </InlineNote>
              </template>
              <template #actions>
                <Tag data-test="screen-status" :tone="isOnline(k) ? 'ok' : 'neutral'">
                  {{ isOnline(k) ? "Online" : "Offline" }}
                </Tag>
                <Tag
                  v-if="isPending(k)"
                  tone="warn"
                  data-test="kiosk-pending-badge"
                  role="img"
                  :aria-label="`${screenLabel(k)}: offline, display settings waiting`"
                  title="Offline. It will apply the new display settings when it's back."
                  :icon="mdiAlert"
                />
              </template>
            </ListRow>

            <!-- Only on a browser that is not itself a set-up screen (§2). -->
            <ListRow
              v-if="!kioskId"
              class="screen-card screen-card--browser"
              name="This browser"
              :selected="browserOpen"
              data-test="screen-browser-card"
              role="button"
              tabindex="0"
              @click="openBrowser"
              @keydown.enter="openBrowser"
              @keydown.space.prevent="openBrowser"
            >
              <template #meta>
                <InlineNote data-test="browser-summary">{{ browserSummary }}</InlineNote>
              </template>
            </ListRow>
          </div>
        </SettingsSection>
      </div>
    </template>

    <Button variant="link" size="sm" data-test="screens-back" @click="closeDetail">
      ‹ Screens
    </Button>

    <DefaultScreenSettings
      v-if="defaultOpen"
      :config="config"
      @update:config="patch => emit('update:config', patch)"
    />
    <ThisBrowserSettings v-else-if="browserOpen" :config="config" @changed="refreshBrowserCount" />

    <template v-else-if="selectedKiosk">
      <KioskStatusHeader
        :kiosk-id="screenLabel(selectedKiosk)"
        :online="isOnline(selectedKiosk)"
        :last-seen-label="relativeTime(selectedKiosk.lastSeen)"
        :applied-version="selectedKiosk.lastAppliedVersion ?? null"
        :desired-version="desiredVersions[selectedId] ?? null"
        :display-stack="selectedKiosk.displayStack ?? null"
        :agent-version="selectedKiosk.agentVersion ?? null"
      />

      <SettingsSection id="screen-name" title="Name">
        <SettingRow label="Name" description="Shown in this screen's clock bar.">
          <TextField
            input-test="screen-name-input"
            hide-label
            label="Name"
            :model-value="nameDraft"
            :placeholder="namePlaceholder"
            @update:model-value="v => (nameDraft = v)"
            @blur="setName(nameDraft)"
          />
        </SettingRow>
        <InlineNote
          v-if="nameMsg"
          class="screens-saved"
          :tone="toneFor(nameMsg)"
          role="status"
          aria-live="polite"
        >
          {{ nameMsg }}
        </InlineNote>
      </SettingsSection>

      <SettingsSection id="screen-pages" title="Pages">
        <SettingRow label="Pages shown">
          <template #description>
            <InlineNote v-if="pages.length === 1" data-test="only-one-page">
              Only one page so far.
            </InlineNote>
            <ScopeLine
              :overridden="availableOverridden"
              reset-test="reset-screens-shown"
              @reset="resetAvailable"
            />
          </template>
          <Button data-test="edit-pages-btn" @click="editorOpen = true">Edit pages</Button>
        </SettingRow>
        <ListRow
          v-for="page in pages"
          :key="page.id"
          :name="page.name"
          :disabled="!showsPage(page.id)"
          data-test="screen-page-row"
          class="screen-page"
        >
          <template #lead>
            <PageThumbnail
              :page="page"
              :orientation="effOrientation"
              size="page"
              data-test="screen-page-thumbnail"
            />
          </template>
          <template #meta>
            <InlineNote v-if="!showsPage(page.id)">Not shown here</InlineNote>
          </template>
          <template #actions>
            <ToggleSwitch
              :model-value="showsPage(page.id)"
              :aria-label="`Show ${page.name} on this screen`"
              @update:model-value="value => togglePage(page.id, value)"
            />
            <Button
              size="sm"
              :variant="effDefault === page.id ? 'primary' : 'secondary'"
              :aria-pressed="effDefault === page.id ? 'true' : 'false'"
              :icon="effDefault === page.id ? mdiCheck : undefined"
              :disabled="!showsPage(page.id)"
              :aria-label="`Start here: ${page.name}`"
              @click="setDefault(page.id)"
            >
              Start here
            </Button>
          </template>
        </ListRow>
        <SettingRow label="Start page">
          <template #description>
            <ScopeLine
              :overridden="defaultOverridden"
              reset-test="reset-default-screen"
              @reset="resetDefaultScreen"
            />
          </template>
        </SettingRow>
        <InlineNote
          v-if="pagesMsg"
          class="screens-saved"
          :tone="toneFor(pagesMsg)"
          role="status"
          aria-live="polite"
        >
          {{ pagesMsg }}
        </InlineNote>
      </SettingsSection>

      <SettingsSection id="screen-display" title="Display">
        <SettingRow label="Orientation">
          <template #description>
            <ScopeLine
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
            <ScopeLine :overridden="flipOverridden" reset-test="reset-flip" @reset="resetFlip" />
          </template>
          <ToggleSwitch
            :model-value="effFlipped"
            aria-label="Upside down"
            @update:model-value="setFlipped"
          />
        </SettingRow>
        <SettingRow label="Rotate the screen output">
          <template #description>
            <ScopeLine
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
        <Card data-test="screen-live-preview">
          <PageThumbnail
            :page="selectedStartPage"
            :orientation="effOrientation"
            size="live"
            data-test="screen-live-thumbnail"
          />
          <InlineNote>{{ previewCaption }}</InlineNote>
        </Card>
        <InlineNote
          v-if="displayMsg"
          class="screens-saved"
          :tone="toneFor(displayMsg)"
          role="status"
          aria-live="polite"
        >
          {{ displayMsg }}
        </InlineNote>
      </SettingsSection>

      <SettingsSection id="screen-power" title="Power">
        <SettingRow label="Screen on/off schedule">
          <template #description>
            <ScopeLine
              :overridden="scheduleEnabledOverridden"
              reset-test="reset-schedule-enabled"
              @reset="resetScheduleEnabled"
            />
          </template>
          <ToggleSwitch
            :model-value="effScheduleEnabled"
            aria-label="Screen on/off schedule"
            @update:model-value="setScheduleEnabled"
          />
        </SettingRow>
        <DisplayScheduleGrid
          v-if="effScheduleEnabled"
          :model-value="effSchedule || []"
          :week-start="config.weekStartDay ?? 1"
          :time-format="config.timeFormat || '24h'"
          show-scope
          :overridden="scheduleOverridden"
          reset-test="reset-daily-schedule"
          @update:model-value="setSchedule"
          @reset="resetDailySchedule"
        />
        <SettingRow label="Turn off when idle">
          <template #description>
            <ScopeLine
              :overridden="idleOverridden"
              reset-test="reset-idle-timeout"
              @reset="resetIdle"
            />
          </template>
          <SelectPill
            :model-value="idleValue"
            :options="idleOptions"
            aria-label="Turn off when idle"
            @update:model-value="setIdle"
          />
        </SettingRow>
        <SettingRow label="Screen now">
          <template #description>
            <InlineNote data-test="screen-now-state">
              {{ desiredOnNow ? "On now" : "Off now" }}
            </InlineNote>
            <InlineNote v-if="activeOverride" data-test="screen-now-until">
              {{ untilCopy }}
            </InlineNote>
          </template>
          <Button data-test="screen-now-on" :disabled="desiredOnNow" @click="setScreenNow('on')">
            Turn on now
          </Button>
          <Button data-test="screen-now-off" :disabled="!desiredOnNow" @click="setScreenNow('off')">
            Turn off now
          </Button>
          <Button
            v-if="activeOverride"
            variant="link"
            data-test="screen-now-follow"
            @click="followSchedule"
          >
            Follow schedule
          </Button>
        </SettingRow>
        <InlineNote
          v-if="powerMsg"
          class="screens-saved"
          :tone="toneFor(powerMsg)"
          role="status"
          aria-live="polite"
        >
          {{ powerMsg }}
        </InlineNote>
      </SettingsSection>

      <SettingsSection id="screen-touch" title="Touch & keyboard">
        <SettingRow label="Touchscreen">
          <template #description>
            <ScopeLine
              :overridden="touchOverridden"
              reset-test="reset-touchscreen"
              @reset="resetTouch"
            />
          </template>
          <SegmentedControl
            :model-value="effTouch"
            aria-label="Touchscreen"
            :options="[
              { value: 'auto', label: 'Auto' },
              { value: 'on', label: 'On' },
              { value: 'off', label: 'Off' },
            ]"
            @update:model-value="setTouch"
          />
        </SettingRow>
        <SettingRow label="On-screen keyboard">
          <template #description>
            <ScopeLine :overridden="oskOverridden" reset-test="osk-use-shared" @reset="resetOsk" />
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
        <InlineNote
          v-if="touchMsg"
          class="screens-saved"
          :tone="toneFor(touchMsg)"
          role="status"
          aria-live="polite"
        >
          {{ touchMsg }}
        </InlineNote>
      </SettingsSection>

      <SettingsSection id="screen-behaviour" title="Behaviour">
        <ScreenBehaviourRows
          :photo-frame-enabled="behaviour.photoFrameEnabled"
          :photo-frame-timeout="behaviour.photoFrameTimeout"
          :photo-frame-source-ids="behaviour.photoFrameSourceIds"
          :loading-light="behaviour.loadingLight"
          :layout-mode="behaviour.layoutMode"
          :overridden="behaviourOverridden"
          @set="setBehaviour"
          @reset="resetBehaviour"
        />
        <InlineNote
          v-if="behaviourMsg"
          class="screens-saved"
          :tone="toneFor(behaviourMsg)"
          role="status"
          aria-live="polite"
        >
          {{ behaviourMsg }}
        </InlineNote>
      </SettingsSection>

      <SettingsSection id="screen-software" title="Software">
        <SettingRow
          v-if="selectedKiosk.agentVersion != null"
          label="Kiosk software"
          data-test="screen-software-row"
        >
          <template #description>
            <InlineNote data-test="screen-software-state">
              {{ softwareLine(selectedKiosk) }}
            </InlineNote>
            <InlineNote v-if="isUpdateBlocked(selectedKiosk)">
              Reinstall this kiosk with a current Raspberry Pi OS, then update.
            </InlineNote>
          </template>
          <Button
            v-if="showUpdateButton(selectedKiosk) || selectedKiosk.agentUpdateRequested"
            data-test="kiosk-update-btn"
            :loading="selectedKiosk.agentUpdateRequested"
            loading-label="Updating…"
            @click="onUpdate(selectedId)"
          >
            <template v-if="selectedKiosk.agentUpdateRequested">Updating…</template>
            <template v-else-if="hasUpdateError(selectedKiosk)">Try again</template>
            <template v-else>Update</template>
          </Button>
        </SettingRow>
        <SettingRow v-else label="Kiosk software" data-test="screen-software-empty">
          <template #description>
            <InlineNote>
              This screen runs in a browser, so there is no kiosk software to update.
            </InlineNote>
          </template>
        </SettingRow>
      </SettingsSection>

      <!-- Page footer: only when this screen differs from Default (§4). -->
      <Card v-if="selectedChangedCount > 0" data-test="screen-override-footer">
        <InlineNote>
          {{ footerCopy }}
          <template #action>
            <Button data-test="reset-everything" @click="askResetEverything">
              Reset everything to default
            </Button>
            <Button variant="ghost" data-test="use-as-default" @click="askUseAsDefault">
              Use these as the default
            </Button>
          </template>
        </InlineNote>
        <InlineNote v-if="footerMsg" :tone="toneFor(footerMsg)">{{ footerMsg }}</InlineNote>
      </Card>

      <ScreenRegionEditor
        :config="config"
        :open="editorOpen"
        :initial-preview-kiosk="selectedId"
        @update:config="patch => emit('update:config', patch)"
        @close="editorOpen = false"
      />
    </template>

    <ConfirmModal
      :show="confirm.show"
      :title="confirm.title"
      :message="confirm.message"
      :confirm-text="confirm.confirmText"
      :danger="confirm.mode !== 'use-default'"
      @confirm="onConfirm"
      @cancel="confirm.show = false"
    />
  </ScreensLayout>
</template>

<script setup>
import { computed, onMounted, onUnmounted, reactive, ref, watch } from "vue";
import { mdiAlert, mdiCheck } from "@mdi/js";
import { useKiosksStore } from "@/stores/kiosks";
import { useNotificationsStore } from "@/stores/notifications";
import {
  hasUpdateError,
  isUpdateBlocked,
  displayStackLabel,
  isVersionBehind,
  kiosksBehind,
  kiosksBlocked,
  shortVersion,
} from "@/utils/kioskSoftware";
import { normalizeDashboardScreens } from "@/utils/layout";
import { getKioskId } from "@/utils/kioskId";
import { screenLabel, screenLabelFallback } from "@/utils/screenLabel";
import {
  activePowerOverride,
  buildPowerOverride,
  effectiveTimeZone,
  formatUntil,
  scheduleDesiredOn,
} from "@/utils/screenPower";
import {
  changedSettingCount,
  formatSettingList,
  hasOwnSettings,
  useAsDefaultPatch,
  withoutAllOverrides,
  withoutPromotedSettings,
} from "@/utils/screenOverrides";
import { mdiMonitorDashboard } from "@mdi/js";
import Button from "@/components/ui/Button.vue";
import Card from "@/components/ui/Card.vue";
import EmptyState from "@/components/ui/EmptyState.vue";
import InlineNote from "@/components/ui/InlineNote.vue";
import ListRow from "@/components/ui/ListRow.vue";
import ScopeLine from "@/components/ui/ScopeLine.vue";
import SegmentedControl from "@/components/ui/SegmentedControl.vue";
import Tag from "@/components/ui/Tag.vue";
import TextField from "@/components/ui/TextField.vue";
import ToggleSwitch from "@/components/ui/ToggleSwitch.vue";
import SelectPill from "@/components/ui/SelectPill.vue";
import SettingsSection from "@/components/settings/shell/SettingsSection.vue";
import SettingRow from "@/components/settings/shell/SettingRow.vue";
import DisplayScheduleGrid from "@/components/settings/shared/DisplayScheduleGrid.vue";
import AddKioskPanel from "@/components/settings/shared/AddKioskPanel.vue";
import KioskStatusHeader from "@/components/settings/shared/KioskStatusHeader.vue";
import PageThumbnail from "@/components/settings/shared/PageThumbnail.vue";
import ScreenRegionEditor from "@/components/settings/shared/ScreenRegionEditor.vue";
import ScreensLayout from "@/components/settings/shared/ScreensLayout.vue";
import ConfirmModal from "@/components/settings/shared/ConfirmModal.vue";
import DefaultScreenSettings from "@/components/settings/categories/DefaultScreenSettings.vue";
import ThisBrowserSettings from "@/components/settings/categories/ThisBrowserSettings.vue";
import ScreenBehaviourRows from "@/components/settings/shared/ScreenBehaviourRows.vue";

const props = defineProps({
  config: { type: Object, required: true },
  // A ?setting= deep link that lands inside the Default page (§8). The old
  // All-screens destinations keep working: they open Default at that section.
  initialSection: { type: String, default: null },
});
const emit = defineEmits(["update:config"]);

const store = useKiosksStore();
const notifications = useNotificationsStore();
const kiosks = computed(() => store.kiosks);
// A browser that is itself a set-up screen has no "This browser" card: its
// settings are that screen's.
const kioskId = getKioskId();
const addOpen = ref(false);
const availableVersion = ref(null);
const manifestChecking = ref(true);
const desiredVersions = ref({});
const editorOpen = ref(false);

// --- which page is open ----------------------------------------------------
// null (the list) · "default" · "browser" · a screen id on a kiosk selection.
const DEFAULT_SECTION_IDS = new Set([
  "layout",
  "device-power",
  "device-keyboard",
  "device-behaviour",
]);
const selection = ref(
  props.initialSection && DEFAULT_SECTION_IDS.has(props.initialSection) ? { kind: "default" } : null
);
const defaultOpen = computed(() => selection.value?.kind === "default");
const browserOpen = computed(() => selection.value?.kind === "browser");
const selectedId = computed(() => (selection.value?.kind === "screen" ? selection.value.id : null));

// The category is two-pane only where there is room for it (kiosk width):
// list 320px beside the detail. On a phone the list hides while a page is open,
// and ‹ Screens brings it back. Kept in JS (not only a media query) so the
// layout mode is testable without a real viewport.
const NARROW_QUERY = "(max-width: 900px)";
const narrow = ref(false);
let narrowMql = null;
const onNarrowChange = event => {
  narrow.value = event.matches;
};
if (typeof window !== "undefined" && typeof window.matchMedia === "function") {
  narrowMql = window.matchMedia(NARROW_QUERY);
  narrow.value = narrowMql.matches;
  if (typeof narrowMql.addEventListener === "function") {
    narrowMql.addEventListener("change", onNarrowChange);
  } else if (typeof narrowMql.addListener === "function") {
    narrowMql.addListener(onNarrowChange);
  }
}

const nameMsg = ref("");
const pagesMsg = ref("");
const displayMsg = ref("");
const powerMsg = ref("");
const touchMsg = ref("");
const behaviourMsg = ref("");
const footerMsg = ref("");
const overrides = ref({});

// Browser-only choices that make up "{n} settings just for this browser".
const BROWSER_STORAGE_KEYS = ["calvin-touch-controls", "calvin-osk-mode", "calvin-ui-size"];
const browserOverrideCount = ref(0);
function refreshBrowserCount() {
  try {
    browserOverrideCount.value = BROWSER_STORAGE_KEYS.filter(key => {
      const raw = window.localStorage.getItem(key);
      return raw !== null && raw !== "";
    }).length;
  } catch {
    browserOverrideCount.value = 0;
  }
}
const browserSummary = computed(() => {
  const count = browserOverrideCount.value;
  if (!count) return "Same as Default";
  return `${count} setting${count === 1 ? "" : "s"} just for this browser`;
});

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

// --- pages ---------------------------------------------------------------
const catalog = computed(() => normalizeDashboardScreens(props.config.dashboardScreens));
const pages = computed(() => catalog.value.screens);

// A screen shows every page unless it has an explicit allowlist.
function availableIds(k) {
  const list = k?.overrides?.availableScreens;
  if (Array.isArray(list)) return list;
  return pages.value.map(page => page.id);
}
function startPageId(k) {
  const ids = availableIds(k);
  const def = k?.overrides?.defaultScreenId;
  if (def && ids.includes(def)) return def;
  if (catalog.value.activeScreenId && ids.includes(catalog.value.activeScreenId)) {
    return catalog.value.activeScreenId;
  }
  return ids[0] ?? null;
}
function startPage(k) {
  const id = startPageId(k);
  return pages.value.find(page => page.id === id) || pages.value[0] || null;
}

// --- per-screen facts used by the cards and the detail page --------------
function orientationFor(k) {
  return (k ? k.overrides?.orientation : null) ?? props.config.orientation ?? "landscape";
}
function flippedFor(k) {
  return (k ? k.overrides?.orientationFlipped : null) ?? props.config.orientationFlipped ?? false;
}
function scheduleEnabledFor(k) {
  return (k ? k.overrides?.displayScheduleEnabled : null) ?? props.config.displayScheduleEnabled;
}
function scheduleFor(k) {
  return (k ? k.overrides?.displaySchedule : null) ?? props.config.displaySchedule;
}
function scheduleLabel(k) {
  if (!scheduleEnabledFor(k)) return "";
  const days = Array.isArray(scheduleFor(k)) ? scheduleFor(k) : [];
  const day = days.find(entry => entry?.enabled && entry.offTime && entry.onTime);
  return day ? `off ${day.offTime}–${day.onTime}` : "";
}
function idleLabelFor(seconds) {
  if (!seconds) return "Never";
  if (seconds % 3600 === 0) {
    const hours = seconds / 3600;
    return `${hours} hour${hours === 1 ? "" : "s"}`;
  }
  if (seconds % 60 === 0) return `${seconds / 60} min`;
  return `${seconds} s`;
}
function oskLabel(value) {
  if (value === "on") return "Always";
  if (value === "off") return "Never";
  return "Auto";
}
function summaryFor(k) {
  const count = availableIds(k).length;
  const parts = [`${count} page${count === 1 ? "" : "s"}`, orientationFor(k)];
  if (flippedFor(k)) parts.push("upside down");
  const schedule = scheduleLabel(k);
  if (schedule) parts.push(schedule);
  return parts.join(" · ");
}

// --- the Default card -----------------------------------------------------
const defaultSummary = computed(() => {
  const parts = [props.config.orientation || "landscape"];
  if (props.config.orientationFlipped) parts.push("upside down");
  const schedule = scheduleLabel(null);
  if (schedule) parts.push(schedule);
  parts.push(`keyboard ${oskLabel(props.config.onScreenKeyboard)}`);
  const own = kiosks.value.filter(k => hasOwnSettings(k.overrides)).length;
  if (own === 1) parts.push("1 screen has its own settings");
  else if (own > 1) parts.push(`${own} screens have their own settings`);
  return parts.join(" · ");
});

// --- list / detail -------------------------------------------------------
const selectedKiosk = computed(() => kiosks.value.find(k => k.id === selectedId.value) || null);
const selectedChangedCount = computed(() => changedSettingCount(overrides.value));
const selectedName = computed(() => (selectedKiosk.value ? screenLabel(selectedKiosk.value) : ""));
const footerCopy = computed(() => {
  const count = selectedChangedCount.value;
  return `${count} ${count === 1 ? "setting differs" : "settings differ"} from the default.`;
});

function clearMessages() {
  nameMsg.value = "";
  pagesMsg.value = "";
  displayMsg.value = "";
  powerMsg.value = "";
  touchMsg.value = "";
  behaviourMsg.value = "";
  footerMsg.value = "";
}

function openDefault() {
  selection.value = { kind: "default" };
  overrides.value = {};
  editorOpen.value = false;
  clearMessages();
}

function openBrowser() {
  selection.value = { kind: "browser" };
  overrides.value = {};
  editorOpen.value = false;
  clearMessages();
  refreshBrowserCount();
}

async function select(id) {
  selection.value = { kind: "screen", id };
  clearMessages();
  const fetched = await store.fetchOverrides(id);
  // Guard the stale-selection race: clicking screen A then B before A's fetch
  // resolves must not land A's overrides under B's selection (calvin-vk3).
  if (selectedId.value !== id) return;
  overrides.value = fetched;
  await refreshDesiredVersion(id);
}

function closeDetail() {
  selection.value = null;
  overrides.value = {};
  editorOpen.value = false;
  clearMessages();
  refreshBrowserCount();
}

// --- effective values on the selected screen -----------------------------
const nameValue = computed(() => overrides.value.displayName || "");
const nameDraft = ref("");
watch(nameValue, value => (nameDraft.value = value), { immediate: true });
const namePlaceholder = computed(() =>
  selectedKiosk.value ? screenLabelFallback(selectedKiosk.value) : ""
);
function showsPage(pageId) {
  return effAvailable.value.includes(pageId);
}

const availableOverridden = computed(() => "availableScreens" in overrides.value);
const effAvailable = computed(() =>
  Array.isArray(overrides.value.availableScreens)
    ? overrides.value.availableScreens
    : pages.value.map(page => page.id)
);

const defaultOverridden = computed(() => "defaultScreenId" in overrides.value);
const effDefault = computed(() => {
  const ids = effAvailable.value;
  const def = overrides.value.defaultScreenId;
  if (def && ids.includes(def)) return def;
  if (catalog.value.activeScreenId && ids.includes(catalog.value.activeScreenId)) {
    return catalog.value.activeScreenId;
  }
  return ids[0] ?? null;
});
const selectedStartPage = computed(
  () => pages.value.find(page => page.id === effDefault.value) || pages.value[0] || null
);

const orientationOverridden = computed(() => "orientation" in overrides.value);
const flipOverridden = computed(() => "orientationFlipped" in overrides.value);
const applyOverridden = computed(() => "applyDisplayRotation" in overrides.value);

const effOrientation = computed(() =>
  orientationOverridden.value
    ? overrides.value.orientation
    : (props.config.orientation ?? "landscape")
);
const effFlipped = computed(() =>
  flipOverridden.value ? overrides.value.orientationFlipped : props.config.orientationFlipped
);
const effApply = computed(() =>
  applyOverridden.value
    ? overrides.value.applyDisplayRotation
    : (props.config.applyDisplayRotation ?? true)
);
const previewCaption = computed(() => {
  const vp = selectedKiosk.value?.viewport;
  const size = vp && vp.w > 0 && vp.h > 0 ? `${vp.w}×${vp.h}` : "";
  return [selectedStartPage.value?.name || "", size].filter(Boolean).join(" · ");
});

const scheduleEnabledOverridden = computed(() => "displayScheduleEnabled" in overrides.value);
const scheduleOverridden = computed(() => "displaySchedule" in overrides.value);
const effScheduleEnabled = computed(() =>
  scheduleEnabledOverridden.value
    ? overrides.value.displayScheduleEnabled
    : props.config.displayScheduleEnabled
);
const effSchedule = computed(() =>
  scheduleOverridden.value ? overrides.value.displaySchedule : props.config.displaySchedule
);

// "Screen now" (calvin-ydzz): a manual choice that holds only until the first
// schedule boundary after it was set. The agent owns that decision from the
// stored UTC `setAt`; the row re-reads the clock so an expired override stops
// claiming the screen without needing another config change.
const powerTimeZone = computed(() => effectiveTimeZone(props.config));
const nowTick = ref(Date.now());
const now = () => new Date(nowTick.value);
let nowTimer = null;
const activeOverride = computed(() =>
  activePowerOverride(overrides.value.screenNow, {
    enabled: effScheduleEnabled.value,
    schedule: effSchedule.value,
    now: now(),
    timeZone: powerTimeZone.value,
  })
);
const desiredOnNow = computed(() => {
  if (activeOverride.value) return activeOverride.value.power === "on";
  return scheduleDesiredOn({
    enabled: effScheduleEnabled.value,
    schedule: effSchedule.value,
    now: now(),
    timeZone: powerTimeZone.value,
  });
});
const untilCopy = computed(() => {
  const override = activeOverride.value;
  if (!override) return "";
  const state = override.power === "on" ? "On" : "Off";
  // The browser can only show a time when it shares the screen's zone.
  if (override.expiry) return `${state} until ${formatUntil(override.expiry, powerTimeZone.value)}`;
  if (override.hasSchedule) return `${state} until the next scheduled change`;
  return `${state} until you change it`;
});

function setScreenNow(power) {
  const next = {
    ...overrides.value,
    screenNow: buildPowerOverride({ power, now: new Date() }),
  };
  persist(next, powerMsg, APPLIED_BY_AGENT, OFFLINE_COPY);
}

function followSchedule() {
  const next = { ...overrides.value };
  delete next.screenNow;
  persist(next, powerMsg, APPLIED_BY_AGENT, OFFLINE_COPY);
}

const idleOverridden = computed(
  () => "displayTimeoutEnabled" in overrides.value || "displayTimeout" in overrides.value
);
const idleValue = computed(() => {
  const enabled =
    "displayTimeoutEnabled" in overrides.value
      ? overrides.value.displayTimeoutEnabled
      : props.config.displayTimeoutEnabled;
  if (!enabled) return 0;
  const seconds =
    "displayTimeout" in overrides.value
      ? overrides.value.displayTimeout
      : props.config.displayTimeout;
  return Number(seconds) || 0;
});
const IDLE_OPTIONS = [
  { value: 0, label: "Never" },
  { value: 300, label: "5 min" },
  { value: 900, label: "15 min" },
  { value: 1800, label: "30 min" },
  { value: 3600, label: "1 hour" },
  { value: 7200, label: "2 hours" },
];
const idleOptions = computed(() => {
  const current = idleValue.value;
  if (IDLE_OPTIONS.some(option => option.value === current)) return IDLE_OPTIONS;
  return [...IDLE_OPTIONS, { value: current, label: idleLabelFor(current) }].sort(
    (a, b) => a.value - b.value
  );
});

const touchOverridden = computed(() => "touchControls" in overrides.value);
const effTouch = computed(() =>
  touchOverridden.value ? overrides.value.touchControls : (props.config.touchControls ?? "auto")
);

const oskOverridden = computed(() => "onScreenKeyboard" in overrides.value);
const effOsk = computed(() =>
  oskOverridden.value ? overrides.value.onScreenKeyboard : (props.config.onScreenKeyboard ?? "auto")
);

// --- writes --------------------------------------------------------------
async function persist(next, messageRef, onlineCopy, offlineCopy) {
  // Optimistic set with snapshot revert so a failed save doesn't leave the UI
  // showing apparently-applied values under the error banner (calvin-dd9.13).
  const kioskIdToSave = selectedId.value;
  const prior = overrides.value;
  overrides.value = next;
  messageRef.value = "";
  try {
    await store.saveOverrides(kioskIdToSave, next);
    store.setKioskOverrides(kioskIdToSave, next);
    const online = selectedKiosk.value ? isOnline(selectedKiosk.value) : false;
    messageRef.value = online ? onlineCopy : offlineCopy;
    await refreshDesiredVersion(kioskIdToSave);
  } catch {
    if (selectedId.value === kioskIdToSave) overrides.value = prior;
    messageRef.value = "Couldn't save to the server. Check the connection and try again.";
  }
}

const OFFLINE_COPY = "Saved. Changes apply when this screen reconnects.";

// Where a change is applied decides the wait we promise. The kiosk display
// agent polls its merged config every 60 s (DEFAULT_REFRESH_SECONDS in
// deploy/kiosk-agent); the dashboard page polls every 30 s (configPollInterval)
// and applies its own rows itself. Keep one phrase per path.
const APPLIED_BY_AGENT = "Saved. This screen updates within a minute.";
const APPLIED_BY_PAGE = "Saved. This screen updates within 30 seconds.";

function toneFor(message) {
  return message.startsWith("Couldn't") || message.startsWith("Pick ") ? "err" : "ok";
}

function setName(value) {
  const trimmed = value.trim();
  const next = { ...overrides.value };
  if (trimmed) next.displayName = trimmed;
  else delete next.displayName;
  persist(next, nameMsg, APPLIED_BY_PAGE, OFFLINE_COPY);
}

function persistPages(next) {
  persist(next, pagesMsg, APPLIED_BY_PAGE, OFFLINE_COPY);
}

function togglePage(pageId, checked) {
  const ids = new Set(effAvailable.value);
  if (checked) ids.add(pageId);
  else ids.delete(pageId);
  if (ids.size === 0) {
    pagesMsg.value = "Pick at least one page.";
    return;
  }
  const next = { ...overrides.value };
  const allIds = pages.value.map(page => page.id);
  if (ids.size === allIds.length) delete next.availableScreens;
  else next.availableScreens = allIds.filter(id => ids.has(id));
  const effective = "availableScreens" in next ? next.availableScreens : allIds;
  if ("defaultScreenId" in next && !effective.includes(next.defaultScreenId)) {
    delete next.defaultScreenId;
  }
  persistPages(next);
}

function setDefault(pageId) {
  persistPages({ ...overrides.value, defaultScreenId: pageId });
}
function resetAvailable() {
  const next = { ...overrides.value };
  delete next.availableScreens;
  if ("defaultScreenId" in next && !pages.value.some(page => page.id === next.defaultScreenId)) {
    delete next.defaultScreenId;
  }
  persistPages(next);
}
function resetDefaultScreen() {
  const next = { ...overrides.value };
  delete next.defaultScreenId;
  persistPages(next);
}

function persistDisplay(next) {
  persist(next, displayMsg, APPLIED_BY_AGENT, OFFLINE_COPY);
}
function setOrientation(value) {
  persistDisplay({ ...overrides.value, orientation: value });
}
function setFlipped(value) {
  persistDisplay({ ...overrides.value, orientationFlipped: value });
}
function setApply(value) {
  persistDisplay({ ...overrides.value, applyDisplayRotation: value });
}
function resetOrientationRow() {
  const next = { ...overrides.value };
  delete next.orientation;
  persistDisplay(next);
}
function resetFlip() {
  const next = { ...overrides.value };
  delete next.orientationFlipped;
  persistDisplay(next);
}
function resetApply() {
  const next = { ...overrides.value };
  delete next.applyDisplayRotation;
  persistDisplay(next);
}

function persistPower(next) {
  persist(next, powerMsg, APPLIED_BY_AGENT, OFFLINE_COPY);
}
function setScheduleEnabled(value) {
  persistPower({ ...overrides.value, displayScheduleEnabled: value });
}
function setSchedule(value) {
  persistPower({ ...overrides.value, displaySchedule: value });
}
function resetScheduleEnabled() {
  const next = { ...overrides.value };
  delete next.displayScheduleEnabled;
  persistPower(next);
}
function resetDailySchedule() {
  const next = { ...overrides.value };
  delete next.displaySchedule;
  persistPower(next);
}
function setIdle(seconds) {
  const next = { ...overrides.value };
  if (!seconds) {
    next.displayTimeoutEnabled = false;
    delete next.displayTimeout;
  } else {
    next.displayTimeoutEnabled = true;
    next.displayTimeout = seconds;
  }
  persistPower(next);
}
function resetIdle() {
  const next = { ...overrides.value };
  delete next.displayTimeoutEnabled;
  delete next.displayTimeout;
  persistPower(next);
}

function persistTouch(next) {
  persist(next, touchMsg, APPLIED_BY_PAGE, OFFLINE_COPY);
}
function setTouch(value) {
  persistTouch({ ...overrides.value, touchControls: value });
}
function resetTouch() {
  const next = { ...overrides.value };
  delete next.touchControls;
  persistTouch(next);
}
function setOsk(value) {
  persistTouch({ ...overrides.value, onScreenKeyboard: value });
}
function resetOsk() {
  const next = { ...overrides.value };
  delete next.onScreenKeyboard;
  persistTouch(next);
}

// --- Behaviour: photo frame, loading light and layout (§4) -----------------
// These rows moved here from Dashboard › Focus & remote; the keys stay the
// same, so a screen's existing override (or this browser's stored choice) is
// untouched.
const behaviourOverridden = computed(() => ({
  photoFrameEnabled: "photoFrameEnabled" in overrides.value,
  photoFrameTimeout: "photoFrameTimeout" in overrides.value,
  photoFrameSourceIds: "photoFrameSourceIds" in overrides.value,
  loadingLight: "loadingLight" in overrides.value,
  layoutMode: "layoutMode" in overrides.value,
}));

const behaviour = computed(() => ({
  photoFrameEnabled:
    "photoFrameEnabled" in overrides.value
      ? overrides.value.photoFrameEnabled
      : props.config.photoFrameEnabled,
  photoFrameTimeout:
    "photoFrameTimeout" in overrides.value
      ? overrides.value.photoFrameTimeout
      : props.config.photoFrameTimeout,
  photoFrameSourceIds:
    "photoFrameSourceIds" in overrides.value
      ? overrides.value.photoFrameSourceIds
      : props.config.photoFrameSourceIds,
  loadingLight:
    "loadingLight" in overrides.value ? overrides.value.loadingLight : props.config.loadingLight,
  // The global config has no layout mode: Auto is the default.
  layoutMode: "layoutMode" in overrides.value ? overrides.value.layoutMode : "auto",
}));

function persistBehaviour(next) {
  persist(
    next,
    behaviourMsg,
    "Saved. This screen picks up the change at its next check-in (~30s).",
    OFFLINE_COPY
  );
}
function setBehaviour(key, value) {
  persistBehaviour({ ...overrides.value, [key]: value });
}
function resetBehaviour(key) {
  const next = { ...overrides.value };
  delete next[key];
  persistBehaviour(next);
}

// --- footer: reset everything · use these as the default (§4) ------------
const confirm = reactive({ show: false, mode: null, title: "", message: "", confirmText: "" });

function askResetEverything() {
  const count = selectedChangedCount.value;
  confirm.mode = "reset";
  confirm.title = `Reset ${selectedName.value} to the default?`;
  confirm.message = `Its ${count} changed ${count === 1 ? "setting goes" : "settings go"} back to the default. Its name stays.`;
  confirm.confirmText = "Reset";
  confirm.show = true;
}

function askUseAsDefault() {
  const patch = useAsDefaultPatch(overrides.value);
  const list = formatSettingList(Object.keys(patch));
  if (!list) return;
  confirm.mode = "use-default";
  confirm.title = `Make ${selectedName.value}'s settings the default?`;
  confirm.message = `Default and every screen that follows it will use ${selectedName.value}'s ${list}.`;
  confirm.confirmText = "Make default";
  confirm.show = true;
}

async function onConfirm() {
  const mode = confirm.mode;
  confirm.show = false;
  if (mode === "reset") {
    await persist(
      withoutAllOverrides(overrides.value),
      footerMsg,
      "Saved. This screen follows the default again.",
      OFFLINE_COPY
    );
  } else if (mode === "use-default") {
    const patch = useAsDefaultPatch(overrides.value);
    if (Object.keys(patch).length === 0) return;
    emit("update:config", patch);
    await persist(
      withoutPromotedSettings(overrides.value),
      footerMsg,
      "Saved. New screens and screens that follow the default use these settings.",
      OFFLINE_COPY
    );
  }
}

// --- software ------------------------------------------------------------
function showUpdateButton(k) {
  return isVersionBehind(k, availableVersion.value) && !isUpdateBlocked(k);
}
function softwareTone(k) {
  if (isUpdateBlocked(k)) return "warn";
  if (hasUpdateError(k)) return "err";
  return "neutral";
}
function softwareLine(k) {
  if (k?.agentVersion == null) return "";
  // What the kiosk actually runs, beside the agent version (calvin-2ibz).
  const lead = `${displayStackLabel(k)} · `;
  const tone = softwareTone(k);
  if (k.agentUpdateRequested) return `${lead}Updating to ${shortVersion(availableVersion.value)}…`;
  if (tone === "warn") {
    return `${lead}Kiosk software ${shortVersion(k.agentVersion)} · update needs a newer OS`;
  }
  if (tone === "err") {
    return `${lead}Kiosk software ${shortVersion(k.agentVersion)} · last update failed, kept this version`;
  }
  if (availableVersion.value == null) {
    return `${lead}Kiosk software ${shortVersion(k.agentVersion)}`;
  }
  if (!isVersionBehind(k, availableVersion.value)) {
    return `${lead}Kiosk software ${shortVersion(k.agentVersion)} · up to date`;
  }
  return `${lead}Kiosk software ${shortVersion(k.agentVersion)} · ${shortVersion(availableVersion.value)} available`;
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
  const targets = behind.value;
  const results = await Promise.allSettled(targets.map(k => store.triggerUpdate(k.id)));
  results.forEach((result, index) => {
    if (result.status === "rejected") {
      notifications.notify({
        severity: "error",
        eyebrow: "Screens",
        // The name on the card, never the internal id (CLV-63).
        message: `Couldn't start the update on ${screenLabel(targets[index])}.`,
      });
    }
  });
  await store.loadKiosks();
}

// --- presence + versions ------------------------------------------------
const ONLINE_WINDOW_MS = 120000; // 2 minutes

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
async function refreshDesiredVersion(id) {
  const v = await store.fetchDeviceConfigVersion(id);
  if (v) desiredVersions.value = { ...desiredVersions.value, [id]: v };
}

onMounted(async () => {
  nowTimer = window.setInterval(() => {
    nowTick.value = Date.now();
  }, 30000);
  refreshBrowserCount();
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

onUnmounted(() => {
  if (nowTimer !== null) window.clearInterval(nowTimer);
  if (!narrowMql) return;
  if (typeof narrowMql.removeEventListener === "function") {
    narrowMql.removeEventListener("change", onNarrowChange);
  } else if (typeof narrowMql.removeListener === "function") {
    narrowMql.removeListener(onNarrowChange);
  }
});
</script>
