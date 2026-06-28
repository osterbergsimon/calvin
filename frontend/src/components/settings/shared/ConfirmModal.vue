<template>
  <div v-if="show" class="modal-overlay" @click.self="handleCancel">
    <div class="modal-content confirm-modal">
      <div class="modal-header">
        <h3>{{ title }}</h3>
        <button class="btn-close-modal" @click="handleCancel">×</button>
      </div>
      <div class="modal-body">
        <p>{{ message }}</p>
      </div>
      <div class="modal-footer">
        <button type="button" class="btn-secondary" @click="handleCancel">Cancel</button>
        <button type="button" class="btn-danger" @click="handleConfirm">
          {{ confirmText }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
defineProps({
  show: {
    type: Boolean,
    default: false,
  },
  title: {
    type: String,
    default: "Confirm Action",
  },
  message: {
    type: String,
    required: true,
  },
  confirmText: {
    type: String,
    default: "Confirm",
  },
});

const emit = defineEmits(["confirm", "cancel"]);

const handleConfirm = () => {
  emit("confirm");
};

const handleCancel = () => {
  emit("cancel");
};
</script>

<style scoped>
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: color-mix(in srgb, var(--ink) 55%, transparent);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal-content {
  background: var(--bg-1);
  border-radius: 8px;
  box-shadow: 0 4px 20px color-mix(in srgb, var(--ink) 30%, transparent);
  max-width: 500px;
  width: 90%;
  max-height: 90vh;
  overflow: auto;
}

.confirm-modal {
  display: flex;
  flex-direction: column;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1.25rem;
  border-bottom: 1px solid var(--line);
}

.modal-header h3 {
  margin: 0;
  font-size: 1.25rem;
  font-weight: 600;
  color: var(--ink);
}

.btn-close-modal {
  background: none;
  border: none;
  font-size: 1.5rem;
  color: var(--ink-2);
  cursor: pointer;
  padding: 0;
  width: 2rem;
  height: 2rem;
  min-height: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  transition: all 0.2s;
}

.btn-close-modal:hover {
  background: var(--bg-2);
  color: var(--ink);
}

.btn-close-modal:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: 2px;
}

.modal-body {
  padding: 1.25rem;
}

.modal-body p {
  margin: 0;
  color: var(--ink);
  line-height: 1.5;
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 0.75rem;
  padding: 1.25rem;
  border-top: 1px solid var(--line);
}

.btn-secondary {
  padding: 0.5rem 1rem;
  min-height: 44px;
  background: var(--bg-2);
  color: var(--ink);
  border: 1px solid var(--line);
  border-radius: 4px;
  font-size: 0.9rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-secondary:hover {
  background: var(--bg-2);
  border-color: var(--focus);
}

.btn-secondary:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: 2px;
}

.btn-danger {
  padding: 0.5rem 1rem;
  min-height: 44px;
  background: var(--err);
  color: white;
  border: none;
  border-radius: 4px;
  font-size: 0.9rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-danger:hover {
  background: color-mix(in srgb, var(--err) 85%, black);
  transform: translateY(-1px);
  box-shadow: 0 2px 4px color-mix(in srgb, var(--err) 30%, transparent);
}

.btn-danger:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: 2px;
}
</style>
