<template>
  <div
    v-if="shouldShow"
    class="clock-bar-vertical"
    :class="[`position-${position}`, { 'show-date': showDate }]"
    :style="{ padding: barPaddingStyle }"
    role="status"
    aria-label="Status bar"
    aria-live="polite"
  >
    <div
      v-for="zone in zones"
      :key="zone"
      class="clock-bar-zone"
      :class="[
        zoneClass(zone),
        zone === 'middle'
          ? [
              'clock-bar-content',
              `layout-${layout}`,
              layout === 'compact-time' || layout === 'compact-time-date'
                ? 'layout-vertical-compact'
                : '',
              layout === 'compact-time-date' ? 'layout-compact-date' : '',
            ]
          : '',
      ]"
      :data-zone="zone"
    >
      <template v-for="(group, index) in zoneGroups(zone)" :key="`${zone}-${index}`">
        <div v-if="group.kind === 'stack'" class="clock-bar-stack">
          <ClockBarPartChip
            v-for="(partId, partIndex) in group.ids"
            :key="partId"
            :part-id="partId"
            :zone="zone"
            :label="chipLabel(partId, zone, partIndex, group.ids.length)"
            :selected="selectedPartId === partId"
            :editable="editable"
            @select="$emit('select-part', $event)"
          >
            <ClockBarPartContent
              :part-id="partId"
              shape="vertical"
              :design="design"
              :time-text="formattedTime"
              :date-text="formattedDate"
              :compact-time-parts="compactTimeParts"
              :compact-date-parts="compactDateParts"
              :room-text="roomLabel"
              :screens="screens"
              :active-screen-id="activeScreenId"
              :sample="sample"
              @select-screen="activateScreen"
            />
          </ClockBarPartChip>
        </div>

        <ClockBarPartChip
          v-else-if="group.kind === 'tiles'"
          part-id="tiles"
          kind="tiles"
          :zone="zone"
          :label="chipLabel('tiles', zone, 0, 1)"
          :editable="editable"
        >
          <PluginStatusbarItems
            :ids="group.ids.map(tileInstanceId)"
            :size="tileSizePx"
            orientation="vertical"
          />
        </ClockBarPartChip>

        <ClockBarPartChip
          v-else
          :key="group.ids[0]"
          :part-id="group.ids[0]"
          :zone="zone"
          :label="chipLabel(group.ids[0], zone, 0, 1)"
          :selected="selectedPartId === group.ids[0]"
          :editable="editable"
          @select="$emit('select-part', $event)"
        >
          <ClockBarPartContent
            :part-id="group.ids[0]"
            shape="vertical"
            :design="design"
            :time-text="formattedTime"
            :date-text="formattedDate"
            :compact-time-parts="compactTimeParts"
            :compact-date-parts="compactDateParts"
            :room-text="roomLabel"
            :screens="screens"
            :active-screen-id="activeScreenId"
            :sample="sample"
            @select-screen="activateScreen"
          />
        </ClockBarPartChip>
      </template>
    </div>
  </div>
</template>

<script setup>
import { computed } from "vue";
import { useClockBar } from "../composables/useClockBar";
import { useConfigStore } from "../stores/config";
import { useWebServicesStore } from "../stores/webServices";
import { useKeyboardActions } from "../composables/useKeyboardActions";
import { getActiveDashboardScreen } from "../utils/layout";
import {
  clockBarPartSizePx,
  groupClockBarZone,
  resolveClockBarDesign,
} from "../utils/clockBarDesign";
import ClockBarPartChip from "./ClockBarPartChip.vue";
import ClockBarPartContent from "./ClockBarPartContent.vue";
import PluginStatusbarItems from "./PluginStatusbarItems.vue";

defineOptions({
  name: "ClockBarVertical",
});

const props = defineProps({
  position: {
    type: String,
    required: true,
    validator: value => ["left", "right", "between"].includes(value),
  },
  showInNonKiosk: {
    type: Boolean,
    default: false,
  },
  showInKiosk: {
    type: Boolean,
    default: false,
  },
  enabled: {
    type: Boolean,
    default: true,
  },
  // Editor preview: draw sample room/dots/status values.
  sample: {
    type: Boolean,
    default: false,
  },
  // Editor: every part becomes a focusable chip; the bar's own controls inert.
  editable: {
    type: Boolean,
    default: false,
  },
  selectedPartId: {
    type: String,
    default: "",
  },
});

