<!-- frontend/src/components/settings/categories/ScreensSettings.vue -->
<template>
  <div
    class="screens"
    :class="{
      'screens--detail': Boolean(selection),
      'screens--two-pane': Boolean(selection) && !narrow,
      'screens--single-pane': Boolean(selection) && narrow,
    }"
    data-test="screens-category"
  >
    <!-- LIST: Default, every screen, then This browser -->
    <div class="screens__list" data-test="screens-list">
      <SettingsSection id="screens-list" title="Screens">
        <template #action>
          <button
            type="button"
            class="screens__add"
            data-test="add-screen-btn"
            :aria-expanded="addOpen ? 'true' : 'false'"
            @click="addOpen = !addOpen"
          >
            {{ addOpen ? "Hide instructions" : "+ Add a screen" }}
          </button>
        </template>
        <p
          v-if="kiosks.length === 0"
          class="screens__empty screens__intro"
          data-test="screens-empty"
        >
          No screens have connected yet. A screen shows up here once it is set up as a kiosk: a
          Raspberry Pi installed with the command under “Add a screen”, or any browser that opens
          the dashboard with <code>?kiosk=&lt;name&gt;</code> in its address.
        </p>
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

        <div class="screens__cards">
          <!-- The Default is a screen too, edited on its own page (§2). -->
          <button
            type="button"
            class="screen-card screen-card--default"
            :class="{ 'is-selected': defaultOpen }"
            data-test="screen-default-card"
            @click="openDefault"
          >
            <PageThumbnail
              :page="startPage(null)"
              :orientation="orientationFor(null)"
              data-test="all-screens-thumbnail"
            />
            <div class="screen-card__body">
              <span class="screen-card__name" data-test="default-title">Default</span>
              <span class="screen-card__summary"
                >Used by new screens and by browsers that aren't set up as a screen</span
              >
              <span class="screen-card__meta" data-test="default-summary">{{
                defaultSummary
              }}</span>
            </div>
          </button>

          <button
            v-for="k in kiosks"
            :key="k.id"
            type="button"
            class="screen-card"
            :class="{ 'is-selected': k.id === selectedId }"
            data-test="screen-card"
            @click="select(k.id)"
          >
            <PageThumbnail
              :page="startPage(k)"
              :orientation="orientationFor(k)"
              :aria-label="`${nameFor(k)} start page`"
            />
            <div class="screen-card__body">
              <span class="screen-card__name">
                {{ nameFor(k) }}
                <span
                  class="screen-card__status"
                  :class="isOnline(k) ? 'is-online' : 'is-offline'"
                  data-test="screen-status"
                >
                  {{ isOnline(k) ? "● Online" : "○ Offline" }}
                </span>
                <Tag
                  v-if="isPending(k)"
                  class="screen-card__badge"
                  tone="warn"
                  data-test="kiosk-pending-badge"
                  role="img"
                  :aria-label="`${k.id}: offline, hardware config not yet applied`"
                  title="Offline — this screen hasn't applied the current hardware config yet"
                  >⚠</Tag
                >
              </span>
              <span class="screen-card__id" data-test="screen-id">{{ k.id }}</span>
              <span class="screen-card__meta" data-test="screen-summary">{{ summaryFor(k) }}</span>
              <span
                v-if="changedSettingCount(k.overrides) > 0"
                class="screen-card__changed"
                data-test="screen-changed-count"
                >{{ changedSettingCount(k.overrides) }}
                {{ changedSettingCount(k.overrides) === 1 ? "setting" : "settings" }} changed</span
              >
              <span
                v-if="k.agentVersion != null"
                class="screen-card__software"
                :class="softwareClass(k)"
                data-test="kiosk-version-line"
              >
                <template v-if="k.agentUpdateRequested">
                  Updating to
                  <span class="screen-card__v">{{ shortVersion(availableVersion) }}</span
                  >…
                </template>
                <template v-else-if="isUpdateBlocked(k)">
                  Kiosk software
                  <span class="screen-card__v">{{ shortVersion(k.agentVersion) }}</span>
                  · update needs a newer OS
                </template>
                <template v-else-if="hasUpdateError(k)">
                  Kiosk software
                  <span class="screen-card__v">{{ shortVersion(k.agentVersion) }}</span>
                  · last update failed, kept this version
                </template>
                <template v-else-if="availableVersion == null">
                  Kiosk software
                  <span class="screen-card__v">{{ shortVersion(k.agentVersion) }}</span>
                </template>
                <template v-else-if="!isVersionBehind(k, availableVersion)">
                  Kiosk software
                  <span class="screen-card__v">{{ shortVersion(k.agentVersion) }}</span>
                  · up to date
                </template>
                <template v-else>
                  Kiosk software
                  <span class="screen-card__v">{{ shortVersion(k.agentVersion) }}</span>
                  ·
                  <span class="screen-card__v">{{ shortVersion(availableVersion) }}</span> available
                </template>
              </span>
            </div>
          </button>

          <!-- Only on a browser that is not itself a set-up screen (§2). -->
          <button
            v-if="!kioskId"
            type="button"
            class="screen-card screen-card--browser"
            :class="{ 'is-selected': browserOpen }"
            data-test="screen-browser-card"
            @click="openBrowser"
          >
            <div class="screen-card__body">
              <span class="screen-card__name" data-test="browser-title">This browser</span>
              <span class="screen-card__meta" data-test="browser-summary">{{
                browserSummary
              }}</span>
            </div>
          </button>
        </div>
      </SettingsSection>
    </div>

    <!-- DETAIL: Default, one screen, or this browser -->
    <div v-if="selection" class="screens__detail" data-test="screens-detail">
      <button type="button" class="screens__back" data-test="screens-back" @click="closeDetail">
        ‹ Screens
      </button>

      <DefaultScreenSettings
        v-if="defaultOpen"
        :config="config"
        @update:config="patch => emit('update:config', patch)"
      />
      <ThisBrowserSettings
        v-else-if="browserOpen"
        :config="config"
        @changed="refreshBrowserCount"
      />

      <template v-else-if="selectedKiosk">
        <KioskStatusHeader
          :kiosk-id="nameFor(selectedKiosk)"
          :online="isOnline(selectedKiosk)"
          :last-seen-label="relativeTime(selectedKiosk.lastSeen)"
          :applied-version="selectedKiosk.lastAppliedVersion ?? null"
          :desired-version="desiredVersions[selectedId] ?? null"
        />

        <SettingsSection id="screen-name" title="Name">
          <SettingRow label="Name" description="Shown in this screen's clock bar.">
            <input
              class="screen-name-input"
              type="text"
              data-test="screen-name-input"
              :value="nameValue"
              :placeholder="namePlaceholder"
              aria-label="Name"
              @change="e => setName(e.target.value)"
            />
          </SettingRow>
          <p v-if="nameMsg" class="screens__saved" role="status" aria-live="polite">
            {{ nameMsg }}
          </p>
        </SettingsSection>

        <SettingsSection id="screen-pages" title="Pages">
          <div class="screen-pages__head">
            <div class="screen-pages__meta">
              <p v-if="pages.length === 1" class="screen-pages__hint" data-test="only-one-page">
                Only one page so far.
              </p>
              <p class="screen-pages__scope-label">Pages shown</p>
              <KioskScope
                :overridden="availableOverridden"
                reset-test="reset-screens-shown"
                @reset="resetAvailable"
              />
            </div>
            <button
              type="button"
              class="screen-pages__edit"
              data-test="edit-pages-btn"
              @click="editorOpen = true"
            >
              Edit pages
            </button>
          </div>
          <div
            v-for="page in pages"
            :key="page.id"
            class="screen-page"
            :class="{ 'is-hidden-page': !showsPage(page.id) }"
            data-test="screen-page-row"
          >
            <label class="screen-page__show">
              <input
                type="checkbox"
                :checked="showsPage(page.id)"
                :aria-label="`Show ${page.name} on this screen`"
                @change="e => togglePage(page.id, e.target.checked)"
              />
              <span>Show</span>
            </label>
            <PageThumbnail
              :page="page"
              :orientation="effOrientation"
              size="page"
              data-test="screen-page-thumbnail"
            />
            <span class="screen-page__body">
              <span class="screen-page__name">{{ page.name }}</span>
              <span v-if="!showsPage(page.id)" class="screen-page__not-shown">Not shown here</span>
            </span>
            <label class="screen-page__start">
              <input
                type="radio"
                name="screens-start-page"
                :checked="effDefault === page.id"
                :disabled="!showsPage(page.id)"
                :aria-label="`Start on ${page.name}`"
                @change="setDefault(page.id)"
              />
              <span>Start here</span>
            </label>
          </div>
          <div class="screen-pages__start-scope">
            <span class="screen-pages__scope-label">Start page</span>
            <KioskScope
              :overridden="defaultOverridden"
              reset-test="reset-default-screen"
              @reset="resetDefaultScreen"
            />
          </div>
          <p v-if="pagesMsg" class="screens__saved" role="status" aria-live="polite">
            {{ pagesMsg }}
          </p>
        </SettingsSection>

        <div class="screen-detail__grid">
          <SettingsSection id="screen-display" title="Display">
            <div class="screen-display">
              <div class="screen-display__rows">
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
                    <KioskScope
                      :overridden="flipOverridden"
                      reset-test="reset-flip"
                      @reset="resetFlip"
                    />
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
              </div>
              <div class="screen-display__preview" data-test="screen-live-preview">
                <PageThumbnail
                  :page="selectedStartPage"
                  :orientation="effOrientation"
                  size="live"
                  data-test="screen-live-thumbnail"
                />
                <span class="screen-display__caption">{{ previewCaption }}</span>
              </div>
            </div>
            <p v-if="displayMsg" class="screens__saved" role="status" aria-live="polite">
              {{ displayMsg }}
            </p>
          </SettingsSection>

          <SettingsSection id="screen-power" title="Power">
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
                aria-label="Screen on/off schedule"
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
              <DisplayScheduleGrid
                :model-value="effSchedule || []"
                @update:model-value="setSchedule"
              />
            </SettingRow>
            <SettingRow label="Turn off when idle">
              <template #description>
                <KioskScope
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
            <p v-if="powerMsg" class="screens__saved" role="status" aria-live="polite">
              {{ powerMsg }}
            </p>
          </SettingsSection>

          <SettingsSection id="screen-touch" title="Touch & keyboard">
            <SettingRow label="Touchscreen">
              <template #description>
                <KioskScope
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
                <KioskScope
                  :overridden="oskOverridden"
                  reset-test="osk-use-shared"
                  @reset="resetOsk"
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
            <p v-if="touchMsg" class="screens__saved" role="status" aria-live="polite">
              {{ touchMsg }}
            </p>
          </SettingsSection>
        </div>

        <SettingsSection id="screen-software" title="Software">
          <SettingRow
            v-if="selectedKiosk.agentVersion != null"
            label="Kiosk software"
            data-test="screen-software-row"
          >
            <template #description>
              <p class="screen-software__desc" data-test="screen-software-state">
                <template v-if="selectedKiosk.agentUpdateRequested">
                  Updating to
                  <span class="screen-software__v">{{ shortVersion(availableVersion) }}</span
                  >…
                </template>
                <template v-else-if="isUpdateBlocked(selectedKiosk)">
                  <span class="screen-software__v">{{
                    shortVersion(selectedKiosk.agentVersion)
                  }}</span>
                  · update needs a newer OS
                </template>
                <template v-else-if="hasUpdateError(selectedKiosk)">
                  <span class="screen-software__v">{{
                    shortVersion(selectedKiosk.agentVersion)
                  }}</span>
                  · last update failed, kept this version
                </template>
                <template v-else-if="availableVersion == null">
                  <span class="screen-software__v">{{
                    shortVersion(selectedKiosk.agentVersion)
                  }}</span>
                </template>
                <template v-else-if="!isVersionBehind(selectedKiosk, availableVersion)">
                  <span class="screen-software__v">{{
                    shortVersion(selectedKiosk.agentVersion)
                  }}</span>
                  · up to date
                </template>
                <template v-else>
                  <span class="screen-software__v">{{
                    shortVersion(selectedKiosk.agentVersion)
                  }}</span>
                  ·
                  <span class="screen-software__v">{{ shortVersion(availableVersion) }}</span>
                  available
                </template>
              </p>
              <p v-if="isUpdateBlocked(selectedKiosk)" class="screen-software__reinstall">
                Reinstall this kiosk with a current Raspberry Pi OS, then update.
              </p>
            </template>
            <button
              v-if="showUpdateButton(selectedKiosk) || selectedKiosk.agentUpdateRequested"
              type="button"
              class="kiosk-software__btn"
              data-test="kiosk-update-btn"
              :disabled="selectedKiosk.agentUpdateRequested"
              @click="onUpdate(selectedId)"
            >
              <template v-if="selectedKiosk.agentUpdateRequested">Updating…</template>
              <template v-else-if="hasUpdateError(selectedKiosk)">Try again</template>
              <template v-else>Update</template>
            </button>
          </SettingRow>
          <p v-else class="screen-software__empty" data-test="screen-software-empty">
            This screen runs in a browser, so there is no kiosk software to update.
          </p>
        </SettingsSection>

        <!-- Page footer: only when this screen differs from Default (§4). -->
        <div
          v-if="selectedChangedCount > 0"
          class="screen-footer"
          data-test="screen-override-footer"
        >
          <p class="screen-footer__copy">{{ footerCopy }}</p>
          <div class="screen-footer__actions">
            <button
              type="button"
              class="screen-footer__btn"
              data-test="reset-everything"
              @click="askResetEverything"
            >
              Reset everything to default
            </button>
            <button
              type="button"
              class="screen-footer__btn screen-footer__btn--ghost"
              data-test="use-as-default"
              @click="askUseAsDefault"
            >
              Use these as the default
            </button>
          </div>
          <p v-if="footerMsg" class="screens__saved" role="status" aria-live="polite">
            {{ footerMsg }}
          </p>
        </div>

        <ScreenRegionEditor
          :config="config"
          :open="editorOpen"
          :initial-preview-kiosk="selectedId"
          @update:config="patch => emit('update:config', patch)"
          @close="editorOpen = false"
        />
      </template>
    </div>

    <ConfirmModal
      :show="confirm.show"
      :title="confirm.title"
      :message="confirm.message"
      :confirm-text="confirm.confirmText"
      :danger="confirm.mode !== 'use-default'"
      @confirm="onConfirm"
      @cancel="confirm.show = false"
    />
  </div>
