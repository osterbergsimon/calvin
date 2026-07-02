<template>
  <div v-if="isTouch" class="region-controls" :class="sizeClass">
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
      v-if="actions.expand"
      type="button"
      class="cbtn cbtn--primary"
      data-action="expand"
      :aria-label="`Fullscreen ${regionKind}`"
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
import { useConfigStore } from "@/stores/config";

const props = defineProps({
  regionKind: {
    type: String,
    required: true,
    validator: v => ["calendar", "photos", "service"].includes(v),
  },
});

const { handleAction } = useKeyboardActions();
const { isTouch } = useTouchCapability();
const configStore = useConfigStore();

const sizeClass = computed(() => {
  const size = configStore.touchControlSize;
  const valid = ["small", "medium", "large"].includes(size) ? size : "medium";
  return `region-controls--${valid}`;
});

const MAP = {
  calendar: {
    prev: "calendar_prev",
    next: "calendar_next",
    refresh: "calendar_refresh",
    // Touch ⤢ maximizes the calendar (tapping an event opens it directly, so
    // ⤢ is free for fullscreen). Keyboard calendar_expand — which opens the
    // marked event — is unaffected; this only governs the touch cluster.
    expand: "calendar_enter_fullscreen",
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
  gap: 0.35rem;
  /* default = medium */
  --cbtn-size: 42px;
  --cbtn-font: 1.05rem;
}
.region-controls--small {
  --cbtn-size: 36px;
  --cbtn-font: 0.95rem;
}
.region-controls--medium {
  --cbtn-size: 42px;
  --cbtn-font: 1.05rem;
}
.region-controls--large {
  --cbtn-size: 50px;
  --cbtn-font: 1.25rem;
}

.cbtn {
  min-width: var(--cbtn-size);
  min-height: var(--cbtn-size);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: var(--cbtn-font);
  font-family: var(--font-ui);
  color: var(--ink);
  background: var(--bg-2);
  border: 1px solid var(--line);
  border-radius: 9px;
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
