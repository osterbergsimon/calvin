<template>
  <div class="schedule-days">
    <div v-for="(dayConfig, index) in localSchedule" :key="index" class="schedule-day">
      <label class="schedule-day-header">
        <ToggleSwitch
          v-model="dayConfig.enabled"
          :aria-label="`Schedule ${getDayName(dayConfig.day)}`"
          @update:model-value="emitChange"
        />
        {{ getDayName(dayConfig.day) }}
      </label>
      <div v-if="dayConfig.enabled" class="schedule-day-times">
        <TextField
          v-model="dayConfig.onTime"
          class="schedule-time"
          type="time"
          label="On"
          @update:model-value="emitChange"
        />
        <TextField
          v-model="dayConfig.offTime"
          class="schedule-time"
          type="time"
          label="Off"
          @update:model-value="emitChange"
        />
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, watch } from "vue";
import TextField from "@/components/ui/TextField.vue";
import ToggleSwitch from "@/components/ui/ToggleSwitch.vue";

const props = defineProps({
  modelValue: { type: Array, default: () => [] },
});
const emit = defineEmits(["update:modelValue"]);

const localSchedule = ref(JSON.parse(JSON.stringify(props.modelValue)));

watch(
  () => props.modelValue,
  next => {
    localSchedule.value = JSON.parse(JSON.stringify(next || []));
  },
  { deep: true }
);

const getDayName = day => {
  // Day indices follow the backend's Python weekday() convention (0=Monday …
  // 6=Sunday), NOT JS getDay() (0=Sunday). Keep this array in that order so the
  // labels match how the scheduler interprets each entry — see
  // backend/app/services/display_power_service.py.
  const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  return days[day] || `Day ${day}`;
};

const emitChange = () => {
  emit("update:modelValue", localSchedule.value);
};
</script>

<style scoped>
/* Restyled in calvin-hbp (R2 — Device embeds) — shell token pass. */
.schedule-days {
  display: flex;
  flex-direction: column;
  gap: var(--gap-stack);
}
.schedule-day {
  padding: var(--gap-3);
  background: var(--bg-2);
  border: 1px solid var(--line);
  border-radius: var(--radius-control);
}
.schedule-day-header {
  display: flex;
  align-items: center;
  gap: var(--gap-inline);
  font-family: var(--font-ui);
  font-weight: var(--weight-title);
  cursor: pointer;
}
.schedule-day-times {
  display: flex;
  flex-wrap: wrap;
  gap: var(--gap-group);
  margin-top: var(--gap-stack);
}
.schedule-time {
  flex: 1 1 8rem;
  min-width: 0;
}
</style>
