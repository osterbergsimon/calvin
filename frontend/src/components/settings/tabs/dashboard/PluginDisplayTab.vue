<template>
  <div class="plugin-display-tab">
    <CollapsibleSection title="Plugin Display" icon="📦" :expanded="true">
      <SettingItem
        label="Meal Plan Card Size"
        help="Size of meal plan cards (Mealie plugin)"
        input-id="meal-plan-card-size"
      >
        <select
          id="meal-plan-card-size"
          :value="configValue.mealPlanCardSize"
          aria-label="Meal plan card size"
          @change="handleMealPlanCardSizeChange"
        >
          <option value="small">Small</option>
          <option value="medium">Medium</option>
          <option value="large">Large</option>
        </select>
      </SettingItem>
    </CollapsibleSection>
  </div>
</template>

<script setup>
import { computed } from "vue";
import CollapsibleSection from "../../shared/CollapsibleSection.vue";
import SettingItem from "../../shared/SettingItem.vue";

const props = defineProps({
  config: {
    type: Object,
    required: true,
    default: () => ({}),
  },
});

const emit = defineEmits(["update:config"]);

const configValue = computed(() => ({
  mealPlanCardSize: props.config?.mealPlanCardSize ?? "medium",
}));

const handleMealPlanCardSizeChange = event => {
  emit("update:config", { mealPlanCardSize: event.target.value });
};
</script>

<style scoped>
.plugin-display-tab {
  width: 100%;
}
</style>
