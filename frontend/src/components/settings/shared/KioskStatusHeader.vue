<template>
  <InlineNote class="kiosk-status" data-test="kiosk-status-header">
    <strong>{{ kioskId }}</strong>
    <Tag :tone="online ? 'ok' : 'neutral'">
      {{ online ? "Online" : "Offline" }} · seen {{ lastSeenLabel }}
    </Tag>
    <Tag :tone="config.tone" data-test="hardware-config-status">{{ config.label }}</Tag>
  </InlineNote>
</template>

<script setup>
import { computed } from "vue";
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
  return { tone: "ok", label: "Display settings ✓ Applied" };
});
</script>
