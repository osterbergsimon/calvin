<template>
  <slot />
</template>

<script setup>
// Tells everything inside one dashboard screen whether that screen is the one
// on display. With the screen stack on, hidden screens stay mounted, and their
// regions use this to pause work nobody can see (photo rotation).
import { provide, toRef } from "vue";

const props = defineProps({
  visible: { type: Boolean, default: true },
});

provide("screenVisible", toRef(props, "visible"));
</script>
