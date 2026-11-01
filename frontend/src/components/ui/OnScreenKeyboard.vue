<!-- frontend/src/components/ui/OnScreenKeyboard.vue -->
<template>
  <Teleport to="body">
    <button
      v-if="osk.showKeyboardButton.value"
      type="button"
      class="osk-open"
      aria-label="Show on-screen keyboard"
      @pointerdown.prevent
      @mousedown.prevent
      @click="osk.showKeyboard()"
    >
      <svg class="osk-open__ic" aria-hidden="true" viewBox="0 0 24 24">
        <path
          d="M4,5A2,2 0 0,0 2,7V17A2,2 0 0,0 4,19H20A2,2 0 0,0 22,17V7A2,2 0 0,0 20,5H4M4,7H20V17H4V7M5,8V10H7V8H5M8,8V10H10V8H8M11,8V10H13V8H11M14,8V10H16V8H14M17,8V10H19V8H17M5,11V13H7V11H5M8,11V13H10V11H8M11,11V13H13V11H11M14,11V13H16V11H14M17,11V13H19V11H17M8,14V16H16V14H8Z"
        />
      </svg>
      <span>Keyboard</span>
    </button>
    <!-- Both pointerdown and mousedown are prevented so a tap never takes focus
         from the field (CLV-114). WebKit still sends the compatibility mousedown
         of a touch tap after a prevented pointerdown, and its default action
         focuses the key button: the field blurs and the keyboard hides. -->
    <div
      v-if="!failed"
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
      @mousedown.prevent
    >
      <div v-if="osk.pickerOpen.value" class="osk-picker" role="group" aria-label="Keyboard layout">
        <div class="osk-picker__head">Keyboard layout</div>
        <div class="osk-picker__grid">
          <button
            v-for="option in pickerOptions"
            :key="option.id ?? 'default'"
            type="button"
            class="osk-picker__option"
            :class="{ 'osk-picker__option--on': option.active }"
            :aria-pressed="option.active ? 'true' : 'false'"
            tabindex="-1"
            @click="osk.chooseLetterLayout(option.id)"
          >
            <span class="osk-picker__name">{{ option.label }}</span>
            <code v-if="option.code" class="osk-picker__code">&nbsp;{{ option.code }}</code>
          </button>
        </div>
        <div class="osk-picker__foot">
          <button
            type="button"
            class="osk-picker__abc"
            tabindex="-1"
            @click="osk.closeLayoutPicker()"
          >
            abc
          </button>
        </div>
      </div>
      <div v-show="!osk.pickerOpen.value" ref="host" class="osk-host"></div>
    </div>
  </Teleport>
</template>

<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
// Named import: simple-keyboard is published as a CommonJS UMD bundle whose
// module.exports is `{ SimpleKeyboard, default }`. Under Vite 8/Rolldown the
// default-import interop hands back that whole object, so `new SimpleKeyboard()`
// throws "SimpleKeyboard is not a constructor" and takes app.mount() down with
// it. The named export is the constructor in both the CJS and ESM builds.
import { SimpleKeyboard } from "simple-keyboard";
import { OSK_CASE_CHARS, useOnScreenKeyboard } from "@/composables/useOnScreenKeyboard";
import { OSK_LAYOUTS_BY_ID, OSK_LAYOUT_IDS } from "@/utils/oskLayouts";
import { logError } from "@/utils/logger";

const LAYOUT_LONG_PRESS_MS = 500;

const ICONS = {
  bksp: '<svg class="osk-ic" aria-hidden="true" viewBox="0 0 24 24"><path d="M21 5H9l-6 7 6 7h12z"/><path d="M17 9l-6 6M11 9l6 6"/></svg>',
  shift:
    '<svg class="osk-ic" aria-hidden="true" viewBox="0 0 24 24"><path d="M12 4l8 8h-4v8H8v-8H4z"/></svg>',
  hide: '<svg class="osk-ic" aria-hidden="true" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="11" rx="2"/><path d="M8 19l4 3 4-3"/></svg>',
};

// Shift changes the printed label only; the button token stays lowercase so
// the caret insertion knows which code point to replace.
const SHIFTED_LABELS = Object.fromEntries(
  [...OSK_CASE_CHARS].map(ch => [ch, ch === "ß" ? "ẞ" : ch.toUpperCase()])
);

const osk = useOnScreenKeyboard();
const panel = ref(null);
const host = ref(null);
// Set when the renderer cannot be constructed. The keyboard is an optional
// touch affordance: if it fails, render nothing and let the rest of the app
// (connection checks, routing, setup cards) keep running.
const failed = ref(false);
let keyboard = null;
let repeatDelay = null;
let repeatInterval = null;
let resizeObserver = null;

