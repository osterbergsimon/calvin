import { computed, inject, nextTick, onScopeDispose, readonly, ref, watch } from "vue";
import { routeLocationKey } from "vue-router";
import { useConfigStore } from "../stores/config";
import { useTouchCapability } from "./useTouchCapability";

/**
 * Global on-screen keyboard state for touch kiosks.
 *
 * simple-keyboard is only the renderer (see OnScreenKeyboard.vue). This
 * composable decides when the keyboard shows, which layout a field gets, and
 * how taps reach the focused input. It deliberately does not use
 * simple-keyboard's input buffer: those edits lose the caret on mid-string
 * changes.
 *
 * Show rules (docs/design/2026-10-29-on-screen-keyboard.md §3):
 *   - config `onScreenKeyboard: 'on'` always, `'auto'` on touch screens at
 *     least 720px wide, `'off'` never;
 *   - text-like inputs and textareas, never native pickers/readonly fields,
 *     never inside `[data-osk="off"]`.
 */

const TEXT_INPUT_TYPES = new Set(["text", "search", "url", "email", "password", "number"]);
const CARETLESS_TYPES = new Set(["number", "email"]);
const NUMERIC_INPUTMODES = new Set(["numeric", "decimal"]);
const MIN_AUTO_WIDTH = 720;
const MAX_HEIGHT = 300;
const HEIGHT_RATIO = 0.45;
const SHIFT_LOCK_WINDOW_MS = 400;
const SHIFT_UPPER = { ß: "ẞ" };
const CASE_CHARS = "abcdefghijklmnopqrstuvwxyzåäöæøéèüñßáàâêëíïóôúçõœã";

// Visibility is global (one keyboard, mounted once in App.vue), but the
// composable itself keeps its listeners per caller. These refs let other
// surfaces (the CLV-9 lock screen and sign-in dialog) react to the keyboard
// without owning it: hide the phone hand-off while it is up, and measure the
// space left for the card.
const sharedVisible = ref(false);
const sharedHeight = ref(0);

export function useOskState() {
  return { visible: readonly(sharedVisible), height: readonly(sharedHeight) };
}

export const OSK_LAYOUTS = {
  default: [
    "q w e r t y u i o p {bksp}",
    "a s d f g h j k l {enter}",
    "{shift} z x c v b n m , . {shift}",
    "{numbers} {accents} {space} - {hide}",
  ],
  url: [
    "q w e r t y u i o p {bksp}",
    "a s d f g h j k l {enter}",
    "{shift} z x c v b n m - _ {shift}",
    "{numbers} / : {space} . .com {hide}",
  ],
  // Email keeps every URL key except "/" and ":" — "@" takes their place.
  email: [
    "q w e r t y u i o p {bksp}",
    "a s d f g h j k l {enter}",
    "{shift} z x c v b n m - _ {shift}",
    "{numbers} @ {space} . .com {hide}",
  ],
  symbols: [
    "1 2 3 4 5 6 7 8 9 0 {bksp}",
    "@ # $ % & * - + ( ) {enter}",
    "{abc} ! \" ' : ; / ? _ = {abc}",
    "{abc} {space} . , {hide}",
  ],
  accents: [
    "å ä ö æ ø é è ü ñ ß {bksp}",
    "á à â ê ë í ï ó ô ú {enter}",
    "{shift} ç õ œ ã ' ` ~ ^ ¨ {shift}",
    "{abc} {space} . , {hide}",
  ],
  numeric: ["1 2 3 {bksp}", "4 5 6 -", "7 8 9 .", "{hide} 0 , {enter}"],
};

const isElement = value =>
  typeof Element !== "undefined" && value instanceof Element ? value : null;

const inputType = el => {
  if (!el || el.tagName !== "INPUT") return null;
  return (el.getAttribute("type") || "text").toLowerCase();
};

const isTextarea = el => !!el && el.tagName === "TEXTAREA";

/**
 * A field the keyboard should open for. Native pickers (time, date, color,
 * range, checkboxes) are deliberately excluded.
 */
export const isOskTarget = el => {
  const node = isElement(el);
  if (!node || node.disabled || node.readOnly) return false;
  if (node.closest('[data-osk="off"]')) return false;
  if (isTextarea(node)) return true;
  if (node.tagName !== "INPUT") return false;
  return TEXT_INPUT_TYPES.has(inputType(node));
};

