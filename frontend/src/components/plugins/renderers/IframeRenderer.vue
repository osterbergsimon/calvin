<template>
  <div class="iframe-renderer">
    <iframe
      v-if="url"
      ref="iframe"
      :src="url"
      class="iframe-renderer__frame"
      :class="{ 'iframe-renderer__frame--error': error }"
      frameborder="0"
      referrerpolicy="no-referrer"
      sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
      allowfullscreen
      @load="handleLoad"
      @error="handleError"
    />

    <div v-if="error" class="iframe-renderer__error">
      <div class="iframe-renderer__error-content">
        <h3>This site won't embed</h3>
        <p>It blocks being shown inside another page (X-Frame-Options/CSP).</p>
        <p v-if="url" class="iframe-renderer__url">{{ url }}</p>
        <div class="iframe-renderer__actions">
          <a
            v-if="url"
            :href="url"
            target="_blank"
            rel="noopener noreferrer"
            class="iframe-renderer__btn iframe-renderer__btn--primary"
          >
            Open in new window
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
  background: var(--bg-1);
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
  background: var(--bg-1);
  z-index: 10;
}

.iframe-renderer__error-content {
  text-align: center;
  padding: 2rem;
  max-width: 500px;
}

.iframe-renderer__error-content h3 {
  margin: 0 0 0.75rem 0;
  color: var(--ink);
  font-family: var(--font-ui);
  font-size: 1.15rem;
  font-weight: 700;
}

.iframe-renderer__error-content p {
  margin: 0.4rem 0;
  color: var(--ink-2);
  font-size: 0.95rem;
}

.iframe-renderer__url {
  font-family: var(--font-data);
  font-size: 0.8rem;
  word-break: break-all;
  color: var(--ink-2);
  background: var(--bg-2);
  border: 1px solid var(--line-soft);
  padding: 0.5rem;
  border-radius: 4px;
  margin: 1rem 0;
}

.iframe-renderer__actions {
  display: flex;
  gap: 0.75rem;
  justify-content: center;
  margin-top: 1.25rem;
}

.iframe-renderer__btn {
  padding: 0.6rem 1.25rem;
  border-radius: 4px;
  font-family: var(--font-ui);
  font-size: 0.9rem;
  font-weight: 600;
  cursor: pointer;
  border: 1px solid var(--line);
  background: var(--bg-2);
  color: var(--ink);
  text-decoration: none;
  transition: border-color 0.2s;
}

.iframe-renderer__btn--primary {
  border-color: var(--focus);
}

.iframe-renderer__btn:hover {
  border-color: var(--focus);
}

.iframe-renderer__btn:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: 2px;
}
</style>
