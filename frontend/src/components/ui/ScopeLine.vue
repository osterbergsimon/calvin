<template>
  <p class="scope-line">
    <span
      class="scope-line__label"
      :class="overridden ? 'scope-line__label--own' : 'scope-line__label--shared'"
    >
      {{ overridden ? "Changed here" : "Same as Default" }}
    </span>
    <template v-if="overridden">
      <span class="scope-line__sep" aria-hidden="true">·</span>
      <Button
        class="scope-line__reset"
        variant="link"
        size="sm"
        :data-test="resetTest"
        @click="emit('reset')"
      >
        Reset to default
      </Button>
    </template>
  </p>
</template>

<script setup>
import Button from "./Button.vue";

// Where a row's value comes from (docs/design/frontend-doctrine.md §3.1,
// extracted from KioskScope): "Same as Default" when it inherits, "Changed here"
// plus a way back when it has its own override. Slot it into SettingRow's
// description.
defineProps({
  overridden: { type: Boolean, default: false },
  // data-test id for the reset button, so tests can target one row's link.
  resetTest: { type: String, default: "use-shared-setting" },
});

const emit = defineEmits(["reset"]);
</script>

<style scoped>
.scope-line {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: var(--gap-tight) var(--gap-1);
  margin: 0;
  font-family: var(--font-ui);
  font-size: var(--text-meta);
  line-height: 1.4;
  color: var(--ink-2);
}

.scope-line__label--shared {
  color: var(--ink-3);
}

.scope-line__label--own {
  font-weight: var(--weight-strong);
  color: var(--ink);
}

.scope-line__sep {
  color: var(--ink-3);
}

/* The line is meta-sized, so the link action follows it instead of the body
   size Button would use on its own. */
.scope-line__reset {
  font-size: inherit;
}
</style>
