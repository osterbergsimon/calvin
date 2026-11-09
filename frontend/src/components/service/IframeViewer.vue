<template>
  <div class="iframe-viewer">
    <iframe
      ref="iframe"
      :src="frameSrc"
      :sandbox="onKiosk ? kioskSandboxFor(frameSrc) : undefined"
      class="service-iframe"
      :class="{ 'iframe-error': iframeError }"
      frameborder="0"
      allowfullscreen
      @load="handleIframeLoad"
      @error="handleIframeError"
    />

    <!-- CORS/Iframe Error Message -->
    <div v-if="iframeError" class="iframe-error-message">
      <div class="error-content">
        <h3 class="heading-title">
          <svg class="error-content__icon" viewBox="0 0 24 24" aria-hidden="true">
            <path :d="mdiAlert" />
          </svg>
          {{ frameBlock.blocked.value ? FRAME_BLOCKED_TITLE : "Cannot Display Service" }}
        </h3>
        <p v-if="frameBlock.blocked.value" data-test="frame-blocked-body">
          {{ frameBlockedBody(frameBlock.sealed.value) }}
        </p>
        <p v-else>
          This service cannot be embedded in an iframe due to security restrictions
          (CORS/X-Frame-Options).
        </p>
        <p class="service-url">
          {{ url }}
        </p>
        <div class="error-actions">
          <button v-if="onKiosk" class="btn-open-new" data-test="show-qr" @click="showQr = true">
            Show QR Code
          </button>
          <a v-else :href="url" target="_blank" rel="noopener noreferrer" class="btn-open-new">
            Open in New Window
          </a>
          <button v-if="!frameBlock.blocked.value" class="btn-retry" @click="retryLoad">
            Retry
          </button>
        </div>
      </div>
    </div>
    <HandoffOverlay v-if="showQr" :url="url" embed-refused @close="showQr = false" />
  </div>
</template>

<script setup>
import { computed, ref, watch, onUnmounted } from "vue";
import { mdiAlert } from "@mdi/js";
import HandoffOverlay from "../plugins/overlays/HandoffOverlay.vue";
import { isKioskDisplay } from "../../utils/kioskId";
import { isHttpUrl } from "../../utils/safeUrl";
import { kioskSandboxFor } from "../../utils/kioskSandbox";
import { FRAME_BLOCKED_TITLE, frameBlockedBody } from "../../utils/frameBlockedCopy";
import { useFrameBlockDetection } from "../../composables/useFrameBlockDetection";

const props = defineProps({
  url: {
    type: String,
    required: true,
  },
});

const emit = defineEmits(["error"]);

// A kiosk has no way back from an opened tab: offer the QR handoff instead.
const onKiosk = isKioskDisplay();
// Only http(s) is ever framed (a plugin or feed may carry javascript: or data:).
const frameSrc = computed(() => (isHttpUrl(props.url) ? props.url : "about:blank"));
const showQr = ref(false);
const iframe = ref(null);
const iframeError = ref(false);
const iframeLoadTimeout = ref(null);

// A CSP-blocked frame still fires load afterwards: that must not clear the error.
const frameBlock = useFrameBlockDetection(frameSrc, () => handleIframeError());

const handleIframeLoad = () => {
  if (frameBlock.blocked.value) return;
  iframeError.value = false;
  if (iframeLoadTimeout.value) {
    clearTimeout(iframeLoadTimeout.value);
    iframeLoadTimeout.value = null;
  }
};

const handleIframeError = () => {
  iframeError.value = true;
  emit("error", frameBlock.blocked.value ? { reason: "blocked" } : undefined);
  if (iframeLoadTimeout.value) {
    clearTimeout(iframeLoadTimeout.value);
    iframeLoadTimeout.value = null;
  }
};

const retryLoad = () => {
  iframeError.value = false;
  frameBlock.reset();
  if (iframe.value) {
    // Force reload by setting src again
    const url = frameSrc.value;
    iframe.value.src = "";
    setTimeout(() => {
      if (iframe.value) {
        iframe.value.src = url;
      }
    }, 100);
  }
};

// Set a timeout to detect if iframe doesn't load
watch(
  () => props.url,
  () => {
    iframeError.value = false;
    frameBlock.reset();
    if (iframeLoadTimeout.value) {
      clearTimeout(iframeLoadTimeout.value);
    }
    iframeLoadTimeout.value = setTimeout(() => {
      // If iframe hasn't loaded after 5 seconds, show error
      if (iframe.value) {
        try {
          const iframeEl = iframe.value;
          if (iframeEl.contentDocument === null && iframeEl.contentWindow === null) {
            iframeError.value = true;
            emit("error");
          }
        } catch (e) {
          // CORS error is expected, not necessarily a problem
          console.log("Cannot check iframe content (CORS):", e.message);
        }
      }
    }, 5000);
  },
  { immediate: true }
);

onUnmounted(() => {
  if (iframeLoadTimeout.value) {
    clearTimeout(iframeLoadTimeout.value);
  }
});
</script>

<style scoped>
.iframe-viewer {
  width: 100%;
  height: 100%;
  position: relative;
}

.service-iframe {
  width: 100%;
  height: 100%;
  border: none;
  background: var(--bg-1);
}

.service-iframe.iframe-error {
  opacity: 0.3;
}

.iframe-error-message {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-1);
  z-index: var(--z-raised);
}

.error-content {
  text-align: center;
  padding: 2rem;
  max-width: 500px;
}

.error-content h3 {
  display: inline-flex;
  align-items: center;
  gap: var(--gap-2);
  margin: 0 0 var(--gap-4);
  color: var(--err-text);
}

.error-content__icon {
  width: 1.2em;
  height: 1.2em;
  flex: 0 0 auto;
  fill: currentColor;
}

.error-content p {
  margin: 0.5rem 0;
  color: var(--ink-2);
}

.service-url {
  font-family: monospace;
  font-size: var(--fs-md);
  word-break: break-all;
  color: var(--ink);
  background: var(--bg-2);
  padding: 0.5rem;
  border-radius: var(--radius-sm);
  margin: 1rem 0;
}

.error-actions {
  display: flex;
  gap: 1rem;
  justify-content: center;
  margin-top: 1.5rem;
}

.btn-open-new,
.btn-retry {
  padding: 0.75rem 1.5rem;
  border-radius: var(--radius-sm);
  font-size: var(--fs-base);
  cursor: pointer;
  /* Hover feedback is a colour swap, not an animated filter (kiosk GPU). */
  transition: background var(--dur);
}

.btn-open-new {
  background: var(--focus);
  color: var(--focus-ink);
  text-decoration: none;
  border: none;
}

.btn-open-new:hover {
  background: color-mix(in srgb, var(--focus) 92%, var(--ink));
}

.btn-retry {
  background: var(--bg-2);
  color: var(--ink);
  border: 1px solid var(--line);
}

.btn-retry:hover {
  background: var(--bg-0);
}
</style>