export const layoutForTarget = el => {
  if (!isElement(el)) return "default";
  const inputmode = (el.getAttribute("inputmode") || "").toLowerCase();
  if (inputType(el) === "number" || NUMERIC_INPUTMODES.has(inputmode)) return "numeric";
  if (inputType(el) === "url") return "url";
  if (inputType(el) === "email") return "email";
  return "default";
};

// A real hardware key press in the field means someone has a physical keyboard;
// stay hidden until the next focus. Kept as a named predicate so it can be
// unit-tested without a browser that can mint trusted events (jsdom cannot).
export const isTrustedKeyInTarget = (event, target) =>
  !!event?.isTrusted && !!target && event.target === target;

const isVisible = el => {
  if (!el || el.hidden) return false;
  if (el.closest("[hidden]")) return false;
  if (typeof getComputedStyle !== "function") return true;
  const style = getComputedStyle(el);
  return style.display !== "none" && style.visibility !== "hidden";
};

const enterLabelFor = el => {
  if (!el || layoutForTarget(el) === "numeric") return "Done";
  const form = el.form || el.closest("form");
  if (!form) return "Enter";
  const submit = Array.from(form.querySelectorAll('button[type="submit"]')).find(isVisible);
  const primary = Array.from(form.querySelectorAll(".btn--primary, .security-btn--primary")).find(
    isVisible
  );
  const button = submit || primary;
  const label = button?.textContent?.trim();
  return label || "Enter";
};

const raf = cb =>
  typeof requestAnimationFrame === "function" ? requestAnimationFrame(cb) : setTimeout(cb, 0);

const cancelRaf = id => {
  if (typeof cancelAnimationFrame === "function") cancelAnimationFrame(id);
  else clearTimeout(id);
};

