<!-- frontend/src/components/settings/shared/ScreenSectionIndex.vue -->
<template>
  <!-- Phone Settings: the page is a list of its sections, each its own page. -->
  <nav
    v-if="phoneNav && sections.length > 0"
    v-show="!focusedSection"
    class="section-index section-index--pages"
    aria-label="Sections"
    data-test="section-index"
  >
    <ListRowLink
      v-for="section in sections"
      :key="section.id"
      :to="{ query: sectionQuery(section.id) }"
      :name="section.label"
      :meta="section.meta ? [section.meta] : []"
      :data-test="`section-index-${section.id}`"
    />
    <ListRowLink
      v-for="section in trailing"
      :key="section.id"
      class="section-index__trailing"
      :to="{ query: sectionQuery(section.id) }"
      :name="section.label"
      :tone="section.tone || ''"
      :data-test="`section-index-${section.id}`"
    />
  </nav>
  <nav
    v-else-if="sections.length > 0"
    class="section-index"
    aria-label="Sections"
    data-test="section-index"
  >
    <select
      v-if="phone"
      class="section-index__select"
      aria-label="Jump to section"
      data-test="section-index-select"
      @change="onSelect"
    >
      <option value="" disabled selected>Jump to section</option>
      <option
        v-for="section in sections"
        :key="section.id"
        :value="section.id"
        :label="section.label"
      ></option>
    </select>
    <ul v-else class="section-index__list">
      <li v-for="(section, index) in sections" :key="section.id" class="section-index__item">
        <span v-if="index > 0" class="section-index__sep" aria-hidden="true">·</span>
        <a
          class="section-index__link"
          :href="`#section-${section.id}`"
          :data-test="`section-index-${section.id}`"
          @click.prevent="jumpTo(section.id)"
        >
          {{ section.label }}
        </a>
      </li>
    </ul>
  </nav>
</template>

<script setup>
// A compact index of the page's sections (settings-scope §5), using the same
// `section-<id>` anchors the deep links scroll to. On a phone it becomes a
// select.
import { computed, inject, onMounted, onUnmounted, ref } from "vue";
import { isPhone } from "@/styles/breakpoints";
import ListRowLink from "@/components/ui/ListRowLink.vue";
import { openQuery, useSettingsPhoneNav } from "@/composables/useSettingsPhoneNav";

defineProps({
  // [{ id, label, meta? }]
  sections: { type: Array, default: () => [] },
  // Phone pages only: destinations after a gap, e.g. a destructive one
  // ([{ id: "screen-remove", label: "Remove screen", tone: "danger" }]).
  trailing: { type: Array, default: () => [] },
});

const nav = useSettingsPhoneNav();
const phoneNav = computed(() => Boolean(nav?.active.value));
const focus = inject("settingsSectionFocus", null);
const focusedSection = computed(() => {
  const value = focus?.value;
  return value && !value.startsWith("__") ? value : null;
});
const sectionQuery = id => openQuery(nav?.query.value ?? {}, { section: id });

const detectPhone = () =>
  typeof window !== "undefined" &&
  typeof window.innerWidth === "number" &&
  isPhone(window.innerWidth, window.innerHeight);

const phone = ref(detectPhone());
const refreshPhone = () => {
  phone.value = detectPhone();
};

function jumpTo(id) {
  const section = document.getElementById(`section-${id}`);
  if (!section) return;
  if (typeof section.scrollIntoView === "function") {
    section.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

function onSelect(event) {
  jumpTo(event.target.value);
}

onMounted(() => window.addEventListener("resize", refreshPhone));
onUnmounted(() => window.removeEventListener("resize", refreshPhone));
</script>

<style scoped>
.section-index {
  margin: 0 0 0.75rem;
}

.section-index--pages {
  display: flex;
  flex-direction: column;
  gap: var(--gap-stack);
  margin: var(--gap-3) 0 0;
}

.section-index__trailing {
  margin-top: var(--gap-4);
}

.section-index__list {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 0 var(--gap-1);
  margin: 0;
  padding: 0 0.25rem;
  list-style: none;
  font-family: var(--font-ui);
  font-size: var(--text-meta);
  line-height: 1.5;
  color: var(--ink-3);
}

.section-index__item {
  display: inline-flex;
  align-items: baseline;
  gap: var(--gap-1);
}

.section-index__sep {
  color: var(--ink-3);
}

.section-index__link {
  display: inline-flex;
  align-items: center;
  min-height: var(--toggle-h);
  color: var(--focus-text);
  text-decoration: none;
}

.section-index__link:hover,
.section-index__link:focus-visible {
  text-decoration: underline;
  text-underline-offset: 2px;
}

.section-index__link:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: 2px;
}

.section-index__select {
  width: 100%;
  min-height: var(--touch-target);
  padding: 0 var(--gap-4);
  font-family: var(--font-ui);
  font-size: var(--text-body);
  color: var(--ink);
  background: var(--bg-1);
  border: 1px solid var(--line);
  border-radius: var(--radius-control);
}
</style>
