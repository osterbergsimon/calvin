<template>
  <div class="calendar-display-tab">
    <CollapsibleSection title="Calendar Display" icon="📅" :expanded="true">
      <SettingItem
        label="Week Start Day"
        help="First day of the week in calendar view"
        input-id="week-start-day"
      >
        <select
          id="week-start-day"
          :value="configValue.weekStartDay"
          aria-label="Week start day"
          @change="handleWeekStartDayChange"
        >
          <option :value="0">Sunday</option>
          <option :value="1">Monday</option>
          <option :value="2">Tuesday</option>
          <option :value="3">Wednesday</option>
          <option :value="4">Thursday</option>
          <option :value="5">Friday</option>
          <option :value="6">Saturday</option>
        </select>
      </SettingItem>

      <SettingItem
        label="Show Week Numbers"
        help="Display ISO week numbers in calendar view"
      >
        <label>
          <input
            :checked="configValue.showWeekNumbers"
            type="checkbox"
            @change="handleShowWeekNumbersChange"
          />
          Show Week Numbers
        </label>
      </SettingItem>

      <SettingItem
        label="Time Format"
        help="12-hour or 24-hour clock display"
        input-id="time-format"
      >
        <select
          id="time-format"
          :value="configValue.timeFormat"
          aria-label="Time format"
          @change="handleTimeFormatChange"
        >
          <option value="24h">24-hour</option>
          <option value="12h">12-hour</option>
        </select>
      </SettingItem>

      <SettingItem
        label="Max Visible Events"
        help="Maximum events shown per day before overflow (1-20)"
        input-id="max-visible-events"
      >
        <input
          id="max-visible-events"
          :value="configValue.maxVisibleEvents"
          type="number"
          min="1"
          max="20"
          step="1"
          placeholder="4"
          aria-label="Maximum visible events per day"
          @change="handleMaxVisibleEventsChange"
        />
      </SettingItem>

      <SettingItem label="Weekend Days" help="Days to highlight as weekend">
        <div class="weekend-days">
          <label
            v-for="day in dayOptions"
            :key="day.value"
            class="weekend-day-checkbox"
          >
            <input
              type="checkbox"
              :checked="configValue.weekendDays.includes(day.value)"
              @change="handleWeekendDayChange(day.value, $event)"
            />
            {{ day.label }}
          </label>
        </div>
      </SettingItem>

      <SettingItem
        label="Show Red Days (Holidays)"
        help="Highlight holidays when backend supports it"
      >
        <label>
          <input
            :checked="configValue.showRedDays"
            type="checkbox"
            @change="handleShowRedDaysChange"
          />
          Show Red Days
        </label>
      </SettingItem>
    </CollapsibleSection>
  </div>
</template>

<script setup>
import { computed } from "vue";
import CollapsibleSection from "../../shared/CollapsibleSection.vue";
import SettingItem from "../../shared/SettingItem.vue";

const props = defineProps({
  config: {
    type: Object,
    required: true,
    default: () => ({}),
  },
});

const emit = defineEmits(["update:config"]);

const dayOptions = [
  { value: 0, label: "Sun" },
  { value: 1, label: "Mon" },
  { value: 2, label: "Tue" },
  { value: 3, label: "Wed" },
  { value: 4, label: "Thu" },
  { value: 5, label: "Fri" },
  { value: 6, label: "Sat" },
];

const configValue = computed(() => {
  const config = props.config || {};
  return {
    weekStartDay: config.weekStartDay ?? 1,
    showWeekNumbers: config.showWeekNumbers ?? false,
    timeFormat: config.timeFormat ?? "24h",
    maxVisibleEvents: config.maxVisibleEvents ?? 4,
    weekendDays: Array.isArray(config.weekendDays)
      ? config.weekendDays
      : [0, 6],
    showRedDays: config.showRedDays ?? false,
  };
});

const handleWeekStartDayChange = (event) => {
  const value = parseInt(event.target.value, 10);
  if (!isNaN(value)) {
    emit("update:config", { weekStartDay: value });
  }
};

const handleShowWeekNumbersChange = (event) => {
  emit("update:config", { showWeekNumbers: event.target.checked });
};

const handleTimeFormatChange = (event) => {
  emit("update:config", { timeFormat: event.target.value });
};

const handleMaxVisibleEventsChange = (event) => {
  const value = parseInt(event.target.value, 10);
  if (!isNaN(value) && value >= 1 && value <= 20) {
    emit("update:config", { maxVisibleEvents: value });
  }
};

const handleWeekendDayChange = (dayValue, event) => {
  const current = configValue.value.weekendDays;
  const next = event.target.checked
    ? [...current, dayValue].sort((a, b) => a - b)
    : current.filter((d) => d !== dayValue);
  emit("update:config", { weekendDays: next });
};

const handleShowRedDaysChange = (event) => {
  emit("update:config", { showRedDays: event.target.checked });
};
</script>

<style scoped>
.calendar-display-tab {
  width: 100%;
}

.weekend-days {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem 1.5rem;
}

.weekend-day-checkbox {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  cursor: pointer;
}
</style>
