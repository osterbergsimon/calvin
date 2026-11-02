<template>
  <div class="dialog-scrim" :class="{ 'is-blurred': blur }" @click="$emit('dismiss')" />
</template>

<script setup>
defineProps({
  blur: { type: Boolean, default: false },
});
defineEmits(["dismiss"]);
</script>

<style scoped>
.dialog-scrim {
  position: fixed;
  inset: 0;
  /* On the dialog layer; every caller renders the scrim before its panel, so
     the panel (same layer, later in the DOM) paints above it. */
  z-index: var(--z-dialog);
  background: color-mix(in srgb, var(--bg-0) 72%, transparent);
  animation: scrim-in var(--dur) var(--ease);
}
.dialog-scrim.is-blurred {
  /* Progressive enhancement — Raspberry Pi GPUs may ignore/struggle with
     backdrop-filter; the dim above is the reliable baseline. */
  backdrop-filter: blur(6px);
}
@keyframes scrim-in {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}
@media (prefers-reduced-motion: reduce) {
  .dialog-scrim {
    animation: none;
  }
}
</style>
