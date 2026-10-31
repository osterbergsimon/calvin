<template>
  <SettingRow
    label="Button bindings"
    description="Press a button to bind it, then choose what it does. Any key works — your remote's buttons or a full keyboard."
    stacked
  >
    <InlineNote v-if="store.loading">Loading mappings…</InlineNote>
    <InlineNote v-else-if="store.error" tone="err" role="alert">{{ store.errorText }}</InlineNote>

    <KeyBindingBoard
      v-else
      :mappings="store.mappings"
      :capturing="capturing"
      @edit="openPicker"
      @clear="clearKey"
      @add="captureNewKey"
    />
  </SettingRow>

  <Dialog
    v-if="pickerKey"
    :model-value="true"
    title="Choose keyboard action"
    initial-focus=".ap-opt"
    @update:model-value="onDialogUpdate"
    @close="closePicker"
  >
    <ActionPicker
      :key-code="pickerKey"
      :current-action="store.mappings[pickerKey] || null"
      @select="onSelect"
    />
  </Dialog>
</template>

<script setup>
import { ref, onMounted } from "vue";
import { useKeyboardStore } from "@/stores/keyboard";
import { useKeyCapture } from "@/composables/useKeyCapture";
import { logError } from "@/utils/logger";
import SettingRow from "@/components/settings/shell/SettingRow.vue";
import Dialog from "@/components/ui/Dialog.vue";
import InlineNote from "@/components/ui/InlineNote.vue";
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

const onDialogUpdate = value => {
  if (!value) closePicker();
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
