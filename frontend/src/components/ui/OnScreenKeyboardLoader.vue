<!-- frontend/src/components/ui/OnScreenKeyboardLoader.vue -->
<template>
  <!-- Nothing until a field that actually uses the keyboard gets focus: the
       OSK chunk (and simple-keyboard) is not on the dashboard's first paint. -->
  <component :is="keyboard" v-if="keyboard" />
  <!-- A failed chunk load (flaky Wi-Fi on a kiosk) must not leave the keyboard
       dead until the page is reloaded (calvin-o8c1): offer a retry. -->
  <div v-else-if="failed" class="osk-load-error" role="alert">
    <span>The on-screen keyboard did not load.</span>
    <button type="button" class="osk-load-error__retry" data-test="osk-retry" @click="load">
      Retry
    </button>
  </div>
</template>

<script setup>
import { markRaw, onMounted, onUnmounted, ref, shallowRef } from "vue";
import { logWarn } from "@/utils/logger";
import { isOskTarget } from "@/composables/useOnScreenKeyboard";

defineOptions({ name: "OnScreenKeyboardLoader" });

// The keyboard is fixed-position, so mounting it late causes no layout shift.
// It is loaded once, on first need, and stays mounted for the rest of the page.
const keyboard = shallowRef(null);
const failed = ref(false);
let loading = false;

const load = async () => {
  if (loading || keyboard.value) return;
  loading = true;
  failed.value = false;
  try {
    keyboard.value = markRaw((await import("./OnScreenKeyboard.vue")).default);
  } catch (error) {
    logWarn("[OnScreenKeyboardLoader]", "Keyboard chunk failed to load:", error);
    failed.value = true;
  } finally {
    loading = false;
  }
};

const requested = ref(false);
let listening = false;

const requestFor = element => {
  if (requested.value || !isOskTarget(element)) return;
  requested.value = true;
  stopListening();
  void load();
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

<style scoped>
.osk-load-error {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: var(--z-osk);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 12px;
  background: var(--bg-0);
  border-top: 1px solid var(--line);
  color: var(--ink-1, inherit);
}
.osk-load-error__retry {
  min-height: 44px;
  padding: 0 16px;
  border: 1px solid var(--line);
  border-radius: var(--radius-control);
  background: var(--bg-1, var(--bg-0));
  color: inherit;
  font: inherit;
}
</style>
