<template>
  <div class="settings-page">
    <div class="settings-header">
      <h1>Settings & Configuration</h1>
      <div class="header-actions">
        <div
          class="save-status"
          :class="`save-status-${saveStatus.state}`"
          role="status"
          aria-live="polite"
        >
          {{ saveStatus.message }}
        </div>
        <div ref="systemMenuRef" class="system-menu">
          <button class="btn-system-menu" @click="showSystemMenu = !showSystemMenu">
            ⚙️ System
            <span class="menu-arrow">{{ showSystemMenu ? "▲" : "▼" }}</span>
          </button>
          <div v-if="showSystemMenu" class="system-menu-dropdown">
            <button
              class="menu-item"
              title="Restart the backend server"
              :disabled="!!updateMessage"
              @click="
                showSystemMenu = false;
                requestSystemAction('restart-backend');
              "
            >
              🔄 Restart Backend
            </button>
            <button
              class="menu-item"
              title="Restart the frontend server"
              :disabled="!!updateMessage"
              @click="
                showSystemMenu = false;
                requestSystemAction('restart-frontend');
              "
            >
              🔄 Restart Frontend
            </button>
            <button
              class="menu-item"
              title="Reload the frontend page"
              @click="
                showSystemMenu = false;
                requestSystemAction('reload-ui');
              "
            >
              🔄 Reload Page
            </button>
          </div>
        </div>
        <button class="btn-back" @click="goBack">← Back to Dashboard</button>
      </div>
    </div>

    <div class="settings-search">
      <label class="search-label" for="settings-search-input"> Find a setting </label>
      <input
        id="settings-search-input"
        v-model="settingsSearchQuery"
        class="search-input"
        type="search"
        placeholder="Search display, calendar, plugins, reboot, updates..."
        autocomplete="off"
      />
      <div
        v-if="settingsSearchQuery.trim()"
        class="search-results"
        role="listbox"
        aria-label="Settings search results"
      >
        <button
          v-for="result in filteredSettingsDestinations"
          :key="result.id"
          type="button"
          class="search-result"
          role="option"
          @click="jumpToSetting(result)"
        >
          <span class="search-result-title">{{ result.label }}</span>
          <span class="search-result-path">{{ result.path }}</span>
        </button>
        <div v-if="filteredSettingsDestinations.length === 0" class="search-empty">
          No matching settings
        </div>
      </div>
    </div>

    <div v-if="updateMessage" class="system-status-banner" :class="updateMessageClass">
      {{ updateMessage }}
    </div>

    <div class="settings-layout" :class="{ 'sidebar-collapsed': sidebarCollapsed }">
      <!-- Sidebar Navigation -->
      <aside class="settings-sidebar">
        <button
          type="button"
          class="sidebar-collapse-toggle"
          :aria-expanded="!sidebarCollapsed"
          :aria-label="sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'"
          :title="sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'"
          @click="toggleSidebar"
        >
          {{ sidebarCollapsed ? "›" : "‹" }}
        </button>
        <nav class="category-nav">
          <button
            v-for="category in categories"
            :key="category.id"
            class="category-btn"
            :class="{ active: activeCategory === category.id }"
            :title="sidebarCollapsed ? category.label : null"
            @click="selectCategory(category.id)"
          >
            <span class="category-icon">{{ category.icon }}</span>
            <span class="category-label">{{ category.label }}</span>
          </button>
        </nav>
      </aside>

      <!-- Main Content -->
      <div class="settings-content">
        <div v-if="error" class="settings-banner settings-banner-error">
          {{ error }}
        </div>
        <DashboardCategory
          v-if="activeCategory === 'dashboard' && localConfig"
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
        <PluginsCategory v-if="activeCategory === 'plugins'" :key="categoryRenderKey" />
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
          :git-repo-url="localConfig.gitRepoUrl"
          :git-branch="localConfig.gitBranch"
          @update:config="handleConfigUpdate"
          @update:gitRepoUrl="handleGitRepoUrlUpdate"
          @update:gitBranch="handleGitBranchUpdate"
        />
      </div>
    </div>

    <ConfirmModal
      :show="!!pendingSystemAction"
      :title="pendingSystemActionConfig.title"
      :message="pendingSystemActionConfig.message"
      :confirm-text="pendingSystemActionConfig.confirmText"
      @confirm="confirmSystemAction"
      @cancel="cancelSystemAction"
    />
  </div>
</template>

