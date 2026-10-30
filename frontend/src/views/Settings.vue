<template>
  <div class="settings-page">
    <SettingsTopBar
      :category-label="auth.authenticated ? activeCategoryLabel : 'Settings'"
      :section-label="auth.authenticated ? sectionLabel : ''"
      :save-state="saveStatus.state"
      :show-phone="isTouch"
      :locked="!auth.authenticated"
      @done="onDone"
      @phone="phoneOpen = true"
    />

    <template v-if="phoneOpen && auth.authenticated">
      <DialogScrim blur @dismiss="phoneOpen = false" />
      <div
        class="settings-phone dialog-above-osk dialog-above-osk--center"
        role="dialog"
        aria-modal="true"
        aria-label="Set up from your phone"
      >
        <PhoneSetupCard :setting-id="phoneSettingId" />
        <button type="button" class="settings-phone__close" @click="phoneOpen = false">
          Close
        </button>
      </div>
    </template>

    <div v-if="!auth.authenticated" class="settings-lock-scale">
      <AuthLockScreen />
    </div>

    <div v-else class="settings-body">
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
          <!-- settings-scale carries the global "Settings UI size" zoom. It is a
               width:auto block so it still fills the column at any scale (zoom,
               unlike transform, resolves auto width against the zoomed box); only
               its contents scale, and it scrolls inside .settings-content. The
               live dashboard is a different view and is never touched by this. -->
          <div class="settings-scale">
            <div v-if="error" class="settings-banner settings-banner-error">
              {{ error }}
            </div>

            <DashboardSettings
              v-if="activeCategory === 'dashboard' && localConfig"
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
            <ScreensSettings
              v-if="activeCategory === 'screens' && localConfig"
              :key="categoryRenderKey"
              :config="localConfig"
              @update:config="handleConfigUpdate"
            />
            <MaintenanceSettings
              v-if="activeCategory === 'maintenance' && localConfig"
              :key="categoryRenderKey"
              :config="localConfig"
              :git-repo-url="localConfig && localConfig.gitRepoUrl"
              :git-branch="(localConfig && localConfig.gitBranch) || 'develop'"
              :version="version"
              :frontend-version="frontendVersion"
              @update:config="handleConfigUpdate"
              @update:git-repo-url="handleGitRepoUrlUpdate"
              @update:git-branch="handleGitBranchUpdate"
            />
            <SecuritySettings v-if="activeCategory === 'security'" :key="categoryRenderKey" />
          </div>
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
import { useAuthStore } from "@/stores/auth";
import { resolveScrollView, pickActiveEyebrow } from "@/utils/settingsSectionSpy";
import { expandSettingsSection } from "@/utils/settingsSectionExpansion";
import SettingsTopBar from "@/components/settings/shell/SettingsTopBar.vue";
import SettingsSearch from "@/components/settings/shell/SettingsSearch.vue";
import CategoryRail from "@/components/settings/shell/CategoryRail.vue";
import DialogScrim from "@/components/ui/DialogScrim.vue";
import PhoneSetupCard from "@/components/ui/PhoneSetupCard.vue";
import AuthLockScreen from "@/components/settings/auth/AuthLockScreen.vue";
import { useTouchCapability } from "@/composables/useTouchCapability";
import {
  SETTINGS_CATEGORY_STORAGE_KEY,
  defaultSettingsCategoryId,
  getSettingDestinationById,
  normalizeSettingsCategoryId,
  settingsCategories,
} from "@/components/settings/settingsRegistry";
import ContentSettings from "@/components/settings/categories/ContentSettings.vue";

// Lazy-load category components for better code splitting
const DashboardSettings = defineAsyncComponent(
  () => import("@/components/settings/categories/DashboardSettings.vue")
);
const PluginsCategory = defineAsyncComponent(
  () => import("@/components/settings/categories/PluginsCategory.vue")
);
const ScreensSettings = defineAsyncComponent(
  () => import("@/components/settings/categories/ScreensSettings.vue")
);
const MaintenanceSettings = defineAsyncComponent(
  () => import("@/components/settings/categories/MaintenanceSettings.vue")
);
const SecuritySettings = defineAsyncComponent(
  () => import("@/components/settings/categories/SecuritySettings.vue")
);

const router = useRouter();
const route = useRoute();
const modeStore = useModeStore();
const auth = useAuthStore();

const categories = settingsCategories;

// ── Phone hand-off (F2) ─────────────────────────────────────────────────────
// A touch kiosk has no keyboard; offer the same settings page on a phone.
const { isTouch } = useTouchCapability();
const phoneOpen = ref(false);
const phoneSettingId = computed(() =>
  typeof route.query.setting === "string" ? route.query.setting : null
);

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
  return normalizeSettingsCategoryId(storedCategory) ?? defaultSettingsCategoryId;
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

// A deep link scrolls its section to the top, but a short section can't push the
// next eyebrows past the midpoint, so the spy would name a later section. Keep
// the header on the linked section until the user scrolls on their own.
let pinnedEyebrow = null;
const USER_SCROLL_EVENTS = ["wheel", "touchmove", "keydown", "pointerdown"];
function unpinSection() {
  pinnedEyebrow = null;
  USER_SCROLL_EVENTS.forEach(e => window.removeEventListener(e, unpinSection, true));
}
function pinSection(sectionEl) {
  const eyebrow = sectionEl.querySelector(".settings-section__eyebrow");
  if (!eyebrow) return;
  unpinSection();
  pinnedEyebrow = eyebrow;
  sectionLabel.value = eyebrow.textContent.trim();
  USER_SCROLL_EVENTS.forEach(e =>
    window.addEventListener(e, unpinSection, { capture: true, passive: true })
  );
}

