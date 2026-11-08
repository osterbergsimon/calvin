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
        <IframeViewer :url="url" @error="$emit('fallback')" />
      </div>
      <!-- A site that refuses framing fires load, not error, so a refusal cannot
           be detected: on a kiosk the QR handoff is always one tap away. -->
      <template v-if="onKiosk" #actions>
        <Button variant="secondary" data-test="embed-qr" @click="$emit('fallback')">
          Show QR code
        </Button>
      </template>
    </Dialog>
  </teleport>
</template>

<script setup>
import { onBeforeUnmount, onMounted } from "vue";
import Button from "@/components/ui/Button.vue";
import Dialog from "@/components/ui/Dialog.vue";
import IframeViewer from "@/components/service/IframeViewer.vue";
import { isKioskDisplay } from "@/utils/kioskId";

// A plugin link that asks for an embed opens the one Dialog shell in its full
// size: scrim, focus trap, Escape, close button and the OSK layer all come from
// Dialog. The frame fills the body; IframeViewer keeps its own error fallback.
defineProps({ url: { type: String, required: true } });
const emit = defineEmits(["close", "fallback"]);

const onKiosk = isKioskDisplay();

// Taps inside the frame never reach this page, so an idle timer cannot be reset
// by them: on a kiosk the embed gets a hard cap, then closes, so a wall never
// sits on a third-party page indefinitely.
const KIOSK_EMBED_CAP_MS = 5 * 60 * 1000;
let capTimer = null;
onMounted(() => {
  if (onKiosk) capTimer = setTimeout(() => emit("close"), KIOSK_EMBED_CAP_MS);
});
onBeforeUnmount(() => {
  if (capTimer) clearTimeout(capTimer);
});
</script>

<style scoped>
.embed-overlay__frame {
  flex: 1 1 auto;
  min-height: 0;
}
</style>
