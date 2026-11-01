<template>
  <div class="clock-bar-preview" data-test="clock-bar-preview">
    <div class="clock-bar-preview__bar">
      <ClockBarHorizontal
        position="top"
        :show-in-non-kiosk="true"
        :show-in-kiosk="false"
        :enabled="true"
        :preview-mode="true"
        :preview-time-size="horizontal.time"
        :preview-date-size="horizontal.date"
        :preview-layout="config.clockBarLayout || 'single-line'"
        :preview-padding="horizontal.padding"
        :preview-plugin-item-size="horizontal.plugin"
      />
    </div>
    <div class="clock-bar-preview__side">
      <ClockBarVertical
        position="left"
        :show-in-non-kiosk="true"
        :show-in-kiosk="false"
        :enabled="true"
        :preview-mode="true"
        :preview-time-size="vertical.time"
        :preview-date-size="vertical.date"
        :preview-layout="config.clockBarVerticalLayout || 'upright'"
        :preview-padding="vertical.padding"
        :preview-plugin-item-size="vertical.plugin"
      />
    </div>
  </div>
</template>

<script setup>
import { computed } from "vue";
import ClockBarHorizontal from "@/components/ClockBarHorizontal.vue";
import ClockBarVertical from "@/components/ClockBarVertical.vue";

// One live preview for the Clock bar layout section: both bar shapes at the
// values being edited (docs/design/2026-11-01-screen-schedule.md §4). Layout
// only; the bars draw themselves exactly as they do on a screen.
const props = defineProps({
  config: { type: Object, required: true },
});

const horizontal = computed(() => ({
  time: props.config.clockBarFontSize || 16,
  date: props.config.clockBarDateFontSize || 14,
  padding: props.config.clockBarPadding ?? 8,
  plugin: props.config.clockBarPluginItemSize ?? 16,
}));

const vertical = computed(() => ({
  time: props.config.clockBarVerticalFontSize || 18,
  date: props.config.clockBarVerticalDateFontSize || 11,
  padding: props.config.clockBarVerticalPadding ?? 8,
  plugin: props.config.clockBarVerticalPluginItemSize ?? 16,
}));
</script>

<style scoped>
.clock-bar-preview {
  display: flex;
  align-items: stretch;
  gap: var(--gap-3);
  padding: var(--panel-pad-y) var(--panel-pad-x);
}

.clock-bar-preview__bar {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  min-width: 0;
}

.clock-bar-preview__side {
  display: flex;
  flex: 0 0 auto;
  height: 12rem;
  overflow: hidden;
}

@media (--bp-phone) {
  .clock-bar-preview {
    flex-direction: column;
  }

  .clock-bar-preview__side {
    height: 8rem;
  }
}
</style>
