<template>
  <template v-if="modelValue">
    <DialogScrim @dismiss="onScrim" />
    <div ref="overlayEl" class="dialog-overlay dialog-above-osk" @click.self="onScrim">
      <div
        ref="panelEl"
        class="dialog"
        :class="{ 'dialog--wide': wide }"
        role="dialog"
        aria-modal="true"
        :aria-labelledby="hasTitle ? titleId : undefined"
        :aria-label="hasTitle ? undefined : label || undefined"
        tabindex="-1"
      >
        <header v-if="hasTitle || dismissible" class="dialog__header">
          <h2 v-if="hasTitle" :id="titleId" class="dialog__title">
            <slot name="title">{{ title }}</slot>
          </h2>
          <IconButton
            v-if="dismissible"
            label="Close"
            size="md"
            variant="ghost"
            @click="requestClose"
          >
            ×
          </IconButton>
        </header>

        <div ref="bodyEl" class="dialog__body"><slot /></div>

        <footer v-if="$slots.actions" ref="actionsEl" class="dialog__actions">
          <slot name="actions" />
        </footer>
      </div>
    </div>
  </template>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, ref, useSlots, watch } from "vue";
import DialogScrim from "./DialogScrim.vue";
import IconButton from "./IconButton.vue";

// The one dialog shell (docs/design/frontend-doctrine.md §3, audit P1):
// scrim, title, body, actions, focus trap, Escape, layered at --z-dialog and
// kept above the on-screen keyboard like ConfirmModal/AdminSignInDialog. It
// returns focus to whatever opened it. Feature code supplies content only.
let dialogSeq = 0;

const props = defineProps({
  // Open state, so `v-model="open"` works.
  modelValue: { type: Boolean, default: false },
  title: { type: String, default: "" },
  // Accessible name for a dialog that has no visible title.
  label: { type: String, default: "" },
  // Wider sheet for editors (the sign-in dialog's two-column layout).
  wide: { type: Boolean, default: false },
  // A blocking dialog (a required setup step) keeps Escape and the scrim inert.
  dismissible: { type: Boolean, default: true },
  // Optional selector for the control that should take focus first.
  initialFocus: { type: String, default: "" },
});

const emit = defineEmits(["update:modelValue", "close"]);

const slots = useSlots();
const titleId = `dialog-title-${++dialogSeq}`;
const overlayEl = ref(null);
const panelEl = ref(null);
const bodyEl = ref(null);
const actionsEl = ref(null);
let opener = null;
let listening = false;

const hasTitle = computed(() => Boolean(props.title) || Boolean(slots.title));

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

const focusables = scope => (scope ? Array.from(scope.querySelectorAll(FOCUSABLE)) : []);

function close() {
  emit("update:modelValue", false);
  emit("close");
}

function requestClose() {
  if (props.dismissible) close();
}

function onScrim() {
  requestClose();
}

function focusInitial() {
  nextTick(() => {
    const root = panelEl.value;
    if (!root) return;
    const preferred = props.initialFocus ? root.querySelector(props.initialFocus) : null;
    const target =
      preferred || focusables(bodyEl.value)[0] || focusables(actionsEl.value)[0] || root;
    target?.focus();
  });
}

function restoreFocus() {
  const target = opener;
  opener = null;
  nextTick(() => target?.focus?.());
}

function onKeydown(event) {
  if (event.key === "Escape") {
    if (!props.dismissible) return;
    event.preventDefault();
    close();
    return;
  }
  if (event.key !== "Tab" || !panelEl.value) return;

  // All focusable controls, header first, then body, then actions.
  const nodes = focusables(panelEl.value);
  if (!nodes.length) {
    event.preventDefault();
    panelEl.value.focus();
    return;
  }

  const first = nodes[0];
  const last = nodes[nodes.length - 1];
  const active = document.activeElement;
  const inside = panelEl.value.contains(active);

  if (event.shiftKey && (!inside || active === first)) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && (!inside || active === last)) {
    event.preventDefault();
    first.focus();
  }
}

function listen() {
  if (listening) return;
  document.addEventListener("keydown", onKeydown);
  listening = true;
}

function unlisten() {
  if (!listening) return;
  document.removeEventListener("keydown", onKeydown);
  listening = false;
}

watch(
  () => props.modelValue,
  (open, wasOpen) => {
    if (open) {
      opener = document.activeElement;
      listen();
      focusInitial();
    } else if (wasOpen) {
      unlisten();
      restoreFocus();
    }
  },
  { immediate: true }
);

onBeforeUnmount(() => {
  unlisten();
  if (props.modelValue) restoreFocus();
});
</script>

<style scoped>
.dialog-overlay {
  position: fixed;
  inset: 0;
  z-index: var(--z-dialog);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--gap-4);
}

.dialog {
  position: relative;
  display: flex;
  flex-direction: column;
  width: min(30rem, 100%);
  max-height: 100%;
  overflow: auto;
  color: var(--ink);
  background: var(--bg-1);
  border: 1px solid var(--line);
  border-radius: var(--radius-panel);
  box-shadow: var(--elev-2);
  animation: dialog-in var(--dur) var(--ease);
}

.dialog--wide {
  width: min(56rem, 100%);
}

.dialog__header {
  display: flex;
  align-items: flex-start;
  gap: var(--gap-inline);
  padding: var(--gap-4) var(--gap-5) 0;
}

.dialog__title {
  flex: 1;
  min-width: 0;
  margin: 0;
  font-family: var(--font-ui);
  font-size: var(--text-title);
  font-weight: var(--weight-title);
  line-height: 1.3;
  color: var(--ink);
}

.dialog__body {
  padding: var(--gap-3) var(--gap-5) 0;
}

.dialog__actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: var(--gap-inline);
  padding: var(--gap-4) var(--gap-5) var(--gap-5);
}

@keyframes dialog-in {
  from {
    opacity: 0;
    transform: translateY(4px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@media (prefers-reduced-motion: reduce) {
  .dialog {
    animation: none;
  }
}
</style>