export function useOnScreenKeyboard() {
  const configStore = useConfigStore();
  const { isTouch } = useTouchCapability();

  const visible = ref(false);
  const viewportWidth = ref(typeof window !== "undefined" ? window.innerWidth : 0);
  const target = ref(null);
  const layout = ref("default");
  // The letter layout to return to from the symbols/accents layers.
  const baseLayout = ref("default");
  const height = ref(0);
  const shiftActive = ref(false);
  const capsLock = ref(false);
  const enterLabel = ref("Enter");

  const shiftOn = computed(() => shiftActive.value || capsLock.value);
  const isNumeric = computed(() => layout.value === "numeric");

  let lastShiftTap = 0;
  let hideFrame = null;
  let started = false;

  const mode = () => configStore.onScreenKeyboard || "auto";

  const enabled = computed(() => {
    const value = mode();
    if (value === "on") return true;
    if (value === "off") return false;
    if (typeof window === "undefined") return false;
    return isTouch.value && viewportWidth.value >= MIN_AUTO_WIDTH;
  });

  const currentHeight = () => {
    if (typeof window === "undefined") return 0;
    const viewport = window.visualViewport?.height || window.innerHeight || 0;
    return Math.min(MAX_HEIGHT, Math.round(viewport * HEIGHT_RATIO));
  };

  const publishHeight = () => {
    if (typeof document === "undefined") return;
    document.documentElement.style.setProperty("--osk-height", `${height.value}px`);
  };

  const syncHeight = () => {
    height.value = visible.value ? currentHeight() : 0;
    sharedVisible.value = visible.value;
    sharedHeight.value = height.value;
    publishHeight();
  };

  // The rendered panel is measured by OnScreenKeyboard (ResizeObserver). This
  // keeps --osk-height truthful even if CSS or browser chrome makes the panel
  // differ slightly from the viewport-ratio estimate, and re-scrolls the field
  // when the height changes.
  const setMeasuredHeight = px => {
    if (!visible.value || !Number.isFinite(px) || px <= 0) return;
    if (Math.abs(px - height.value) < 0.5) return;
    height.value = px;
    sharedHeight.value = px;
    publishHeight();
    scrollTargetIntoView(target.value);
  };

  const resetShift = () => {
    shiftActive.value = false;
    capsLock.value = false;
    lastShiftTap = 0;
  };

  const dispatchInput = el => {
    el.dispatchEvent(new Event("input", { bubbles: true }));
  };

  const supportsCaret = el => isTextarea(el) || !CARETLESS_TYPES.has(inputType(el));

  const maxLength = el => {
    const value = Number(el?.maxLength);
    return Number.isFinite(value) && value >= 0 ? value : -1;
  };

  const focusCaret = (el, position) => {
    if (!supportsCaret(el)) return;
    try {
      el.setSelectionRange(position, position);
    } catch {
      // Some input types (and detached test inputs) reject selection APIs.
    }
  };

  const insertText = text => {
    const el = target.value;
    if (!el || typeof el.value !== "string") return;

    const max = maxLength(el);
    if (!supportsCaret(el)) {
      if (max >= 0 && el.value.length >= max) return;
      const allowed = max >= 0 ? text.slice(0, max - el.value.length) : text;
      if (!allowed) return;
      el.value += allowed;
      dispatchInput(el);
      return;
    }

    const start = el.selectionStart ?? el.value.length;
    const end = el.selectionEnd ?? start;
    const available = max >= 0 ? max - (el.value.length - (end - start)) : text.length;
    if (available <= 0) return;
    const inserted = text.slice(0, available);
    el.value = el.value.slice(0, start) + inserted + el.value.slice(end);
    focusCaret(el, start + inserted.length);
    dispatchInput(el);
  };

  const backspace = () => {
    const el = target.value;
    if (!el || typeof el.value !== "string") return;

    if (!supportsCaret(el)) {
      const chars = [...el.value];
      chars.pop();
      el.value = chars.join("");
      dispatchInput(el);
      return;
    }

    const start = el.selectionStart ?? el.value.length;
    const end = el.selectionEnd ?? start;
    if (start !== end) {
      el.value = el.value.slice(0, start) + el.value.slice(end);
      focusCaret(el, start);
      dispatchInput(el);
      return;
    }
    if (start === 0) return;

    // [...string] keeps a surrogate pair or a composed character together.
    const before = [...el.value.slice(0, start)];
    before.pop();
    const prefix = before.join("");
    el.value = prefix + el.value.slice(end);
    focusCaret(el, prefix.length);
    dispatchInput(el);
  };

  const pressEnter = () => {
    const el = target.value;
    if (!el) return;

    if (isTextarea(el)) {
      insertText("\n");
      return;
    }

    const keydown = new KeyboardEvent("keydown", {
      key: "Enter",
      code: "Enter",
      keyCode: 13,
      which: 13,
      bubbles: true,
      cancelable: true,
    });
    const notPrevented = el.dispatchEvent(keydown);
    el.dispatchEvent(
      new KeyboardEvent("keyup", {
        key: "Enter",
        code: "Enter",
        keyCode: 13,
        which: 13,
        bubbles: true,
        cancelable: true,
      })
    );

    const form = el.form || el.closest("form");
    if (notPrevented && form) {
      if (typeof form.requestSubmit === "function") form.requestSubmit();
      else form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    }

    if (isNumeric.value) hide();
  };

  const findScrollContainer = el => {
    let node = el?.parentElement;
    while (node && node !== document.body) {
      const style = getComputedStyle(node);
      if (/(auto|scroll)/.test(style.overflowY) && node.scrollHeight > node.clientHeight) {
        return node;
      }
      node = node.parentElement;
    }
    return null;
  };

  /**
   * Scroll the focused field fully above the keyboard, with a little margin.
   *
   * Settings scrolls an inner `.settings-content`, not the window, and that
   * container's `padding-bottom: var(--osk-height)` (plus the height variable
   * itself) only applies after the panel renders. So wait for Vue's flush and
   * one animation frame before measuring, then nudge the nearest scrollable
   * ancestor instead of relying on scrollIntoView, which centres in the full
   * viewport — i.e. under the keyboard.
   */
  const scrollTargetIntoView = el => {
    if (!el) return;
    nextTick(() => {
      raf(() => {
        if (!visible.value || target.value !== el) return;
        if (typeof el.getBoundingClientRect !== "function") return;
        const rect = el.getBoundingClientRect();
        if (!rect || (!rect.height && !rect.width)) return;
        const viewport = window.visualViewport?.height || window.innerHeight || 0;
        const visibleBottom = viewport - height.value;
        const margin = 16;
        if (rect.top >= margin && rect.bottom <= visibleBottom - margin) return;

        // Centre inside the area above the keyboard, not the whole viewport.
        const centre = Math.max(margin, visibleBottom - margin) / 2;
        const delta = rect.top + rect.height / 2 - centre;
        if (!delta) return;
        const container = findScrollContainer(el);
        if (container) {
          container.scrollTop += delta;
        } else if (typeof window.scrollBy === "function") {
          window.scrollBy(0, delta);
        }
      });
    });
  };

  const showFor = el => {
    if (!isTargetElement(el)) return;
    if (!enabled.value) {
      hide();
      return;
    }

    target.value = el;
    baseLayout.value = layoutForTarget(el);
    layout.value = baseLayout.value;
    enterLabel.value = enterLabelFor(el);
    resetShift();
    visible.value = true;
    syncHeight();
    scrollTargetIntoView(el);
  };

  const hide = () => {
    if (hideFrame !== null) {
      cancelRaf(hideFrame);
      hideFrame = null;
    }
    visible.value = false;
    target.value = null;
    resetShift();
    syncHeight();
  };

  const scheduleHideCheck = () => {
    if (!visible.value) return;
    if (hideFrame !== null) cancelRaf(hideFrame);
    hideFrame = raf(() => {
      hideFrame = null;
      if (!visible.value) return;
      const active = document.activeElement;
      if (!enabled.value || !isTargetElement(active)) hide();
    });
  };

  const toggleShift = () => {
    const now = Date.now();
    if (capsLock.value) {
      resetShift();
      return;
    }
    if (shiftActive.value && now - lastShiftTap <= SHIFT_LOCK_WINDOW_MS) {
      capsLock.value = true;
      shiftActive.value = false;
      lastShiftTap = 0;
      return;
    }
    shiftActive.value = !shiftActive.value;
    lastShiftTap = shiftActive.value ? now : 0;
  };

  const uppercase = value => {
    // Multi-character buttons such as .com are never letter-cased.
    if (value.length === 1) return SHIFT_UPPER[value] || value.toUpperCase();
    return value;
  };

  const insertCharacter = value => {
    const shift = shiftOn.value;
    insertText(shift ? uppercase(value) : value);
    if (shiftActive.value && !capsLock.value) shiftActive.value = false;
  };

  const handleKeyPress = button => {
    if (!visible.value || !target.value) return;

    switch (button) {
      case "{bksp}":
        backspace();
        return;
      case "{shift}":
        toggleShift();
        return;
      case "{enter}":
        pressEnter();
        return;
      case "{hide}":
        hide();
        return;
      case "{numbers}":
        resetShift();
        layout.value = "symbols";
        return;
      case "{accents}":
        layout.value = "accents";
        return;
      case "{abc}":
        layout.value = baseLayout.value;
        return;
      case "{space}":
        insertCharacter(" ");
        return;
      default:
        insertCharacter(button);
    }
  };

  const isTargetElement = el => isOskTarget(el);

  const onFocusIn = event => {
    const el = event.target;
    if (isTargetElement(el)) {
      if (enabled.value) showFor(el);
      return;
    }
    scheduleHideCheck();
  };

  const onFocusOut = () => {
    scheduleHideCheck();
  };

  const onPointerDown = event => {
    if (visible.value || !enabled.value) return;
    if (isTargetElement(event.target)) showFor(event.target);
  };

  const onKeyDown = event => {
    if (!visible.value) return;
    if (event.key === "Escape") {
      hide();
      return;
    }
    if (isTrustedKeyInTarget(event, target.value)) hide();
  };

  const onResize = () => {
    viewportWidth.value = window.innerWidth;
    if (!visible.value) return;
    syncHeight();
    scrollTargetIntoView(target.value);
  };

  const route = inject(routeLocationKey, null);
  let stopRouteWatch = null;

  const start = () => {
    if (started || typeof document === "undefined") return;
    started = true;
    viewportWidth.value = window.innerWidth;
    height.value = 0;
    publishHeight();
    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("focusout", onFocusOut);
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("resize", onResize);
    if (route) {
      stopRouteWatch = watch(
        () => route.fullPath,
        () => hide()
      );
    }
  };

  const stop = () => {
    if (!started) return;
    started = false;
    document.removeEventListener("focusin", onFocusIn);
    document.removeEventListener("focusout", onFocusOut);
    document.removeEventListener("pointerdown", onPointerDown, true);
    document.removeEventListener("keydown", onKeyDown);
    window.removeEventListener("resize", onResize);
    if (hideFrame !== null) {
      cancelRaf(hideFrame);
      hideFrame = null;
    }
    stopRouteWatch?.();
    stopRouteWatch = null;
    visible.value = false;
    target.value = null;
    height.value = 0;
    sharedVisible.value = false;
    sharedHeight.value = 0;
    publishHeight();
  };

  watch(enabled, value => {
    if (!value) hide();
  });

  onScopeDispose(stop);

  return {
    visible,
    target,
    layout,
    baseLayout,
    height,
    isNumeric,
    shiftOn,
    shiftActive,
    capsLock,
    enterLabel,
    enabled,
    start,
    stop,
    hide,
    showFor,
    setMeasuredHeight,
    handleKeyPress,
  };
}

export const OSK_CASE_CHARS = CASE_CHARS;
