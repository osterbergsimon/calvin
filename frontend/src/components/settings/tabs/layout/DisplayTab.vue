<template>
  <div class="display-tab">
    <CollapsibleSection title="Screen Orientation" icon="🖥️">
      <SettingItem
        label="Orientation"
        help="Screen orientation"
        input-id="display-orientation"
      >
        <select
          id="display-orientation"
          :value="configValue.orientation"
          aria-label="Screen orientation"
          @change="handleOrientationChange"
        >
          <option value="landscape">Landscape</option>
          <option value="portrait">Portrait</option>
        </select>
      </SettingItem>

      <SettingItem
        label="Flip Orientation (180°)"
        help="Rotate the display 180 degrees (useful for mounted displays)"
      >
        <label>
          <input
            :checked="configValue.orientationFlipped"
            type="checkbox"
            @change="handleOrientationFlippedChange"
          />
          Flip Orientation
        </label>
      </SettingItem>

      <SettingItem
        label="Apply Display Rotation (Raspberry Pi)"
        help="Physically rotate the display when orientation changes (RPi only)"
      >
        <label>
          <input
            :checked="configValue.applyDisplayRotation"
            type="checkbox"
            @change="handleApplyDisplayRotationChange"
          />
          Apply Display Rotation
        </label>
      </SettingItem>
    </CollapsibleSection>

    <CollapsibleSection title="Layout" icon="📐">
      <SettingItem
        label="Calendar Split (%)"
        help="Calendar width percentage (10-90%)"
        input-id="calendar-split"
      >
        <input
          id="calendar-split"
          :value="configValue.calendarSplit"
          type="number"
          min="10"
          max="90"
          step="1"
          placeholder="70"
          aria-label="Calendar width percentage"
          @change="handleCalendarSplitChange"
        />
      </SettingItem>

      <SettingItem
        label="Side View Position"
        :help="
          configValue.orientation === 'landscape'
            ? 'Position of side view (left or right of calendar)'
            : 'Position of side view (top or bottom of calendar)'
        "
        input-id="side-view-position"
      >
        <select
          id="side-view-position"
          :value="configValue.sideViewPosition"
          aria-label="Side view position"
          @change="handleSideViewPositionChange"
        >
          <option v-if="configValue.orientation === 'landscape'" value="left">
            Left
          </option>
          <option v-if="configValue.orientation === 'landscape'" value="right">
            Right
          </option>
          <option v-if="configValue.orientation === 'portrait'" value="top">
            Top
          </option>
          <option v-if="configValue.orientation === 'portrait'" value="bottom">
            Bottom
          </option>
        </select>
      </SettingItem>
    </CollapsibleSection>

    <CollapsibleSection title="Calendar" icon="📅">
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

    <CollapsibleSection title="Plugin Display" icon="📦">
      <SettingItem
        label="Meal Plan Card Size"
        help="Size of meal plan cards (Mealie plugin)"
        input-id="meal-plan-card-size"
      >
        <select
          id="meal-plan-card-size"
          :value="configValue.mealPlanCardSize"
          aria-label="Meal plan card size"
          @change="handleMealPlanCardSizeChange"
        >
          <option value="small">Small</option>
          <option value="medium">Medium</option>
          <option value="large">Large</option>
        </select>
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

// Ensure config values are reactive and have defaults
const configValue = computed(() => {
  const config = props.config || {};
  return {
    orientation: config.orientation ?? "landscape",
    orientationFlipped: config.orientationFlipped ?? false,
    applyDisplayRotation: config.applyDisplayRotation ?? true,
    calendarSplit: config.calendarSplit ?? 70,
    sideViewPosition: config.sideViewPosition ?? "right",
    weekStartDay: config.weekStartDay ?? 1,
    showWeekNumbers: config.showWeekNumbers ?? false,
    timeFormat: config.timeFormat ?? "24h",
    maxVisibleEvents: config.maxVisibleEvents ?? 4,
    weekendDays: Array.isArray(config.weekendDays)
      ? config.weekendDays
      : [0, 6],
    showRedDays: config.showRedDays ?? false,
    mealPlanCardSize: config.mealPlanCardSize ?? "medium",
  };
});

const handleOrientationChange = (event) => {
  emit("update:config", { orientation: event.target.value });
};

const handleOrientationFlippedChange = (event) => {
  emit("update:config", { orientationFlipped: event.target.checked });
};

const handleCalendarSplitChange = (event) => {
  const value = parseInt(event.target.value, 10);
  if (!isNaN(value)) {
    const clamped = Math.max(10, Math.min(90, value));
    emit("update:config", { calendarSplit: clamped });
  }
};

const handleSideViewPositionChange = (event) => {
  emit("update:config", { sideViewPosition: event.target.value });
};

const handleWeekStartDayChange = (event) => {
  const value = parseInt(event.target.value, 10);
  if (!isNaN(value)) {
    emit("update:config", { weekStartDay: value });
  }
};

const handleApplyDisplayRotationChange = (event) => {
  emit("update:config", { applyDisplayRotation: event.target.checked });
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

const handleMealPlanCardSizeChange = (event) => {
  emit("update:config", { mealPlanCardSize: event.target.value });
};
</script>

<style scoped>
.display-tab {
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
