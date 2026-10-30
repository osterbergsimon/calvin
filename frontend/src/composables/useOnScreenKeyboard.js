import { computed, inject, nextTick, onScopeDispose, readonly, ref, watch } from "vue";
import { routeLocationKey } from "vue-router";
import { useConfigStore } from "../stores/config";
import { useScreenSetting } from "./useScreenSetting";
import { useTouchCapability } from "./useTouchCapability";
import {
  DEFAULT_OSK_LAYOUT,
  buildOskLayouts,
  clearStoredOskLayout,
  isOskLayoutId,
  layoutSwitchOrder,
  nextOskLayout,
  normalizeOskExtraLayouts,
  oskLayoutCode,
  oskLayoutName,
  readStoredOskLayout,
  resolveOskMainLayout,
  storeOskLayout,
} from "../utils/oskLayouts";

/**
 * Global on-screen keyboard state for touch kiosks.
 *
 * simple-keyboard is only the renderer (see OnScreenKeyboard.vue). This
 * composable decides when the keyboard shows, which layer and which letter
 * layout a field gets, and how taps reach the focused input. It deliberately
 * does not use simple-keyboard's input buffer: those edits lose the caret on
 * mid-string changes.
 *
 * Show rules (docs/design/2026-10-29-on-screen-keyboard.md §3, amended by
 * docs/design/2026-10-30-osk-hardware-keyboard.md):
 *   - `onScreenKeyboard` is per screen: Auto · On · Off. Auto shows on touch
 *     screens at least 720px wide until a real keyboard is used there; On
 *     always; Off never by itself;
 *   - text-like inputs and textareas, never native pickers/readonly fields,
 *     never inside `[data-osk="off"]`;
 *   - on a touchscreen with a field focused and the keyboard hidden, a
 *     "⌨ Keyboard" button always opens it.
 *
 * Layout rules (§4): the keyboard layout is its own setting (`oskLayout` plus
 * `oskExtraLayouts`). It is independent of the language Calvin's UI is shown
 * in — nothing here reads or follows the UI/app language.
 */

export const OSK_MODE_STORAGE_KEY = "calvin-osk-mode";
export const OSK_HARDWARE_SEEN_KEY = "calvin-osk-hardware-seen";

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

/**
 * Physical typing, as opposed to a remote, a button box or the OSK itself
 * (CLV-27 §2): a trusted, printable, non-space key in an OSK target field with
 * no Ctrl, Alt or Meta. Arrows, Enter, Escape, media/F-keys and the OSK's
 * synthetic events never count.
 */
export const isPhysicalTyping = (event, target = event?.target) => {
  if (!event?.isTrusted) return false;
  if (!isOskTarget(event.target)) return false;
  if (target && event.target !== target) return false;
  if (event.ctrlKey || event.altKey || event.metaKey) return false;
  return typeof event.key === "string" && event.key.length === 1 && event.key !== " ";
};

// Auto learns that this screen has a keyboard. The flag is per browser and
// survives reloads; when storage is blocked it lasts for this page load.
const hardwareSeen = ref(false);

const readHardwareSeen = () => {
  try {
    return window.localStorage.getItem(OSK_HARDWARE_SEEN_KEY) === "1";
  } catch {
    return hardwareSeen.value;
  }
};

export const learnHardwareKeyboard = () => {
  hardwareSeen.value = true;
  try {
    window.localStorage.setItem(OSK_HARDWARE_SEEN_KEY, "1");
  } catch {
    // Storage blocked: the flag lasts for this page load.
  }
};

export const forgetHardwareKeyboard = () => {
  hardwareSeen.value = false;
  try {
    window.localStorage.removeItem(OSK_HARDWARE_SEEN_KEY);
  } catch {
    // Nothing to clean up when storage is blocked.
  }
};

export const forgetOskHardware = forgetHardwareKeyboard;

