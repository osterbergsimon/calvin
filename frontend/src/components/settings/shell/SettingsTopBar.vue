<template>
  <header class="settings-topbar">
    <div class="settings-topbar__left">
      <span class="settings-topbar__wordmark" aria-label="Calvin">
        CAL<span class="settings-topbar__wordmark-dot">·</span>VIN
      </span>
      <nav class="settings-topbar__breadcrumb" aria-label="Settings navigation">
        <button
          class="topbar__crumb"
          type="button"
          @click="$emit('crumb', 'settings')"
        >Settings</button>
        <span class="settings-topbar__sep" aria-hidden="true">›</span>
        <button
          class="topbar__crumb"
          type="button"
          @click="$emit('crumb', 'category')"
        >{{ categoryLabel }}</button>
        <template v-if="sectionLabel">
          <span class="settings-topbar__sep" aria-hidden="true">›</span>
          <button
            class="topbar__crumb"
            type="button"
            @click="$emit('crumb', 'section')"
          >{{ sectionLabel }}</button>
        </template>
      </nav>
    </div>

    <div class="settings-topbar__right">
      <div class="settings-topbar__pill" :data-state="saveState">
        <span
          class="settings-topbar__dot"
          :class="dotClass"
          aria-hidden="true"
        ></span>
        <span class="settings-topbar__pill-label">{{ pillLabel }}</span>
      </div>
      <button
        class="settings-topbar__done"
        type="button"
        data-action="done"
        @click="$emit('done')"
      >Done</button>
    </div>
  </header>
</template>

<script setup>
import { computed } from "vue";

const props = defineProps({
  categoryLabel: { type: String, required: true },
  sectionLabel: { type: String, default: "" },
  saveState: { type: String, required: true },
});

defineEmits(["done", "crumb"]);

const pillLabel = computed(() => {
  switch (props.saveState) {
    case "saving": return "Saving…";
    case "saved": return "Saved";
    case "error": return "Error";
    default: return "All changes saved";
  }
});

const dotClass = computed(() => {
  switch (props.saveState) {
    case "saving": return "settings-topbar__dot--warn";
    case "error": return "settings-topbar__dot--err";
    default: return "settings-topbar__dot--ok";
  }
});
</script>

<style scoped>
.settings-topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 16px;
  height: 48px;
  border-bottom: 1px solid var(--line);
  background: var(--bg-1);
}

/* Left side */
.settings-topbar__left {
  display: flex;
  align-items: center;
  gap: 16px;
}

.settings-topbar__wordmark {
  font-family: var(--font-display);
  font-size: 1rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  color: var(--ink);
  user-select: none;
}

.settings-topbar__wordmark-dot {
  color: var(--focus);
}

.settings-topbar__breadcrumb {
  display: flex;
  align-items: center;
  gap: 4px;
}

.topbar__crumb {
  background: none;
  border: none;
  padding: 2px 4px;
  font-family: inherit;
  font-size: 0.875rem;
  color: var(--ink-2);
  cursor: pointer;
  border-radius: 4px;
  transition: color 0.15s;
}

.topbar__crumb:hover {
  color: var(--ink);
}

.topbar__crumb:last-of-type {
  color: var(--ink);
  font-weight: 500;
}

.topbar__crumb:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: 2px;
}

.settings-topbar__sep {
  color: var(--ink-3);
  font-size: 0.875rem;
  user-select: none;
}

/* Right side */
.settings-topbar__right {
  display: flex;
  align-items: center;
  gap: 10px;
}

.settings-topbar__pill {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border-radius: 20px;
  background: var(--bg-0);
  border: 1px solid var(--line);
}

.settings-topbar__pill-label {
  font-size: 0.8125rem;
  color: var(--ink-2);
}

.settings-topbar__dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  flex-shrink: 0;
}

.settings-topbar__dot--ok {
  background: var(--ok);
}

.settings-topbar__dot--warn {
  background: var(--warn);
}

.settings-topbar__dot--err {
  background: var(--err);
}

.settings-topbar__done {
  background: var(--focus);
  color: var(--focus-ink);
  border: none;
  border-radius: 6px;
  padding: 6px 16px;
  font-family: inherit;
  font-size: 0.875rem;
  font-weight: 600;
  cursor: pointer;
  transition: opacity 0.15s;
}

.settings-topbar__done:hover {
  opacity: 0.88;
}

.settings-topbar__done:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: 2px;
}
</style>
