<template>
  <div class="settings-page">
    <div class="settings-header">
      <h1>Settings & Configuration</h1>
      <div class="header-actions">
        <div class="system-menu">
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
              @click="restartBackend"
            >
              🔄 Restart Backend
            </button>
            <button
              class="menu-item"
              title="Restart the frontend server"
              @click="restartFrontend"
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
import { ref, onMounted } from "vue";
import { useRouter } from "vue-router";
import { useConfigForm } from "@/composables";
import { useSystem } from "@/composables";
import { useModeStore } from "@/stores/mode";
import LayoutCategory from "@/components/settings/categories/LayoutCategory.vue";
import ContentCategory from "@/components/settings/categories/ContentCategory.vue";
import PluginsCategory from "@/components/settings/categories/PluginsCategory.vue";
import SystemCategory from "@/components/settings/categories/SystemCategory.vue";

const router = useRouter();
const modeStore = useModeStore();

// Category navigation
const categories = [
  { id: "layout", label: "Layout & Display", icon: "📐" },
  { id: "content", label: "Content", icon: "📦" },
  { id: "plugins", label: "Plugins", icon: "🔌" },
  { id: "system", label: "System", icon: "⚙️" },
];

const activeCategory = ref("layout");
const showSystemMenu = ref(false);

// Config management
const { localConfig, loadConfig, updateConfig } = useConfigForm();

// System operations
const { restartBackend, restartFrontend } = useSystem();

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

// Version comes from config

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
  window.location.reload();
};

// Initialize
onMounted(async () => {
  await loadConfig();
  frontendVersion.value = getFrontendVersionFromMeta();
  // Version comes from config
  version.value = localConfig.value.version;
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
