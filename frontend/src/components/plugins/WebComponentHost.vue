<template>
  <div class="web-component-host">
    <div v-if="error" class="web-component-host__error calvin-plugin-error">
      Couldn't load this plugin's display. {{ error }}
    </div>
    <component v-else-if="loaded" :is="elementName" ref="elementRef" />
    <div v-else class="web-component-host__loading calvin-plugin-loading">Loading…</div>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, ref, watch } from "vue";

const props = defineProps({
  schema: { type: Object, required: true },
  data: { type: [Object, Array, null], default: null },
  pluginId: { type: String, required: true },
});

const loaded = ref(false);
const error = ref(null);
const elementRef = ref(null);
let stylesheetEl = null;

const elementName = computed(() => props.schema?.element);

const moduleUrl = computed(() => {
  const file = props.schema?.module || "dist.js";
  return `/api/plugins/${props.pluginId}/static/${file}`;
});

const stylesheetUrl = computed(() => {
  const file = props.schema?.stylesheet;
  return file ? `/api/plugins/${props.pluginId}/static/${file}` : null;
});

async function load() {
  error.value = null;
  loaded.value = false;
  try {
    if (!elementName.value) {
      throw new Error("schema.element missing");
    }
    if (stylesheetUrl.value && !stylesheetEl) {
      stylesheetEl = document.createElement("link");
      stylesheetEl.rel = "stylesheet";
      stylesheetEl.href = stylesheetUrl.value;
      document.head.appendChild(stylesheetEl);
    }
    await import(/* @vite-ignore */ moduleUrl.value);
    if (!customElements.get(elementName.value)) {
      throw new Error(`Custom element "${elementName.value}" not registered after import`);
    }
    loaded.value = true;
  } catch (err) {
    error.value = err?.message || String(err);
  }
}

watch(moduleUrl, load, { immediate: true });

watch(
  () => props.data,
  newData => {
    const el = elementRef.value;
    if (el) el.data = newData;
  },
  { immediate: true, flush: "post" }
);

watch(
  elementRef,
  el => {
    if (el) el.data = props.data;
  },
  { flush: "post" }
);

onBeforeUnmount(() => {
  if (stylesheetEl) {
    stylesheetEl.remove();
    stylesheetEl = null;
  }
});
</script>

<style scoped>
.web-component-host {
  width: 100%;
  height: 100%;
}

.web-component-host__error,
.web-component-host__loading {
  font-size: 0.85rem;
}
</style>
