<template>
  <div class="dashboard-settings">
    <!-- DASHBOARD SCREENS / REGIONS -->
    <SettingsSection id="regions" title="Pages & regions">
      <SettingRow
        :label="screenSummary"
        description="Design each page’s regions in the full-size editor."
      >
        <Button variant="primary" @click="editorOpen = true">Open editor</Button>
      </SettingRow>
      <ScreenRegionEditor
        :config="config"
        :open="editorOpen"
        :place-source="placement"
        :initial-page-id="initialPageId"
        :initial-region-id="initialRegionId"
        @update:config="patch => emit('update:config', patch)"
        @close="closeEditor"
        @placed="handlePlaced"
        @place-cancel="clearPlacement"
      />
    </SettingsSection>

    <!-- CLOCK BAR: one section with a live preview and the design editor. -->
    <SettingsSection id="clock-bar" title="Clock bar">
      <ClockBarOverview :config="config" @edit="clockEditorOpen = true" />
      <ClockBarEditor
        :config="config"
        :open="clockEditorOpen"
        @update:config="patch => emit('update:config', patch)"
        @close="clockEditorOpen = false"
      />
    </SettingsSection>

    <!-- The moved groups: one line where they used to be (§4). -->
    <InlineNote class="dashboard-signpost" data-test="dashboard-screen-signpost">
      Look, focus light and controls are set per screen.
      <template #action>
        <Button variant="link" data-test="open-screens-settings" @click="openScreenSettings">
          Open Screens
        </Button>
      </template>
    </InlineNote>

    <SettingsSection id="kiosk-touch-focus" title="Remote buttons">
      <SettingRow label="Hide label after">
        <NumberStepper
          :model-value="config.modeIndicatorTimeout"
          :min="0"
          :max="60"
          unit=" s"
          aria-label="Hide label after, in seconds"
          @update:model-value="v => emit('update:config', { modeIndicatorTimeout: v })"
        />
      </SettingRow>
      <KeyboardTab />
    </SettingsSection>
  </div>
</template>

<script setup>
import SettingsSection from "@/components/settings/shell/SettingsSection.vue";
import SettingRow from "@/components/settings/shell/SettingRow.vue";
import InlineNote from "@/components/ui/InlineNote.vue";
import Button from "@/components/ui/Button.vue";
import NumberStepper from "@/components/ui/NumberStepper.vue";
import ScreenRegionEditor from "@/components/settings/shared/ScreenRegionEditor.vue";
import ClockBarOverview from "@/components/settings/shared/ClockBarOverview.vue";
import ClockBarEditor from "@/components/settings/shared/ClockBarEditor.vue";
import KeyboardTab from "@/components/settings/tabs/layout/KeyboardTab.vue";
import { computed, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { normalizeDashboardScreens } from "@/utils/layout";
import { usePlacementRequest } from "@/composables/usePlacementRequest";
import { useRegionEditorRequest } from "@/composables/useRegionEditorRequest";

const props = defineProps({
  config: { type: Object, required: true },
});

const emit = defineEmits(["update:config"]);

// Kept out of the template: the quoted example would fight the formatter's
// attribute quoting.

const editorOpen = ref(false);
// The clock bar editor: opened by its section or by a link from Content /
// Pages & regions (`?setting=clock-bar&edit=clock-bar`).
const clockEditorOpen = ref(false);
const route = useRoute();
const router = useRouter();
const { placement, clearPlacement } = usePlacementRequest();
const { regionRequest, clearRegionRequest } = useRegionEditorRequest();

// A placement link names the page the source already shows on; open the editor
// on that page.
const initialPageId = computed(() => {
  if (regionRequest.value?.pageId) return regionRequest.value.pageId;
  return typeof route?.query?.page === "string" ? route.query.page : null;
});
const initialRegionId = computed(() => regionRequest.value?.regionId || null);

// "Put it on a page" arrives from Content: open the editor straight into place
// mode instead of making the user hunt for the button.
watch(
  () => placement.value,
  next => {
    if (next) editorOpen.value = true;
  },
  { immediate: true }
);

// A "Where it shows" line opens the editor on its page with the region selected.
watch(
  () => regionRequest.value,
  next => {
    if (next) editorOpen.value = true;
  },
  { immediate: true }
);

// Content › Clock bar info and Pages & regions › Clock bar panel link here.
watch(
  () => route?.query?.edit,
  next => {
    if (next === "clock-bar") clockEditorOpen.value = true;
  },
  { immediate: true }
);

const closeEditor = () => {
  editorOpen.value = false;
  clearPlacement();
  clearRegionRequest();
};

const handlePlaced = () => {
  clearPlacement();
  clearRegionRequest();
};

// "Open Screens": the same destination as the old Controls deep link. On a
// kiosk it opens that screen's page; elsewhere Screens › Default.
const openScreenSettings = () => {
  router.push({ path: "/settings", query: { setting: "dashboard-kiosk" } });
};
const screenSummary = computed(() => {
  const screens = normalizeDashboardScreens(props.config.dashboardScreens).screens;
  const regionCount = screens.reduce((sum, s) => {
    const regions = s.layout.regions;
    return sum + regions.reduce((n, r) => n + (r.split ? r.split.regions.length : 1), 0);
  }, 0);
  const s = screens.length === 1 ? "" : "s";
  const r = regionCount === 1 ? "" : "s";
  return `${screens.length} page${s} · ${regionCount} region${r}`;
});
</script>
