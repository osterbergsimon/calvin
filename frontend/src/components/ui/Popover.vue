<template>
  <span ref="triggerEl" class="popover">
    <slot name="trigger" :attrs="triggerAttrs" />
  </span>
  <Teleport to="body">
    <div
      v-if="modelValue"
      :id="panelId"
      ref="panelEl"
      class="popover__panel"
      :class="{ 'popover__panel--above': openUp }"
      :style="popoverStyle"
      :role="role || undefined"
      :aria-label="role ? label : undefined"
      tabindex="-1"
    >
      <slot />
    </div>
  </Teleport>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue";
import { usePopoverPlacement } from "@/composables/usePopoverPlacement";

// The one small floating surface (docs/design/frontend-doctrine.md §3): it is
// anchored to its trigger, flips above when the viewport runs out below, closes
// on Escape or an outside tap and returns focus to the opener. `Menu` sits on
// top for action lists. The panel teleports to <body> as fixed coordinates so
// an ancestor's overflow (the rounded settings panel) can never clip it, and
// reserves the on-screen keyboard's height so it never opens underneath it.
let popoverSeq = 0;

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  // Accessible name for the panel when it carries a role.
  label: { type: String, default: "" },
  // "menu" for action lists, "dialog" for a picker or explainer, "" when the
  // content owns the semantics (the slot supplies its own role).
  haspopup: {
    type: String,
    default: "dialog",
    validator: value => ["menu", "listbox", "dialog", "true"].includes(value),
  },
  role: {
    type: String,
    default: "",
    validator: value => ["", "dialog", "group"].includes(value),
  },
  // Optional selector for the control that takes focus first (defaults to the
  // first focusable control in the panel).
  initialFocus: { type: String, default: "" },
});

const emit = defineEmits(["update:modelValue", "close", "open"]);

const panelId = `popover-${++popoverSeq}`;
const triggerEl = ref(null);
const panelEl = ref(null);
let opener = null;
let listening = false;
let restoreOnClose = true;
let closing = false;

const oskHeight = () => {
  if (typeof window === "undefined") return 0;
  const raw = getComputedStyle(document.documentElement).getPropertyValue("--osk-height");
  return Number.parseFloat(raw) || 0;
};

const { popoverStyle, openUp, place, reposition } = usePopoverPlacement({
  bottomInset: oskHeight,
  margin: 12,
});

const triggerAttrs = computed(() => ({
  "aria-expanded": props.modelValue ? "true" : "false",
  "aria-haspopup": props.haspopup,
  "aria-controls": props.modelValue ? panelId : undefined,
  onClick: toggle,
  onKeydown: onTriggerKey,
}));

function toggle() {
  if (props.modelValue) close("trigger");
  else emit("update:modelValue", true);
}

function onTriggerKey(event) {
  if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
  if (props.modelValue) return;
  event.preventDefault();
  emit("update:modelValue", true);
}

function close(reason) {
  if (!props.modelValue) return;
  // An outside tap already moved focus where the user aimed; only a keyboard
  // or trigger close gives focus back to the opener.
  restoreOnClose = reason !== "outside";
  closing = true;
  emit("update:modelValue", false);
  emit("close", reason);
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function focusInitial() {
  const root = panelEl.value;
  if (!root || closing || !props.modelValue) return;
  const target =
    (props.initialFocus ? root.querySelector(props.initialFocus) : null) ||
    root.querySelector(FOCUSABLE) ||
    root;
  target?.focus?.();
}

function restoreFocus() {
  const target = opener;
  opener = null;
  nextTick(() => target?.focus?.());
}

function onDocumentPointerDown(event) {
  if (panelEl.value?.contains(event.target) || triggerEl.value?.contains(event.target)) return;
  close("outside");
}

function onDocumentKeydown(event) {
  if (event.key !== "Escape") return;
  event.preventDefault();
  close("escape");
}

// Re-place while the trigger moves and when the on-screen keyboard appears or
// hides (it changes --osk-height without necessarily resizing the window).
let oskObserver = null;

function listen() {
  if (listening) return;
  document.addEventListener("pointerdown", onDocumentPointerDown, true);
  document.addEventListener("keydown", onDocumentKeydown);
  window.addEventListener("scroll", reposition, true);
  window.addEventListener("resize", reposition);
  if (typeof MutationObserver === "function" && typeof document !== "undefined") {
    oskObserver = new MutationObserver(reposition);
    oskObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["style", "class"],
    });
  }
  listening = true;
}

function unlisten() {
  if (!listening) return;
  document.removeEventListener("pointerdown", onDocumentPointerDown, true);
  document.removeEventListener("keydown", onDocumentKeydown);
  window.removeEventListener("scroll", reposition, true);
  window.removeEventListener("resize", reposition);
  oskObserver?.disconnect();
  oskObserver = null;
  listening = false;
}

watch(
  () => props.modelValue,
  (open, wasOpen) => {
    if (open) {
      closing = false;
      opener = document.activeElement;
      nextTick(() => {
        place(triggerEl.value);
        listen();
        // One more tick lets the placement style land before focus moves; a
        // focus in the same flush can be lost when the panel re-renders.
        nextTick(() => {
          focusInitial();
          emit("open");
        });
      });
    } else if (wasOpen) {
      unlisten();
      if (restoreOnClose) restoreFocus();
      restoreOnClose = true;
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
.popover {
  display: inline-flex;
  max-width: 100%;
}

.popover__panel {
  z-index: var(--z-popover);
  max-width: calc(100vw - 2 * var(--gap-4));
  overflow-y: auto;
  overscroll-behavior: contain;
  color: var(--ink);
  background: var(--bg-1);
  border: 1px solid var(--line);
  border-radius: var(--radius-card);
  box-shadow: var(--elev-1);
  animation: popover-in var(--dur) var(--ease);
}

.popover__panel:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: -2px;
}

@keyframes popover-in {
  from {
    opacity: 0;
    transform: translateY(-4px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.popover__panel--above {
  animation-name: popover-in-above;
}

@keyframes popover-in-above {
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
  .popover__panel {
    animation: none;
  }
}
</style>
