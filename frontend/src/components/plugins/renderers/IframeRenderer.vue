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

    <div v-if="error" class="iframe-renderer__fallback">
      <Card class="iframe-renderer__fallback-card" title="This site won't embed">
        <InlineNote>It blocks being shown inside another page (X-Frame-Options/CSP).</InlineNote>
        <p v-if="url" class="iframe-renderer__url">{{ url }}</p>
        <div class="iframe-renderer__actions">
          <a
            v-if="url"
            :href="url"
            target="_blank"
            rel="noopener noreferrer"
            class="iframe-renderer__open"
          >
            Open in new window
          </a>
          <Button variant="secondary" @click="retry">Retry</Button>
        </div>
      </Card>
    </div>
  </div>
</template>

<script setup>
import { computed, onUnmounted, ref, watch } from "vue";
import { resolvePath } from "../../../utils/jsonPath";
import Button from "../../ui/Button.vue";
import Card from "../../ui/Card.vue";
import InlineNote from "../../ui/InlineNote.vue";

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

/* The embed was refused: a card over the dead frame, not a notice of its own. */
.iframe-renderer__fallback {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--gap-4);
  background: var(--bg-1);
  z-index: var(--z-raised);
}

.iframe-renderer__fallback-card {
  display: flex;
  flex-direction: column;
  gap: var(--gap-3);
  width: min(32rem, 100%);
  text-align: center;
}

.iframe-renderer__url {
  margin: 0;
  font-family: var(--font-data);
  font-size: var(--text-caption);
  color: var(--ink-2);
  word-break: break-all;
}

.iframe-renderer__actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: var(--gap-inline);
}

/* A real link to the site (it leaves the page), so it stays an anchor; it is
   styled as the doctrine's text link, never as a button. */
.iframe-renderer__open {
  display: inline-flex;
  align-items: center;
  min-height: var(--touch-target);
  font-family: var(--font-ui);
  font-size: var(--text-body);
  color: var(--ink);
  text-decoration: underline;
  text-underline-offset: 3px;
}

.iframe-renderer__open:hover {
  color: var(--focus-text);
}

.iframe-renderer__open:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: 2px;
}
</style>
