<template>
  <SelectPill
    :model-value="current"
    :options="options"
    aria-label="Typeface"
    @update:model-value="applyTypeTheme"
  />
</template>

<script setup>
import { onMounted } from "vue";
import SelectPill from "@/components/ui/SelectPill.vue";
import { useTypeTheme } from "@/composables/useTypeTheme";

const { current, applyTypeTheme, loadTypeTheme } = useTypeTheme();

onMounted(() => {
  loadTypeTheme();
});

const options = [
  { value: "instrument", label: "Instrument" },
  { value: "marquee", label: "Marquee" },
  { value: "station", label: "Station" },
];
</script>
