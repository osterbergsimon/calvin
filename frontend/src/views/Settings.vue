<template>
  <div class="settings-page">
    <SettingsTopBar
      :category-label="activeCategoryLabel"
      :section-label="sectionLabel"
      :save-state="saveStatus.state"
      @done="onDone"
    />

    <div class="settings-body">
      <div class="settings-search-wrapper">
        <SettingsSearch @jump="onJump" />
      </div>

      <div class="settings-layout">
        <CategoryRail
          :categories="categories"
          :active-id="activeCategory"
          @select="selectCategory"
        />

        <div class="settings-content">
          <div v-if="error" class="settings-banner settings-banner-error">
            {{ error }}
          </div>

          <DisplaySettings
            v-if="activeCategory === 'dashboard' && localConfig"
            :key="categoryRenderKey"
            :config="localConfig"
            @update:config="handleConfigUpdate"
          />
          <ClockBarSettings
            v-if="activeCategory === 'clock-bar' && localConfig"
            :key="categoryRenderKey"
            :config="localConfig"
            @update:config="handleConfigUpdate"
          />
          <ContentSettings
            v-if="activeCategory === 'content' && localConfig"
            :key="categoryRenderKey"
            :config="localConfig"
            @update:config="handleConfigUpdate"
          />
          <PluginsCategory v-if="activeCategory === 'plugins'" :key="categoryRenderKey" />
          <DeviceSettings
            v-if="activeCategory === 'device' && localConfig"
            :key="categoryRenderKey"
            :config="localConfig"
            :version="version"
            :frontend-version="frontendVersion"
            @update:config="handleConfigUpdate"
          />
          <MaintenanceSettings
            v-if="activeCategory === 'maintenance' && localConfig"
            :key="categoryRenderKey"
            :config="localConfig"
            :git-repo-url="localConfig && localConfig.gitRepoUrl"
            :git-branch="(localConfig && localConfig.gitBranch) || 'main'"
            @update:config="handleConfigUpdate"
            @update:git-repo-url="handleGitRepoUrlUpdate"
            @update:git-branch="handleGitBranchUpdate"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, watch, onMounted, onUnmounted, nextTick, defineAsyncComponent } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useConfigForm } from "@/composables/useConfigForm";
import { useModeStore } from "@/stores/mode";
import { resolveScrollView, pickActiveEyebrow } from "@/utils/settingsSectionSpy";
import SettingsTopBar from "@/components/settings/shell/SettingsTopBar.vue";
import SettingsSearch from "@/components/settings/shell/SettingsSearch.vue";
import CategoryRail from "@/components/settings/shell/CategoryRail.vue";
import {
  SETTINGS_CATEGORY_STORAGE_KEY,
  defaultSettingsCategoryId,
  getSettingDestinationById,
  isKnownSettingsCategory,
  settingsCategories,
} from "@/components/settings/settingsRegistry";
import ContentSettings from "@/components/settings/categories/ContentSettings.vue";

// Lazy-load category components for better code splitting
const DisplaySettings = defineAsyncComponent(
  () => import("@/components/settings/categories/DisplaySettings.vue")
);
const ClockBarSettings = defineAsyncComponent(
  () => import("@/components/settings/categories/ClockBarSettings.vue")
);
const PluginsCategory = defineAsyncComponent(
  () => import("@/components/settings/categories/PluginsCategory.vue")
);
const DeviceSettings = defineAsyncComponent(
  () => import("@/components/settings/categories/DeviceSettings.vue")
);
const MaintenanceSettings = defineAsyncComponent(
  () => import("@/components/settings/categories/MaintenanceSettings.vue")
);

const router = useRouter();
const route = useRoute();
const modeStore = useModeStore();

const categories = settingsCategories;

// ── Config ────────────────────────────────────────────────────────────────────
const { localConfig, loadConfig, updateConfig, error, saveStatus } = useConfigForm();

// ── Route-driven initial category ────────────────────────────────────────────
const getRouteSettingDestination = () => {
  const settingId = route.query.setting;
  return typeof settingId === "string" ? getSettingDestinationById(settingId) : null;
};

const initialRouteDestination = getRouteSettingDestination();
// Honour tab hints for non-dashboard categories on initial load
if (
  initialRouteDestination?.tabKey &&
  initialRouteDestination.tab &&
  initialRouteDestination.category !== "dashboard"
) {
  sessionStorage.setItem(initialRouteDestination.tabKey, initialRouteDestination.tab);
}

const getInitialCategory = () => {
  if (initialRouteDestination) return initialRouteDestination.category;
  const storedCategory = sessionStorage.getItem(SETTINGS_CATEGORY_STORAGE_KEY);
  return isKnownSettingsCategory(storedCategory) ? storedCategory : defaultSettingsCategoryId;
};

