<template>
  <div class="pill-wrap" ref="rootEl">
    <button
      type="button"
      class="pill"
      :aria-label="ariaLabel || undefined"
      :aria-expanded="open ? 'true' : 'false'"
      aria-haspopup="listbox"
      :aria-controls="listboxId"
      ref="triggerEl"
      @click="toggleOpen"
      @keydown="onTriggerKey"
    >
      <span
        v-if="swatch"
        class="pill__swatch"
        :style="{ background: `var(${swatch})` }"
        aria-hidden="true"
      />
      <span class="pill__label">{{ currentLabel }}</span>
      <span class="pill__cv" aria-hidden="true">▾</span>
    </button>
    <Teleport to="body">
      <div v-if="open" ref="menuEl" class="pill__panel" :style="popoverStyle">
        <div v-if="searchable" class="pill__search">
          <input
            ref="searchEl"
            v-model="query"
            class="pill__search-input"
            type="text"
            role="combobox"
            aria-autocomplete="list"
            aria-expanded="true"
            :aria-label="searchLabel"
            :placeholder="searchLabel"
            :aria-controls="listboxId"
            :aria-activedescendant="activeOptionId"
            autocomplete="off"
            autocapitalize="off"
            spellcheck="false"
            @keydown="onSearchKey"
          />
        </div>
        <ul
          ref="listEl"
          class="pill__menu"
          role="listbox"
          :id="listboxId"
          :aria-activedescendant="activeOptionId"
          @keydown="onListKey"
        >
          <li
            v-for="(o, i) in visibleOptions"
            :key="o.value"
            :id="`${listboxId}-opt-${i}`"
            role="option"
            class="pill__opt"
            :class="{ 'pill__opt--active': i === activeIndex }"
            :aria-selected="o.value === modelValue ? 'true' : 'false'"
            tabindex="-1"
            :ref="el => setOptRef(el, i)"
            @click="choose(o.value)"
          >
            {{ o.label }}
          </li>
          <li v-if="searchable && !visibleOptions.length" class="pill__empty" role="presentation">
            No matches
          </li>
        </ul>
      </div>
    </Teleport>
  </div>
</template>

<script setup>
import { ref, computed, watch, onUnmounted, nextTick } from "vue";
import { usePopoverPlacement } from "@/composables/usePopoverPlacement";

let _counter = 0;
const listboxId = `selectpill-lb-${++_counter}-${Math.random().toString(36).slice(2, 7)}`;

const props = defineProps({
  modelValue: { type: [String, Number], default: null },
  options: { type: Array, required: true },
  swatch: { type: String, default: null },
  ariaLabel: { type: String, default: "" },
  // Replaces the selected option's label, e.g. "Svenska (suggested)" while
  // the value is only the device's guess.
  displayLabel: { type: String, default: "" },
  // Long lists (the IANA timezone picker) get a text field at the top of the
  // menu. It is a real <input>, so the on-screen keyboard opens for it.
  searchable: { type: Boolean, default: false },
  searchLabel: { type: String, default: "Search" },
});
const emit = defineEmits(["update:modelValue"]);

const open = ref(false);
const activeIndex = ref(0);
const query = ref("");
const rootEl = ref(null);
const triggerEl = ref(null);
const menuEl = ref(null);
const searchEl = ref(null);
const listEl = ref(null);
const optRefs = ref([]);
// The menu teleports to <body> to escape ancestor `overflow: hidden` (the rounded
// settings panel), so it's placed with fixed viewport coords and pinned to the pill width.
const { popoverStyle, place, reposition } = usePopoverPlacement({ matchTriggerWidth: true });

const currentLabel = computed(
  () => props.displayLabel || props.options.find(o => o.value === props.modelValue)?.label || ""
);

// Filter on both the visible label and the raw value: "new york" and
// "new_york" both find "America/New_York".
const normalize = value =>
  String(value ?? "")
    .toLowerCase()
    .replace(/_/g, " ")
    .trim();

const visibleOptions = computed(() => {
  const needle = normalize(query.value);
  if (!props.searchable || !needle) return props.options;
  return props.options.filter(o => normalize(`${o.label} ${o.value}`).includes(needle));
});

// A new filter starts its highlight at the first match.
watch(visibleOptions, () => {
  activeIndex.value = 0;
  optRefs.value = [];
});

const activeOptionId = computed(() =>
  open.value && visibleOptions.value[activeIndex.value]
    ? `${listboxId}-opt-${activeIndex.value}`
    : undefined
);

const setOptRef = (el, i) => {
  if (el) optRefs.value[i] = el;
};

const scrollActiveIntoView = () => {
  listEl.value?.children?.[activeIndex.value]?.scrollIntoView?.({ block: "nearest" });
};

const handleClickOutside = e => {
  // The menu lives in <body> (teleported), so "inside" means either the pill root
  // or the teleported menu itself.
  const inside = rootEl.value?.contains(e.target) || menuEl.value?.contains(e.target);
  if (!inside) close();
};

// Keep the fixed-position menu glued to its trigger as the settings panel scrolls.
const onReposition = () => reposition();

