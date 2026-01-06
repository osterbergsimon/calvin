<template>
  <div class="keyboard-tab">
    <CollapsibleSection title="Keyboard Mappings" icon="⌨️">
      <SettingItem
        label="Keyboard Mappings"
        help="Configure keyboard shortcuts and mappings"
      >
        <p class="help-text">
          Keyboard mappings configuration will be available here.
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
.keyboard-tab {
  width: 100%;
}
</style>