<script setup>
import { computed, ref, watch, onMounted, onUnmounted } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useConfigForm } from "@/composables";
import { useSystem } from "@/composables";
import { useModeStore } from "@/stores/mode";
import { defineAsyncComponent } from "vue";
import ConfirmModal from "@/components/settings/shared/ConfirmModal.vue";
import {
  SETTINGS_CATEGORY_STORAGE_KEY,
  defaultSettingsCategoryId,
  filterSettingsDestinations,
  getSettingDestinationById,
  isKnownSettingsCategory,
  settingsCategories,
} from "@/components/settings/settingsRegistry";

// Lazy load category components for better code splitting
const DashboardCategory = defineAsyncComponent(
  () => import("@/components/settings/categories/DashboardCategory.vue")
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

const SIDEBAR_COLLAPSED_KEY = "settings-sidebar-collapsed";
const sidebarCollapsed = ref(localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "1");
const toggleSidebar = () => {
  sidebarCollapsed.value = !sidebarCollapsed.value;
  localStorage.setItem(SIDEBAR_COLLAPSED_KEY, sidebarCollapsed.value ? "1" : "0");
};

const getRouteSettingDestination = () => {
  const settingId = route.query.setting;
  return typeof settingId === "string" ? getSettingDestinationById(settingId) : null;
};

const initialRouteDestination = getRouteSettingDestination();
if (initialRouteDestination?.tabKey && initialRouteDestination.tab) {
  sessionStorage.setItem(initialRouteDestination.tabKey, initialRouteDestination.tab);
}

const getInitialCategory = () => {
  if (initialRouteDestination) return initialRouteDestination.category;

  const storedCategory = sessionStorage.getItem(SETTINGS_CATEGORY_STORAGE_KEY);
  return isKnownSettingsCategory(storedCategory) ? storedCategory : defaultSettingsCategoryId;
};
const activeCategory = ref(getInitialCategory());
watch(activeCategory, val => sessionStorage.setItem(SETTINGS_CATEGORY_STORAGE_KEY, val));
const showSystemMenu = ref(false);
const settingsSearchQuery = ref("");
const categoryRenderKey = ref(0);
const pendingSystemAction = ref(null);

const systemActionConfigs = {
  "restart-backend": {
    title: "Restart Backend",
    message:
      "Restarting the backend can briefly interrupt plugins, calendar refresh, and API requests. Continue?",
    confirmText: "Restart Backend",
  },
  "restart-frontend": {
    title: "Restart Frontend",
    message:
      "Restarting the frontend service can briefly interrupt the dashboard display. Continue?",
    confirmText: "Restart Frontend",
  },
  "reload-ui": {
    title: "Reload Page",
    message:
      "Reloading the page refreshes the current settings UI. Auto-saved settings are kept, but in-progress plugin forms may be lost. Continue?",
    confirmText: "Reload Page",
  },
};

const pendingSystemActionConfig = computed(
  () =>
    systemActionConfigs[pendingSystemAction.value] || {
      title: "",
      message: "",
      confirmText: "Continue",
    }
);

const filteredSettingsDestinations = computed(() => {
  return filterSettingsDestinations(settingsSearchQuery.value);
});

const applySettingDestination = destination => {
  if (destination.tabKey && destination.tab) {
    sessionStorage.setItem(destination.tabKey, destination.tab);
  }
  activeCategory.value = destination.category;
  categoryRenderKey.value += 1;
};

const jumpToSetting = destination => {
  applySettingDestination(destination);
  settingsSearchQuery.value = "";
  router.replace({
    query: {
      ...route.query,
      setting: destination.id,
    },
  });
};

const selectCategory = categoryId => {
  activeCategory.value = categoryId;
  if (!route.query.setting) return;

  const { setting: _setting, ...query } = route.query;
  router.replace({ query });
};

watch(
  () => route.query.setting,
  () => {
    const destination = getRouteSettingDestination();
    if (destination) {
      applySettingDestination(destination);
    }
  }
);

// Config management
const { localConfig, loadConfig, updateConfig, error, saveStatus } = useConfigForm();

// System operations
const { restartBackend, restartFrontend, updateMessage, updateMessageClass } = useSystem();

// Version info
const version = ref(null);
const frontendVersion = ref(null);

// Get frontend version from meta tag
const getFrontendVersionFromMeta = () => {
  try {
    const metaTag = document.querySelector('meta[name="frontend-version"]');
    if (metaTag) {
      return metaTag.getAttribute("content");
    }
  } catch (error) {
    console.warn("Could not read frontend version from meta tag:", error);
  }
  return null;
};

// Handle config updates
const handleConfigUpdate = async updates => {
  await updateConfig(updates);
};

// Handle git repo URL update
const handleGitRepoUrlUpdate = async url => {
  await updateConfig({ gitRepoUrl: url });
};

// Handle git branch update
const handleGitBranchUpdate = async branch => {
  await updateConfig({ gitBranch: branch });
};

// Navigation
const goBack = () => {
  // Restore previous mode when returning from settings
  modeStore.returnFromSettings();
  router.push("/");
};

// Reload UI
const reloadUI = () => {
  window.location.reload();
};

const requestSystemAction = action => {
  pendingSystemAction.value = action;
};

const cancelSystemAction = () => {
  pendingSystemAction.value = null;
};

const confirmSystemAction = async () => {
  const action = pendingSystemAction.value;
  pendingSystemAction.value = null;

  if (action === "restart-backend") {
    await restartBackend();
  } else if (action === "restart-frontend") {
    await restartFrontend();
  } else if (action === "reload-ui") {
    reloadUI();
  }
};

// Click-outside closes the system menu
const systemMenuRef = ref(null);
const onDocumentClick = e => {
  if (showSystemMenu.value && !systemMenuRef.value?.contains(e.target)) {
    showSystemMenu.value = false;
  }
};

// Initialize
onMounted(async () => {
  await loadConfig();
  frontendVersion.value = getFrontendVersionFromMeta();
  // Version comes from config
  version.value = localConfig.value.version;
  document.addEventListener("click", onDocumentClick, true);
});

onUnmounted(() => {
  document.removeEventListener("click", onDocumentClick, true);
});
</script>

<style scoped>
.settings-page {
  min-height: 100vh;
  background: var(--bg-primary);
  color: var(--text-primary);
  padding: 2rem;
}

.settings-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 2rem;
  padding-bottom: 1rem;
  border-bottom: 2px solid var(--border-color);
}

