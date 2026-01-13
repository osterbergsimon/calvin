<template>
  <section
    class="settings-section collapsible"
    :class="{ expanded: isExpanded }"
  >
    <div class="section-header" @click="toggle">
      <h2>
        <span v-if="icon" class="section-icon">{{ icon }}</span>
        {{ title }}
      </h2>
      <span class="toggle-icon">{{ isExpanded ? "▼" : "▶" }}</span>
    </div>
    <div v-show="isExpanded" class="section-content">
      <slot />
    </div>
  </section>
</template>

<script setup>
import { ref, watch } from "vue";

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

watch(
  () => props.expanded,
  (newVal) => {
    isExpanded.value = newVal;
  },
);

const toggle = () => {
  isExpanded.value = !isExpanded.value;
  emit("update:expanded", isExpanded.value);
};
</script>

<style scoped>
.settings-section {
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  margin-bottom: 1.5rem;
  overflow: hidden;
  transition: all 0.2s ease;
}

.settings-section:hover {
  border-color: var(--accent-primary);
  box-shadow: 0 2px 4px var(--shadow);
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem 1.5rem;
  cursor: pointer;
  user-select: none;
  background: var(--bg-secondary);
  transition: background 0.2s ease;
}

.section-header:hover {
  background: var(--bg-tertiary);
}

.section-header h2 {
  margin: 0;
  font-size: 1.1rem;
  font-weight: 600;
  color: var(--text-primary);
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.section-icon {
  font-size: 1.2rem;
}

.toggle-icon {
  font-size: 0.875rem;
  color: var(--text-secondary);
  transition: transform 0.2s ease;
}

.section-content {
  padding: 1.5rem;
  border-top: 1px solid var(--border-color);
}

.settings-section.expanded .section-header {
  border-bottom: 1px solid var(--border-color);
}
</style>
