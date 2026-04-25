<template>
  <div class="reboot-combo-tab">
    <CollapsibleSection title="Reboot Combo" icon="⌨️" :expanded="true">
      <SettingItem label="First Key" help="First key for reboot combo">
        <select v-model="rebootComboKey1" @change="handleRebootComboChange">
          <option value="KEY_1">KEY_1</option>
          <option value="KEY_2">KEY_2</option>
          <option value="KEY_3">KEY_3</option>
          <option value="KEY_4">KEY_4</option>
          <option value="KEY_5">KEY_5</option>
          <option value="KEY_6">KEY_6</option>
          <option value="KEY_7">KEY_7</option>
        </select>
      </SettingItem>

      <SettingItem label="Second Key" help="Second key for reboot combo">
        <select v-model="rebootComboKey2" @change="handleRebootComboChange">
          <option value="KEY_1">KEY_1</option>
          <option value="KEY_2">KEY_2</option>
          <option value="KEY_3">KEY_3</option>
          <option value="KEY_4">KEY_4</option>
          <option value="KEY_5">KEY_5</option>
          <option value="KEY_6">KEY_6</option>
          <option value="KEY_7">KEY_7</option>
        </select>
      </SettingItem>

      <SettingItem
        label="Combo Duration (milliseconds)"
        help="How long to hold both keys to trigger reboot (1000-60000 ms)"
      >
        <input
          v-model.number="rebootComboDuration"
          type="number"
          min="1000"
          max="60000"
          step="1000"
          @change="handleRebootComboChange"
        />
      </SettingItem>

      <SettingItem>
        <span class="help-text">
          Hold {{ rebootComboKey1 }} + {{ rebootComboKey2 }} for
          {{ (rebootComboDuration / 1000).toFixed(1) }} seconds to reboot
        </span>
      </SettingItem>
    </CollapsibleSection>
  </div>
</template>

<script setup>
import { ref, watch } from "vue";
import CollapsibleSection from "../../shared/CollapsibleSection.vue";
import SettingItem from "../../shared/SettingItem.vue";

const props = defineProps({
  config: {
    type: Object,
    required: true,
  },
});

const emit = defineEmits(["update:config"]);

const rebootComboKey1 = ref(props.config.rebootComboKey1 || "KEY_1");
const rebootComboKey2 = ref(props.config.rebootComboKey2 || "KEY_7");
const rebootComboDuration = ref(props.config.rebootComboDuration || 10000);

watch(
  () => props.config,
  (newConfig) => {
    rebootComboKey1.value = newConfig.rebootComboKey1 || "KEY_1";
    rebootComboKey2.value = newConfig.rebootComboKey2 || "KEY_7";
    rebootComboDuration.value = newConfig.rebootComboDuration || 10000;
  },
  { deep: true },
);

const handleRebootComboChange = () => {
  emit("update:config", {
    rebootComboKey1: rebootComboKey1.value,
    rebootComboKey2: rebootComboKey2.value,
    rebootComboDuration: rebootComboDuration.value,
  });
};
</script>

<style scoped>
.reboot-combo-tab {
  width: 100%;
}
</style>