const buttonAttributes = computed(() => [
  { attribute: "type", value: "button" },
  { attribute: "tabindex", value: "-1" },
  { attribute: "aria-label", value: "Backspace", buttons: "{bksp}" },
  { attribute: "aria-label", value: "Shift", buttons: "{shift}" },
  { attribute: "aria-label", value: "Hide keyboard", buttons: "{hide}" },
  { attribute: "aria-label", value: "Space", buttons: "{space}" },
  // The layout key names the LAYOUT, never the UI language. With extras it
  // cycles; without, it opens the list (CLV-21 §3).
  {
    attribute: "aria-label",
    value: osk.hasExtraLayouts.value
      ? `Switch keyboard layout, now ${osk.activeLayoutName.value}`
      : `Keyboard layout: ${osk.activeLayoutName.value}. Opens the list.`,
    buttons: "{layout}",
  },
  { attribute: "aria-haspopup", value: "true", buttons: "{layout}" },
]);

const compact = computed(() => osk.height.value > 0 && osk.height.value < 260);

const pickerOptions = computed(() => {
  const device = osk.deviceLayout.value;
  const options = [
    {
      id: null,
      label: compact.value
        ? `Default (${osk.mainLayoutCode.value})`
        : `Default (${osk.mainLayoutName.value})`,
      code: "",
      active: !device,
    },
  ];
  for (const id of OSK_LAYOUT_IDS) {
    options.push({
      id,
      label: OSK_LAYOUTS_BY_ID[id].name,
      code: OSK_LAYOUTS_BY_ID[id].code,
      active: device === id,
    });
  }
  return options;
});

const display = computed(() => {
  const map = {
    "{bksp}": ICONS.bksp,
    "{shift}": ICONS.shift,
    "{hide}": ICONS.hide,
    "{numbers}": "?123",
    "{accents}": "åäö",
    "{abc}": "abc",
    "{layout}": osk.activeLayoutCode.value,
    "{enter}": osk.enterLabel.value,
    // The space bar always names the active layout, so a lock screen shows
    // which one you are typing on. Only the label opens the picker (CLV-21 §3).
    "{space}": `<span class="osk-space-label" role="button" tabindex="-1" aria-label="Change keyboard layout"><small class="osk-space-name">${osk.activeLayoutName.value}</small></span>`,
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

// --- Layout key: tap vs long-press, and the space-bar label ---------------
// simple-keyboard fires on pointerdown, so a long press would already have
// cycled the layout. Capture the event before it reaches the button and decide
// on pointerup instead: a short tap keeps the old behaviour, a 500ms hold opens
// the picker (CLV-21 §2).
let layoutHoldTimer = null;
let layoutHoldFired = false;
let layoutPressActive = false;

const clearLayoutHold = () => {
  if (layoutHoldTimer !== null) {
    clearTimeout(layoutHoldTimer);
    layoutHoldTimer = null;
  }
};

const onPanelPointerDown = event => {
  const target = event.target;
  if (!target?.closest) return;

  // A tap on the label text opens the picker; the rest of the key types a space.
  if (target.closest(".osk-space-label")) {
    event.preventDefault();
    event.stopPropagation();
    osk.openLayoutPicker();
    return;
  }

  if (!target.closest(".hg-button-layout")) return;
  event.preventDefault();
  event.stopPropagation();
  layoutPressActive = true;
  layoutHoldFired = false;
  clearLayoutHold();
  layoutHoldTimer = setTimeout(() => {
    layoutHoldTimer = null;
    layoutHoldFired = true;
    osk.openLayoutPicker();
  }, LAYOUT_LONG_PRESS_MS);
};

const onWindowPointerUp = () => {
  if (!layoutPressActive) return;
  layoutPressActive = false;
  clearLayoutHold();
  if (layoutHoldFired) {
    layoutHoldFired = false;
    return;
  }
  osk.tapLayoutKey();
};

// A cancelled gesture (scrolled away, system gesture) must not cycle.
const onWindowPointerCancel = () => {
  layoutPressActive = false;
  layoutHoldFired = false;
  clearLayoutHold();
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
    layout: osk.layouts.value,
    layoutName: osk.layout.value,
    display: display.value,
    buttonTheme: buttonTheme.value,
    buttonAttributes: buttonAttributes.value,
  });
};

onMounted(() => {
  try {
    keyboard = new SimpleKeyboard(host.value, {
      layout: osk.layouts.value,
      layoutName: osk.layout.value,
      theme: "calvin-osk",
      display: display.value,
      buttonTheme: buttonTheme.value,
      buttonAttributes: buttonAttributes.value,
      preventMouseDownDefault: true,
      disableButtonHold: true,
      disableCaretPositioning: true,
      useButtonTag: true,
      debug: false,
      onKeyPress: button => osk.handleKeyPress(button),
    });
  } catch (error) {
    // A broken keyboard renderer must never abort app.mount(): that would skip
    // every later mounted hook, including App.vue's connectionStore.initialize().
    failed.value = true;
    logError("[OnScreenKeyboard]", "Failed to initialise the on-screen keyboard:", error);
    return;
  }
  osk.start();
  if (typeof ResizeObserver === "function" && panel.value) {
    resizeObserver = new ResizeObserver(measureHeight);
    resizeObserver.observe(panel.value);
  }
  panel.value?.addEventListener("pointerdown", onRootPointerDown);
  panel.value?.addEventListener("pointerdown", onPanelPointerDown, true);
  window.addEventListener("pointerup", clearRepeat);
  window.addEventListener("pointercancel", clearRepeat);
  window.addEventListener("pointerup", onWindowPointerUp);
  window.addEventListener("pointercancel", onWindowPointerCancel);
});

onUnmounted(() => {
  clearRepeat();
  resizeObserver?.disconnect();
  resizeObserver = null;
  panel.value?.removeEventListener("pointerdown", onRootPointerDown);
  panel.value?.removeEventListener("pointerdown", onPanelPointerDown, true);
  window.removeEventListener("pointerup", clearRepeat);
  window.removeEventListener("pointercancel", clearRepeat);
  window.removeEventListener("pointerup", onWindowPointerUp);
  window.removeEventListener("pointercancel", onWindowPointerCancel);
  clearLayoutHold();
  osk.stop();
  keyboard?.destroy();
  keyboard = null;
});

watch(
  () => [
    osk.layout.value,
    osk.shiftOn.value,
    osk.enterLabel.value,
    osk.activeLetterLayout.value,
    osk.hasExtraLayouts.value,
  ],
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
/* The way back to the keyboard (CLV-27 §4). Same layer as the OSK panel, so it
   sits above dialogs and their scrim (1000). */
.osk-open {
  position: fixed;
  right: 16px;
  bottom: calc(16px + env(safe-area-inset-bottom, 0px));
  z-index: 1100;
  height: 48px;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 0 16px;
  background: var(--bg-1);
  color: var(--ink);
  border: 1px solid var(--line);
  border-radius: var(--radius-md);
  box-shadow: 0 6px 18px -8px var(--shadow-hover);
  font-family: var(--font-ui);
  font-size: var(--fs-sm);
  font-weight: 500;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  animation: osk-open-in 120ms ease-out;
}
.osk-open__ic {
  width: 20px;
  height: 20px;
  flex: none;
  fill: var(--ink-2);
}
.osk-open:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: 2px;
}
@keyframes osk-open-in {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}
@media (prefers-reduced-motion: reduce) {
  .osk-open {
    animation: none;
  }
}
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
  font-size: var(--fs-lg);
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
  font-size: var(--fs-sm);
}

