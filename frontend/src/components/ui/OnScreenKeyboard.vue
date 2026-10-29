<!-- frontend/src/components/ui/OnScreenKeyboard.vue -->
<template>
  <Teleport to="body">
    <div
      ref="panel"
      class="osk calvin-osk"
      :class="{
        'osk--shown': osk.visible.value,
        'osk--numeric': osk.isNumeric.value,
        'osk--compact': osk.height.value > 0 && osk.height.value < 260,
      }"
      role="group"
      aria-label="On-screen keyboard"
      :aria-hidden="!osk.visible.value"
      :inert="!osk.visible.value"
      @pointerdown.prevent
    >
      <div ref="host" class="osk-host"></div>
    </div>
  </Teleport>
</template>

<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import SimpleKeyboard from "simple-keyboard";
import {
  OSK_CASE_CHARS,
  OSK_LAYOUTS,
  useOnScreenKeyboard,
} from "@/composables/useOnScreenKeyboard";

const ICONS = {
  bksp: '<svg class="osk-ic" aria-hidden="true" viewBox="0 0 24 24"><path d="M21 5H9l-6 7 6 7h12z"/><path d="M17 9l-6 6M11 9l6 6"/></svg>',
  shift:
    '<svg class="osk-ic" aria-hidden="true" viewBox="0 0 24 24"><path d="M12 4l8 8h-4v8H8v-8H4z"/></svg>',
  hide: '<svg class="osk-ic" aria-hidden="true" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="11" rx="2"/><path d="M8 19l4 3 4-3"/></svg>',
};

const BUTTON_ATTRIBUTES = [
  { attribute: "type", value: "button" },
  { attribute: "tabindex", value: "-1" },
  { attribute: "aria-label", value: "Backspace", buttons: "{bksp}" },
  { attribute: "aria-label", value: "Shift", buttons: "{shift}" },
  { attribute: "aria-label", value: "Hide keyboard", buttons: "{hide}" },
  { attribute: "aria-label", value: "Space", buttons: "{space}" },
];

// Shift changes the printed label only; the button token stays lowercase so
// the caret insertion knows which code point to replace.
const SHIFTED_LABELS = Object.fromEntries(
  [...OSK_CASE_CHARS].map(ch => [ch, ch === "ß" ? "ẞ" : ch.toUpperCase()])
);

const osk = useOnScreenKeyboard();
const panel = ref(null);
const host = ref(null);
let keyboard = null;
let repeatDelay = null;
let repeatInterval = null;
let resizeObserver = null;

const display = computed(() => {
  const map = {
    "{bksp}": ICONS.bksp,
    "{shift}": ICONS.shift,
    "{hide}": ICONS.hide,
    // simple-keyboard treats an empty string as "no label" and falls back to
    // the token, so a real space is what renders a blank key.
    "{space}": " ",
    "{numbers}": "?123",
    "{accents}": "åäö",
    "{abc}": "abc",
    "{enter}": osk.enterLabel.value,
  };
  if (osk.shiftOn.value) Object.assign(map, SHIFTED_LABELS);
  return map;
});

const buttonTheme = computed(() =>
  osk.shiftOn.value ? [{ class: "k--on", buttons: "{shift}" }] : []
);

const clearRepeat = () => {
  if (repeatDelay !== null) {
    clearTimeout(repeatDelay);
    repeatDelay = null;
  }
  if (repeatInterval !== null) {
    clearInterval(repeatInterval);
    repeatInterval = null;
  }
};

// Backspace repeats after 500ms, then every 60ms. simple-keyboard's own hold
// is disabled so this is the only repeat path.
const onRootPointerDown = event => {
  const button = event.target?.closest?.(".hg-button");
  if (!button || button.getAttribute("data-skBtn") !== "{bksp}") return;
  clearRepeat();
  repeatDelay = setTimeout(() => {
    repeatDelay = null;
    repeatInterval = setInterval(() => osk.handleKeyPress("{bksp}"), 60);
  }, 500);
};

const measureHeight = () => {
  const measured = panel.value?.getBoundingClientRect?.().height;
  if (measured > 0) osk.setMeasuredHeight(measured);
};

const applyLayout = () => {
  keyboard?.setOptions({
    layoutName: osk.layout.value,
    display: display.value,
    buttonTheme: buttonTheme.value,
  });
};

