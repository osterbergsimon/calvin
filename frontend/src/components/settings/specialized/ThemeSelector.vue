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
          <Tag v-if="theme.is_builtin" class="theme-badge-small">Built-in</Tag>
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
import Tag from "@/components/ui/Tag.vue";

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
  const bgPrimary = vars["bg-1"] || "var(--bg-1)";
  const bgSecondary = vars["bg-2"] || "var(--bg-2)";
  const accentPrimary = vars.focus || "var(--focus)";

  return {
    background: `linear-gradient(135deg, ${bgPrimary} 0%, ${bgSecondary} 50%, ${accentPrimary} 100%)`,
    color: vars.ink || "var(--ink)",
  };
};
</script>

<style scoped>
.theme-selector {
  width: 100%;
}

.loading-state {
  padding: var(--space-3xl);
  text-align: center;
  color: var(--ink-2);
}

.theme-selection-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(7.5rem, 1fr));
  gap: var(--space-xl);
  margin-top: var(--space-sm);
}

.theme-selection-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: var(--space-xl);
  min-height: var(--touch-target);
  background: var(--bg-2);
  border: 2px solid var(--line);
  border-radius: var(--radius-sm);
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
  border-radius: var(--radius-xs);
  overflow: hidden;
  margin-bottom: var(--space-sm);
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
  font-size: var(--fs-xl);
  font-weight: 600;
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
  width: var(--space-3xl);
  height: var(--space-3xl);
  background: var(--focus);
  color: var(--focus-ink);
  border-radius: var(--radius-pill);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: var(--fs-control);
  font-weight: 600;
  box-shadow: 0 2px 4px var(--shadow);
}

.theme-selection-info {
  text-align: center;
  width: 100%;
}

.theme-selection-info strong {
  display: block;
  font-size: var(--fs-control);
  color: var(--ink);
  margin-bottom: var(--space-3xs);
}

.theme-badge-small {
  margin-left: var(--space-3xs);
}

.help-text {
  font-size: var(--fs-control);
  color: var(--ink-2);
  line-height: 1.4;
}
</style>
