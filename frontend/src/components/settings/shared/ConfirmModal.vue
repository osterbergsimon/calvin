<template>
  <div v-if="show" class="modal-overlay dialog-above-osk" @click.self="handleCancel">
    <div class="modal-content confirm-modal">
      <div class="modal-header">
        <h3>{{ title }}</h3>
        <IconButton variant="ghost" label="Close" @click="handleCancel">×</IconButton>
      </div>
      <div class="modal-body">
        <p>{{ message }}</p>
      </div>
      <div class="modal-footer">
        <button type="button" class="btn-secondary" @click="handleCancel">Cancel</button>
        <button type="button" :class="danger ? 'btn-danger' : 'btn-primary'" @click="handleConfirm">
          {{ confirmText }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import IconButton from "@/components/ui/IconButton.vue";

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
  // Destructive actions (delete, reset) keep the red button; a confirming
  // action that is not destructive (e.g. "Make default") uses the primary
  // focus style instead, so the colour carries the meaning.
  danger: {
    type: Boolean,
    default: true,
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
  border-radius: var(--radius-sm);
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
  font-size: var(--fs-xl);
  font-weight: 600;
  color: var(--ink);
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
  min-height: var(--touch-target);
  background: var(--bg-2);
  color: var(--ink);
  border: 1px solid var(--line);
  border-radius: var(--radius-xs);
  font-size: var(--fs-md);
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

.btn-primary {
  padding: 0.5rem 1rem;
  min-height: var(--touch-target);
  background: var(--focus);
  color: var(--focus-ink);
  border: none;
  border-radius: var(--radius-xs);
  font-size: var(--fs-md);
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-primary:hover {
  filter: brightness(1.08);
  transform: translateY(-1px);
  box-shadow: 0 2px 4px color-mix(in srgb, var(--focus) 30%, transparent);
}

.btn-primary:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: 2px;
}

.btn-danger {
  padding: 0.5rem 1rem;
  min-height: var(--touch-target);
  background: var(--err);
  color: var(--err-ink);
  border: none;
  border-radius: var(--radius-xs);
  font-size: var(--fs-md);
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-danger:hover {
  background: color-mix(in srgb, var(--err) 88%, var(--ink));
  transform: translateY(-1px);
  box-shadow: 0 2px 4px color-mix(in srgb, var(--err) 30%, transparent);
}

.btn-danger:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: 2px;
}
</style>