const close = () => {
  if (!open.value) return;
  open.value = false;
  document.removeEventListener("click", handleClickOutside);
  window.removeEventListener("scroll", onReposition, true);
  window.removeEventListener("resize", onReposition);
  nextTick(() => triggerEl.value?.focus());
};

const openList = () => {
  const idx = props.options.findIndex(o => o.value === props.modelValue);
  activeIndex.value = idx >= 0 ? idx : 0;
  query.value = "";
  place(triggerEl);
  open.value = true;
  nextTick(() => {
    if (props.searchable) {
      searchEl.value?.focus();
      scrollActiveIntoView();
    } else {
      optRefs.value[activeIndex.value]?.focus();
    }
    document.addEventListener("click", handleClickOutside);
    window.addEventListener("scroll", onReposition, true);
    window.addEventListener("resize", onReposition);
  });
};

const toggleOpen = () => {
  if (open.value) {
    close();
  } else {
    openList();
  }
};

const choose = v => {
  emit("update:modelValue", v);
  close();
};

const onTriggerKey = e => {
  if (e.key === "ArrowDown") {
    e.preventDefault();
    if (!open.value) {
      openList();
    } else {
      moveActive(1);
    }
  }
};

const onListKey = e => {
  if (e.key === "ArrowDown") {
    e.preventDefault();
    moveActive(1);
  } else if (e.key === "ArrowUp") {
    e.preventDefault();
    moveActive(-1);
  } else if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    const option = visibleOptions.value[activeIndex.value];
    if (option) choose(option.value);
  } else if (e.key === "Escape") {
    e.preventDefault();
    close();
  }
};

// With search enabled the caret stays in the text field; the highlight moves
// inside the list, so typing never loses focus (or closes the keyboard).
const moveActive = delta => {
  if (!visibleOptions.value.length) return;
  activeIndex.value = Math.min(
    Math.max(activeIndex.value + delta, 0),
    visibleOptions.value.length - 1
  );
  if (props.searchable) {
    nextTick(scrollActiveIntoView);
  } else {
    nextTick(() => optRefs.value[activeIndex.value]?.focus());
  }
};

const onSearchKey = e => {
  if (e.key === "ArrowDown") {
    e.preventDefault();
    moveActive(1);
  } else if (e.key === "ArrowUp") {
    e.preventDefault();
    moveActive(-1);
  } else if (e.key === "Enter") {
    e.preventDefault();
    const option = visibleOptions.value[activeIndex.value];
    if (option) choose(option.value);
  } else if (e.key === "Escape") {
    e.preventDefault();
    close();
  }
};

onUnmounted(() => {
  document.removeEventListener("click", handleClickOutside);
  window.removeEventListener("scroll", onReposition, true);
  window.removeEventListener("resize", onReposition);
});
</script>

<style scoped>
.pill-wrap {
  position: relative;
}
.pill {
  display: inline-flex;
  align-items: center;
  gap: 0.75rem; /* 12px */
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
.pill:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: 2px;
}
.pill__swatch {
  width: 1rem; /* 16px */
  height: 1rem;
  border-radius: var(--radius-xs);
}
.pill__cv {
  color: var(--ink-3);
  font-size: var(--fs-2xs); /* 12px */
}
.pill__panel {
  /* position/coords come from :style (fixed, teleported to <body> to escape the
     rounded settings panel's overflow:hidden). */
  z-index: 1000;
  display: flex;
  flex-direction: column;
  background: var(--bg-1);
  border: 1px solid var(--line);
  border-radius: var(--radius-xl);
  box-shadow: 0 12px 32px var(--focus-glow);
  overflow: hidden;
}
.pill__search {
  padding: 0.375rem; /* 6px */
  border-bottom: 1px solid var(--line);
}
.pill__search-input {
  width: 100%;
  height: var(--control-height);
  padding: 0 0.75rem; /* 12px */
  background: var(--bg-2);
  border: 1px solid var(--line);
  border-radius: var(--radius-lg);
  font-family: var(--font-ui);
  font-size: var(--fs-control-lg);
  color: var(--ink);
}
.pill__search-input::placeholder {
  color: var(--ink-3);
}
.pill__search-input:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: -2px;
}
.pill__menu {
  flex: 1 1 auto;
  min-height: 0;
  list-style: none;
  margin: 0;
  padding: 0.375rem; /* 6px */
  /* Long option lists scroll inside the menu (max-height set inline from the
     viewport space) instead of running off a short screen. */
  overflow-y: auto;
  overscroll-behavior: contain;
}
.pill__empty {
  padding: 0.75rem 0.875rem; /* 12px 14px */
  color: var(--ink-3);
}
.pill__opt {
  padding: 0.75rem 0.875rem; /* 12px 14px */
  min-height: var(--touch-target);
  display: flex;
  align-items: center;
  border-radius: var(--radius-sm);
  color: var(--ink);
  cursor: pointer;
}
.pill__opt:hover,
.pill__opt[aria-selected="true"],
.pill__opt--active {
  background: var(--bg-2);
}
.pill__opt:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: -2px;
}
</style>