const activeCategory = ref(getInitialCategory());
watch(activeCategory, val => sessionStorage.setItem(SETTINGS_CATEGORY_STORAGE_KEY, val));

const activeCategoryLabel = computed(
  () => categories.find(c => c.id === activeCategory.value)?.label ?? ""
);

const categoryRenderKey = ref(0);

// ── Scroll-spy section indicator ─────────────────────────────────────────────
const sectionLabel = ref("");
let scrollTargets = [];
let computeRafId = null;
let observerRetryId = null;

function cancelObserverRetry() {
  if (observerRetryId !== null) {
    cancelAnimationFrame(observerRetryId);
    observerRetryId = null;
  }
}

function computeActiveSection() {
  // Key off eyebrows, not ".settings-section": CollapsibleSection (used inside
  // embedded editors) also carries the .settings-section class but has no
  // eyebrow, so matching on .settings-section would land on those nested,
  // label-less elements. Each eyebrow belongs to exactly one shell section,
  // in DOM (= visual) order.
  const eyebrows = [...document.querySelectorAll(".settings-section__eyebrow")];
  if (!eyebrows.length) return;

  const view = resolveScrollView({
    container: document.querySelector(".settings-content"),
    win: window,
    doc: document.documentElement,
  });
  const idx = pickActiveEyebrow(
    eyebrows.map(e => e.getBoundingClientRect().top),
    view
  );

  sectionLabel.value = eyebrows[idx].textContent.trim();
}

function scheduleCompute() {
  if (computeRafId !== null) return; // already queued — coalesce
  computeRafId = requestAnimationFrame(() => {
    computeRafId = null;
    computeActiveSection();
  });
}

function teardownSectionObserver() {
  cancelObserverRetry();
  if (computeRafId !== null) {
    cancelAnimationFrame(computeRafId);
    computeRafId = null;
  }
  for (const target of scrollTargets) {
    target.removeEventListener("scroll", scheduleCompute);
  }
  scrollTargets = [];
  window.removeEventListener("resize", scheduleCompute);
}

function setupSectionObserver(attempt = 0) {
  // On a fresh call, tear down any existing listener and pending rAFs
  if (attempt === 0) {
    teardownSectionObserver();
  }
  if (!MIGRATED_CATEGORIES.has(activeCategory.value)) {
    sectionLabel.value = "";
    return;
  }
  const sections = document.querySelectorAll(".settings-section__eyebrow");
  if (!sections.length) {
    // Async component may not have rendered yet — retry via rAF, capped at 10 attempts
    if (attempt < 10) {
      observerRetryId = requestAnimationFrame(() => {
        observerRetryId = null;
        setupSectionObserver(attempt + 1);
      });
    }
    return;
  }

  // Listen on BOTH the pane and the window: the pane scrolls on desktop, the
  // window scrolls at the responsive breakpoints, and which one is live can
  // flip on resize. computeActiveSection() reads geometry from whichever is
  // actually scrolling. Resize also recomputes (the scroll owner / midpoint
  // can change). Throttled via rAF so layout reads coalesce to one per frame.
  const container = document.querySelector(".settings-content");
  scrollTargets = container ? [container, window] : [window];
  for (const target of scrollTargets) {
    target.addEventListener("scroll", scheduleCompute, { passive: true });
  }
  window.addEventListener("resize", scheduleCompute, { passive: true });

  // Compute immediately so the indicator is correct before any scroll occurs
  computeActiveSection();
}

watch(activeCategory, async () => {
  sectionLabel.value = "";
  if (MIGRATED_CATEGORIES.has(activeCategory.value)) {
    await nextTick();
    setupSectionObserver(); // handles teardown internally at attempt=0
  } else {
    teardownSectionObserver();
  }
});

// ── (category, tab) → section-id for migrated categories ────────────────────
const SECTION_BY_CATEGORY_TAB = {
  dashboard: {
    layout: "layout",
    regions: "regions",
    appearance: "appearance",
    "kiosk-touch": "kiosk-touch",
  },
  "clock-bar": {
    appearance: "clock-bar-clock",
    "bar-items": "clock-bar-items",
  },
  content: {
    calendars: "content-calendars",
    "calendar-display": "content-calendar-display",
    photos: "content-photos",
    images: "content-images",
    services: "content-services",
  },
  device: {
    power: "device-power",
    keyboard: "device-keyboard",
    notifications: "device-notifications",
    reboot: "device-reboot",
    hardware: "device-hardware",
  },
  maintenance: {
    updates: "maintenance-updates",
    diagnostics: "maintenance-diagnostics",
  },
  plugins: {
    install: "plugins-install",
    installed: "plugins-installed",
  },
};
const MIGRATED_CATEGORIES = new Set(Object.keys(SECTION_BY_CATEGORY_TAB));