defineEmits(["select-part"]);

const zones = ["top", "middle", "bottom"];
const zoneLabels = { top: "Top", middle: "Middle", bottom: "Bottom" };

const configStore = useConfigStore();
const webServicesStore = useWebServicesStore();
const design = computed(() => resolveClockBarDesign(configStore, webServicesStore.services));

const {
  shouldShow,
  showDate,
  formattedTime,
  compactTimeParts,
  formattedDate,
  compactDateParts,
  layout,
  barPaddingStyle,
} = useClockBar({
  enabled: () => props.enabled,
  showInKiosk: () => props.showInKiosk,
  showInNonKiosk: () => props.showInNonKiosk,
  design: () => design.value,
  orientation: () => "vertical",
});

const tileSizePx = computed(() => clockBarPartSizePx(design.value, "vertical", "tile:any"));
const tileInstanceId = partId => partId.slice("tile:".length);

function zoneClass(zone) {
  return `clock-bar-${zone}`;
}

function zoneGroups(zone) {
  const groups = groupClockBarZone(design.value, "vertical", zone);
  if (props.editable) {
    return groups.map(group =>
      group.kind === "stack"
        ? { kind: "stack", ids: group.parts }
        : { kind: "part", ids: [group.id] }
    );
  }
  const merged = [];
  for (const group of groups) {
    if (group.kind === "stack") {
      merged.push({ kind: "stack", ids: group.parts });
      continue;
    }
    if (group.id.startsWith("tile:")) {
      const last = merged[merged.length - 1];
      if (last?.kind === "tiles") last.ids.push(group.id);
      else merged.push({ kind: "tiles", ids: [group.id] });
      continue;
    }
    merged.push({ kind: "part", ids: [group.id] });
  }
  return merged;
}

const serviceName = id =>
  webServicesStore.services.find(service => service.id === tileInstanceId(id))?.name ||
  "Plugin tile";

const PART_LABELS = {
  logo: "Calvin logo",
  room: "Room name",
  pageDots: "Page dots",
  time: "Time",
  date: "Date",
  status: "Status & menu",
  tiles: "Plugin tiles",
};

function chipLabel(partId, zone, index, count) {
  const name = partId.startsWith("tile:") ? serviceName(partId) : PART_LABELS[partId] || partId;
  return `${name}, in ${zoneLabels[zone]}, ${index + 1} of ${count}`;
}

const { activateScreen } = useKeyboardActions();
const screensConfig = computed(() => configStore.effectiveDashboardScreens);
const screens = computed(() => screensConfig.value.screens);
const activeScreenId = computed(() => getActiveDashboardScreen(screensConfig.value)?.id ?? null);
const roomLabel = computed(() => (props.sample ? "Kitchen" : ""));
</script>

<style scoped>
.clock-bar-vertical {
  height: 100%;
  width: auto;
  min-width: fit-content;
  background: var(--bg-1);
  border-right: 1px solid var(--line);
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: var(--gap-3);
  position: relative;
  /* Above the dashboard stage (--z-raised) so the bar never sits under a
     region's focus glow. */
  z-index: var(--z-sticky);
  user-select: none;
  flex-shrink: 0;
  box-sizing: border-box;
  min-height: 0;
}

.clock-bar-vertical.position-right {
  border-left: 1px solid var(--line);
  border-right: none;
}

.clock-bar-vertical.position-between {
  z-index: var(--z-sticky);
  border: none;
  background: color-mix(in srgb, var(--ink) 5%, transparent);
  border-radius: var(--radius-control);
}

.clock-bar-top {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--gap-2);
  flex: 0 0 auto;
}

.clock-bar-middle {
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--gap-3);
  min-height: 0;
}

.clock-bar-bottom {
  flex: 0 0 auto;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-end;
  gap: var(--gap-3);
  min-height: 0;
}

.clock-bar-stack {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--gap-1);
  white-space: nowrap;
  text-align: center;
}

.clock-bar-vertical.position-between :deep(.clock-time) {
  font-size: var(--text-body);
}

.clock-bar-vertical.position-between :deep(.clock-date) {
  font-size: var(--text-caption);
}

.clock-bar-actions {
  width: 100%;
  flex: 0 0 auto;
}
</style>
