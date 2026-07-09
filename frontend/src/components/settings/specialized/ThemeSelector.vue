<template>
  <div class="theme-selector">
    <div v-if="loading" class="loading-state">
      <p>Loading themes...</p>
    </div>
    <div v-else class="theme-selection-grid">
      <div
        v-for="theme in themes"
        :key="theme.id"
        class="theme-selection-item"
        :class="{
          active: selectedThemeId === theme.id,
          builtin: theme.is_builtin,
        }"
        @click="handleThemeSelect(theme.id)"
      >
        <div class="theme-selection-preview">
          <div
            v-if="theme.preview_image"
            class="theme-preview-image"
            :style="{
              backgroundImage: theme.preview ? `url(/api/plugins/${theme.id}/preview)` : undefined,
            }"
          />
          <div v-else class="theme-preview-placeholder" :style="getThemePreviewStyle(theme)">
            {{ theme.name.charAt(0) }}
          </div>
          <span v-if="selectedThemeId === theme.id" class="theme-selected-badge"> ✓ </span>
        </div>
        <div class="theme-selection-info">
          <strong>{{ theme.name }}</strong>
          <span v-if="theme.is_builtin" class="theme-badge-small">Built-in</span>
        </div>
      </div>
    </div>
    <span v-if="showHelp" class="help-text" style="display: block; margin-top: 0.5rem"
      >Select a theme to customize the appearance</span
    >
  </div>
</template>

<script setup>
// import { computed } from "vue";

defineProps({
  themes: {
    type: Array,
    required: true,
    default: () => [],
  },
  selectedThemeId: {
    type: String,
    default: null,
  },
  loading: {
    type: Boolean,
    default: false,
  },
  showHelp: {
    type: Boolean,
    default: true,
  },
});

const emit = defineEmits(["select"]);

const handleThemeSelect = themeId => {
  emit("select", themeId);
};

const getThemePreviewStyle = theme => {
  // Extract CSS variables from theme if available
  const vars = theme.variables || {};
  const bgPrimary = vars["bg-1"] || "#ffffff";
  const bgSecondary = vars["bg-2"] || "#f5f5f5";
  const accentPrimary = vars.focus || "#e08a1e";

  return {
    background: `linear-gradient(135deg, ${bgPrimary} 0%, ${bgSecondary} 50%, ${accentPrimary} 100%)`,
    color: vars.ink || "#1b242b",
  };
};
</script>

<style scoped>
.theme-selector {
  width: 100%;
}

.loading-state {
  padding: 2rem;
  text-align: center;
  color: var(--ink-2);
}

.theme-selection-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
  gap: 1rem;
  margin-top: 0.5rem;
}

.theme-selection-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 1rem;
  min-height: var(--touch-target);
  background: var(--bg-2);
  border: 2px solid var(--line);
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.theme-selection-item:hover {
  border-color: var(--focus);
  box-shadow: 0 2px 8px var(--shadow);
  transform: translateY(-2px);
}

.theme-selection-item:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: 2px;
}

.theme-selection-item.active {
  border-color: var(--focus);
  background: var(--bg-2);
  box-shadow: 0 4px 12px var(--shadow-hover);
}

.theme-selection-preview {
  position: relative;
  width: 100%;
  aspect-ratio: 16 / 9;
  border-radius: 6px;
  overflow: hidden;
  margin-bottom: 0.5rem;
  background: var(--bg-1);
  border: 1px solid var(--line);
}

.theme-preview-image {
  width: 100%;
  height: 100%;
  background-size: cover;
  background-position: center;
}

.theme-preview-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 2rem;
  font-weight: bold;
  color: var(--ink-2);
  background: linear-gradient(
    135deg,
    var(--focus),
    color-mix(in srgb, var(--focus) 60%, var(--bg-1))
  );
}

.theme-selected-badge {
  position: absolute;
  top: 0.25rem;
  right: 0.25rem;
  width: 1.5rem;
  height: 1.5rem;
  background: var(--focus);
  color: white;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.875rem;
  font-weight: bold;
  box-shadow: 0 2px 4px var(--shadow);
}

.theme-selection-info {
  text-align: center;
  width: 100%;
}

.theme-selection-info strong {
  display: block;
  font-size: 0.875rem;
  color: var(--ink);
  margin-bottom: 0.25rem;
}

.theme-badge-small {
  display: inline-block;
  padding: 0.125rem 0.375rem;
  background: var(--bg-2);
  color: var(--ink-2);
  border-radius: 4px;
  font-size: 0.7rem;
  margin-left: 0.25rem;
}

.help-text {
  font-size: 0.875rem;
  color: var(--ink-2);
  line-height: 1.4;
}
</style>