export function useOskHardwareSeen() {
  return { seen: readonly(hardwareSeen), forget: forgetHardwareKeyboard };
}

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
  // The existing key, now per screen: kiosk override on a kiosk, localStorage
  // on any other browser, server default while neither is set (CLV-27 §6).
  const screenSetting = useScreenSetting("onScreenKeyboard", {
    storageKey: OSK_MODE_STORAGE_KEY,
  });

  const visible = ref(false);
  const viewportWidth = ref(typeof window !== "undefined" ? window.innerWidth : 0);
  const target = ref(null);
  // The OSK target that has focus even when the keyboard is hidden. The
  // "⌨ Keyboard" button needs it while `target` is cleared.
  const focusedTarget = ref(null);
  const layout = ref("default");
  // The letter layout to return to from the symbols/accents layers.
  const baseLayout = ref("default");
  const height = ref(0);
  const shiftActive = ref(false);
  const capsLock = ref(false);
  const enterLabel = ref("Enter");

  // --- Letter layout (spec §4 "Keyboard layouts") -------------------------
  // `oskLayout` is the main layout, `oskExtraLayouts` the ones the layout key
  // cycles through. Neither has anything to do with Calvin's UI language.
  const preferredLetterLayout = ref(readStoredOskLayout());
  const mainLayout = computed(() => resolveOskMainLayout(configStore.oskLayout));
  const layoutOrder = computed(() =>
    layoutSwitchOrder(
      mainLayout.value,
      normalizeOskExtraLayouts(configStore.oskExtraLayouts, mainLayout.value)
    )
  );
  // The active layout survives hiding and showing. A device choice is honoured
  // even when it isn't the main or an extra layout (CLV-21 §5); only an entry
  // that is no longer a valid layout falls back to the main one.
  const activeLetterLayout = computed(() => {
    if (isOskLayoutId(preferredLetterLayout.value)) return preferredLetterLayout.value;
    return layoutOrder.value[0] ?? DEFAULT_OSK_LAYOUT;
  });
  const hasExtraLayouts = computed(() => layoutOrder.value.length > 1);
  // The choice made on this device, or null when the keyboard follows Settings.
  const deviceLayout = computed(() =>
    isOskLayoutId(preferredLetterLayout.value) ? preferredLetterLayout.value : null
  );
  const activeLayoutName = computed(() => oskLayoutName(activeLetterLayout.value));
  const activeLayoutCode = computed(() => oskLayoutCode(activeLetterLayout.value));
  const mainLayoutName = computed(() => oskLayoutName(mainLayout.value));
  const mainLayoutCode = computed(() => oskLayoutCode(mainLayout.value));
  const layouts = computed(() => buildOskLayouts({ layout: activeLetterLayout.value }));

  // The picker replaces the key rows inside the keyboard panel (CLV-21 §4).
  const pickerOpen = ref(false);
  const openLayoutPicker = () => {
    if (!visible.value || !target.value) return;
    pickerOpen.value = true;
  };
  const closeLayoutPicker = () => {
    pickerOpen.value = false;
  };

  const setLetterLayout = id => {
    preferredLetterLayout.value = id;
    if (id) storeOskLayout(id);
  };

  const cycleLetterLayout = () => {
    setLetterLayout(nextOskLayout(layoutOrder.value, activeLetterLayout.value));
  };

  /** Picking from the list: a layout id, or null for the Settings default. */
  const chooseLetterLayout = id => {
    if (id) {
      setLetterLayout(id);
    } else {
      preferredLetterLayout.value = null;
      clearStoredOskLayout();
    }
    pickerOpen.value = false;
    layout.value = baseLayout.value;
    resetShift();
  };

  /** A short tap on the layout key: cycle with extras, open the list without. */
  const tapLayoutKey = () => {
    if (hasExtraLayouts.value) cycleLetterLayout();
    else openLayoutPicker();
  };

  const shiftOn = computed(() => shiftActive.value || capsLock.value);
  const isNumeric = computed(() => layout.value === "numeric");

  let lastShiftTap = 0;
  let hideFrame = null;
  let started = false;

  const mode = () => screenSetting.value.value || "auto";

  const enabled = computed(() => {
    const value = mode();
    if (value === "on") return true;
    if (value === "off") return false;
    if (typeof window === "undefined") return false;
    return isTouch.value && viewportWidth.value >= MIN_AUTO_WIDTH;
  });

  // Auto stops showing the keyboard on a screen after someone typed on a real
  // keyboard there. On and Off are unaffected.
  const canShowFor = el =>
    isTargetElement(el) && enabled.value && !(mode() === "auto" && hardwareSeen.value);

  // Touchscreen, an OSK field has focus, keyboard hidden: there must always be
  // a way back (CLV-27 §4). Non-touch screens have a keyboard already, and
  // Auto keeps its no-keyboard rule for narrow viewports (§3).
  const showKeyboardButton = computed(() => {
    if (!isTouch.value || !focusedTarget.value || visible.value) return false;
    if (mode() === "auto") return enabled.value;
    return true;
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

  const showFor = (el, { force = false } = {}) => {
    if (!isTargetElement(el)) return;
    if (!force && !canShowFor(el)) return;

    target.value = el;
    focusedTarget.value = el;
    baseLayout.value = layoutForTarget(el);
    layout.value = baseLayout.value;
    enterLabel.value = enterLabelFor(el);
    resetShift();
    pickerOpen.value = false;
    visible.value = true;
    syncHeight();
    scrollTargetIntoView(el);
  };

  /**
   * The "⌨ Keyboard" button. Opens the keyboard for the field that already has
   * focus even in Off mode or after Auto learned a hardware keyboard. In Auto
   * it also forgets the learned keyboard, so focusing a field shows it again.
   */
  const showKeyboard = () => {
    const el =
      focusedTarget.value ||
      (typeof document !== "undefined" && isTargetElement(document.activeElement)
        ? document.activeElement
        : null);
    if (!el) return;
    if (mode() === "auto") forgetHardwareKeyboard();
    showFor(el, { force: true });
  };

  const hide = () => {
    if (hideFrame !== null) {
      cancelRaf(hideFrame);
      hideFrame = null;
    }
    visible.value = false;
    target.value = null;
    pickerOpen.value = false;
    resetShift();
    syncHeight();
  };

  const scheduleHideCheck = () => {
    if (hideFrame !== null) cancelRaf(hideFrame);
    hideFrame = raf(() => {
      hideFrame = null;
      const active = typeof document !== "undefined" ? document.activeElement : null;
      if (isTargetElement(active)) {
        focusedTarget.value = active;
        if (canShowFor(active)) {
          if (!visible.value || target.value !== active) showFor(active);
        } else if (visible.value) {
          hide();
        }
        return;
      }
      focusedTarget.value = null;
      if (visible.value) hide();
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
      case "{layout}":
        tapLayoutKey();
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
      focusedTarget.value = el;
      if (canShowFor(el)) showFor(el);
      else if (visible.value) hide();
      return;
    }
    scheduleHideCheck();
  };

  const onFocusOut = () => {
    scheduleHideCheck();
  };

  const onPointerDown = event => {
    if (visible.value) return;
    const el = event.target;
    if (!isTargetElement(el)) return;
    focusedTarget.value = el;
    // Auto after learning, and Off, only open from the ⌨ Keyboard button.
    if (canShowFor(el)) showFor(el);
  };

  const onKeyDown = event => {
    if (event.key === "Escape") {
      if (visible.value) hide();
      return;
    }
    if (!isPhysicalTyping(event, event.target)) return;
    if (mode() === "auto") learnHardwareKeyboard();
    if (visible.value) hide();
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
    hardwareSeen.value = readHardwareSeen();
    focusedTarget.value = isTargetElement(document.activeElement) ? document.activeElement : null;
    publishHeight();
    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("focusout", onFocusOut);
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("resize", onResize);
    if (route) {
      stopRouteWatch = watch(
        () => route.fullPath,
        () => {
          focusedTarget.value = null;
          hide();
        }
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
    focusedTarget.value = null;
    height.value = 0;
    sharedVisible.value = false;
    sharedHeight.value = 0;
    publishHeight();
  };

  watch(enabled, value => {
    if (!value) hide();
  });

  watch(hardwareSeen, seen => {
    if (seen && mode() === "auto" && visible.value) hide();
  });

  onScopeDispose(stop);

  return {
    visible,
    target,
    focusedTarget,
    layout,
    baseLayout,
    height,
    isNumeric,
    shiftOn,
    shiftActive,
    capsLock,
    enterLabel,
    enabled,
    showKeyboardButton,
    showKeyboard,
    // Letter layout state and switching.
    mainLayout,
    mainLayoutName,
    mainLayoutCode,
    layoutOrder,
    hasExtraLayouts,
    deviceLayout,
    activeLetterLayout,
    activeLayoutName,
    activeLayoutCode,
    layouts,
    pickerOpen,
    openLayoutPicker,
    closeLayoutPicker,
    chooseLetterLayout,
    cycleLetterLayout,
    tapLayoutKey,
    start,
    stop,
    hide,
    showFor,
    onKeyDown,
    setMeasuredHeight,
    handleKeyPress,
  };
}

export const OSK_CASE_CHARS = CASE_CHARS;