function computeActiveSection() {
  if (pinnedEyebrow?.isConnected) {
    sectionLabel.value = pinnedEyebrow.textContent.trim();
    return;
  }
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
    regions: "regions",
    clock: "clock-bar-clock",
    "bar-items": "clock-bar-items",
    appearance: "appearance",
    "kiosk-touch": "kiosk-touch",
    "kiosk-touch-focus": "kiosk-touch-focus",
  },
  content: {
    calendars: "content-calendars",
    "calendar-display": "content-calendar-display",
    photos: "content-photos",
    images: "content-photos",
    services: "content-services",
    // "Add a web page" (plugins-services) lands on the services section.
    "content-services": "content-services",
    "clock-bar-sources": "content-clock-bar",
  },
  screens: {
    // Screens has no tabs: the list page and each screen's page are sections.
    // Destinations point at a section id directly (see settingsRegistry.js).
  },
  maintenance: {
    updates: "maintenance-updates",
    hardware: "device-hardware",
    system: "maintenance-system",
    backup: "maintenance-backup",
    // The old Diagnostics rows moved into the closed Advanced disclosure.
    diagnostics: "maintenance-advanced",
  },
  security: {
    admin: "security-admin",
  },
  plugins: {
    install: "plugins-install",
    installed: "plugins-installed",
  },
};
const MIGRATED_CATEGORIES = new Set(Object.keys(SECTION_BY_CATEGORY_TAB));

function sectionFor(destination) {
  // A destination can name a section directly (Kiosks has no tabs).
  return (
    destination.section ?? SECTION_BY_CATEGORY_TAB[destination.category]?.[destination.tab] ?? null
  );
}

// Scroll a ?setting= destination's section into view. Category components are
// async, so retry for a few frames until the section exists.
function scrollToDestination(destination, attempt = 0) {
  if (
    (!destination?.tab && !destination?.section) ||
    !MIGRATED_CATEGORIES.has(destination.category)
  ) {
    return;
  }
  const sectionId = sectionFor(destination);
  if (!sectionId) return;
  // A closed disclosure (System › Advanced) must open before it can be read.
  expandSettingsSection(sectionId);
  const el = document.getElementById("section-" + sectionId);
  if (el) {
    el.scrollIntoView({ behavior: "smooth", block: "start" });
    pinSection(el);
  } else if (attempt < 20) {
    requestAnimationFrame(() => scrollToDestination(destination, attempt + 1));
  }
}

// ── Navigation helpers ────────────────────────────────────────────────────────
const selectCategory = categoryId => {
  unpinSection();
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

  await nextTick();
  scrollToDestination(destination);
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
    nextTick(() => scrollToDestination(destination));
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
  await Promise.all([loadConfig(), auth.fetchStatus()]);
  frontendVersion.value = getFrontendVersionFromMeta();
  version.value = localConfig.value?.version ?? null;

  if (MIGRATED_CATEGORIES.has(activeCategory.value)) {
    await nextTick();
    setupSectionObserver();
  }
  // Arrived from a dashboard empty state or a phone QR code: show the section.
  scrollToDestination(initialRouteDestination);
});

// Signing in on the lock screen reveals the body: honour the deep link that was
// kept in the URL while locked, and start the section observer now that the
// sections exist.
watch(
  () => auth.authenticated,
  async authenticated => {
    if (!authenticated) return;
    await nextTick();
    if (MIGRATED_CATEGORIES.has(activeCategory.value)) setupSectionObserver();
    scrollToDestination(getRouteSettingDestination() ?? initialRouteDestination);
  }
);

onUnmounted(() => {
  unpinSection();
  teardownSectionObserver();
});
</script>

<style scoped>
.settings-phone {
  position: fixed;
  top: 50%;
  left: 50%;
  z-index: 1000;
  transform: translate(-50%, -50%);
  width: min(32rem, calc(100vw - 32px));
  display: flex;
  flex-direction: column;
  gap: var(--space-lg);
  padding: var(--space-xl);
  background: var(--bg-1);
  border: 1px solid var(--line);
  border-radius: 14px;
  box-shadow: 0 18px 50px -16px var(--shadow-hover);
}
.settings-phone__close {
  align-self: flex-end;
  min-height: var(--touch-target);
  padding: 0 1.25rem;
  font-family: var(--font-ui);
  font-weight: 600;
  color: var(--focus-ink);
  background: var(--focus);
  border: 0;
  border-radius: 10px;
  cursor: pointer;
}
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

/* The lock screen honours the Settings UI size too (CLV-9 §6). */
.settings-lock-scale {
  flex: 1;
  min-height: 0;
  display: flex;
  zoom: var(--ui-scale);
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
  /* Keep the focused field reachable above the on-screen keyboard. */
  padding-bottom: var(--osk-height, 0px);
}

/* Global "Settings UI size": scales the whole settings content (text, every
   control, modals) via zoom, scoped here so the live dashboard is unaffected.
   --ui-scale is set on <html> by useUiScale; scale 1 is a no-op. */
.settings-scale {
  zoom: var(--ui-scale);
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

/* Short AND narrow (a phone in landscape) → fall back to page scroll, where the
   browser chrome provides it. A short but WIDE viewport (an 800x480 kiosk) must
   keep the constrained internal scroll above: a chromeless kiosk has no page
   scroll, so overflow:visible would push content below the fold unreachably
   (calvin-g7v). */
@media (max-height: 600px) and (max-width: 768px) {
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
