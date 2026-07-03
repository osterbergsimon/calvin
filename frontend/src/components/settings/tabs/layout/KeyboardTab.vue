<template>
  <div class="keyboard-tab">
    <CollapsibleSection title="Keyboard Buttons" icon="⌨️" :expanded="true">
      <p class="kb-intro">
        Press a button to bind it, then choose what it does. Buttons 1–7 are your remote; other keys
        work too for full keyboards.
      </p>

      <div v-if="store.loading" class="kb-msg">Loading mappings…</div>
      <div v-else-if="store.error" class="kb-msg kb-msg--err" role="alert">{{ store.error }}</div>

      <KeyBindingBoard
        v-else
        :mappings="store.mappings"
        :capturing="capturing"
        @edit="openPicker"
        @clear="clearKey"
        @add="captureNewKey"
      />
    </CollapsibleSection>

    <div v-if="pickerKey" class="kb-picker-overlay" @click.self="closePicker">
      <ActionPicker
        :key-code="pickerKey"
        :current-action="store.mappings[pickerKey] || null"
        @select="onSelect"
        @close="closePicker"
      />
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from "vue";
import { useKeyboardStore } from "@/stores/keyboard";
import { useKeyCapture } from "@/composables/useKeyCapture";
import { logError } from "@/utils/logger";
import CollapsibleSection from "../../shared/CollapsibleSection.vue";
import KeyBindingBoard from "./keyboard/KeyBindingBoard.vue";
import ActionPicker from "./keyboard/ActionPicker.vue";

const store = useKeyboardStore();
const { capturing, capture } = useKeyCapture();

const pickerKey = ref(null);

onMounted(() => {
  store.fetchMappings().catch(err => logError("[Keyboard]", "load failed:", err));
});

const openPicker = key => {
  pickerKey.value = key;
};
const closePicker = () => {
  pickerKey.value = null;
};

const onSelect = async action => {
  const key = pickerKey.value;
  closePicker();
  try {
    await store.setMapping(key, action);
  } catch (err) {
    logError("[Keyboard]", "save failed:", err);
  }
};

const clearKey = async key => {
  try {
    await store.removeMapping(key);
  } catch (err) {
    logError("[Keyboard]", "clear failed:", err);
  }
};

const captureNewKey = async () => {
  const key = await capture();
  if (key) openPicker(key);
};
</script>

<style scoped>
.keyboard-tab {
  width: 100%;
}
.kb-intro {
  color: var(--ink-2);
  font-size: 0.85rem;
  margin: 0 0 12px;
}
.kb-msg {
  padding: 12px;
  border-radius: 6px;
  background: var(--bg-2);
  color: var(--ink-2);
}
.kb-msg--err {
  background: color-mix(in srgb, var(--err) 12%, var(--bg-1));
  color: var(--err);
  border: 1px solid var(--err);
}
.kb-picker-overlay {
  position: fixed;
  inset: 0;
  z-index: 50;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  background: color-mix(in srgb, var(--bg-1) 60%, transparent);
}
</style>
