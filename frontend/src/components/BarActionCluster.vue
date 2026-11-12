<template>
  <div v-if="visible" class="bar-action-cluster" :class="{ compact }">
    <ConnectionStatus :compact="compact" />

    <!-- A phone gets Settings in the ⋯ slot, even with controls hidden; the
         menu's other items (layout lock, hide controls) are wall-display tools. -->
    <PhoneSettingsButton v-if="phone" />
    <template v-else-if="configStore.shouldShowUI">
      <AdminOverflow />
    </template>
  </div>
</template>

<script setup>
import { computed } from "vue";
import { useConfigStore } from "../stores/config";
import ConnectionStatus from "./ConnectionStatus.vue";
import AdminOverflow from "./dashboard/AdminOverflow.vue";
import PhoneSettingsButton from "./dashboard/PhoneSettingsButton.vue";
import { usePhoneViewport } from "../composables/usePhoneViewport";

defineProps({
  compact: {
    type: Boolean,
    default: false,
  },
});

const visible = computed(() => true);

const configStore = useConfigStore();
const phone = usePhoneViewport();
</script>

<style scoped>
.bar-action-cluster {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: nowrap;
}

.bar-action-cluster.compact {
  flex-direction: column;
  gap: 0.5rem;
}
</style>