.settings-header h1 {
  margin: 0;
  font-size: 2rem;
  font-weight: 600;
  color: var(--text-primary);
}

.header-actions {
  display: flex;
  gap: 1rem;
  align-items: center;
}

.save-status {
  width: 190px;
  padding: 0.45rem 0.75rem;
  border: 1px solid var(--border-color);
  border-radius: 999px;
  background: var(--bg-secondary);
  color: var(--text-secondary);
  font-size: 0.82rem;
  font-weight: 600;
  white-space: nowrap;
  text-align: center;
}

.save-status-saving {
  border-color: rgba(33, 150, 243, 0.4);
  color: #1565c0;
}

.save-status-saved {
  border-color: rgba(76, 175, 80, 0.45);
  color: #2e7d32;
}

.save-status-error {
  border-color: rgba(244, 67, 54, 0.45);
  color: #c62828;
}

.settings-search {
  position: relative;
  margin-bottom: 1.5rem;
  max-width: 720px;
}

.search-label {
  display: block;
  margin-bottom: 0.4rem;
  color: var(--text-secondary);
  font-size: 0.85rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.search-input {
  width: 100%;
  padding: 0.8rem 1rem;
  background: var(--bg-secondary);
  color: var(--text-primary);
  border: 1px solid var(--border-color);
  border-radius: 10px;
  font-size: 0.95rem;
  font-family: inherit;
}

.search-input:focus {
  outline: none;
  border-color: var(--accent-primary);
  box-shadow: 0 0 0 3px rgba(33, 150, 243, 0.18);
}

.search-results {
  position: absolute;
  z-index: 1200;
  top: calc(100% + 0.4rem);
  left: 0;
  right: 0;
  overflow: hidden;
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: 10px;
  box-shadow: 0 8px 24px var(--shadow);
}

.search-result {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  width: 100%;
  padding: 0.8rem 1rem;
  background: transparent;
  border: 0;
  border-bottom: 1px solid var(--border-color);
  color: var(--text-primary);
  cursor: pointer;
  text-align: left;
}

.search-result:last-child {
  border-bottom: 0;
}

.search-result:hover,
.search-result:focus-visible {
  background: var(--bg-secondary);
  outline: none;
}

.search-result-title {
  font-weight: 700;
}

.search-result-path {
  color: var(--text-secondary);
  font-size: 0.82rem;
}

.search-empty {
  padding: 0.9rem 1rem;
  color: var(--text-secondary);
  font-size: 0.9rem;
}

.system-menu {
  position: relative;
}

.btn-system-menu {
  padding: 0.5rem 1rem;
  background: var(--bg-secondary);
  color: var(--text-primary);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  font-size: 0.9rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.btn-system-menu:hover {
  background: var(--bg-tertiary);
  border-color: var(--accent-primary);
}

.menu-arrow {
  font-size: 0.75rem;
}

.system-menu-dropdown {
  position: absolute;
  top: 100%;
  right: 0;
  margin-top: 0.5rem;
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  box-shadow: 0 4px 12px var(--shadow);
  z-index: 1000;
  min-width: 200px;
  overflow: hidden;
}

.menu-item {
  display: block;
  width: 100%;
  padding: 0.75rem 1rem;
  background: transparent;
  color: var(--text-primary);
  border: none;
  text-align: left;
  cursor: pointer;
  transition: background 0.2s;
  font-size: 0.9rem;
}

.menu-item:hover {
  background: var(--bg-secondary);
}

.menu-item:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.btn-back {
  padding: 0.5rem 1rem;
  background: var(--bg-secondary);
  color: var(--text-primary);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  font-size: 0.9rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-back:hover {
  background: var(--bg-tertiary);
  border-color: var(--accent-primary);
}

.settings-layout {
  display: grid;
  grid-template-columns: 250px 1fr;
  gap: 2rem;
  transition: grid-template-columns 0.2s;
}

.settings-layout.sidebar-collapsed {
  grid-template-columns: 56px 1fr;
}

.settings-sidebar {
  position: sticky;
  top: 2rem;
  height: fit-content;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.sidebar-collapse-toggle {
  align-self: flex-end;
  width: 28px;
  height: 28px;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  background: var(--bg-secondary);
  color: var(--text-secondary);
  cursor: pointer;
  font-size: 1.1rem;
  line-height: 1;
}

.sidebar-collapse-toggle:hover,
.sidebar-collapse-toggle:focus {
  border-color: var(--accent-primary);
  color: var(--text-primary);
}

.sidebar-collapsed .sidebar-collapse-toggle {
  align-self: center;
}

.sidebar-collapsed .category-btn {
  padding: 0.65rem;
  justify-content: center;
  gap: 0;
}

.sidebar-collapsed .category-label {
  display: none;
}

.category-nav {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.category-btn {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 1rem;
  background: var(--bg-secondary);
  color: var(--text-primary);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  font-size: 0.95rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
  text-align: left;
}

.category-btn:hover {
  background: var(--bg-tertiary);
  border-color: var(--accent-primary);
  transform: translateX(4px);
}

.category-btn.active {
  background: var(--accent-primary);
  color: white;
  border-color: var(--accent-primary);
  box-shadow: 0 2px 8px var(--shadow);
}

.category-icon {
  font-size: 1.25rem;
}

.category-label {
  flex: 1;
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

.settings-banner-success {
  background: rgba(76, 175, 80, 0.15);
  color: var(--text-primary);
  border: 1px solid rgba(76, 175, 80, 0.4);
}

.system-status-banner {
  padding: 0.75rem 1.5rem;
  margin-bottom: 1rem;
  font-size: 0.9rem;
  font-weight: 500;
  border-radius: 6px;
  border: 1px solid transparent;
}
.system-status-banner.info {
  background: rgba(33, 150, 243, 0.1);
  border-color: rgba(33, 150, 243, 0.3);
  color: #1565c0;
}
.system-status-banner.success {
  background: rgba(40, 167, 69, 0.1);
  border-color: rgba(40, 167, 69, 0.3);
  color: #155724;
}
.system-status-banner.warning {
  background: rgba(255, 193, 7, 0.1);
  border-color: rgba(255, 193, 7, 0.3);
  color: #856404;
}
.system-status-banner.error {
  background: rgba(220, 53, 69, 0.1);
  border-color: rgba(220, 53, 69, 0.3);
  color: #721c24;
}

/* Responsive styles */
@media (max-width: 1024px) {
  .settings-layout {
    grid-template-columns: 200px 1fr;
    gap: 1.5rem;
  }

  .category-label {
    font-size: 0.9rem;
  }
}

@media (max-width: 768px) {
  .settings-page {
    padding: 1rem;
  }

  .settings-layout {
    grid-template-columns: 1fr;
    gap: 1rem;
  }

  .settings-sidebar {
    position: static;
    order: -1;
  }

  .category-nav {
    flex-direction: row;
    flex-wrap: wrap;
    gap: 0.5rem;
  }

  .category-btn {
    flex: 1;
    min-width: calc(33.333% - 0.5rem);
    justify-content: center;
    padding: 0.75rem 0.5rem;
  }

  .category-icon {
    display: none;
  }

  .category-label {
    font-size: 0.85rem;
    text-align: center;
  }
}
</style>
