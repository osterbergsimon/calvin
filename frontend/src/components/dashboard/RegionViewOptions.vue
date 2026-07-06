<template>
  <div ref="root" class="region-view-options">
    <IconButton
      class="region-view-options__trigger"
      size="custom"
      :active="active"
      :label="label"
      :title="label"
      :aria-expanded="open ? 'true' : 'false'"
      @click.stop="toggle"
    >
      <!-- Sliders/"tune" glyph: reads as "adjust what I'm looking at", distinct
           from a settings gear (which lives in the Settings screen). -->
      <svg class="tune-glyph" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
        <line x1="4" y1="7" x2="20" y2="7" />
        <line x1="4" y1="12" x2="20" y2="12" />
        <line x1="4" y1="17" x2="20" y2="17" />
        <circle cx="15" cy="7" r="2.4" class="knob" />
        <circle cx="9" cy="12" r="2.4" class="knob" />
        <circle cx="13" cy="17" r="2.4" class="knob" />
      </svg>
    </IconButton>
    <div v-if="open" class="region-view-options__popover" @click.stop>
      <slot />
    </div>
  </div>
</template>

<script setup>
// Generic region view-options control: a tune trigger + a popover shell that
// hosts region-specific quick display controls (calendar window/rolling today,
// service view options later). Owns nothing about a region's data — a consumer
// fills the default slot and drives `active` from whatever modifier is on.
import { onBeforeUnmount, ref, watch } from "vue";
import IconButton from "@/components/ui/IconButton.vue";

defineProps({
  // When a display modifier is engaged (e.g. calendar rolling), the trigger
  // lights up so the state is visible without opening the popover.
  active: { type: Boolean, default: false },
  label: { type: String, default: "View options" },
});

const root = ref(null);
const open = ref(false);

const toggle = () => (open.value = !open.value);
const close = () => (open.value = false);

const onDocPointer = e => {
  if (root.value && !root.value.contains(e.target)) close();
};
const onKeydown = e => {
  if (e.key === "Escape") close();
};

// Listeners exist only while open. Capture phase so an outside pointerdown is
// caught before other handlers can stop it. The opening click's pointerdown
// fires before this watch attaches the listener, so it never self-closes.
watch(open, isOpen => {
  if (isOpen) {
    document.addEventListener("pointerdown", onDocPointer, true);
    document.addEventListener("keydown", onKeydown, true);
  } else {
    document.removeEventListener("pointerdown", onDocPointer, true);
    document.removeEventListener("keydown", onKeydown, true);
  }
});

onBeforeUnmount(() => {
  document.removeEventListener("pointerdown", onDocPointer, true);
  document.removeEventListener("keydown", onKeydown, true);
});

defineExpose({ open, close });
</script>

<style scoped>
.region-view-options {
  position: relative;
  display: inline-flex;
}

/* Button chrome (size/border/hover/focus/active) comes from ui/IconButton; only
   the tune glyph's stroke styling is region-specific. Slotted SVG is compiled in
   this component's scope, so these scoped selectors reach it. The glyph inherits
   the button's `color`, so IconButton's active state (--focus) lights it up. */
.tune-glyph {
  fill: none;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
}

.tune-glyph .knob {
  fill: currentColor;
  stroke: none;
}

.region-view-options__popover {
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  z-index: 20;
  min-width: 168px;
  padding: 0.5rem 0.6rem;
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  background: var(--bg-2);
  border: 1px solid var(--line);
  border-radius: 10px;
  box-shadow: 0 8px 24px var(--shadow);
}
</style>
