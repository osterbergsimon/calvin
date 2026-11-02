<template>
  <div class="dialog-scrim" @click="$emit('dismiss')" />
</template>

<script setup>
defineEmits(["dismiss"]);
</script>

<style scoped>
.dialog-scrim {
  position: fixed;
  inset: 0;
  /* On the dialog layer; every caller renders the scrim before its panel, so
     the panel (same layer, later in the DOM) paints above it. */
  z-index: var(--z-dialog);
  /* The dim is the whole effect: a backdrop blur re-runs over the full screen
     on every fade frame, which crawls on the Pi kiosk (cog / WPE WebKit). */
  background: color-mix(in srgb, var(--bg-0) 78%, transparent);
  animation: scrim-in var(--dur) var(--ease);
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
