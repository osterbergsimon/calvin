<template>
  <div class="kiosk-status" data-test="kiosk-status-header">
    <span class="kiosk-status__id">{{ kioskId }}</span>
    <span class="kiosk-status__presence" :class="online ? 'is-online' : 'is-offline'">
      {{ online ? "● Online" : "○ Offline" }} · seen {{ lastSeenLabel }}
    </span>
    <span class="kiosk-status__config" :class="config.cls" data-test="hardware-config-status">
      {{ config.label }}
    </span>
  </div>
</template>

<script setup>
import { computed } from "vue";

const props = defineProps({
  kioskId: { type: String, required: true },
  online: { type: Boolean, default: false },
  lastSeenLabel: { type: String, default: "" },
  appliedVersion: { type: String, default: null },
  desiredVersion: { type: String, default: null },
});

const config = computed(() => {
  if (props.appliedVersion == null) {
    return { cls: "is-unknown", label: "Display settings · Not confirmed yet" };
  }
  if (props.desiredVersion != null && props.appliedVersion !== props.desiredVersion) {
    return props.online
      ? { cls: "is-pending", label: "Display settings · Applying…" }
      : {
          cls: "is-pending",
          label: "Display settings · Applies when this screen comes back online",
        };
  }
  return { cls: "is-applied", label: "Display settings ✓ Applied" };
});
</script>

<style scoped>
.kiosk-status {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 4px 16px;
  padding: 10px 12px;
  margin-bottom: 12px;
  border: 1px solid var(--line);
  border-radius: var(--radius-2xl);
  background: var(--bg-1);
}
.kiosk-status__id {
  font-weight: 600;
}
.kiosk-status__presence {
  font-size: 0.85em;
}
.kiosk-status__presence.is-online {
  color: var(--ok-text);
}
.kiosk-status__presence.is-offline {
  color: var(--ink-3);
}
.kiosk-status__config {
  font-size: 0.85em;
  opacity: 0.85;
}
.kiosk-status__config.is-pending {
  color: var(--warn-text);
}
.kiosk-status__config.is-applied {
  color: var(--ok-text);
}
</style>
