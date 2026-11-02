<!-- frontend/src/components/ui/OnScreenKeyboardLoader.vue -->
<template>
  <!-- Nothing until a field that actually uses the keyboard gets focus: the
       OSK chunk (and simple-keyboard) is not on the dashboard's first paint. -->
  <OnScreenKeyboard v-if="requested" />
</template>

<script setup>
import { defineAsyncComponent, onMounted, onUnmounted, ref } from "vue";
import { isOskTarget } from "@/composables/useOnScreenKeyboard";

defineOptions({ name: "OnScreenKeyboardLoader" });

// The keyboard is fixed-position, so mounting it late causes no layout shift.
// It is loaded once, on first need, and stays mounted for the rest of the page.
const OnScreenKeyboard = defineAsyncComponent({
  loader: () => import("./OnScreenKeyboard.vue"),
  delay: 0,
});

const requested = ref(false);
let listening = false;

const requestFor = element => {
  if (requested.value || !isOskTarget(element)) return;
  requested.value = true;
  stopListening();
};

const onFocusIn = event => requestFor(event.target);

const stopListening = () => {
  if (!listening) return;
  document.removeEventListener("focusin", onFocusIn, true);
  listening = false;
};

onMounted(() => {
  // A field can already be focused by the time the app shell mounts (the
  // Settings lock screen, a dialog's initial focus): no focusin will follow.
  requestFor(document.activeElement);
  if (!requested.value) {
    document.addEventListener("focusin", onFocusIn, true);
    listening = true;
  }
});

onUnmounted(stopListening);
</script>