</template>

<script setup>
import { computed, onMounted, onUnmounted, reactive, ref } from "vue";
import { useKiosksStore } from "@/stores/kiosks";
import { useNotificationsStore } from "@/stores/notifications";
import {
  hasUpdateError,
  isUpdateBlocked,
  isVersionBehind,
  kiosksBehind,
  kiosksBlocked,
  shortVersion,
} from "@/utils/kioskSoftware";
import { normalizeDashboardScreens } from "@/utils/layout";
import { getKioskId } from "@/utils/kioskId";
import {
  changedSettingCount,
  formatSettingList,
  hasOwnSettings,
  useAsDefaultPatch,
  withoutAllOverrides,
  withoutPromotedSettings,
} from "@/utils/screenOverrides";
import SettingsSection from "@/components/settings/shell/SettingsSection.vue";
import SettingRow from "@/components/settings/shell/SettingRow.vue";
import SegmentedControl from "@/components/ui/SegmentedControl.vue";
import Tag from "@/components/ui/Tag.vue";
import ToggleSwitch from "@/components/ui/ToggleSwitch.vue";
import SelectPill from "@/components/ui/SelectPill.vue";
import DisplayScheduleGrid from "@/components/settings/shared/DisplayScheduleGrid.vue";
import AddKioskPanel from "@/components/settings/shared/AddKioskPanel.vue";
import KioskScope from "@/components/settings/shared/KioskScope.vue";
import KioskStatusHeader from "@/components/settings/shared/KioskStatusHeader.vue";
import PageThumbnail from "@/components/settings/shared/PageThumbnail.vue";
import ScreenRegionEditor from "@/components/settings/shared/ScreenRegionEditor.vue";
import ConfirmModal from "@/components/settings/shared/ConfirmModal.vue";
import DefaultScreenSettings from "@/components/settings/categories/DefaultScreenSettings.vue";
import ThisBrowserSettings from "@/components/settings/categories/ThisBrowserSettings.vue";

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
const DEFAULT_SECTION_IDS = new Set(["layout", "device-power", "device-keyboard"]);
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
function nameFor(k) {
  return k?.overrides?.displayName || k?.hostname || k?.id || "";
}
function nameFallback(k) {
  return k?.hostname || k?.id || "";
}
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
const selectedName = computed(() => (selectedKiosk.value ? nameFor(selectedKiosk.value) : ""));
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
const namePlaceholder = computed(() =>
  selectedKiosk.value ? nameFallback(selectedKiosk.value) : ""
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

function setName(value) {
  const trimmed = value.trim();
  const next = { ...overrides.value };
  if (trimmed) next.displayName = trimmed;
  else delete next.displayName;
  persist(
    next,
    nameMsg,
    "Saved. This screen shows its new name at the next check-in (~30s).",
    OFFLINE_COPY
  );
}

function persistPages(next) {
  persist(
    next,
    pagesMsg,
    "Saved. This screen picks up content changes at its next check-in (~30s).",
    OFFLINE_COPY
  );
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
  persist(
    next,
    displayMsg,
    "Saved. This screen applies orientation at its next check-in (~30s).",
    OFFLINE_COPY
  );
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
  persist(
    next,
    powerMsg,
    "Saved. This screen applies the schedule at its next check-in (~30s).",
    OFFLINE_COPY
  );
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
  persist(
    next,
    touchMsg,
    "Saved. This screen picks up keyboard changes at its next check-in (~30s).",
    OFFLINE_COPY
  );
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
        eyebrow: "Screens",
        message: `Couldn't start the update on ${ids[index]}.`,
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
  if (!narrowMql) return;
  if (typeof narrowMql.removeEventListener === "function") {
    narrowMql.removeEventListener("change", onNarrowChange);
  } else if (typeof narrowMql.removeListener === "function") {
    narrowMql.removeListener(onNarrowChange);
  }
});
</script>