function sectionFor(category, tab) {
  return SECTION_BY_CATEGORY_TAB[category]?.[tab] ?? null;
}

// ── Navigation helpers ────────────────────────────────────────────────────────
const selectCategory = categoryId => {
  activeCategory.value = categoryId;
  categoryRenderKey.value += 1;
  if (!route.query.setting) return;
  const { setting: _setting, ...rest } = route.query;
  router.replace({ query: rest });
};

const onJump = async destination => {
  // Unmigrated categories still use the tab sessionStorage hint.
  if (destination.tabKey && destination.tab && !MIGRATED_CATEGORIES.has(destination.category)) {
    sessionStorage.setItem(destination.tabKey, destination.tab);
  }

  activeCategory.value = destination.category;
  categoryRenderKey.value += 1;
  router.replace({ query: { ...route.query, setting: destination.id } });

  if (MIGRATED_CATEGORIES.has(destination.category) && destination.tab) {
    await nextTick();
    const sectionId = sectionFor(destination.category, destination.tab);
    if (sectionId) {
      const el = document.getElementById("section-" + sectionId);
      if (el) el.scrollIntoView({ behavior: "smooth" });
    }
  }
};

const onDone = () => {
  modeStore.returnFromSettings();
  router.push("/");
};

// Reload from route ?setting= when the query changes externally
watch(
  () => route.query.setting,
  () => {
    const destination = getRouteSettingDestination();
    if (!destination) return;
    if (destination.tabKey && destination.tab && !MIGRATED_CATEGORIES.has(destination.category)) {
      sessionStorage.setItem(destination.tabKey, destination.tab);
    }
    activeCategory.value = destination.category;
    categoryRenderKey.value += 1;
  }
);

// ── Config helpers ────────────────────────────────────────────────────────────
const handleConfigUpdate = async updates => {
  await updateConfig(updates);
};

const handleGitRepoUrlUpdate = async url => {
  await updateConfig({ gitRepoUrl: url });
};

const handleGitBranchUpdate = async branch => {
  await updateConfig({ gitBranch: branch });
};

// ── Version info (for DeviceCategory) ────────────────────────────────────────
const version = ref(null);
const frontendVersion = ref(null);

const getFrontendVersionFromMeta = () => {
  try {
    const metaTag = document.querySelector('meta[name="frontend-version"]');
    if (metaTag) return metaTag.getAttribute("content");
  } catch (err) {
    console.warn("Could not read frontend version from meta tag:", err);
  }
  return null;
};

// ── Lifecycle ─────────────────────────────────────────────────────────────────
onMounted(async () => {
  await loadConfig();
  frontendVersion.value = getFrontendVersionFromMeta();
  version.value = localConfig.value?.version ?? null;

  if (MIGRATED_CATEGORIES.has(activeCategory.value)) {
    await nextTick();
    setupSectionObserver();
  }
});

onUnmounted(() => {
  teardownSectionObserver();
});
</script>

<style scoped>
.settings-page {
  height: 100dvh;
  overflow: hidden;
  background: var(--bg-1);
  color: var(--ink);
  display: flex;
  flex-direction: column;
}

.settings-body {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  padding: var(--space-5, 2rem);
  display: flex;
  flex-direction: column;
  gap: var(--space-4, 1.5rem);
}

.settings-search-wrapper {
  max-width: 640px;
}

.settings-layout {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: 220px 1fr;
  gap: var(--space-5, 2rem);
  align-items: stretch;
}

.settings-content {
  min-width: 0;
  min-height: 0;
  overflow-y: auto;
}

.settings-banner {
  padding: 0.75rem 1rem;
  border-radius: 6px;
  margin-bottom: 1rem;
  font-weight: 500;
}

.settings-banner-error {
  background: color-mix(in srgb, var(--err) 15%, transparent);
  color: var(--ink);
  border: 1px solid color-mix(in srgb, var(--err) 40%, transparent);
}

/* Responsive */
@media (max-width: 768px) {
  .settings-body {
    padding: var(--space-3, 1rem);
    overflow: visible;
  }

  .settings-layout {
    grid-template-columns: 1fr;
    gap: var(--space-3, 1rem);
    min-height: auto;
  }

  .settings-page {
    height: auto;
    min-height: 100dvh;
    overflow: visible;
  }
  .settings-content {
    overflow-y: visible;
    min-height: auto;
  }
}

@media (max-height: 600px) {
  .settings-page {
    height: auto;
    min-height: 100dvh;
    overflow: visible;
  }
  .settings-body {
    overflow: visible;
  }
  .settings-content {
    overflow-y: visible;
  }
}
</style>
