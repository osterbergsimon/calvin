<!-- frontend/src/components/settings/shared/ScreensWithOwnSettings.vue -->
<template>
  <p v-if="entries.length > 0" class="screens-with-own" data-test="screens-with-own-settings">
    <span class="screens-with-own__label">Screens with their own settings:</span>&nbsp;<a
      v-for="(entry, index) in entries"
      :key="entry.screen.id"
      class="screens-with-own__link"
      href="#"
      :data-test="`own-screen-${entry.screen.id}`"
      @click.prevent="emit('open', entry.screen.id)"
      >{{ index > 0 ? ", " : "" }}{{ entry.label }} ({{ entry.count }})</a
    >
  </p>
</template>

<script setup>
// The Default page's matching line (settings-scope §5): the screens that have
// settings of their own, each with the number the Changed here line would list.
import { computed } from "vue";
import { changedSettingCount } from "@/utils/screenOverrides";
import { screenLabel } from "@/utils/screenLabel";

const props = defineProps({
  screens: { type: Array, default: () => [] },
});
const emit = defineEmits(["open"]);

const entries = computed(() =>
  (props.screens || [])
    .map(screen => ({
      screen,
      label: screenLabel(screen),
      count: changedSettingCount(screen?.overrides),
    }))
    .filter(entry => entry.count > 0)
);
</script>

<style scoped>
.screens-with-own {
  margin: 0;
  padding: 0 0.25rem 0.5rem;
  font-family: var(--font-ui);
  font-size: var(--text-meta);
  line-height: 1.5;
  color: var(--ink-2);
}

.screens-with-own__label {
  font-weight: var(--weight-strong);
  color: var(--ink);
}

.screens-with-own__link {
  color: var(--focus-text);
  text-decoration: underline;
  text-underline-offset: 2px;
}

.screens-with-own__link:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: 2px;
}
</style>
