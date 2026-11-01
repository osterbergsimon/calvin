<template>
  <InlineNote class="kiosk-status" data-test="kiosk-status-header">
    <strong>{{ kioskId }}</strong>
    <Tag :tone="online ? 'ok' : 'neutral'">
      {{ online ? "Online" : "Offline" }} · seen {{ lastSeenLabel }}
    </Tag>
    <Tag :tone="config.tone" :icon="config.icon" data-test="hardware-config-status">
      {{ config.label }}
    </Tag>
  </InlineNote>
</template>

<script setup>
import { computed } from "vue";
import { mdiCheck } from "@mdi/js";
import InlineNote from "@/components/ui/InlineNote.vue";
import Tag from "@/components/ui/Tag.vue";

// The selected screen's status strip: who it is, whether it is here, and
// whether it has confirmed the display settings. Built from the shared note and
// tag blocks so it carries no card styling of its own.
const props = defineProps({
  kioskId: { type: String, required: true },
  online: { type: Boolean, default: false },
  lastSeenLabel: { type: String, default: "" },
  appliedVersion: { type: String, default: null },
  desiredVersion: { type: String, default: null },
});

const config = computed(() => {
  if (props.appliedVersion == null) {
    return { tone: "neutral", label: "Display settings · Not confirmed yet" };
  }
  if (props.desiredVersion != null && props.appliedVersion !== props.desiredVersion) {
    return props.online
      ? { tone: "warn", label: "Display settings · Applying…" }
      : {
          tone: "warn",
          label: "Display settings · Applies when this screen comes back online",
        };
  }
  return { tone: "ok", icon: mdiCheck, label: "Display settings · Applied" };
});
</script>

<style scoped>
/* The name and each tag sit on one line with the bar's inline gap. They are
   inside InlineNote's text span, so the gap lives there. */
.kiosk-status :deep(.inline-note__text) {
  display: inline-flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--gap-inline);
}
</style>
