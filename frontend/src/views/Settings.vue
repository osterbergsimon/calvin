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
          <button
            class="btn-system-menu"
            @click="showSystemMenu = !showSystemMenu"
          >
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
                restartBackend();
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
                restartFrontend();
              "
            >
              🔄 Restart Frontend
            </button>
            <button
              class="menu-item"
              title="Reload the frontend page"
              @click="reloadUI"
            >
              🔄 Reload Page
            </button>
          </div>
        </div>
        <button class="btn-back" @click="goBack">← Back to Dashboard</button>
      </div>
    </div>

    <div
      v-if="updateMessage"
      class="system-status-banner"
      :class="updateMessageClass"
    >
      {{ updateMessage }}
    </div>

    <div class="settings-layout">
      <!-- Sidebar Navigation -->
      <aside class="settings-sidebar">
        <nav class="category-nav">
          <button
            v-for="category in categories"
            :key="category.id"
            class="category-btn"
            :class="{ active: activeCategory === category.id }"
            @click="activeCategory = category.id"
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
        <div
          v-else-if="saveSuccess"
          class="settings-banner settings-banner-success"
        >
          ✓ Saved
        </div>
        <LayoutCategory
          v-if="activeCategory === 'layout' && localConfig"
          :config="localConfig"
          @update:config="handleConfigUpdate"
        />
        <ContentCategory v-if="activeCategory === 'content'" />
        <PluginsCategory v-if="activeCategory === 'plugins'" />
        <SystemCategory
          v-if="activeCategory === 'system'"
          :config="localConfig"
          :version="version"
          :frontend-version="frontendVersion"
          :git-repo-url="localConfig.gitRepoUrl"
          :git-branch="localConfig.gitBranch"
          @update:config="handleConfigUpdate"
          @update:gitRepoUrl="handleGitRepoUrlUpdate"
          @update:gitBranch="handleGitBranchUpdate"
        />
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, watch, onMounted, onUnmounted } from "vue";
import { useRouter } from "vue-router";
import { useConfigForm } from "@/composables";
import { useSystem } from "@/composables";
import { useModeStore } from "@/stores/mode";
import { defineAsyncComponent } from "vue";

// Lazy load category components for better code splitting
const LayoutCategory = defineAsyncComponent(
  () => import("@/components/settings/categories/LayoutCategory.vue"),
);
const ContentCategory = defineAsyncComponent(
  () => import("@/components/settings/categories/ContentCategory.vue"),
);
const PluginsCategory = defineAsyncComponent(
  () => import("@/components/settings/categories/PluginsCategory.vue"),
);
const SystemCategory = defineAsyncComponent(
  () => import("@/components/settings/categories/SystemCategory.vue"),
);

const router = useRouter();
const modeStore = useModeStore();

// Category navigation
const categories = [
  { id: "layout", label: "Layout & Display", icon: "📐" },
  { id: "content", label: "Content", icon: "📦" },
  { id: "plugins", label: "Plugins", icon: "🔌" },
  { id: "system", label: "System", icon: "⚙️" },
];

const _CATEGORY_KEY = "settings_active_category";
const activeCategory = ref(sessionStorage.getItem(_CATEGORY_KEY) || "layout");
watch(activeCategory, (val) => sessionStorage.setItem(_CATEGORY_KEY, val));
const showSystemMenu = ref(false);

// Config management
const {
  localConfig,
  loadConfig,
  updateConfig,
  error,
  saveSuccess,
  saveStatus,
} = useConfigForm();

// System operations
const { restartBackend, restartFrontend, updateMessage, updateMessageClass } =
  useSystem();

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
const handleConfigUpdate = async (updates) => {
  await updateConfig(updates);
};

// Handle git repo URL update
const handleGitRepoUrlUpdate = async (url) => {
  await updateConfig({ gitRepoUrl: url });
};

// Handle git branch update
const handleGitBranchUpdate = async (branch) => {
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
  showSystemMenu.value = false;
  window.location.reload();
};

// Click-outside closes the system menu
const systemMenuRef = ref(null);
const onDocumentClick = (e) => {
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
  padding: 0.45rem 0.75rem;
  border: 1px solid var(--border-color);
  border-radius: 999px;
  background: var(--bg-secondary);
  color: var(--text-secondary);
  font-size: 0.82rem;
  font-weight: 600;
  white-space: nowrap;
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
}

.settings-sidebar {
  position: sticky;
  top: 2rem;
  height: fit-content;
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
