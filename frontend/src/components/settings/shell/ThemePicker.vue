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
          :themes="themes"
          :selected-theme-id="selectedThemeId"
          :loading="loading"
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
// Teleported to <body> to escape the rounded settings panel's overflow:hidden;
// placed with fixed viewport coords.
const { popoverStyle, place, reposition } = usePopoverPlacement();

const selectedThemeName = computed(() => {
  if (!props.selectedThemeId || themes.value.length === 0) return "Theme";
  return themes.value.find(t => t.id === props.selectedThemeId)?.name ?? "Theme";
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
  emit("select", id);
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
  border-radius: 0.3125rem; /* 5px */
  background: var(--focus);
}

.theme-picker__label {
  white-space: nowrap;
}

.theme-picker__chevron {
  color: var(--ink-3);
  font-size: 0.75rem; /* 12px */
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
