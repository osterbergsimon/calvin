<template>
  <SettingRow v-if="behindCount > 0" label="Kiosk software" data-test="kiosk-software-pointer">
    <template #description>
      <InlineNote data-test="kiosk-software-pointer-copy">
        {{ copy }} {{ shortVersion(availableVersion) }}.
      </InlineNote>
    </template>
    <Button data-test="open-kiosks" @click="openKiosks">Open Kiosks</Button>
  </SettingRow>
</template>

<script setup>
import { computed, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import { useKiosksStore } from "@/stores/kiosks";
import { kiosksBehind, shortVersion } from "@/utils/kioskSoftware";
import Button from "@/components/ui/Button.vue";
import InlineNote from "@/components/ui/InlineNote.vue";
import SettingRow from "@/components/settings/shell/SettingRow.vue";

// Pointer only: the fleet controls live in Kiosks. It reads the same store, so
// it can never disagree with the Kiosks summary (CLV-19 §3.4).
const store = useKiosksStore();
const router = useRouter();
const availableVersion = ref(null);

const behindCount = computed(() => kiosksBehind(store.kiosks, availableVersion.value).length);
const copy = computed(() =>
  behindCount.value === 1
    ? "1 kiosk can be updated to"
    : `${behindCount.value} kiosks can be updated to`
);

function openKiosks() {
  router.push({ path: "/settings", query: { setting: "kiosks-software" } });
}

onMounted(async () => {
  await store.loadKiosks();
  availableVersion.value = await store.fetchAvailableAgentVersion();
});
</script>
