<template>
  <template v-if="modelValue">
    <DialogScrim ref="scrimEl" :blur="scrimBlur" @dismiss="onScrim" />
    <div
      ref="overlayEl"
      class="dialog-overlay dialog-above-osk"
      :class="{
        'dialog-overlay--full': size === 'full',
        'dialog-overlay--bleed': size === 'full' && bleed,
      }"
      @click.self="onScrim"
    >
      <div
        ref="panelEl"
        class="dialog"
        :class="{
          'dialog--sm': size === 'sm',
          'dialog--wide': wide,
          'dialog--full': size === 'full',
          'dialog--bleed': size === 'full' && bleed,
        }"
        role="dialog"
        aria-modal="true"
        :aria-labelledby="hasTitle ? titleId : undefined"
        :aria-label="hasTitle ? undefined : label || undefined"
        tabindex="-1"
      >
        <header v-if="hasTitle || dismissible || $slots.subtitle" class="dialog__header">
          <div v-if="hasTitle || $slots.subtitle" class="dialog__heading">
            <h2 v-if="hasTitle" :id="titleId" class="dialog__title">
              <slot name="title">{{ title }}</slot>
            </h2>
            <p v-if="$slots.subtitle" class="dialog__subtitle"><slot name="subtitle" /></p>
          </div>
          <IconButton
            v-if="dismissible"
            :icon="mdiClose"
            :label="closeLabel"
            size="md"
            variant="ghost"
            @click="requestClose"
          />
        </header>

        <div ref="bodyEl" class="dialog__body"><slot /></div>

        <footer v-if="$slots.actions" ref="actionsEl" class="dialog__actions">
          <slot name="actions" />
        </footer>
      </div>
    </div>
  </template>
</template>

<script>
// Shared by every instance, so set in module scope rather than inside setup.
let dialogSeq = 0;
// Every open dialog, oldest first. Only the newest handles keys, so Escape on
// a confirm over the pages editor closes the confirm (calvin-kajl M1).
const openStack = [];
const openRoots = new Map();
// The elements we made inert, so clearing never removes an inert another part
// of the app set (the screen stack does).
const inerted = new Set();
</script>

<script setup>
import { computed, nextTick, onBeforeUnmount, ref, useSlots, watch } from "vue";
import { mdiClose } from "@mdi/js";
import DialogScrim from "./DialogScrim.vue";
import IconButton from "./IconButton.vue";

// The one dialog shell (docs/design/frontend-doctrine.md §3, audit P1):
// scrim, title, body, actions, focus trap, Escape, layered at --z-dialog and
// kept above the on-screen keyboard like ConfirmModal/AdminSignInDialog. It
// returns focus to whatever opened it. Feature code supplies content only.
const props = defineProps({
  // Open state, so `v-model="open"` works.
  modelValue: { type: Boolean, default: false },
  title: { type: String, default: "" },
  // Accessible name for a dialog that has no visible title.
  label: { type: String, default: "" },
  // Wider sheet for editors (the sign-in dialog's two-column layout).
  wide: { type: Boolean, default: false },
  // sm = a short confirm, md = the default form, full = the pages editor's
  // large sheet. `bleed` makes full edge-to-edge (no gutter, border or radius),
  // which the editor turns on when its measured space is compact or phone.
  size: {
    type: String,
    default: "md",
    validator: value => ["sm", "md", "full"].includes(value),
  },
  bleed: { type: Boolean, default: false },
  // A blocking dialog (a required setup step) keeps Escape and the scrim inert.
  dismissible: { type: Boolean, default: true },
  // Accessible name for the close control (the pages editor says "Close editor").
  closeLabel: { type: String, default: "Close" },
  // Blur the scrim behind a large editor sheet (Full effects only).
  scrimBlur: { type: Boolean, default: false },
  // Optional selector for the control that should take focus first.
  initialFocus: { type: String, default: "" },
});

const emit = defineEmits(["update:modelValue", "close"]);

const slots = useSlots();
const titleId = `dialog-title-${++dialogSeq}`;
const scrimEl = ref(null);
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

function topDialog() {
  // A dialog torn down without unmounting (an HMR swap, a test teardown)
  // leaves a stale id behind. Drop ids whose root has left the document.
  for (let i = openStack.length - 1; i >= 0; i -= 1) {
    const id = openStack[i];
    const entry = openRoots.get(id);
    if (entry?.overlay && !entry.overlay.isConnected) {
      openStack.splice(i, 1);
      openRoots.delete(id);
    }
  }
  return openStack[openStack.length - 1];
}

