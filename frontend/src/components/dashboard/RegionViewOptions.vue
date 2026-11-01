<template>
  <Popover v-model="open" :label="label" role="dialog" @close="open = false">
    <template #trigger="{ attrs }">
      <IconButton
        class="region-view-options__trigger"
        size="lg"
        :active="active"
        :label="label"
        :title="label"
        v-bind="attrs"
      >
        <!-- Sliders/"tune" glyph: reads as "adjust what I'm looking at", distinct
             from a settings gear (which lives in the Settings screen). -->
        <svg class="tune-glyph" viewBox="0 0 24 24" aria-hidden="true">
          <line x1="4" y1="7" x2="20" y2="7" />
          <line x1="4" y1="12" x2="20" y2="12" />
          <line x1="4" y1="17" x2="20" y2="17" />
          <circle cx="15" cy="7" r="2.4" class="knob" />
          <circle cx="9" cy="12" r="2.4" class="knob" />
          <circle cx="13" cy="17" r="2.4" class="knob" />
        </svg>
      </IconButton>
    </template>
    <div class="region-view-options__panel">
      <slot />
    </div>
  </Popover>
</template>

<script setup>
// Generic region view-options control: a tune trigger + the shared Popover that
// hosts region-specific quick display controls (calendar window/rolling today,
// service view options later). Owns nothing about a region's data — a consumer
// fills the default slot and drives `active` from whatever modifier is on.
import { ref } from "vue";
import IconButton from "@/components/ui/IconButton.vue";
import Popover from "@/components/ui/Popover.vue";

defineProps({
  // When a display modifier is engaged (e.g. calendar rolling), the trigger
  // lights up so the state is visible without opening the popover.
  active: { type: Boolean, default: false },
  label: { type: String, default: "View options" },
});

const open = ref(false);

defineExpose({ open });
</script>

<style scoped>
/* Panel inset/rhythm only: the floating shell (surface, border, radius,
   elevation, placement, Escape/outside close) comes from ui/Popover. */
.region-view-options__panel {
  min-width: 168px;
  padding: var(--gap-2) var(--gap-3);
  display: flex;
  flex-direction: column;
  gap: var(--gap-2);
}

/* The icon-only control's chrome comes from ui/IconButton; only the tune
   glyph's stroke styling is region-specific. Slotted SVG is compiled in this
   component's scope, so these scoped selectors reach it. The glyph inherits
   the button's `color`, so IconButton's active state (--focus) lights it up. */
.tune-glyph {
  width: 1.25rem; /* 20px, the header's icon box */
  height: 1.25rem;
  fill: none;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
}

.tune-glyph .knob {
  fill: currentColor;
  stroke: none;
}
</style>