onMounted(() => {
  keyboard = new SimpleKeyboard(host.value, {
    layout: OSK_LAYOUTS,
    layoutName: osk.layout.value,
    theme: "calvin-osk",
    display: display.value,
    buttonTheme: buttonTheme.value,
    buttonAttributes: BUTTON_ATTRIBUTES,
    preventMouseDownDefault: true,
    disableButtonHold: true,
    disableCaretPositioning: true,
    useButtonTag: true,
    debug: false,
    onKeyPress: button => osk.handleKeyPress(button),
  });
  osk.start();
  if (typeof ResizeObserver === "function" && panel.value) {
    resizeObserver = new ResizeObserver(measureHeight);
    resizeObserver.observe(panel.value);
  }
  panel.value?.addEventListener("pointerdown", onRootPointerDown);
  window.addEventListener("pointerup", clearRepeat);
  window.addEventListener("pointercancel", clearRepeat);
});

onUnmounted(() => {
  clearRepeat();
  resizeObserver?.disconnect();
  resizeObserver = null;
  panel.value?.removeEventListener("pointerdown", onRootPointerDown);
  window.removeEventListener("pointerup", clearRepeat);
  window.removeEventListener("pointercancel", clearRepeat);
  osk.stop();
  keyboard?.destroy();
  keyboard = null;
});

watch(
  () => [osk.layout.value, osk.shiftOn.value, osk.enterLabel.value],
  () => nextTick(applyLayout)
);

watch(
  () => osk.visible.value,
  visible => {
    if (visible) nextTick(measureHeight);
  }
);

defineExpose({
  ...osk,
  keyboard: () => keyboard,
});
</script>

<style scoped>
.osk {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 1100;
  height: min(300px, 45dvh);
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px 12px 12px;
  background: var(--bg-0);
  border-top: 1px solid var(--line);
  box-shadow: 0 -10px 30px -18px var(--shadow-hover);
  transform: translateY(100%);
  transition: transform 120ms ease-in;
  pointer-events: none;
}
.osk--shown {
  transform: translateY(0);
  transition: transform 180ms ease-out;
  pointer-events: auto;
}
.osk--compact {
  gap: 6px;
  padding: 8px;
}

.osk-host {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  width: 100%;
}

:deep(.hg-rows) {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.osk--compact :deep(.hg-rows) {
  gap: 6px;
}

:deep(.hg-row) {
  flex: 1;
  min-height: 0;
  display: flex;
  justify-content: center;
  gap: 8px;
}
.osk--compact :deep(.hg-row) {
  gap: 6px;
}

:deep(.hg-button) {
  flex: 1 1 0;
  min-width: 0;
  min-height: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  background: var(--bg-2);
  color: var(--ink);
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  box-shadow: 0 1px 0 var(--line);
  font: 400 1.25rem var(--font-ui);
  line-height: 1;
  user-select: none;
  -webkit-tap-highlight-color: transparent;
  cursor: pointer;
}
.osk--compact :deep(.hg-button) {
  font-size: 1.05rem;
}

:deep(.hg-button.hg-functionBtn) {
  flex-grow: 1.5;
  background: color-mix(in srgb, var(--ink) 6%, var(--bg-0));
  color: var(--ink-2);
  font-family: var(--font-ui);
  font-size: var(--fs-md);
  font-weight: 500;
}
.osk--compact :deep(.hg-button.hg-functionBtn) {
  font-size: 0.85rem;
}

:deep(.hg-button.hg-button-space) {
  flex-grow: 6;
  background: var(--bg-2);
  color: var(--ink);
  font-size: 1.25rem;
  font-weight: 400;
}

:deep(.hg-button.hg-button-enter) {
  flex-grow: 2;
  background: var(--focus);
  border-color: var(--focus);
  color: var(--focus-ink);
  font-size: var(--fs-md);
  font-weight: 600;
}

:deep(.hg-button.hg-button-shift.k--on) {
  background: color-mix(in srgb, var(--focus) 16%, var(--bg-2));
  border-color: var(--focus);
  color: var(--ink);
}

:deep(.hg-button.hg-activeButton) {
  background: color-mix(in srgb, var(--focus) 22%, var(--bg-2));
  box-shadow: none;
  transform: translateY(1px);
}

:deep(.osk-ic) {
  width: 22px;
  height: 22px;
  stroke: currentColor;
  fill: none;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

/* Number pad: a centred 4×4 grid, 440px wide, every key the same size. */
.osk--numeric :deep(.hg-rows) {
  align-items: center;
}
.osk--numeric :deep(.hg-row) {
  width: 440px;
  max-width: 100%;
}
.osk--numeric :deep(.hg-button) {
  flex-grow: 1;
}
.osk--numeric :deep(.hg-button.hg-button-enter) {
  font-size: var(--fs-control);
}

@media (prefers-reduced-motion: reduce) {
  .osk,
  .osk--shown {
    transition: none;
  }
}
</style>
