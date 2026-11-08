<template>
  <Dialog
    :model-value="show"
    :title="title"
    :size="alternativeText ? 'md' : 'sm'"
    @update:model-value="onDialogUpdate"
  >
    <p class="confirm-modal__message">{{ message }}</p>
    <!-- Optional extra body under the message, e.g. a SettingRow with a ToggleSwitch. -->
    <slot />
    <template #actions>
      <div
        class="confirm-modal__actions"
        :class="{ 'confirm-modal__actions--stacked': alternativeText }"
      >
        <Button
          class="confirm-modal__action"
          variant="secondary"
          data-test="confirm-cancel"
          @click="handleCancel"
        >
          Cancel
        </Button>
        <Button
          v-if="alternativeText"
          class="confirm-modal__action confirm-modal__alternative"
          variant="secondary"
          data-test="confirm-alternative"
          @click="handleAlternative"
        >
          {{ alternativeText }}
        </Button>
        <Button
          class="confirm-modal__action"
          :variant="danger ? 'danger' : 'primary'"
          data-test="confirm-accept"
          @click="handleConfirm"
        >
          {{ confirmText }}
        </Button>
      </div>
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
  // An optional less-destructive choice beside Cancel (e.g. "Hide on Kitchen"
  // in the delete-everywhere confirm).
  alternativeText: { type: String, default: "" },
});

const emit = defineEmits(["confirm", "cancel", "alternative"]);

const handleConfirm = () => {
  emit("confirm");
};

const handleCancel = () => {
  emit("cancel");
};

const handleAlternative = () => {
  emit("alternative");
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

/* Let the actions stay Dialog's flex items on a roomy screen. */
.confirm-modal__actions {
  display: contents;
}

/* The alternative names a screen ("Hide on …"), and that name can be long:
   wrap it inside its button rather than pushing the row past the dialog. */
.confirm-modal__actions .confirm-modal__alternative {
  max-width: 100%;
  line-height: 1.3;
  text-align: center;
  white-space: normal;
  overflow-wrap: anywhere;
}

/* Three actions on a phone stack full-width, in Dialog's order: cancel and the
   alternative sit above the filled danger action. A two-button confirm keeps
   the old inline row. */
@media (--bp-phone) {
  .confirm-modal__actions--stacked {
    display: flex;
    flex-direction: column;
    width: 100%;
  }

  .confirm-modal__actions--stacked :deep(.confirm-modal__action) {
    width: 100%;
  }
}
</style>
