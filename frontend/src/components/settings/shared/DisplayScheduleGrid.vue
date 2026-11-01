<template>
  <div class="display-schedule" data-test="display-schedule">
    <SettingRow label="Schedule">
      <template #description>
        <span data-test="schedule-summary">{{ summary }}</span>
        <ScopeLine
          v-if="showScope"
          :overridden="overridden"
          :reset-test="resetTest"
          @reset="emit('reset')"
        />
      </template>
      <Button size="sm" data-test="schedule-change" @click="toggleEditing">
        {{ editing ? "Done" : "Change" }}
      </Button>
    </SettingRow>

    <SettingGroup v-if="editing" title="How it repeats">
      <div class="display-schedule__mode">
        <SegmentedControl
          :model-value="mode"
          :options="SCHEDULE_MODES"
          aria-label="How it repeats"
          @update:model-value="setMode"
        />
      </div>
      <FieldTable :columns="columns" :rows="rows">
        <template #default="{ row }">
          <template v-if="rowValue(row).enabled">
            <TextField
              class="display-schedule__time"
              type="time"
              step="900"
              hide-label
              :label="`${row.a11y} on`"
              :model-value="rowValue(row).onTime"
              @update:model-value="value => setRow(row, { onTime: value })"
            />
            <TextField
              class="display-schedule__time"
              type="time"
              step="900"
              hide-label
              :label="`${row.a11y} off`"
              :model-value="rowValue(row).offTime"
              @update:model-value="value => setRow(row, { offTime: value })"
            />
          </template>
          <span v-else class="field-table__span">Off all day</span>
          <ToggleSwitch
            :model-value="rowValue(row).enabled"
            :aria-label="`Screen on, ${row.a11y}`"
            @update:model-value="value => setRow(row, { enabled: value })"
          />
          <InlineNote v-if="sameTime(row)" class="field-table__note" tone="err">
            On and off can't be the same time.
          </InlineNote>
        </template>
      </FieldTable>
    </SettingGroup>
  </div>
</template>

<script setup>
import { computed, ref, watch } from "vue";
import Button from "@/components/ui/Button.vue";
import FieldTable from "@/components/ui/FieldTable.vue";
import InlineNote from "@/components/ui/InlineNote.vue";
import ScopeLine from "@/components/ui/ScopeLine.vue";
import SegmentedControl from "@/components/ui/SegmentedControl.vue";
import TextField from "@/components/ui/TextField.vue";
import ToggleSwitch from "@/components/ui/ToggleSwitch.vue";
import SettingRow from "@/components/settings/shell/SettingRow.vue";
import SettingGroup from "@/components/ui/SettingGroup.vue";
import {
  SCHEDULE_MODES,
  applyScheduleMode,
  formatScheduleSummary,
  inferScheduleMode,
  normalizeSchedule,
  scheduleRows,
} from "@/utils/displaySchedule";

// The screen on/off schedule (docs/design/2026-11-01-screen-schedule.md): one
// summary row with Change, and a full-width table built from the doctrine
// blocks. The stored seven-day array is unchanged; the editor's three shapes
// are inferred from it.
const props = defineProps({
  modelValue: { type: Array, default: () => [] },
  // The screen's week order ("Week starts on"), a JS weekday (0 = Sunday).
  weekStart: { type: Number, default: 1 },
  timeFormat: { type: String, default: "24h" },
  // Screen pages show where the whole schedule comes from under the summary.
  showScope: { type: Boolean, default: false },
  overridden: { type: Boolean, default: false },
  resetTest: { type: String, default: "reset-daily-schedule" },
});
const emit = defineEmits(["update:modelValue", "reset"]);

const local = ref(normalizeSchedule(props.modelValue));
const mode = ref(inferScheduleMode(props.modelValue));
const editing = ref(false);

watch(
  () => props.modelValue,
  next => {
    local.value = normalizeSchedule(next);
    // While the editor is open its shape is the user's choice; re-inferring
    // would flip the segment back (Each day with equal values looks like
    // Every day).
    if (!editing.value) mode.value = inferScheduleMode(next);
  },
  { deep: true }
);

const summary = computed(() =>
  formatScheduleSummary(local.value, { timeFormat: props.timeFormat })
);

const columns = [
  { label: "" },
  { label: "On", width: "7rem" },
  { label: "Off", width: "7rem" },
  { label: "" },
];

const rows = computed(() => scheduleRows(local.value, mode.value, props.weekStart));

const rowValue = row => local.value[row.days[0]];

const sameTime = row => {
  const day = rowValue(row);
  return day.enabled && day.onTime === day.offTime;
};

// A grouped row (Every day, Mon–Fri, Sat–Sun) writes every day it covers.
function setRow(row, patch) {
  const next = local.value.map(day => (row.days.includes(day.day) ? { ...day, ...patch } : day));
  local.value = next;
  emit("update:modelValue", next);
}

function setMode(nextMode) {
  mode.value = nextMode;
  const next = applyScheduleMode(local.value, nextMode);
  const changed = next.some(
    (day, index) =>
      day.enabled !== local.value[index].enabled ||
      day.onTime !== local.value[index].onTime ||
      day.offTime !== local.value[index].offTime
  );
  local.value = next;
  if (changed) emit("update:modelValue", next);
}

function toggleEditing() {
  editing.value = !editing.value;
  if (!editing.value) mode.value = inferScheduleMode(local.value);
}
</script>

<style scoped>
/* Layout only: the table and the segment control share the panel's inset. */
.display-schedule__mode {
  display: flex;
  padding: 0 var(--panel-pad-x) var(--gap-2);
}
</style>
