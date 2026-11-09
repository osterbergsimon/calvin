<template>
  <teleport to="body">
    <Dialog :model-value="true" label="Open this link on your phone" @close="emitClose">
      <div class="handoff">
        <p class="handoff__host">{{ host }}</p>
        <InlineNote v-if="blocked" data-test="handoff-blocked">
          {{ FRAME_BLOCKED_HANDOFF_NOTE }}
        </InlineNote>
        <img v-if="qr" class="handoff__qr" data-test="qr" :src="qr" alt="QR code for this link" />
        <InlineNote>Scan to open on your phone</InlineNote>
        <Button v-if="showOpen" variant="primary" data-test="open" @click="openNow">
          {{ onKiosk ? "Open here" : "Open ↗" }}
        </Button>
      </div>
    </Dialog>
  </teleport>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import QRCode from "qrcode";
import Button from "@/components/ui/Button.vue";
import Dialog from "@/components/ui/Dialog.vue";
import InlineNote from "@/components/ui/InlineNote.vue";
import { isKioskDisplay } from "@/utils/kioskId";
import { isHttpUrl } from "@/utils/safeUrl";
import { FRAME_BLOCKED_HANDOFF_NOTE } from "@/utils/frameBlockedCopy";

const props = defineProps({
  url: { type: String, required: true },
  // The site already refused to be embedded: a kiosk has nowhere left to open it.
  embedRefused: { type: Boolean, default: false },
  // Calvin's own policy blocked the embed (not the site refusing): say so.
  blocked: { type: Boolean, default: false },
});
const emit = defineEmits(["close", "embed"]);

// A kiosk browser has no tabs or back button, so a tapped link must never leave
// Calvin: Open shows the page in the embed overlay instead, and disappears once
// the site refuses embedding (the QR code is then the only way out).
const onKiosk = isKioskDisplay();
const showOpen = computed(() => !(onKiosk && props.embedRefused));

const qr = ref("");
const host = computed(() => {
  try {
    return new URL(props.url).host;
  } catch {
    return props.url;
  }
});

const renderQr = async url => {
  try {
    qr.value = await QRCode.toDataURL(url, { margin: 1, width: 220 });
  } catch {
    qr.value = "";
  }
};
watch(() => props.url, renderQr, { immediate: true });

const emitClose = () => emit("close");
const openNow = () => {
  if (!isHttpUrl(props.url)) return;
  if (onKiosk) {
    emit("embed");
    return;
  }
  window.open(props.url, "_blank", "noopener");
  emitClose();
};

// Dismissal: Escape (Dialog) plus a 45s idle auto-close so a wall display can
// never be left sitting on an overlay indefinitely.
let idleTimer = null;
onMounted(() => {
  idleTimer = setTimeout(emitClose, 45000);
});
onBeforeUnmount(() => {
  if (idleTimer) clearTimeout(idleTimer);
});
</script>

<style scoped>
.handoff {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--gap-3);
  padding-bottom: var(--gap-2);
}
.handoff__host {
  margin: 0;
  font-family: var(--font-data);
  font-size: var(--text-meta);
  color: var(--ink-2);
  word-break: break-all;
  text-align: center;
}
.handoff__qr {
  width: 200px;
  height: 200px;
  image-rendering: pixelated;
  background: var(--qr-surface); /* QR codes need a light quiet zone in dark themes too */
  border-radius: var(--radius-control);
}
</style>
