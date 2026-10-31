<template>
  <div class="theme-picker" ref="rootEl">
    <button
      ref="triggerEl"
      type="button"
      class="theme-picker__trigger"
      :aria-expanded="open ? 'true' : 'false'"
      aria-haspopup="dialog"
      @click="toggleOpen"
    >
      <span class="theme-picker__swatch" aria-hidden="true" />
      <span class="theme-picker__label">{{ selectedThemeName }}</span>
      <span class="theme-picker__chevron" aria-hidden="true">▾</span>
    </button>
    <Teleport to="body">
      <div
        v-if="open"
        ref="popoverEl"
        class="theme-picker__popover"
        :style="popoverStyle"
        role="dialog"
        aria-label="Choose theme"
      >
        <ThemeSelector
          :themes="themesWithCalvin"
          :selected-theme-id="selectedThemeId || CALVIN_ID"
          :loading="loading"
          :dark="dark"
          :show-help="false"
          @select="onSelect"
        />
      </div>
    </Teleport>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from "vue";
import ThemeSelector from "@/components/settings/specialized/ThemeSelector.vue";
import { usePopoverPlacement } from "@/composables/usePopoverPlacement";
import * as pluginsApi from "@/services/pluginsApi";

const props = defineProps({
  selectedThemeId: { type: String, default: null },
});

const emit = defineEmits(["select"]);

const rootEl = ref(null);
const triggerEl = ref(null);
const popoverEl = ref(null);
const open = ref(false);
const themes = ref([]);
const loading = ref(false);
// The mini previews show the palette in the mode the screen is in right now.
const dark = ref(false);
// Teleported to <body> to escape the rounded settings panel's overflow:hidden;
// placed with fixed viewport coords.
const { popoverStyle, place, reposition } = usePopoverPlacement();

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

const onDocClick = event => {
  // Popover is teleported to <body>; treat clicks in either the trigger root or
  // the teleported popover as inside.
  const inside = rootEl.value?.contains(event.target) || popoverEl.value?.contains(event.target);
  if (!inside) close();
};

const onDocKeydown = event => {
  if (event.key === "Escape") {
    close();
  }
};

const onReposition = () => reposition();

const openPopover = () => {
  dark.value =
    typeof document !== "undefined" && document.documentElement.classList.contains("dark");
  place(triggerEl);
  open.value = true;
  document.addEventListener("click", onDocClick, true);
  document.addEventListener("keydown", onDocKeydown);
  window.addEventListener("scroll", onReposition, true);
  window.addEventListener("resize", onReposition);
};

const close = () => {
  if (!open.value) return;
  open.value = false;
  document.removeEventListener("click", onDocClick, true);
  document.removeEventListener("keydown", onDocKeydown);
  window.removeEventListener("scroll", onReposition, true);
  window.removeEventListener("resize", onReposition);
};

const toggleOpen = () => {
  open.value ? close() : openPopover();
};

const onSelect = id => {
  // Calvin is "no theme overrides": the CSS defaults take over.
  emit("select", id === CALVIN_ID ? null : id);
  close();
};

onMounted(() => {
  loadThemes();
});

onUnmounted(() => {
  document.removeEventListener("click", onDocClick, true);
  document.removeEventListener("keydown", onDocKeydown);
  window.removeEventListener("scroll", onReposition, true);
  window.removeEventListener("resize", onReposition);
});
</script>

<style scoped>
.theme-picker {
  position: relative;
  display: inline-flex;
}

.theme-picker__trigger {
  display: inline-flex;
  align-items: center;
  gap: 0.625rem; /* 10px */
  height: var(--control-height);
  padding: 0 1rem; /* 16px */
  background: var(--bg-2);
  border: 1px solid var(--line);
  border-radius: var(--radius-lg);
  font-family: var(--font-ui);
  font-size: var(--fs-control-lg);
  color: var(--ink);
  cursor: pointer;
}

.theme-picker__trigger:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: 2px;
}

.theme-picker__swatch {
  width: 1rem; /* 16px */
  height: 1rem;
  border-radius: var(--radius-xs);
  background: var(--focus);
}

.theme-picker__label {
  white-space: nowrap;
}

.theme-picker__chevron {
  color: var(--ink-3);
  font-size: var(--fs-2xs); /* 12px */
}

.theme-picker__popover {
  /* position/coords come from :style (fixed, teleported to <body> to escape the
     rounded settings panel's overflow:hidden). */
  z-index: 1000;
  min-width: 17.5rem; /* 280px */
  padding: 0.75rem; /* 12px */
  background: var(--bg-1);
  border: 1px solid var(--line);
  border-radius: var(--radius-xl);
  box-shadow: 0 12px 32px var(--shadow);
  /* max-height is set inline from the available viewport space (place());
     this is the fallback cap. The list scrolls inside the popover so it never
     runs off the bottom of a short screen. */
  max-height: min(60vh, 26rem);
  overflow-y: auto;
  overscroll-behavior: contain;
}

@media (prefers-reduced-motion: no-preference) {
  .theme-picker__popover {
    animation: theme-picker-in 0.15s ease;
  }
}

@keyframes theme-picker-in {
  from {
    opacity: 0;
    transform: translateY(-4px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>
