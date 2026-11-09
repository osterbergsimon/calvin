<template>
  <teleport to="body">
    <Dialog
      :model-value="true"
      label="Embedded page"
      size="full"
      scrim-blur
      @close="$emit('close')"
    >
      <div class="embed-overlay__frame">
        <IframeViewer :url="url" @error="onFrameError" />
      </div>
      <!-- A frame blocked by Calvin's CSP is detected (securitypolicyviolation) and
           falls back via IframeViewer's error. A site that refuses framing with
           X-Frame-Options fires load, not error, and cannot be detected: on a
           kiosk the QR handoff is always one tap away. -->
      <template v-if="onKiosk" #actions>
        <InlineNote v-if="secondsLeft !== null" role="status" data-test="embed-closing">
          Closing in {{ secondsLeft }} s
        </InlineNote>
        <Button
          v-if="secondsLeft !== null"
          variant="primary"
          data-test="embed-keep"
          @click="keepOpen"
        >
          Keep open
        </Button>
        <Button variant="secondary" data-test="embed-qr" @click="$emit('fallback')">
          Show QR code
        </Button>
      </template>
    </Dialog>
  </teleport>
</template>

<script setup>
import { onBeforeUnmount, onMounted, ref } from "vue";
import Button from "@/components/ui/Button.vue";
import Dialog from "@/components/ui/Dialog.vue";
import InlineNote from "@/components/ui/InlineNote.vue";
import IframeViewer from "@/components/service/IframeViewer.vue";
import { isKioskDisplay } from "@/utils/kioskId";

// A plugin link that asks for an embed opens the one Dialog shell in its full
// size: scrim, focus trap, Escape, close button and the OSK layer all come from
// Dialog. The frame fills the body; IframeViewer keeps its own error fallback.
defineProps({ url: { type: String, required: true } });
const emit = defineEmits(["close", "fallback"]);

const onKiosk = isKioskDisplay();

// Only a real CSP block carries a flag: the Show QR button emits a plain
// fallback, so the handoff's "can't be shown" note never follows a working page.
const onFrameError = info => {
  if (info?.reason === "blocked") emit("fallback", { blocked: true });
  else emit("fallback");
};

// Taps inside the frame never reach this page, so an idle timer cannot be reset
// by them: on a kiosk the embed gets a hard cap, then closes, so a wall never
// sits on a third-party page indefinitely. The last 30 seconds say so, and
// Keep open (a tap on Calvin's own button) starts the cap again.
const KIOSK_EMBED_CAP_MS = 5 * 60 * 1000;
const WARNING_MS = 30 * 1000;
const secondsLeft = ref(null);
let capTimer = null;
let warnTimer = null;
let tick = null;

const clearTimers = () => {
  if (capTimer) clearTimeout(capTimer);
  if (warnTimer) clearTimeout(warnTimer);
  if (tick) clearInterval(tick);
  capTimer = warnTimer = tick = null;
};

const startWarning = () => {
  secondsLeft.value = Math.round(WARNING_MS / 1000);
  tick = setInterval(() => {
    if (secondsLeft.value > 0) secondsLeft.value -= 1;
  }, 1000);
};

const arm = () => {
  clearTimers();
  secondsLeft.value = null;
  warnTimer = setTimeout(startWarning, KIOSK_EMBED_CAP_MS - WARNING_MS);
  capTimer = setTimeout(() => emit("close"), KIOSK_EMBED_CAP_MS);
};

const keepOpen = () => arm();

onMounted(() => {
  if (onKiosk) arm();
});
onBeforeUnmount(clearTimers);
</script>

<style scoped>
.embed-overlay__frame {
  flex: 1 1 auto;
  min-height: 0;
}
</style>
