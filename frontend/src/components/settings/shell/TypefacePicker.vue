<template>
  <SelectPill
    :model-value="current"
    :options="options"
    @update:model-value="applyTypeTheme"
  />
</template>

<script setup>
import SelectPill from "@/components/ui/SelectPill.vue";
import { useTypeTheme } from "@/composables/useTypeTheme";

const { current, applyTypeTheme } = useTypeTheme();

const options = [
  { value: "instrument", label: "Instrument" },
  { value: "marquee", label: "Marquee" },
  { value: "station", label: "Station" },
];
</script>
