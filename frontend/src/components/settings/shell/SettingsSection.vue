<template>
  <section v-if="!hiddenByFocus" :id="`section-${id}`" class="settings-section">
    <!-- Alone on a phone page, the top bar already names the section. -->
    <div v-if="!(alone || titleHidden) || $slots.action" class="settings-section__head">
      <div
        class="settings-section__eyebrow"
        :class="{ 'settings-section__eyebrow--hidden': alone || titleHidden }"
      >
        {{ title }}
      </div>
      <slot name="action" />
    </div>
    <div class="settings-section__panel">
      <div v-if="description || $slots.description" class="settings-section__intro">
        <slot name="description">{{ description }}</slot>
      </div>
      <slot />
    </div>
  </section>
</template>
<script setup>
import { computed, inject } from "vue";

const props = defineProps({
  id: { type: String, required: true },
  title: { type: String, required: true },
  // One sentence introducing what the panel's rows are for, above the first
  // row. Keeps a category from inventing its own intro row or paragraph.
  description: { type: String, default: "" },
  // The title is already on screen (phone Settings' top bar names the page):
  // keep it for screen readers, hide it visually.
  titleHidden: { type: Boolean, default: false },
});

// Phone Settings shows a long page (a screen's settings) one section at a time
// (useSettingsPhoneNav.js). The page provides the section on show: an id shows
// that section alone, SECTION_FOCUS_INDEX hides them all behind the page's list
// of sections, and no value (every other page and every desktop) shows all.
const focus = inject("settingsSectionFocus", null);
const hiddenByFocus = computed(() => Boolean(focus?.value) && focus.value !== props.id);
const alone = computed(() => focus?.value === props.id);
</script>
<style scoped>
.settings-section {
  scroll-margin-top: 1rem;
}
.settings-section__head {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 1.25rem 0.25rem 0.5rem;
}
.settings-section__eyebrow {
  flex: 1;
  min-width: 0;
  font-family: var(--font-data);
  font-size: var(--fs-micro);
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--ink-3);
}
/* Still read by screen readers and found by the scroll spy. */
.settings-section__eyebrow--hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
}
.settings-section__panel {
  background: var(--bg-1);
  border: 1px solid var(--line);
  border-radius: var(--radius-2xl);
  overflow: hidden;
}
.settings-section__intro {
  margin: 0;
  padding: var(--panel-pad-y) var(--panel-pad-x);
  font-family: var(--font-ui);
  font-size: var(--text-meta);
  line-height: 1.4;
  color: var(--ink-2);
  border-bottom: 1px solid var(--line-soft);
}
</style>
