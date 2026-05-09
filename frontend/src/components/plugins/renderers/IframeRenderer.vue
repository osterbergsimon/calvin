<template>
  <div class="iframe-renderer">
    <iframe
      v-if="url"
      ref="iframe"
      :src="url"
      class="iframe-renderer__frame"
      :class="{ 'iframe-renderer__frame--error': error }"
      frameborder="0"
      allowfullscreen
      @load="handleLoad"
      @error="handleError"
    />

    <div v-if="error" class="iframe-renderer__error calvin-plugin-error">
      <div class="iframe-renderer__error-content">
        <h3>⚠️ Cannot Display Service</h3>
        <p>
          This service cannot be embedded in an iframe due to security restrictions
          (CORS/X-Frame-Options).
        </p>
        <p v-if="url" class="iframe-renderer__url">{{ url }}</p>
        <div class="iframe-renderer__actions">
          <a
            v-if="url"
            :href="url"
            target="_blank"
            rel="noopener noreferrer"
            class="iframe-renderer__btn iframe-renderer__btn--primary"
          >
            Open in New Window
          </a>
          <button class="iframe-renderer__btn iframe-renderer__btn--secondary" @click="retry">
            Retry
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onUnmounted, ref, watch } from "vue";
import { resolvePath } from "../../../utils/jsonPath";

const props = defineProps({
  schema: { type: Object, required: true },
  data: { type: [Object, Array, null], default: null },
});

const url = computed(() => {
  if (props.schema.url_path) {
    return resolvePath(props.data, props.schema.url_path) || "";
  }
  return props.schema.url || "";
});

const iframe = ref(null);
const error = ref(false);
let loadTimer = null;

function clearTimer() {
  if (loadTimer) {
    clearTimeout(loadTimer);
    loadTimer = null;
  }
}

function handleLoad() {
  error.value = false;
  clearTimer();
}

function handleError() {
  error.value = true;
  clearTimer();
}

function retry() {
  error.value = false;
  if (!iframe.value) return;
  const current = url.value;
  iframe.value.src = "";
  setTimeout(() => {
    if (iframe.value) iframe.value.src = current;
  }, 100);
}

watch(
  url,
  () => {
    error.value = false;
    clearTimer();
    loadTimer = setTimeout(() => {
      const el = iframe.value;
      if (!el) return;
      try {
        if (el.contentDocument === null && el.contentWindow === null) {
          error.value = true;
        }
      } catch {
        // Cross-origin reads throw — that's expected, not a load failure.
      }
    }, 5000);
  },
  { immediate: true }
);

onUnmounted(clearTimer);
</script>

<style scoped>
.iframe-renderer {
  width: 100%;
  height: 100%;
  position: relative;
}

.iframe-renderer__frame {
  width: 100%;
  height: 100%;
  border: none;
  background: var(--bg-primary);
}

.iframe-renderer__frame--error {
  opacity: 0.3;
}

.iframe-renderer__error {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-primary);
  z-index: 10;
}

.iframe-renderer__error-content {
  text-align: center;
  padding: 2rem;
  max-width: 500px;
}

.iframe-renderer__error-content h3 {
  margin: 0 0 1rem 0;
  color: var(--accent-error);
  font-size: 1.5rem;
}

.iframe-renderer__error-content p {
  margin: 0.5rem 0;
  color: var(--text-secondary);
}

.iframe-renderer__url {
  font-family: monospace;
  font-size: 0.9rem;
  word-break: break-all;
  color: var(--text-primary);
  background: var(--bg-secondary);
  padding: 0.5rem;
  border-radius: 4px;
  margin: 1rem 0;
}

.iframe-renderer__actions {
  display: flex;
  gap: 1rem;
  justify-content: center;
  margin-top: 1.5rem;
}

.iframe-renderer__btn {
  padding: 0.75rem 1.5rem;
  border-radius: 4px;
  font-size: 1rem;
  cursor: pointer;
  transition: all 0.2s;
  border: 1px solid transparent;
}

.iframe-renderer__btn--primary {
  background: var(--accent-primary);
  color: white;
  text-decoration: none;
}

.iframe-renderer__btn--primary:hover {
  background: var(--accent-secondary);
}

.iframe-renderer__btn--secondary {
  background: var(--bg-secondary);
  color: var(--text-primary);
  border-color: var(--border-color);
}

.iframe-renderer__btn--secondary:hover {
  background: var(--bg-tertiary);
}
</style>
