<template>
  <div v-if="isTouch" class="region-controls">
    <button
      type="button"
      class="cbtn"
      data-action="prev"
      :aria-label="`Previous in ${regionKind}`"
      @click="run('prev')"
    >
      ‹
    </button>
    <button
      type="button"
      class="cbtn"
      data-action="next"
      :aria-label="`Next in ${regionKind}`"
      @click="run('next')"
    >
      ›
    </button>
    <button
      v-if="actions.refresh"
      type="button"
      class="cbtn"
      data-action="refresh"
      :aria-label="`Refresh ${regionKind}`"
      @click="run('refresh')"
    >
      ↻
    </button>
    <button
      type="button"
      class="cbtn cbtn--primary"
      data-action="expand"
      :aria-label="`Expand ${regionKind}`"
      @click="run('expand')"
    >
      ⤢
    </button>
  </div>
</template>

<script setup>
import { computed } from "vue";
import { useKeyboardActions } from "@/composables/useKeyboardActions";
import { useTouchCapability } from "@/composables/useTouchCapability";

const props = defineProps({
  regionKind: {
    type: String,
    required: true,
    validator: v => ["calendar", "photos", "service"].includes(v),
  },
});

const { handleAction } = useKeyboardActions();
const { isTouch } = useTouchCapability();

const MAP = {
  calendar: {
    prev: "calendar_prev",
    next: "calendar_next",
    refresh: "calendar_refresh",
    expand: "calendar_expand",
  },
  photos: {
    prev: "images_prev",
    next: "images_next",
    refresh: null,
    expand: "photos_enter_fullscreen",
  },
  service: {
    prev: "web_service_prev",
    next: "web_service_next",
    refresh: "service_refresh",
    expand: "web_service_enter_fullscreen",
  },
};

const actions = computed(() => MAP[props.regionKind]);

const run = verb => {
  const action = actions.value[verb];
  if (action) handleAction(action);
};
</script>

<style scoped>
.region-controls {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.cbtn {
  min-width: 46px;
  min-height: 46px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 1.25rem;
  font-family: var(--font-ui);
  color: var(--ink);
  background: var(--bg-2);
  border: 1px solid var(--line);
  border-radius: 11px;
  cursor: pointer;
  transition:
    background 0.2s,
    border-color 0.2s;
}

.cbtn:hover {
  border-color: var(--focus-edge);
}

.cbtn--primary {
  background: var(--focus);
  color: var(--focus-ink);
  border-color: var(--focus);
}

.cbtn:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: 2px;
}

@media (prefers-reduced-motion: reduce) {
  .cbtn {
    transition: none;
  }
}
</style>
