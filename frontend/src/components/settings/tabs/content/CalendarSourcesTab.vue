<template>
  <div class="calendar-sources-tab">
    <CollapsibleSection title="Calendar Sources" icon="📅">
      <SettingItem
        label="Calendar Sources"
        help="Manage calendar sources for events"
      >
        <p class="help-text">
          Calendar sources are managed through calendar plugin instances in the
          Plugins section.
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
.calendar-sources-tab {
  width: 100%;
}
</style>
