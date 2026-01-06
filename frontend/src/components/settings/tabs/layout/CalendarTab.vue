<template>
  <div class="calendar-tab">
    <CollapsibleSection title="Calendar Sources" icon="📅">
      <SettingItem
        label="Calendar Sources"
        help="Manage calendar sources for events"
      >
        <p class="help-text">
          Calendar sources are managed in the Content → Calendar Sources tab.
        </p>
      </SettingItem>
    </CollapsibleSection>
  </div>
</template>

<script setup>
import CollapsibleSection from "../../shared/CollapsibleSection.vue";
import SettingItem from "../../shared/SettingItem.vue";
</script>

<style scoped>
.calendar-tab {
  width: 100%;
}
</style>
