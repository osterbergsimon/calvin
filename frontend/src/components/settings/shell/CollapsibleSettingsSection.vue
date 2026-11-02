<template>
  <section :id="`section-${id}`" class="settings-section collapsible-settings-section">
    <button
      type="button"
      class="collapsible-settings-section__header"
      :aria-expanded="open ? 'true' : 'false'"
      :aria-controls="contentId"
      @click="toggle"
    >
      <span class="settings-section__eyebrow">{{ title }}</span>
      <span class="collapsible-settings-section__chevron" aria-hidden="true">{{
        open ? "▾" : "▸"
      }}</span>
    </button>
    <div v-show="open" :id="contentId" class="settings-section__panel">
      <slot />
    </div>
  </section>
</template>

<script setup>
import { computed } from "vue";
import {
  collapseSettingsSection,
  expandSettingsSection,
  isSettingsSectionExpanded,
} from "@/utils/settingsSectionExpansion";

// A SettingsSection whose panel starts closed (System › Advanced, §4).
// The eyebrow doubles as the toggle, so the section keeps its normal chrome and
// the scroll spy / ?setting= deep links still find it by id and eyebrow.
const props = defineProps({
  id: { type: String, required: true },
  title: { type: String, required: true },
});

let counter = 0;
const contentId = `settings-section-content-${++counter}`;

const open = computed(() => isSettingsSectionExpanded(props.id));

const toggle = () => {
  if (open.value) collapseSettingsSection(props.id);
  else expandSettingsSection(props.id);
};
</script>

<style scoped>
.collapsible-settings-section {
  scroll-margin-top: 1rem;
}
.collapsible-settings-section__header {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  width: 100%;
  padding: 0;
  background: transparent;
  border: 0;
  cursor: pointer;
  text-align: left;
}
.collapsible-settings-section__header .settings-section__eyebrow {
  margin: 1.25rem 0.25rem 0.5rem;
}
.collapsible-settings-section__header:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: 2px;
}
.collapsible-settings-section__chevron {
  margin-top: 0.75rem;
  color: var(--ink-3);
  font-size: var(--fs-2xs);
}
.settings-section__eyebrow {
  font-family: var(--font-data);
  font-size: var(--fs-micro);
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--ink-3);
  margin: 1.25rem 0.25rem 0.5rem;
}
.settings-section__panel {
  background: var(--bg-1);
  border: 1px solid var(--line);
  border-radius: var(--radius-2xl);
  overflow: hidden;
}
</style>
