<!-- frontend/src/components/settings/shared/ChangedHereLine.vue -->
<template>
  <p v-if="items.length > 0" class="changed-here" data-test="changed-here-line">
    <span class="changed-here__label">Changed here:</span>&nbsp;<template
      v-for="(item, index) in items"
      :key="item.key"
      ><span v-if="index > 0">{{ ", " }}</span
      ><a
        class="changed-here__link"
        :href="`#${rowAnchorId(item.key)}`"
        :data-test="`changed-here-${item.key}`"
        @click.prevent="jumpTo(item.key)"
        >{{ item.label }}</a
      ></template
    >
  </p>
</template>

<script setup>
// The "Changed here: Theme, Focus light, Corner size" line at the top of a
// screen's page (settings-scope §5). Every name is a link to that row; the row
// flashes briefly so the jump is easy to follow.
import { rowAnchorId } from "@/utils/screenOverrides";

defineProps({
  items: { type: Array, default: () => [] },
});

const FLASH_MS = 1600;

function jumpTo(key) {
  const row = document.getElementById(rowAnchorId(key));
  if (!row) return;
  if (typeof row.scrollIntoView === "function") {
    row.scrollIntoView({ behavior: "smooth", block: "center" });
  }
  row.classList.remove("calvin-row-flash");
  // Restart the animation when the same link is clicked twice.
  void row.offsetWidth;
  row.classList.add("calvin-row-flash");
  window.setTimeout(() => row.classList.remove("calvin-row-flash"), FLASH_MS);
}
</script>

<style scoped>
.changed-here {
  margin: 0;
  padding: 0 0.25rem 0.5rem;
  font-family: var(--font-ui);
  font-size: var(--text-meta);
  line-height: 1.5;
  color: var(--ink-2);
}

.changed-here__label {
  font-weight: var(--weight-strong);
  color: var(--ink);
}

.changed-here__link {
  color: var(--focus-text);
  text-decoration: underline;
  text-underline-offset: 2px;
  /* A link that wraps across two lines has a box that covers its neighbour's
     centre, so the tap lands on the wrong link. Keep each name on one line. */
  white-space: nowrap;
}

.changed-here__link:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: 2px;
}
</style>

<style>
/* Applied to a SettingRow when its name is clicked in the Changed here line.
   Global because the row carries it across component boundaries. */
.calvin-row-flash {
  animation: calvin-row-flash calc(var(--dur) * 7) ease-out;
}

@keyframes calvin-row-flash {
  0%,
  35% {
    background: color-mix(in srgb, var(--focus) 18%, transparent);
    box-shadow: inset 3px 0 0 var(--focus);
  }
  100% {
    background: transparent;
    box-shadow: none;
  }
}

@media (prefers-reduced-motion: reduce) {
  .calvin-row-flash {
    animation: none;
  }
}
</style>
