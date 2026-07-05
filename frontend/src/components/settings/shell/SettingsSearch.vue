<template>
  <div class="settings-search">
    <div class="settings-search__bar">
      <span class="settings-search__icon" aria-hidden="true">
        <svg
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <circle cx="6.5" cy="6.5" r="4.5" stroke="currentColor" stroke-width="1.5" />
          <line
            x1="10.5"
            y1="10.5"
            x2="14"
            y2="14"
            stroke="currentColor"
            stroke-width="1.5"
            stroke-linecap="round"
          />
        </svg>
      </span>
      <input
        ref="inputEl"
        v-model="query"
        class="settings-search__input"
        type="search"
        placeholder="Search settings…"
        aria-label="Search settings"
        autocomplete="off"
        @keydown.escape="query = ''"
      />
      <kbd v-if="!isTouch" class="settings-search__hint" aria-label="Press slash to focus search"
        >/</kbd
      >
    </div>
    <ul
      v-if="results.length"
      class="settings-search__results"
      role="listbox"
      aria-label="Search results"
    >
      <li v-for="result in results" :key="result.id" role="none">
        <button class="settings-search__result" type="button" role="option" @click="select(result)">
          <span class="settings-search__result-label">{{ result.label }}</span>
          <span class="settings-search__result-path">{{ result.path }}</span>
        </button>
      </li>
    </ul>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, useTemplateRef } from "vue";
import { filterSettingsDestinations } from "@/components/settings/settingsRegistry";
import { useTouchCapability } from "@/composables/useTouchCapability";

const emit = defineEmits(["jump"]);

// The '/' focus shortcut is keyboard-only; hide its hint on touch kiosks.
const { isTouch } = useTouchCapability();

const query = ref("");
const inputEl = useTemplateRef("inputEl");

const results = computed(() => filterSettingsDestinations(query.value));

function select(destination) {
  emit("jump", destination);
  query.value = "";
}

function onGlobalKeydown(event) {
  if (event.key === "/") {
    const tag = document.activeElement?.tagName?.toLowerCase();
    if (tag === "input" || tag === "textarea") return;
    event.preventDefault();
    inputEl.value?.focus();
  } else if (event.key === "Escape") {
    query.value = "";
  }
}

onMounted(() => {
  document.addEventListener("keydown", onGlobalKeydown);
});

onUnmounted(() => {
  document.removeEventListener("keydown", onGlobalKeydown);
});
</script>

<style scoped>
.settings-search {
  position: relative;
  width: 100%;
}

.settings-search__bar {
  display: flex;
  align-items: center;
  gap: var(--space-2, 8px);
  background: var(--bg-2);
  border: 1px solid var(--border-color);
  border-radius: var(--radius, 6px);
  padding: 0 var(--space-3, 12px);
}

.settings-search__icon {
  color: var(--ink-3);
  display: flex;
  align-items: center;
  flex-shrink: 0;
}

.settings-search__input {
  flex: 1;
  background: transparent;
  border: none;
  outline: none;
  color: var(--ink);
  font-family: var(--font-ui);
  font-size: 0.875rem;
  padding: var(--space-2, 8px) 0;
  min-width: 0;
  /* Remove default search input styling */
  -webkit-appearance: none;
  appearance: none;
}

.settings-search__input::placeholder {
  color: var(--ink-3);
}

.settings-search__input::-webkit-search-cancel-button {
  display: none;
}

.settings-search__input:focus-visible {
  outline: none;
}

.settings-search__bar:focus-within {
  outline: 2px solid var(--focus);
  outline-offset: 2px;
  border-color: var(--focus);
}

.settings-search__hint {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-family: var(--font-ui);
  font-size: 0.75rem;
  color: var(--ink-3);
  background: var(--bg-1);
  border: 1px solid var(--border-color);
  border-radius: 3px;
  padding: 1px 5px;
  line-height: 1.4;
}

.settings-search__results {
  position: absolute;
  top: calc(100% + var(--space-1, 4px));
  left: 0;
  right: 0;
  z-index: 100;
  background: var(--bg-2);
  border: 1px solid var(--border-color);
  border-radius: var(--radius, 6px);
  list-style: none;
  margin: 0;
  padding: var(--space-1, 4px);
  box-shadow: 0 4px 16px var(--shadow);
  /* Cap the results list so a long match set scrolls instead of running off a
     short screen. The search sits at the top of the pane, so it only opens
     downward — no upward flip needed. */
  max-height: min(50vh, 22rem);
  overflow-y: auto;
  overscroll-behavior: contain;
}

.settings-search__result {
  display: flex;
  flex-direction: column;
  gap: 2px;
  width: 100%;
  min-height: var(--touch-target);
  padding: var(--space-2, 8px) var(--space-3, 12px);
  background: transparent;
  border: none;
  border-radius: calc(var(--radius, 6px) - 2px);
  cursor: pointer;
  text-align: left;
  font-family: inherit;
}

.settings-search__result:hover {
  background: color-mix(in srgb, var(--focus) 14%, transparent);
}

.settings-search__result:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: -2px;
}

.settings-search__result-label {
  font-family: var(--font-ui);
  font-size: 0.875rem;
  color: var(--ink);
  font-weight: 500;
  line-height: 1.2;
}

.settings-search__result-path {
  font-size: 0.75rem;
  color: var(--ink-3);
  line-height: 1.3;
}
</style>
