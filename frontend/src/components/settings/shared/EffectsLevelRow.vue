<template>
  <div class="effects-level-row" data-test="effects-level-row">
    <SettingRow label="Effects" :description="DESCRIPTION">
      <template #description>
        <span>{{ DESCRIPTION }}</span>
        <InlineNote v-if="isAuto" data-test="effects-auto-note">{{ autoCopy }}</InlineNote>
        <ScopeLine
          v-if="showScope"
          :overridden="overridden"
          :reset-test="resetTest"
          @reset="emit('reset')"
        />
      </template>
      <SegmentedControl
        :model-value="normalized"
        :options="EFFECTS_LEVEL_OPTIONS"
        aria-label="Effects"
        @update:model-value="value => emit('set', value)"
      />
    </SettingRow>
  </div>
</template>

<script setup>
import { computed } from "vue";
import InlineNote from "@/components/ui/InlineNote.vue";
import ScopeLine from "@/components/ui/ScopeLine.vue";
import SegmentedControl from "@/components/ui/SegmentedControl.vue";
import SettingRow from "@/components/settings/shell/SettingRow.vue";
import { EFFECTS_LEVEL_OPTIONS, normalizeEffectsLevel } from "@/utils/effectsLevel";

// The effects row, shared by Screens › Default (writes the household config)
// and a screen's page (writes that screen's overrides). It only says *how*
// effects draw; the focus light and dimming rows still decide whether they show.
const DESCRIPTION =
  "Full is the richest look. Standard keeps a slow screen such as a Pi 3B+ smooth.";

const props = defineProps({
  value: { type: String, default: "auto" },
  overridden: { type: Boolean, default: false },
  // What Auto resolved to, e.g. "Auto (Standard on this screen)".
  autoCopy: { type: String, default: "" },
  resetTest: { type: String, default: "reset-effects-level" },
  // A screen page shows Same as Default / Changed here; the Default page does not.
  showScope: { type: Boolean, default: true },
});
const emit = defineEmits(["set", "reset"]);

const normalized = computed(() => normalizeEffectsLevel(props.value));
const isAuto = computed(() => normalized.value === "auto");
</script>
