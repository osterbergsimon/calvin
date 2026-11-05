<template>
  <div
    v-if="shouldShow"
    class="clock-bar-horizontal"
    :class="[`position-${position}`, { 'show-date': showDate }]"
    :style="{ padding: barPaddingStyle }"
    role="status"
    aria-label="Status bar"
    aria-live="polite"
  >
    <div class="clock-bar-outer">
      <div
        v-for="zone in zones"
        :key="zone"
        class="clock-bar-zone"
        :class="zoneClass(zone)"
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
                shape="horizontal"
                :design="design"
                :time-text="formattedTime"
                :date-text="formattedDate"
                :compact-time-parts="compactTimeParts"
                :compact-date-parts="compactDateParts"
                :room-text="roomLabel"
                :screens="screens"
                :active-screen-id="activeScreenId"
                :sample="sample"
                :editable="editable"
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
              orientation="horizontal"
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
              shape="horizontal"
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
  </div>
</template>

<script setup>
import { computed, onMounted } from "vue";
import { useConfigStore } from "../stores/config";
import { useKiosksStore } from "../stores/kiosks";
import { useWebServicesStore } from "../stores/webServices";
import { useClockBar } from "../composables/useClockBar";
import { useKeyboardActions } from "../composables/useKeyboardActions";
import { getActiveDashboardScreen } from "../utils/layout";
import { getKioskId } from "../utils/kioskId";
import {
  clockBarPartSizePx,
  groupClockBarZone,
  resolveClockBarDesign,
} from "../utils/clockBarDesign";
import ClockBarPartChip from "./ClockBarPartChip.vue";
import ClockBarPartContent from "./ClockBarPartContent.vue";
import PluginStatusbarItems from "./PluginStatusbarItems.vue";

defineOptions({
  name: "ClockBarHorizontal",
});

const props = defineProps({
  position: {
    type: String,
    required: true,
    validator: value => ["top", "bottom", "between"].includes(value),
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
  // The resolver output. The editor passes its live draft; on a screen the bar
  // resolves the household config itself.
  design: {
    type: Object,
    default: null,
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

const zones = ["left", "center", "right"];
const zoneLabels = { left: "Left", center: "Centre", right: "Right" };

const configStore = useConfigStore();
const webServicesStore = useWebServicesStore();
const design = computed(
  () => props.design || resolveClockBarDesign(configStore, webServicesStore.services)
);

const {
  shouldShow,
  showDate,
  formattedTime,
  compactTimeParts,
  formattedDate,
  compactDateParts,
  barPaddingStyle,
} = useClockBar({
  enabled: () => props.enabled,
  showInKiosk: () => props.showInKiosk,
  showInNonKiosk: () => props.showInNonKiosk,
  design: () => design.value,
  orientation: () => "horizontal",
});

const tileSizePx = computed(() => clockBarPartSizePx(design.value, "horizontal", "tile:any"));
const tileInstanceId = partId => partId.slice("tile:".length);

function zoneClass(zone) {
  if (zone === "left") return "clock-bar-side clock-bar-left";
  if (zone === "right") return "clock-bar-side clock-bar-right";
  return "clock-bar-content";
}

function zoneGroups(zone) {
  const groups = groupClockBarZone(design.value, "horizontal", zone);
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

// The room name is a screen's own Name (its displayName override), never a
// global value: a browser that is not a known screen shows nothing, and an
// unnamed screen shows nothing here too (CLV-84). The screen's card falls back
// to its hostname; the clock bar does not.
const kioskId = getKioskId();
const kiosksStore = useKiosksStore();
const liveRoomLabel = computed(() => {
  if (!kioskId) return "";
  const self = kiosksStore.kiosks.find(kiosk => kiosk.id === kioskId);
  return self?.overrides?.displayName || "";
});
const roomLabel = computed(() => (props.sample ? "Kitchen" : liveRoomLabel.value));

onMounted(() => {
  if (kioskId) kiosksStore.loadKiosks();
});
</script>

<style scoped>
.clock-bar-horizontal {
  width: 100%;
  background: var(--bg-1);
  border-bottom: 1px solid var(--line);
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  /* Above the dashboard stage (--z-raised) so the bar never sits under a
     region's focus glow. */
  z-index: var(--z-sticky);
  user-select: none;
  flex: 0 0 auto;
  box-sizing: border-box;
  min-width: 0;
}

.clock-bar-horizontal.position-bottom {
  border-top: 1px solid var(--line);
  border-bottom: none;
}

.clock-bar-horizontal.position-between {
  z-index: var(--z-sticky);
  border: none;
  background: color-mix(in srgb, var(--ink) 5%, transparent);
  border-radius: var(--radius-control);
}

.clock-bar-content {
  display: flex;
  align-items: center;
  gap: var(--gap-4);
}

.clock-bar-stack {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--gap-1);
}

/* On a phone the bar cannot hold the wordmark, the room, the clock, the
   connection pill and the ⋯ menu on one line: the row ran past the screen and
   scrolled sideways, cutting the clock (CLV-66). The room name is the least
   load-bearing piece there and still shows in Settings. */
@media (--bp-phone) {
  .clock-bar-horizontal :deep(.clock-bar-room) {
    display: none;
  }
  /* Screen dots are 44px touch targets each and cannot shrink; at 390px they
     ran under the centred time ("●15:31"). Below the phone breakpoint the dots
     give way so the clock keeps its own room. */
  .clock-bar-horizontal :deep(.screen-dots) {
    display: none;
  }
  .clock-bar-outer {
    gap: var(--gap-2);
  }
}

.clock-bar-horizontal.position-between :deep(.clock-time) {
  font-size: var(--text-body);
}

.clock-bar-horizontal.position-between :deep(.clock-date) {
  font-size: var(--text-caption);
}

.clock-bar-outer {
  display: flex;
  align-items: center;
  width: 100%;
  gap: var(--gap-4);
  min-width: 0;
}

.clock-bar-side {
  flex: 1;
  display: flex;
  align-items: center;
  /* One spacing token for both sides: the wordmark, room name and screen dots
     (left) and the plugin tiles and actions (right) never touch. */
  gap: var(--gap-inline);
  min-width: 0;
}

.clock-bar-left {
  justify-content: flex-start;
}

.clock-bar-right {
  justify-content: flex-end;
}

.clock-bar-content {
  /* The centred clock keeps its full width: the side groups yield instead of
     the time being squeezed under the screen dots (CLV-91). */
  flex: 0 0 auto;
  min-width: 0;
}
</style>
