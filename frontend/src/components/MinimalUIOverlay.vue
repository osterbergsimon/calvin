<template>
  <div v-if="!configStore.showUI" class="minimal-ui-overlay">
    <button
      @click="configStore.toggleUI"
      class="ui-toggle-btn"
      title="Show UI"
      aria-label="Show UI"
    >
      ⚙️
    </button>
  </div>
</template>

<script setup>
import { useConfigStore } from '../stores/config'

const configStore = useConfigStore()
</script>

<style scoped>
.minimal-ui-overlay {
  position: fixed;
  top: 1rem;
  right: 1rem;
  z-index: 1000;
}

.ui-toggle-btn {
  background: rgba(0, 0, 0, 0.6);
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-radius: 50%;
  width: 48px;
  height: 48px;
  font-size: 1.5rem;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
  backdrop-filter: blur(4px);
}

.ui-toggle-btn:hover {
  background: rgba(0, 0, 0, 0.8);
  border-color: rgba(255, 255, 255, 0.5);
  transform: scale(1.1);
}

.ui-toggle-btn:active {
  transform: scale(0.95);
}
</style>

