<template>
  <teleport to="body">
    <div class="link-overlay" role="dialog" aria-modal="true" @click.self="$emit('close')">
      <div class="link-overlay__panel link-overlay__panel--frame calvin-plugin-surface">
        <button type="button" class="link-overlay__close" data-test="close" aria-label="Close" @click="$emit('close')">
          ×
        </button>
        <div class="link-overlay__frame">
          <IframeViewer :url="url" @error="$emit('fallback')" />
        </div>
      </div>
    </div>
  </teleport>
</template>

<script setup>
import { onBeforeUnmount, onMounted } from "vue";
import IframeViewer from "@/components/service/IframeViewer.vue";

defineProps({ url: { type: String, required: true } });
const emit = defineEmits(["close", "fallback"]);

const onKeydown = e => {
  if (e.key === "Escape") emit("close");
};
onMounted(() => document.addEventListener("keydown", onKeydown, true));
onBeforeUnmount(() => document.removeEventListener("keydown", onKeydown, true));
</script>

<style scoped>
.link-overlay {
  position: fixed;
  inset: 0;
  z-index: 1200;
  display: flex;
  align-items: center;
  justify-content: center;
  background: color-mix(in srgb, var(--bg-1) 82%, transparent);
}
.link-overlay__panel--frame {
  position: relative;
  width: min(92vw, 900px);
  height: min(88vh, 720px);
  padding: 0;
  background: var(--bg-2);
  border: 1px solid var(--line);
  border-radius: 12px;
  box-shadow: 0 12px 40px var(--shadow);
  overflow: hidden;
}
.link-overlay__frame {
  width: 100%;
  height: 100%;
}
.link-overlay__close {
  position: absolute;
  top: 0.4rem;
  right: 0.55rem;
  z-index: 2;
  width: 2rem;
  height: 2rem;
  border: 1px solid var(--line);
  border-radius: 50%;
  background: var(--bg-2);
  color: var(--ink);
  font-size: 1.2rem;
  line-height: 1;
  cursor: pointer;
}
</style>
