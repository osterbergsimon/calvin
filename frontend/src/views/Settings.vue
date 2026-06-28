<template>
  <div class="settings-page">
    <SettingsTopBar
      :category-label="activeCategoryLabel"
      :section-label="sectionLabel"
      :save-state="saveStatus.state"
      @done="onDone"
      @crumb="onCrumb"
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
          <ClockBarCategory
            v-if="activeCategory === 'clock-bar' && localConfig"
            :key="categoryRenderKey"
            :config="localConfig"
            @update:config="handleConfigUpdate"
          />
          <ContentSourcesCategory
            v-if="activeCategory === 'content' && localConfig"
            :key="categoryRenderKey"
            :config="localConfig"
            @update:config="handleConfigUpdate"
          />
          <PluginsCategory
            v-if="activeCategory === 'plugins'"
            :key="categoryRenderKey"
          />
          <DeviceCategory
            v-if="activeCategory === 'device'"
            :key="categoryRenderKey"
            :config="localConfig"
            :version="version"
            :frontend-version="frontendVersion"
            @update:config="handleConfigUpdate"
          />
          <MaintenanceCategory
            v-if="activeCategory === 'maintenance'"
            :key="categoryRenderKey"
            :config="localConfig"
            :git-repo-url="localConfig && localConfig.gitRepoUrl"
            :git-branch="localConfig && localConfig.gitBranch"
            @update:config="handleConfigUpdate"
            @update:gitRepoUrl="handleGitRepoUrlUpdate"
            @update:gitBranch="handleGitBranchUpdate"
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

// Lazy-load category components for better code splitting
const DisplaySettings = defineAsyncComponent(
  () => import("@/components/settings/categories/DisplaySettings.vue")
);
const ClockBarCategory = defineAsyncComponent(
  () => import("@/components/settings/categories/ClockBarCategory.vue")
);
const ContentSourcesCategory = defineAsyncComponent(
  () => import("@/components/settings/categories/ContentSourcesCategory.vue")
);
const PluginsCategory = defineAsyncComponent(
  () => import("@/components/settings/categories/PluginsCategory.vue")
);
const DeviceCategory = defineAsyncComponent(
  () => import("@/components/settings/categories/DeviceCategory.vue")
);
const MaintenanceCategory = defineAsyncComponent(
  () => import("@/components/settings/categories/MaintenanceCategory.vue")
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
if (initialRouteDestination?.tabKey && initialRouteDestination.tab
    && initialRouteDestination.category !== "dashboard") {
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

// ── Scroll-spy breadcrumb (dashboard only) ────────────────────────────────────
const sectionLabel = ref("");
let sectionObserver = null;
let observerRetryId = null;

function cancelObserverRetry() {
  if (observerRetryId !== null) {
    cancelAnimationFrame(observerRetryId);
    observerRetryId = null;
  }
}

function teardownSectionObserver() {
  cancelObserverRetry();
  if (sectionObserver) {
    sectionObserver.disconnect();
    sectionObserver = null;
  }
}

function setupSectionObserver(attempt = 0) {
  // On a fresh call, tear down any existing observer and pending retries
  if (attempt === 0) {
    teardownSectionObserver();
  }
  if (activeCategory.value !== "dashboard") {
    sectionLabel.value = "";
    return;
  }
  const sections = document.querySelectorAll(".settings-section");
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

  sectionObserver = new IntersectionObserver(
    entries => {
      // Pick the topmost visible section
      const visible = entries
        .filter(e => e.isIntersecting)
        .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
      if (visible.length) {
        const eyebrow = visible[0].target.querySelector(".settings-section__eyebrow");
        if (eyebrow) sectionLabel.value = eyebrow.textContent.trim();
      }
    },
    { threshold: 0.1, rootMargin: "0px 0px -70% 0px" }
  );

  sections.forEach(section => sectionObserver.observe(section));
}

watch(activeCategory, async () => {
  sectionLabel.value = "";
  if (activeCategory.value === "dashboard") {
    await nextTick();
    setupSectionObserver(); // handles teardown internally at attempt=0
  } else {
    teardownSectionObserver();
  }
});

// ── Tab → section-id mapping (Display/dashboard) ─────────────────────────────
const TAB_TO_SECTION = {
  layout: "layout",
  calendar: "calendar",
  appearance: "appearance",
  notifications: "notifications",
  "plugin-display": "plugin-display",
};

function sectionForTab(tab) {
  return TAB_TO_SECTION[tab] ?? null;
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
  // For non-dashboard categories, honour the tab sessionStorage hint
  if (destination.tabKey && destination.tab && destination.category !== "dashboard") {
    sessionStorage.setItem(destination.tabKey, destination.tab);
  }

  activeCategory.value = destination.category;
  categoryRenderKey.value += 1;

  router.replace({ query: { ...route.query, setting: destination.id } });

  if (destination.category === "dashboard" && destination.tab) {
    await nextTick();
    const sectionId = sectionForTab(destination.tab);
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

const onCrumb = which => {
  if (which === "section") {
    // Scroll to the currently active section — find the eyebrow whose text
    // matches sectionLabel so we don't always land on the first section.
    const label = sectionLabel.value;
    if (label) {
      const el = [...document.querySelectorAll(".settings-section__eyebrow")]
        .find(e => e.textContent.trim() === label);
      el?.closest(".settings-section")?.scrollIntoView({ behavior: "smooth" });
    }
  } else {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
};

// Reload from route ?setting= when the query changes externally
watch(
  () => route.query.setting,
  () => {
    const destination = getRouteSettingDestination();
    if (!destination) return;
    if (destination.tabKey && destination.tab && destination.category !== "dashboard") {
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

  if (activeCategory.value === "dashboard") {
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
  min-height: 100vh;
  background: var(--bg-primary);
  color: var(--text-primary);
  display: flex;
  flex-direction: column;
}

.settings-body {
  flex: 1;
  padding: var(--space-5, 2rem);
  display: flex;
  flex-direction: column;
  gap: var(--space-4, 1.5rem);
}

.settings-search-wrapper {
  max-width: 640px;
}

.settings-layout {
  display: grid;
  grid-template-columns: 220px 1fr;
  gap: var(--space-5, 2rem);
  align-items: start;
}

.settings-content {
  min-width: 0;
}

.settings-banner {
  padding: 0.75rem 1rem;
  border-radius: 6px;
  margin-bottom: 1rem;
  font-weight: 500;
}

.settings-banner-error {
  background: rgba(244, 67, 54, 0.15);
  color: var(--text-primary);
  border: 1px solid rgba(244, 67, 54, 0.4);
}

/* Responsive */
@media (max-width: 768px) {
  .settings-body {
    padding: var(--space-3, 1rem);
  }

  .settings-layout {
    grid-template-columns: 1fr;
    gap: var(--space-3, 1rem);
  }
}
</style>
