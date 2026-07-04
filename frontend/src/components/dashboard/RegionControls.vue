<template>
  <div v-if="isTouch" class="region-controls" :class="sizeClass">
    <IconButton
      size="custom"
      data-action="prev"
      :label="`Previous in ${regionKind}`"
      @click="run('prev')"
    >
      ‹
    </IconButton>
    <IconButton
      size="custom"
      data-action="next"
      :label="`Next in ${regionKind}`"
      @click="run('next')"
    >
      ›
    </IconButton>
    <IconButton
      v-if="actions.refresh"
      size="custom"
      data-action="refresh"
      :label="`Refresh ${regionKind}`"
      @click="run('refresh')"
    >
      ↻
    </IconButton>
    <IconButton
      v-if="actions.expand"
      size="custom"
      variant="primary"
      data-action="expand"
      :label="`Fullscreen ${regionKind}`"
      @click="run('expand')"
    >
      ⤢
    </IconButton>
  </div>
</template>

<script setup>
import { computed } from "vue";
import IconButton from "@/components/ui/IconButton.vue";
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
/* The cluster buttons compose ui/IconButton (size="custom"). touchControlSize
   drives their box/font via the --icon-size / --icon-font vars, which the
   IconButton's .icon-btn--custom rule reads (custom properties inherit through
   the component boundary). All other chrome — border, radius, hover, focus,
   primary variant, reduced-motion — lives in the primitive. */
.region-controls {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  /* default = medium */
  --icon-size: 42px;
  --icon-font: 1.05rem;
}
.region-controls--small {
  --icon-size: 36px;
  --icon-font: 0.95rem;
}
.region-controls--medium {
  --icon-size: 42px;
  --icon-font: 1.05rem;
}
.region-controls--large {
  --icon-size: 50px;
  --icon-font: 1.25rem;
}
</style>
