<template>
  <div class="debug-tab">
    <CollapsibleSection title="Console Logging" icon="📝">
      <SettingItem
        label="Enable Console Logging"
        help="Enable logging to browser console. When disabled, only errors will be shown."
      >
        <label>
          <input v-model="consoleLogEnabled" type="checkbox" @change="handleConsoleLogChange" />
          Enable Console Logging
        </label>
      </SettingItem>

      <SettingItem
        v-if="consoleLogEnabled"
        label="Log Level"
        help="Controls which log messages are shown in the browser console. Lower levels include higher severity messages."
      >
        <select v-model="consoleLogLevel" @change="handleConsoleLogChange">
          <option value="error">Error Only</option>
          <option value="warn">Warnings & Errors</option>
          <option value="info">Info, Warnings & Errors</option>
          <option value="debug">All Logs (Debug)</option>
        </select>
      </SettingItem>
    </CollapsibleSection>
    <CollapsibleSection title="Dashboard Refresh" icon="🔄">
      <SettingItem
        label="Config Polling Interval (seconds)"
        help="How often to poll for config changes (5-300 seconds)"
        input-id="config-poll-interval"
      >
        <input
          id="config-poll-interval"
          v-model.number="configPollInterval"
          type="number"
          min="5"
          max="300"
          step="1"
          placeholder="30"
          aria-label="Config polling interval in seconds"
          @change="handlePollIntervalChange"
        />
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

const consoleLogEnabled = ref(props.config.consoleLogEnabled ?? true);
const consoleLogLevel = ref(props.config.consoleLogLevel || "info");
const configPollInterval = ref(props.config.configPollInterval || 30);

watch(
  () => props.config,
  newConfig => {
    consoleLogEnabled.value = newConfig.consoleLogEnabled ?? true;
    consoleLogLevel.value = newConfig.consoleLogLevel || "info";
    configPollInterval.value = newConfig.configPollInterval || 30;
  },
  { deep: true }
);

const handleConsoleLogChange = () => {
  emit("update:config", {
    consoleLogEnabled: consoleLogEnabled.value,
    consoleLogLevel: consoleLogLevel.value,
  });
};

const handlePollIntervalChange = () => {
  emit("update:config", {
    configPollInterval: configPollInterval.value,
  });
};
</script>

<style scoped>
.debug-tab {
  width: 100%;
}
</style>
