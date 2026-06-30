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
    <div
      v-if="open"
      class="theme-picker__popover"
      :class="{ 'theme-picker__popover--up': openUp }"
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
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from "vue";
import ThemeSelector from "@/components/settings/specialized/ThemeSelector.vue";
import * as pluginsApi from "@/services/pluginsApi";

const props = defineProps({
  selectedThemeId: { type: String, default: null },
});

const emit = defineEmits(["select"]);

const rootEl = ref(null);
const triggerEl = ref(null);
const open = ref(false);
const openUp = ref(false);
const popoverStyle = ref({});
const themes = ref([]);
const loading = ref(false);

// Size + place the popover against the available viewport space so the theme
// list never runs off the bottom of a short screen: cap its height to the room
// below the trigger, or flip it upward when there's clearly more room above.
const placePopover = () => {
  const el = triggerEl.value;
  if (!el) return;
  const r = el.getBoundingClientRect();
  const margin = 16;
  const spaceBelow = window.innerHeight - r.bottom - margin;
  const spaceAbove = r.top - margin;
  const up = spaceBelow < 240 && spaceAbove > spaceBelow;
  openUp.value = up;
  popoverStyle.value = { maxHeight: `${Math.max(160, Math.round(up ? spaceAbove : spaceBelow))}px` };
};

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
  if (rootEl.value && !rootEl.value.contains(event.target)) {
    close();
  }
};

const onDocKeydown = event => {
  if (event.key === "Escape") {
    close();
  }
};

const openPopover = () => {
  placePopover();
  open.value = true;
  document.addEventListener("click", onDocClick, true);
  document.addEventListener("keydown", onDocKeydown);
};

const close = () => {
  if (!open.value) return;
  open.value = false;
  document.removeEventListener("click", onDocClick, true);
  document.removeEventListener("keydown", onDocKeydown);
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
  gap: 10px;
  height: 48px;
  padding: 0 16px;
  background: var(--bg-2);
  border: 1px solid var(--line);
  border-radius: 11px;
  font-family: var(--font-ui);
  font-size: 15px;
  color: var(--ink);
  cursor: pointer;
}

.theme-picker__trigger:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: 2px;
}

.theme-picker__swatch {
  width: 16px;
  height: 16px;
  border-radius: 5px;
  background: var(--focus);
}

.theme-picker__label {
  white-space: nowrap;
}

.theme-picker__chevron {
  color: var(--ink-3);
  font-size: 12px;
}

.theme-picker__popover {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  z-index: 20;
  min-width: 280px;
  padding: 12px;
  background: var(--bg-1);
  border: 1px solid var(--line);
  border-radius: 12px;
  box-shadow: 0 12px 32px var(--shadow);
  /* max-height is set inline from the available viewport space (placePopover);
     this is the fallback cap. The list scrolls inside the popover so it never
     runs off the bottom of a short screen. */
  max-height: min(60vh, 26rem);
  overflow-y: auto;
  overscroll-behavior: contain;
}

/* Flip above the trigger when there's more room there. */
.theme-picker__popover--up {
  top: auto;
  bottom: calc(100% + 8px);
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
