<template>
  <div
    class="list-row"
    :class="{ 'list-row--selected': selected, 'list-row--disabled': disabled }"
    :aria-current="selected ? 'true' : undefined"
    :aria-disabled="disabled ? 'true' : undefined"
  >
    <div v-if="lead || $slots.lead" class="list-row__lead">
      <slot name="lead">
        <svg class="list-row__glyph" viewBox="0 0 24 24" aria-hidden="true">
          <path :d="lead" fill="currentColor" />
        </svg>
      </slot>
    </div>

    <div class="list-row__body">
      <span class="list-row__name">{{ name }}</span>
      <slot name="meta">
        <span
          v-for="(line, index) in metaLines"
          :key="index"
          class="list-row__meta"
          :class="line.tone ? `list-row__meta--${line.tone}` : undefined"
        >
          {{ line.text }}
        </span>
      </slot>
      <slot />
    </div>

    <div v-if="$slots.actions" class="list-row__actions"><slot name="actions" /></div>
  </div>
</template>

<script setup>
import { computed } from "vue";

// The one item row (docs/design/frontend-doctrine.md §3, §4.4): lead · body ·
// actions. Screens, sources, keys and plugins build their lists from it instead
// of a per-feature card. The actions group never wraps internally; under 600px
// the whole group moves under the body as one right-aligned line.
const props = defineProps({
  name: { type: String, required: true },
  // ["CalDAV · 12 events", { text: "Last sync failed", tone: "err" }]
  meta: { type: Array, default: () => [] },
  // An @mdi/js path, or use the lead slot for a dot or thumbnail.
  lead: { type: String, default: "" },
  selected: { type: Boolean, default: false },
  disabled: { type: Boolean, default: false },
});

const metaLines = computed(() =>
  props.meta.map(line =>
    typeof line === "string" ? { text: line, tone: "" } : { text: line.text, tone: line.tone || "" }
  )
);
</script>

<style scoped>
.list-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--gap-inline) var(--gap-3);
  padding: var(--gap-3) var(--gap-4);
  color: var(--ink);
  background: var(--bg-2);
  border: 1px solid var(--line);
  border-radius: var(--radius-card);
  transition:
    background var(--dur-fast) var(--ease),
    border-color var(--dur-fast) var(--ease);
}

.list-row:hover {
  background: color-mix(in srgb, var(--ink) 4%, var(--bg-2));
}

.list-row--selected {
  background: color-mix(in srgb, var(--focus) 16%, var(--bg-2));
  border-color: var(--focus);
}

.list-row--disabled {
  opacity: 0.5;
}

.list-row__lead {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  color: var(--ink-3);
}

.list-row__glyph {
  width: 1.25rem;
  height: 1.25rem;
  fill: currentColor;
}

.list-row__body {
  display: flex;
  flex: 1 1 12rem;
  flex-direction: column;
  min-width: 0;
  gap: var(--gap-tight);
}

.list-row__name {
  overflow: hidden;
  font-family: var(--font-ui);
  font-size: var(--text-label);
  font-weight: var(--weight-strong);
  color: var(--ink);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.list-row__meta {
  font-family: var(--font-ui);
  font-size: var(--text-meta);
  color: var(--ink-2);
}

.list-row__meta--ok {
  color: var(--ok-text);
}

.list-row__meta--warn {
  color: var(--warn-text);
}

.list-row__meta--err {
  color: var(--err-text);
}

.list-row__actions {
  display: flex;
  flex: 0 0 auto;
  flex-wrap: nowrap;
  align-items: center;
  gap: var(--gap-inline);
  margin-left: auto;
}

@media (max-width: 600px) {
  .list-row {
    align-items: flex-start;
  }

  .list-row__actions {
    width: 100%;
    justify-content: flex-end;
    margin-left: 0;
  }
}

@media (prefers-reduced-motion: reduce) {
  .list-row {
    transition: none;
  }
}
</style>
