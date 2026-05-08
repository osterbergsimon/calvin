<template>
  <div v-if="!configStore.shouldShowUI" class="minimal-ui-overlay position-bottom-left">
    <button
      class="ui-toggle-btn"
      title="Show UI"
      aria-label="Show UI"
      @click="configStore.showUITemporarily(60)"
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
      >
        <circle cx="12" cy="12" r="3" />
        <path
          d="M12 1v6m0 6v6M23 12h-6m-6 0H1M20.66 3.34l-4.24 4.24m0 4.24l4.24 4.24M3.34 20.66l4.24-4.24m0-4.24L3.34 7.94"
        />
      </svg>
    </button>
  </div>
</template>

<script setup>
import { useConfigStore } from "../stores/config";

const configStore = useConfigStore();
</script>

<style scoped>
.minimal-ui-overlay {
  position: fixed;
  z-index: 1001; /* Above clock (1000) */
}

.minimal-ui-overlay.position-top-left {
  top: 0.5rem;
  left: 0.5rem;
}

.minimal-ui-overlay.position-top-right {
  top: 0.5rem;
  right: 0.5rem;
}

.minimal-ui-overlay.position-bottom-left {
  bottom: 0.5rem;
  left: 0.5rem;
}

.minimal-ui-overlay.position-bottom-right {
  bottom: 0.5rem;
  right: 0.5rem;
}

.ui-toggle-btn {
  background: rgba(0, 0, 0, 0.4);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 50%;
  width: 36px;
  height: 36px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s ease;
  backdrop-filter: blur(8px);
  color: rgba(255, 255, 255, 0.7);
  padding: 0;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
}

.ui-toggle-btn:hover {
  background: rgba(0, 0, 0, 0.6);
  border-color: rgba(255, 255, 255, 0.4);
  color: rgba(255, 255, 255, 0.9);
  transform: scale(1.05);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
}

.ui-toggle-btn:active {
  transform: scale(0.95);
}

.ui-toggle-btn svg {
  width: 16px;
  height: 16px;
}
</style>
