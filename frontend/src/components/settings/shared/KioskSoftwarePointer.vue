<template>
  <SettingRow v-if="behindCount > 0" label="Kiosk software" data-test="kiosk-software-pointer">
    <template #description>
      <p class="pointer__desc" data-test="kiosk-software-pointer-copy">
        {{ copy }} <span class="pointer__v">{{ shortVersion(availableVersion) }}</span
        >.
      </p>
    </template>
    <button type="button" class="pointer__btn" data-test="open-kiosks" @click="openKiosks">
      Open Kiosks
    </button>
  </SettingRow>
</template>

<script setup>
import { computed, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import { useKiosksStore } from "@/stores/kiosks";
import { kiosksBehind, shortVersion } from "@/utils/kioskSoftware";
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

<style scoped>
.pointer__desc {
  margin: 0.2rem 0 0;
  font-size: 0.85rem;
  line-height: 1.4;
  color: var(--ink-2);
}
.pointer__v {
  font-family: var(--font-data);
}
.pointer__btn {
  min-height: var(--touch-target);
  padding: 0 1rem;
  font-family: var(--font-ui);
  font-size: 0.95rem;
  font-weight: 500;
  color: var(--ink);
  background: var(--bg-2);
  border: 1px solid var(--line);
  border-radius: 10px;
  cursor: pointer;
}
.pointer__btn:hover {
  border-color: var(--focus);
}
</style>
