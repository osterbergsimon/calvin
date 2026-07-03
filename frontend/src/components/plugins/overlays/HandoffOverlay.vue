<template>
  <div class="link-overlay" role="dialog" aria-modal="true" @click.self="emitClose">
    <div class="link-overlay__panel calvin-plugin-surface">
      <button type="button" class="link-overlay__close" data-test="close" aria-label="Close" @click="emitClose">
        ×
      </button>
      <p class="link-overlay__host">{{ host }}</p>
      <img v-if="qr" class="link-overlay__qr" :src="qr" alt="QR code for this link" />
      <p class="link-overlay__hint">Scan to open on your phone</p>
      <button type="button" class="link-overlay__open" data-test="open" @click="openNow">
        Open ↗
      </button>
    </div>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import QRCode from "qrcode";

const props = defineProps({
  url: { type: String, required: true },
});
const emit = defineEmits(["close"]);

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
  window.open(props.url, "_blank", "noopener");
  emitClose();
};

// Dismissal: Escape + a 45s idle auto-close so a wall display can never be left
// sitting on an overlay indefinitely.
const onKeydown = e => {
  if (e.key === "Escape") emitClose();
};
let idleTimer = null;
onMounted(() => {
  document.addEventListener("keydown", onKeydown, true);
  idleTimer = setTimeout(emitClose, 45000);
});
onBeforeUnmount(() => {
  document.removeEventListener("keydown", onKeydown, true);
  if (idleTimer) clearTimeout(idleTimer);
});
</script>

<style scoped>
.link-overlay {
  position: fixed;
  inset: 0;
  z-index: 1200;
  display: flex;
  align-items: center;
  justify-content: center;
  background: color-mix(in srgb, var(--bg-1) 78%, transparent);
}
.link-overlay__panel {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.6rem;
  padding: 1.5rem 1.75rem;
  min-width: 240px;
  background: var(--bg-2);
  border: 1px solid var(--line);
  border-radius: 14px;
  box-shadow: 0 12px 40px var(--shadow);
}
.link-overlay__close {
  position: absolute;
  top: 0.4rem;
  right: 0.55rem;
  border: 0;
  background: transparent;
  color: var(--ink-2);
  font-size: 1.4rem;
  line-height: 1;
  cursor: pointer;
}
.link-overlay__host {
  margin: 0;
  font-family: var(--font-data);
  font-size: 0.8rem;
  color: var(--ink-2);
  word-break: break-all;
  text-align: center;
}
.link-overlay__qr {
  width: 200px;
  height: 200px;
  image-rendering: pixelated;
  background: #fff;
  border-radius: 8px;
}
.link-overlay__hint {
  margin: 0;
  font-size: 0.75rem;
  color: var(--ink-3);
}
.link-overlay__open {
  margin-top: 0.25rem;
  padding: 0.45rem 1.1rem;
  border: 1px solid var(--focus-edge);
  border-radius: 8px;
  background: var(--focus);
  color: var(--focus-ink);
  font-size: 0.9rem;
  cursor: pointer;
}
.link-overlay__open:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: 2px;
}
</style>
