import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { defineComponent } from "vue";
import { useHotCornerReveal } from "@/composables/useHotCornerReveal";

// Mount a throwaway component so the composable's onMounted/onUnmounted run in a
// real component context, and expose onPointerDown for direct invocation.
function setup(store) {
  let api;
  const Comp = defineComponent({
    setup() {
      api = useHotCornerReveal(store, { getViewport: () => ({ w: 1000, h: 800 }) });
      return () => null;
    },
  });
  const wrapper = mount(Comp);
  return {
    wrapper,
    onPointerDown: (...a) => api.onPointerDown(...a),
    onContextMenu: (...a) => api.onContextMenu(...a),
  };
}

// A cancelable contextmenu-like event carrying viewport coords.
const contextMenuAt = (x, y) => ({ clientX: x, clientY: y, preventDefault: vi.fn() });

function makeStore(overrides = {}) {
  return {
    shouldShowUI: false,
    hotCornerPosition: "bottom-left",
    hotCornerSize: 64,
    hotCornerLongPressMs: 500,
    showUITemporarily: vi.fn(),
    ...overrides,
  };
}

const press = (x, y) => ({ button: 0, clientX: x, clientY: y });

describe("useHotCornerReveal", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  it("reveals the UI after holding inside the corner for the configured time", () => {
    const store = makeStore();
    const { onPointerDown } = setup(store);
    onPointerDown(press(10, 790));
    expect(store.showUITemporarily).not.toHaveBeenCalled();
    vi.advanceTimersByTime(500);
    expect(store.showUITemporarily).toHaveBeenCalledWith(60);
  });

  it("does not reveal on a short tap (pointerup before the hold elapses)", () => {
    const store = makeStore();
    const { onPointerDown } = setup(store);
    onPointerDown(press(10, 790));
    vi.advanceTimersByTime(200);
    window.dispatchEvent(new Event("pointerup"));
    vi.advanceTimersByTime(500);
    expect(store.showUITemporarily).not.toHaveBeenCalled();
  });

  it("ignores presses outside the corner hit-box", () => {
    const store = makeStore();
    const { onPointerDown } = setup(store);
    onPointerDown(press(400, 400));
    vi.advanceTimersByTime(1000);
    expect(store.showUITemporarily).not.toHaveBeenCalled();
  });

  it("does nothing while the UI is already shown", () => {
    const store = makeStore({ shouldShowUI: true });
    const { onPointerDown } = setup(store);
    onPointerDown(press(10, 790));
    vi.advanceTimersByTime(1000);
    expect(store.showUITemporarily).not.toHaveBeenCalled();
  });

  it("honors a custom hold time", () => {
    const store = makeStore({ hotCornerLongPressMs: 900 });
    const { onPointerDown } = setup(store);
    onPointerDown(press(10, 790));
    vi.advanceTimersByTime(500);
    expect(store.showUITemporarily).not.toHaveBeenCalled();
    vi.advanceTimersByTime(400);
    expect(store.showUITemporarily).toHaveBeenCalledWith(60);
  });

  it("suppresses the trailing content click after a reveal", () => {
    const store = makeStore();
    const { onPointerDown } = setup(store);
    onPointerDown(press(10, 790));
    vi.advanceTimersByTime(500);
    const click = new Event("click", { cancelable: true });
    window.dispatchEvent(click);
    expect(click.defaultPrevented).toBe(true);
  });

  it("suppresses the long-press context menu while pressing in the corner", () => {
    const store = makeStore();
    const { onPointerDown, onContextMenu } = setup(store);
    onPointerDown(press(10, 790));
    const ctx = contextMenuAt(10, 790);
    onContextMenu(ctx);
    expect(ctx.preventDefault).toHaveBeenCalled();
  });

  it("still suppresses the context menu after the hold reveals (finger down)", () => {
    const store = makeStore();
    const { onPointerDown, onContextMenu } = setup(store);
    onPointerDown(press(10, 790));
    vi.advanceTimersByTime(500); // hold fires → shouldShowUI would flip in the real store
    store.shouldShowUI = true; // simulate the reveal
    const ctx = contextMenuAt(10, 790); // browser contextmenu fires slightly later, finger still down
    onContextMenu(ctx);
    expect(ctx.preventDefault).toHaveBeenCalled();
  });

  it("suppresses a right-click context menu over the corner while UI is hidden", () => {
    const store = makeStore();
    const { onContextMenu } = setup(store);
    const ctx = contextMenuAt(10, 790);
    onContextMenu(ctx);
    expect(ctx.preventDefault).toHaveBeenCalled();
  });

  it("does not touch the context menu away from the corner", () => {
    const store = makeStore();
    const { onContextMenu } = setup(store);
    const ctx = contextMenuAt(500, 400);
    onContextMenu(ctx);
    expect(ctx.preventDefault).not.toHaveBeenCalled();
  });

  it("leaves the context menu alone once the UI is shown and no press is active", () => {
    const store = makeStore({ shouldShowUI: true });
    const { onContextMenu } = setup(store);
    const ctx = contextMenuAt(10, 790);
    onContextMenu(ctx);
    expect(ctx.preventDefault).not.toHaveBeenCalled();
  });
});