<style scoped>
.screens {
  display: block;
}
/* Kiosk width: the list and the selected page side by side (list 320px). */
.screens--two-pane {
  display: grid;
  grid-template-columns: 320px minmax(0, 1fr);
  gap: var(--space-lg);
  align-items: start;
}
/* Phone: one pane at a time — the list hides while a page is open. */
.screens--single-pane {
  display: block;
}
.screens--single-pane .screens__list {
  display: none;
}
.screens--single-pane .screen-display {
  grid-template-columns: 1fr;
}
.screens__list,
.screens__detail {
  min-width: 0;
}
.screens__intro {
  padding: 0.75rem 1.25rem;
}
.screens__empty {
  flex: 1 1 20rem;
  margin: 0;
  opacity: 0.8;
}
/* Secondary .btn (mock S1), right-aligned in the Screens section header. */
.screens__add {
  flex: none;
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
.screens__add:hover {
  border-color: var(--focus);
}
.screens__add:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: 2px;
}
.screens__cards {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 12px;
  padding: 6px 1.25rem 16px;
}
.screen-card {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 4px 12px;
  align-items: start;
  width: 100%;
  padding: 12px;
  text-align: left;
  color: inherit;
  background: var(--bg-2);
  border: 1px solid var(--line);
  border-radius: 12px;
  cursor: pointer;
}
/* The Default is a real screen now: no dashed "shared" treatment. */
.screen-card--default {
  border-style: solid;
}
/* This browser is a single column of words, with no thumbnail. */
.screen-card--browser {
  grid-template-columns: 1fr;
}
.screen-card.is-selected {
  border-color: var(--focus);
}
.screen-card__body {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.screen-card__name {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 6px;
  font-weight: 600;
  color: var(--ink);
}
.screen-card__id {
  font-family: var(--font-data);
  font-size: var(--fs-xs);
  color: var(--ink-3);
}
.screen-card__meta,
.screen-card__summary {
  font-size: var(--fs-sm);
  color: var(--ink-2);
}
/* The Default card has two prose lines; keep the summary visually separate. */
.screen-card--default .screen-card__meta {
  margin-top: 2px;
  display: block;
}
.screen-card__changed {
  font-size: var(--fs-sm);
  font-weight: 500;
  color: var(--ink);
}
.screen-card__status {
  font-size: var(--fs-xs);
  font-weight: 500;
}
.screen-card__status.is-online {
  color: var(--ok);
}
.screen-card__status.is-offline {
  color: var(--ink-3);
}
.screen-card__software {
  font-size: var(--fs-sm);
  color: var(--ink-2);
}
.screen-card__software.is-warn {
  color: var(--warn);
}
.screen-card__software.is-err {
  color: var(--err);
}
.screen-card__v,
.kiosk-software__v,
.screen-software__v {
  font-family: var(--font-data);
}
/* Kiosk software summary row (CLV-19). */
.kiosk-software__desc {
  margin: 0.2rem 0 0;
  font-size: 0.85rem;
  line-height: 1.4;
  color: var(--ink-2);
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
.screens__saved {
  margin: 8px 1.25rem;
  font-size: 0.85em;
  opacity: 0.7;
}
.screens__back {
  margin-bottom: 10px;
  padding: 0;
  background: none;
  border: none;
  color: var(--ink-2);
  font-family: var(--font-ui);
  font-size: 0.85rem;
  cursor: pointer;
}
.screens__back:hover {
  color: var(--ink);
}
.screens__back:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: 2px;
}
.screen-name-input {
  min-width: 180px;
  height: var(--control-height);
  min-height: var(--touch-target);
  padding: 0 0.875rem;
  font-family: var(--font-ui);
  font-size: var(--fs-control-lg);
  color: var(--ink);
  background: var(--bg-2);
  border: 1px solid var(--line);
  border-radius: var(--radius-lg);
}
.screen-name-input:focus {
  outline: 2px solid var(--focus);
  outline-offset: 2px;
}
.screen-pages__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 12px 1.25rem 6px;
}
.screen-pages__hint {
  margin: 0;
  color: var(--ink-2);
  font-size: var(--fs-sm);
}
.screen-pages__meta {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}
.screen-pages__scope-label {
  margin: 0;
  font-family: var(--font-ui);
  font-size: var(--fs-sm);
  font-weight: 600;
  color: var(--ink);
}
.screen-pages__start-scope {
  display: flex;
  align-items: baseline;
  gap: 10px;
  padding: 8px 1.25rem;
  border-top: 1px solid var(--line-soft);
}
.screen-pages__edit {
  margin-left: auto;
  min-height: var(--touch-target);
  padding: 0 1rem;
  font-family: var(--font-ui);
  font-weight: 600;
  color: var(--focus-ink);
  background: var(--focus);
  border: 0;
  border-radius: 10px;
  cursor: pointer;
}
.screen-page {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 1.25rem;
  border-top: 1px solid var(--line-soft);
}
.screen-page.is-hidden-page {
  opacity: 0.65;
}
.screen-page__show,
.screen-page__start {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: var(--fs-sm);
  color: var(--ink-2);
}
.screen-page__start {
  margin-left: auto;
}
.screen-page__body {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}
.screen-page__name {
  font-size: 0.9rem;
  font-weight: 500;
  color: var(--ink);
}
.screen-page__not-shown {
  font-size: var(--fs-xs);
  color: var(--ink-3);
}
.screen-detail__grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
  gap: var(--space-lg);
  align-items: start;
}
.screen-display {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: start;
  gap: var(--space-md);
}
.screen-display__rows {
  min-width: 0;
}
.screen-display__preview {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 12px 1.25rem;
}
.screen-display__caption {
  font-size: var(--fs-xs);
  color: var(--ink-3);
}
.screen-software__empty {
  margin: 0;
  padding: 0.75rem 1.25rem;
  font-size: var(--fs-sm);
  color: var(--ink-2);
}
.screen-software__desc {
  margin: 0.2rem 0 0;
  font-size: 0.85rem;
  line-height: 1.4;
  color: var(--ink-2);
}
.screen-software__reinstall {
  margin: 0.2rem 0 0;
  font-size: var(--fs-sm);
  color: var(--ink-2);
}
/* Page footer: only a screen with overrides gets the two default actions. */
.screen-footer {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  margin-top: 1.25rem;
  padding: 1rem 1.25rem;
  background: var(--bg-1);
  border: 1px solid var(--line);
  border-radius: 16px;
}
.screen-footer__copy {
  margin: 0;
  font-size: var(--fs-sm);
  color: var(--ink-2);
}
.screen-footer__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.6rem;
}
.screen-footer__btn {
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
.screen-footer__btn--ghost {
  background: none;
}
.screen-footer__btn:hover {
  border-color: var(--focus);
}
.screen-footer__btn:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: 2px;
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