// Make everything outside the open dialogs inert, so the screen reader cursor
// can't leave the top one. Walk from each dialog's overlay up to the app root
// and mark the siblings at every level; the dialog's own scrim and any nested
// dialog stay live. The on-screen keyboard is teleported to <body>, outside
// #app, so it keeps working while a dialog with fields is open.
function applyInert() {
  const entries = [...openRoots.values()].filter(entry => entry.overlay?.isConnected);
  const roots = entries.flatMap(entry => [entry.overlay, entry.scrim].filter(Boolean));
  const wanted = new Set();

  for (const { overlay } of entries) {
    let node = overlay;
    while (node.parentElement && node.parentElement !== document.body) {
      for (const sibling of node.parentElement.children) {
        if (sibling === node) continue;
        // A sibling that holds an open dialog (a second mount, not a nested
        // one) is part of the live surface.
        if (roots.some(root => sibling === root || sibling.contains(root))) continue;
        wanted.add(sibling);
      }
      node = node.parentElement;
    }
  }

  for (const node of inerted) {
    if (!wanted.has(node)) {
      node.removeAttribute("inert");
      inerted.delete(node);
    }
  }
  for (const node of wanted) {
    if (!node.hasAttribute("inert")) {
      node.setAttribute("inert", "");
      inerted.add(node);
    }
  }
}

function registerOpen() {
  if (!openStack.includes(titleId)) openStack.push(titleId);
  openRoots.set(titleId, { overlay: null, scrim: null });
  nextTick(() => {
    if (!props.modelValue) return;
    openRoots.set(titleId, { overlay: overlayEl.value, scrim: scrimEl.value?.$el ?? null });
    applyInert();
  });
}

function registerClose() {
  const index = openStack.indexOf(titleId);
  if (index !== -1) openStack.splice(index, 1);
  openRoots.delete(titleId);
  applyInert();
}

// A SelectPill, Menu or Popover inside the dialog is a floating surface of its
// own: Escape closes that, not the editor behind it. Their panels teleport to
// <body>, so detect them from the event target rather than the DOM subtree.
const NESTED_OVERLAY = '[role="listbox"], [role="menu"], .popover__panel';

function onKeydown(event) {
  if (topDialog() !== titleId) return;
  if (event.key === "Escape") {
    if (event.target?.closest?.(NESTED_OVERLAY)) return;
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
      registerOpen();
    } else if (wasOpen) {
      unlisten();
      restoreFocus();
      registerClose();
    }
  },
  { immediate: true }
);

onBeforeUnmount(() => {
  unlisten();
  registerClose();
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

/* A short confirm. */
.dialog--sm {
  width: min(24rem, 100%);
}

/* The full-size editor sheet: as large as the space above the OSK allows,
   with the page gutter kept on a roomy screen. `bleed` drops the gutter,
   border and radius when the editor measures itself as compact or phone. */
.dialog-overlay--full {
  padding: 2.5vh 2vw;
}

.dialog-overlay--bleed {
  padding: 0;
}

.dialog--full {
  width: min(1240px, 100%);
  height: min(820px, 100%);
  max-height: 100%;
  overflow: hidden;
}

.dialog--full.dialog--bleed {
  width: 100%;
  height: 100%;
  border: 0;
  border-radius: 0;
  box-shadow: none;
}

/* The full sheet's content owns the scrolling (the editor's stage and rail),
   so its body is a flex column with no inset of its own. */
.dialog--full .dialog__header {
  align-items: center;
  padding: var(--gap-4) var(--gap-5);
  border-bottom: 1px solid var(--line);
}

.dialog--full .dialog__body {
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  flex-direction: column;
  padding: 0;
}

.dialog__header {
  display: flex;
  align-items: flex-start;
  gap: var(--gap-inline);
  padding: var(--gap-4) var(--gap-5) 0;
}

.dialog__heading {
  flex: 1;
  min-width: 0;
}

.dialog__title {
  margin: 0;
  font-family: var(--font-ui);
  font-size: var(--text-title);
  font-weight: var(--weight-title);
  line-height: 1.3;
  color: var(--ink);
}

.dialog__subtitle {
  margin: var(--gap-1) 0 0;
  font-size: var(--text-meta);
  line-height: 1.4;
  color: var(--ink-3);
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

/* Inside a destructive confirm the danger Button is the filled one (doctrine
   §3: the text-only danger style is for row actions). */
.dialog__actions :deep(.btn--danger) {
  color: var(--err-ink);
  background: var(--err);
  border-color: var(--err);
}

.dialog__actions :deep(.btn--danger:not(:disabled):hover) {
  background: color-mix(in srgb, var(--err) 88%, var(--ink));
  border-color: color-mix(in srgb, var(--err) 88%, var(--ink));
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
