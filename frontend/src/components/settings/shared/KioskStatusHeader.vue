<template>
  <div class="kiosk-status" data-test="kiosk-status-header">
    <span class="kiosk-status__id">{{ kioskId }}</span>
    <span class="kiosk-status__presence" :class="online ? 'is-online' : 'is-offline'">
      {{ online ? "● Online" : "○ Offline" }} · seen {{ lastSeenLabel }}
    </span>
    <span
      class="kiosk-status__config"
      :class="config.cls"
      data-test="hardware-config-status"
    >
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
    return { cls: "is-unknown", label: "Hardware config · Not yet reported" };
  }
  if (props.desiredVersion != null && props.appliedVersion !== props.desiredVersion) {
    return props.online
      ? { cls: "is-pending", label: "Hardware config · Pending (applies shortly)" }
      : {
          cls: "is-pending",
          label: "Hardware config · Pending — applies when this kiosk reconnects",
        };
  }
  return { cls: "is-applied", label: "Hardware config ✓ Applied" };
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
  border-radius: 16px;
  background: var(--bg-1);
}
.kiosk-status__id {
  font-weight: 600;
}
.kiosk-status__presence {
  font-size: 0.85em;
}
.kiosk-status__presence.is-online {
  color: var(--ok);
}
.kiosk-status__presence.is-offline {
  color: var(--ink-3, rgba(255, 255, 255, 0.45));
}
.kiosk-status__config {
  font-size: 0.85em;
  opacity: 0.85;
}
.kiosk-status__config.is-pending {
  color: var(--warn);
}
.kiosk-status__config.is-applied {
  color: var(--ok);
}
</style>
