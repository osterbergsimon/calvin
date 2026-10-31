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
          disabled: theme.selectable === false,
        }"
        :aria-disabled="theme.selectable === false ? 'true' : undefined"
        :tabindex="theme.selectable === false ? -1 : 0"
        :data-theme-id="theme.id"
        @click="handleThemeSelect(theme)"
        @keydown.enter.prevent="handleThemeSelect(theme)"
      >
        <div class="theme-selection-preview">
          <img
            v-if="theme.preview_image"
            class="theme-preview-image"
            :src="`/api/plugins/${theme.id}/preview`"
            alt=""
          />
          <div v-else class="theme-preview-mini" :style="pageStyle(theme)">
            <div class="mini-panel" :style="panelStyle(theme)">
              <span class="mini-heading" :style="{ background: paletteFor(theme).ink }" />
              <span class="mini-line" :style="{ background: paletteFor(theme)['ink-3'] }" />
              <span class="mini-actions">
                <span class="mini-primary" :style="buttonStyle(theme)">Aa</span>
                <span class="mini-tag" :style="tagStyle(theme)">Tag</span>
              </span>
            </div>
          </div>
          <span v-if="selectedThemeId === theme.id" class="theme-selected-badge"> ✓ </span>
        </div>
        <div class="theme-selection-info">
          <strong>{{ theme.name }}</strong>
          <span class="theme-selection-mode">Light and dark</span>
          <Tag v-if="theme.is_builtin" class="theme-badge-small">Built-in</Tag>
          <span v-if="theme.selectable === false" class="theme-selection-error">
            Needs an update to work with this Calvin.
          </span>
          <span v-else-if="hasHueWarning(theme)" class="theme-selection-warning">
            Status colours may be hard to tell apart in this theme.
          </span>
        </div>
      </div>
    </div>
    <span v-if="showHelp" class="help-text" style="display: block; margin-top: 0.5rem"
      >Select a theme to customize the appearance</span
    >
  </div>
</template>

<script setup>
import Tag from "@/components/ui/Tag.vue";
import { themePalette } from "@/utils/themePalettes";

const props = defineProps({
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
  // Which mode the preview shows: the picker follows the current light/dark.
  dark: {
    type: Boolean,
    default: false,
  },
});

const emit = defineEmits(["select"]);

const handleThemeSelect = theme => {
  // A theme that fails the load check stays visible but cannot be selected.
  if (theme.selectable === false) return;
  emit("select", theme.id);
};

const paletteFor = theme => themePalette(theme, props.dark);

const pageStyle = theme => {
  const palette = paletteFor(theme);
  return { background: palette["bg-0"], borderColor: palette.line };
};

const panelStyle = theme => {
  const palette = paletteFor(theme);
  return { background: palette["bg-1"], borderColor: palette.line };
};

const buttonStyle = theme => {
  const palette = paletteFor(theme);
  return { background: palette.focus, color: palette["focus-ink"] };
};

const tagStyle = theme => {
  const palette = paletteFor(theme);
  // A tinted status tag, the same recipe Tag.vue uses.
  return {
    background: `color-mix(in srgb, ${palette.ok} 15%, ${palette["bg-1"]})`,
    color: palette["ok-text"],
    borderColor: `color-mix(in srgb, ${palette.ok} 35%, transparent)`,
  };
};

const hasHueWarning = theme =>
  (theme.validation_warnings || []).some(warning => warning.startsWith("Status colours"));
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
  grid-template-columns: repeat(auto-fill, minmax(10rem, 1fr));
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

.theme-selection-item.disabled {
  cursor: not-allowed;
  opacity: 0.6;
}

.theme-selection-item.disabled:hover {
  border-color: var(--line);
  box-shadow: none;
  transform: none;
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
  object-fit: cover;
}

.theme-preview-mini {
  width: 100%;
  height: 100%;
  padding: 8%;
  border: 1px solid transparent;
  box-sizing: border-box;
}

.mini-panel {
  display: flex;
  flex-direction: column;
  gap: 6%;
  height: 100%;
  padding: 8%;
  border: 1px solid transparent;
  border-radius: var(--radius-xs);
  box-sizing: border-box;
}

.mini-heading {
  display: block;
  width: 45%;
  height: 8%;
  border-radius: var(--radius-pill);
}

.mini-line {
  display: block;
  width: 70%;
  height: 5%;
  border-radius: var(--radius-pill);
  opacity: 0.7;
}

.mini-actions {
  display: flex;
  align-items: center;
  gap: 6%;
  margin-top: auto;
}

.mini-primary {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 30%;
  height: 1rem;
  border-radius: var(--radius-xs);
  font-size: var(--fs-3xs);
  font-weight: 600;
}

.mini-tag {
  display: inline-flex;
  align-items: center;
  padding: 0 0.3rem;
  height: 0.85rem;
  border: 1px solid transparent;
  border-radius: var(--radius-pill);
  font-size: var(--fs-3xs);
  font-weight: 500;
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

.theme-selection-mode {
  display: block;
  font-size: var(--fs-2xs);
  color: var(--ink-3);
}

.theme-badge-small {
  margin-left: var(--space-3xs);
}

.theme-selection-error,
.theme-selection-warning {
  display: block;
  margin-top: var(--space-2xs);
  font-size: var(--fs-2xs);
  line-height: 1.3;
}

.theme-selection-error {
  color: var(--err-text);
}

.theme-selection-warning {
  color: var(--warn-text);
}

.help-text {
  font-size: var(--fs-control);
  color: var(--ink-2);
  line-height: 1.4;
}
</style>
