<template>
  <p class="setting-row__desc kiosk-scope">
    <span
      class="kiosk-scope__label"
      :class="overridden ? 'kiosk-scope__label--own' : 'kiosk-scope__label--shared'"
      >{{ overridden ? "Changed here" : "Same as Default" }}</span
    >
    <template v-if="overridden">
      <span class="kiosk-scope__sep" aria-hidden="true">·</span>
      <button
        type="button"
        class="kiosk-scope__reset"
        :data-test="resetTest"
        @click="emit('reset')"
      >
        Reset to default
      </button>
    </template>
  </p>
</template>

<script setup>
// Where a row's value comes from (Default-is-a-screen §4/§7): "Same as
// Default" when it inherits, "Changed here" plus a way back when it has its own
// override. Slotted into SettingRow's description.
defineProps({
  overridden: { type: Boolean, default: false },
  // data-test id for the reset button, so tests can target one row's link.
  resetTest: { type: String, default: "use-shared-setting" },
});
const emit = defineEmits(["reset"]);
</script>

<style scoped>
/* Slot content is in the parent's scope, so this component carries its own
   copy of the row-description styles. */
.setting-row__desc {
  margin: 0.2rem 0 0;
  font-size: var(--fs-sm);
  line-height: 1.4;
  color: var(--ink-2);
}
.kiosk-scope {
  display: flex;
  align-items: baseline;
  gap: 0.25rem 0.4rem;
  flex-wrap: wrap;
}
.kiosk-scope__label--shared {
  color: var(--ink-3);
}
.kiosk-scope__label--own {
  color: var(--ink);
  font-weight: 600;
}
.kiosk-scope__reset {
  padding: 0;
  background: none;
  border: none;
  color: var(--ink);
  font-family: var(--font-ui);
  font-size: var(--fs-sm);
  font-weight: 500;
  text-decoration: underline;
  text-underline-offset: 3px;
  cursor: pointer;
}
.kiosk-scope__reset:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: 2px;
}
</style>
