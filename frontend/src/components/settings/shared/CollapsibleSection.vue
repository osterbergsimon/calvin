<template>
  <section class="settings-section collapsible" :class="{ expanded: isExpanded }">
    <button
      type="button"
      class="section-header"
      :aria-expanded="isExpanded"
      :aria-controls="contentId"
      @click="toggle"
    >
      <h2>
        <span v-if="icon" class="section-icon">{{ icon }}</span>
        {{ title }}
      </h2>
      <span class="toggle-icon">{{ isExpanded ? "▼" : "▶" }}</span>
    </button>
    <div :id="contentId" v-show="isExpanded" class="section-content">
      <slot />
    </div>
  </section>
</template>

<script setup>
import { ref, watch } from "vue";

let sectionId = 0;

const props = defineProps({
  title: {
    type: String,
    required: true,
  },
  icon: {
    type: String,
    default: null,
  },
  expanded: {
    type: Boolean,
    default: false,
  },
});

const emit = defineEmits(["update:expanded"]);

const isExpanded = ref(props.expanded);
const contentId = `settings-section-content-${++sectionId}`;

watch(
  () => props.expanded,
  newVal => {
    isExpanded.value = newVal;
  }
);

const toggle = () => {
  isExpanded.value = !isExpanded.value;
  emit("update:expanded", isExpanded.value);
};
</script>

<style scoped>
.settings-section {
  background: var(--bg-1);
  border: 1px solid var(--line);
  border-radius: 8px;
  margin-bottom: 1.5rem;
  overflow: hidden;
  transition: all 0.2s ease;
}

.settings-section:hover {
  border-color: var(--focus);
  box-shadow: 0 2px 4px var(--shadow);
}

.section-header {
  width: 100%;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem 1.5rem;
  cursor: pointer;
  user-select: none;
  background: var(--bg-1);
  border: 0;
  transition: background 0.2s ease;
}

.section-header:hover {
  background: var(--bg-2);
}

.section-header:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: -2px;
}

.section-header h2 {
  margin: 0;
  font-size: 1.1rem;
  font-weight: 600;
  font-family: var(--font-ui);
  color: var(--ink);
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.section-icon {
  font-size: 1.2rem;
}

.toggle-icon {
  font-size: 0.875rem;
  color: var(--ink-2);
  transition: transform 0.2s ease;
}

.section-content {
  padding: 1.5rem;
  border-top: 1px solid var(--line);
}

.settings-section.expanded .section-header {
  border-bottom: 1px solid var(--line);
}
</style>