:deep(.hg-button.hg-button-space) {
  flex-grow: 6;
  background: var(--bg-2);
  color: var(--ink);
  font-size: var(--fs-xl);
  font-weight: 400;
}

/* The layout key is a 1× function key showing the active layout's code. */
:deep(.hg-button.hg-button-layout) {
  flex-grow: 1;
}

/* The space bar names the active layout on every field (CLV-21 §3). Only the
   label itself opens the picker; the rest of the key types a space. */
:deep(.osk-space-label) {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 44px;
  min-height: 32px;
  padding: 0 8px;
  border-radius: var(--radius-xs);
  cursor: pointer;
}
:deep(.osk-space-name) {
  color: var(--ink-3);
  font-size: var(--fs-sm);
  font-weight: 400;
}

/* Layout picker: replaces the key rows inside the same panel, so the field
   above stays visible and the panel keeps its height (CLV-21 §4). */
.osk-picker {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.osk-picker__head {
  flex: 0 0 auto;
  padding-left: 4px;
  color: var(--ink-2);
  font-size: var(--fs-md);
}
.osk-picker__grid {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  grid-auto-rows: minmax(44px, 1fr);
  gap: 8px;
}
.osk-picker__option {
  min-width: 0;
  min-height: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 0 6px;
  background: var(--bg-2);
  color: var(--ink);
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  box-shadow: 0 1px 0 var(--line);
  font-family: var(--font-ui);
  font-size: var(--fs-md);
  font-weight: 500;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}
.osk-picker__option:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: 2px;
}
.osk-picker__option--on {
  background: color-mix(in srgb, var(--focus) 16%, var(--bg-2));
  border-color: var(--focus);
}
.osk-picker__name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.osk-picker__code {
  color: var(--ink-3);
  font-family: var(--font-data);
  font-size: var(--fs-sm);
}
.osk-picker__foot {
  flex: 0 0 auto;
  display: flex;
  justify-content: flex-end;
}
.osk-picker__abc {
  min-height: 44px;
  min-width: 110px;
  padding: 0 1.5rem;
  background: color-mix(in srgb, var(--ink) 6%, var(--bg-0));
  color: var(--ink-2);
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  font-family: var(--font-ui);
  font-size: var(--fs-md);
  font-weight: 500;
  cursor: pointer;
}
.osk-picker__abc:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: 2px;
}

/* 800×480 (216px tall panel): tighter heading and bottom row, no codes. */
.osk--compact .osk-picker {
  gap: 6px;
}
.osk--compact .osk-picker__head {
  flex-basis: 22px;
  height: 22px;
  display: flex;
  align-items: center;
  font-size: var(--fs-sm);
}
.osk--compact .osk-picker__grid {
  gap: 6px;
}
.osk--compact .osk-picker__code {
  display: none;
}
.osk--compact .osk-picker__foot {
  flex-basis: 44px;
}

@media (max-width: 480px) {
  .osk-picker__grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
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
