<template>
  <div class="iframe-viewer">
    <iframe
      ref="iframe"
      :src="url"
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
        <h3>⚠️ Cannot Display Service</h3>
        <p>
          This service cannot be embedded in an iframe due to security
          restrictions (CORS/X-Frame-Options).
        </p>
        <p class="service-url">{{ url }}</p>
        <div class="error-actions">
          <a
            :href="url"
            target="_blank"
            rel="noopener noreferrer"
            class="btn-open-new"
          >
            Open in New Window
          </a>
          <button class="btn-retry" @click="retryLoad">Retry</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, watch, onUnmounted } from "vue";

const props = defineProps({
  url: {
    type: String,
    required: true,
  },
});

const iframe = ref(null);
const iframeError = ref(false);
const iframeLoadTimeout = ref(null);

const handleIframeLoad = () => {
  iframeError.value = false;
  if (iframeLoadTimeout.value) {
    clearTimeout(iframeLoadTimeout.value);
    iframeLoadTimeout.value = null;
  }
};

const handleIframeError = () => {
  iframeError.value = true;
  if (iframeLoadTimeout.value) {
    clearTimeout(iframeLoadTimeout.value);
    iframeLoadTimeout.value = null;
  }
};

const retryLoad = () => {
  iframeError.value = false;
  if (iframe.value) {
    // Force reload by setting src again
    const url = props.url;
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
    if (iframeLoadTimeout.value) {
      clearTimeout(iframeLoadTimeout.value);
    }
    iframeLoadTimeout.value = setTimeout(() => {
      // If iframe hasn't loaded after 5 seconds, show error
      if (iframe.value) {
        try {
          const iframeEl = iframe.value;
          if (
            iframeEl.contentDocument === null &&
            iframeEl.contentWindow === null
          ) {
            iframeError.value = true;
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
  background: var(--bg-primary);
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
  background: var(--bg-primary);
  z-index: 10;
}

.error-content {
  text-align: center;
  padding: 2rem;
  max-width: 500px;
}

.error-content h3 {
  margin: 0 0 1rem 0;
  color: var(--accent-error);
  font-size: 1.5rem;
}

.error-content p {
  margin: 0.5rem 0;
  color: var(--text-secondary);
}

.service-url {
  font-family: monospace;
  font-size: 0.9rem;
  word-break: break-all;
  color: var(--text-primary);
  background: var(--bg-secondary);
  padding: 0.5rem;
  border-radius: 4px;
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
  border-radius: 4px;
  font-size: 1rem;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-open-new {
  background: var(--accent-primary);
  color: white;
  text-decoration: none;
  border: none;
}

.btn-open-new:hover {
  background: var(--accent-secondary);
}

.btn-retry {
  background: var(--bg-secondary);
  color: var(--text-primary);
  border: 1px solid var(--border-color);
}

.btn-retry:hover {
  background: var(--bg-tertiary);
}
</style>

