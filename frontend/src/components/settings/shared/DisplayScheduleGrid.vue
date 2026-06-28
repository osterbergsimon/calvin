<template>
  <div class="schedule-days">
    <div v-for="(dayConfig, index) in localSchedule" :key="index" class="schedule-day">
      <div class="schedule-day-header">
        <label>
          <input v-model="dayConfig.enabled" type="checkbox" @change="emitChange" />
          {{ getDayName(dayConfig.day) }}
        </label>
      </div>
      <div v-if="dayConfig.enabled" class="schedule-day-times">
        <div class="schedule-time">
          <label>On:</label>
          <input v-model="dayConfig.onTime" type="time" @change="emitChange" />
        </div>
        <div class="schedule-time">
          <label>Off:</label>
          <input v-model="dayConfig.offTime" type="time" @change="emitChange" />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, watch } from "vue";

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
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return days[day] || `Day ${day}`;
};

const emitChange = () => {
  emit("update:modelValue", localSchedule.value);
};
</script>

<style scoped>
/* Styling lifted as-is from PowerTab (legacy tokens) — restyle in calvin-hbp. */
.schedule-days {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}
.schedule-day {
  padding: 0.75rem;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: 6px;
}
.schedule-day-header {
  margin-bottom: 0.5rem;
}
.schedule-day-header label {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-weight: 600;
  cursor: pointer;
}
.schedule-day-times {
  display: flex;
  gap: 1rem;
  margin-top: 0.5rem;
}
.schedule-time {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
.schedule-time label {
  font-size: 0.875rem;
  color: var(--text-secondary);
}
.schedule-time input {
  padding: 0.5rem;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  background: var(--bg-primary);
  color: var(--text-primary);
}
</style>
