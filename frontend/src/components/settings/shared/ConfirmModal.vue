<template>
  <Dialog :model-value="show" :title="title" size="sm" @update:model-value="onDialogUpdate">
    <p class="confirm-modal__message">{{ message }}</p>
    <template #actions>
      <Button variant="secondary" data-test="confirm-cancel" @click="handleCancel">Cancel</Button>
      <Button
        :variant="danger ? 'danger' : 'primary'"
        data-test="confirm-accept"
        @click="handleConfirm"
      >
        {{ confirmText }}
      </Button>
    </template>
  </Dialog>
</template>

<script setup>
import Button from "@/components/ui/Button.vue";
import Dialog from "@/components/ui/Dialog.vue";

// A thin wrapper over the shared Dialog (docs/design/frontend-doctrine.md §3):
// the shell, scrim, focus trap, Escape and OSK placement are Dialog's. Only
// the wording and the destructive action are confirm-specific. A destructive
// confirm keeps the danger Button (filled by Dialog's action row); a confirming
// action that is not destructive (e.g. "Make default") uses primary instead, so
// the colour carries the meaning.
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
  // Opt-in: only an action that loses something irreversible (uninstall,
  // restore, revoke, remove, reset, restart/reboot) asks for the red Button.
  danger: {
    type: Boolean,
    default: false,
  },
});

const emit = defineEmits(["confirm", "cancel"]);

const handleConfirm = () => {
  emit("confirm");
};

const handleCancel = () => {
  emit("cancel");
};

// Closing from Escape, the scrim or the × is a cancel.
const onDialogUpdate = value => {
  if (!value) handleCancel();
};
</script>

<style scoped>
.confirm-modal__message {
  margin: 0;
  color: var(--ink);
  line-height: 1.5;
}
</style>
