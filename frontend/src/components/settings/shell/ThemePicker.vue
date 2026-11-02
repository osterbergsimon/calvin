<template>
  <Popover v-model="open" class="theme-picker" label="Choose theme" role="dialog" @open="loadDark">
    <template #trigger="{ attrs }">
      <Button
        v-bind="attrs"
        class="theme-picker__trigger"
        variant="secondary"
        data-test="theme-picker-trigger"
      >
        <template #icon>
          <span class="theme-picker__swatch" aria-hidden="true" />
        </template>
        <span class="theme-picker__label">{{ selectedThemeName }}</span>
        <span class="theme-picker__chevron" aria-hidden="true">▾</span>
      </Button>
    </template>

    <div class="theme-picker__panel">
      <ThemeSelector
        :themes="themesWithCalvin"
        :selected-theme-id="selectedThemeId || CALVIN_ID"
        :loading="loading"
        :dark="dark"
        :show-help="false"
        @select="onSelect"
      />
    </div>
  </Popover>
</template>

<script setup>
import { ref, computed, onMounted } from "vue";
import ThemeSelector from "@/components/settings/specialized/ThemeSelector.vue";
import Button from "@/components/ui/Button.vue";
import Popover from "@/components/ui/Popover.vue";
import * as pluginsApi from "@/services/pluginsApi";

// The theme picker is an anchored floating surface, so it uses the shared
// Popover: Escape, outside tap, focus return and the popover layer above a
// dialog are Popover's (docs/design/frontend-doctrine.md §3). This component
// only loads the theme list and renders ThemeSelector.
const props = defineProps({
  selectedThemeId: { type: String, default: null },
});

const emit = defineEmits(["select"]);

const open = ref(false);
const themes = ref([]);
const loading = ref(false);
// The mini previews show the palette in the mode the screen is in right now.
const dark = ref(false);

// No selected theme means Calvin's own palette (light/dark per the Mode below).
// D1: a theme is a palette family, so the picker lists Calvin (the default)
// plus installed plugin themes; Light/Dark are modes, not themes.
const CALVIN_ID = "calvin";
const CALVIN_OPTION = {
  id: CALVIN_ID,
  name: "Calvin",
  is_builtin: true,
  selectable: true,
};
const themesWithCalvin = computed(() => [CALVIN_OPTION, ...themes.value]);
const selectedThemeName = computed(() => {
  if (!props.selectedThemeId) return CALVIN_OPTION.name;
  if (loading.value && themes.value.length === 0) return "Loading themes…";
  return themes.value.find(t => t.id === props.selectedThemeId)?.name ?? CALVIN_OPTION.name;
});

const loadThemes = async () => {
  loading.value = true;
  try {
    const response = await pluginsApi.getPlugins({ plugin_type: "theme" });
    const allItems = response.plugins || [];
    const themePlugins = allItems.filter(p => p.type === "theme");

    const enriched = [];
    for (const tp of themePlugins) {
      try {
        const detail = await pluginsApi.getPlugin(tp.id);
        enriched.push({ ...tp, ...detail });
      } catch {
        enriched.push(tp);
      }
    }
    themes.value = enriched;
  } catch {
    themes.value = [];
  } finally {
    loading.value = false;
  }
};

const loadDark = () => {
  dark.value =
    typeof document !== "undefined" && document.documentElement.classList.contains("dark");
};

const onSelect = id => {
  // Calvin is "no theme overrides": the CSS defaults take over.
  emit("select", id === CALVIN_ID ? null : id);
  open.value = false;
};

onMounted(() => {
  loadThemes();
});
</script>

<style scoped>
.theme-picker__panel {
  min-width: 17.5rem;
  max-width: calc(100vw - 2 * var(--gap-4));
  padding: var(--gap-3);
}
.theme-picker__swatch {
  width: 1rem;
  height: 1rem;
  border-radius: var(--radius-control);
  background: var(--focus);
}
.theme-picker__label {
  white-space: nowrap;
}
.theme-picker__chevron {
  color: var(--ink-3);
  font-size: var(--text-caption);
}
</style>
