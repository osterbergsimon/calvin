import { describe, it, expect, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import { setActivePinia, createPinia } from "pinia";
import { useClockBar } from "@/composables/useClockBar";
import { useConfigStore } from "@/stores/config";

// useClockBar registers a timer in setup, so call it inside a mounted component.
function useBar(orientation, extra = {}) {
  let api;
  mount({
    setup() {
      api = useClockBar({
        enabled: () => true,
        showInKiosk: () => false,
        showInNonKiosk: () => true,
        previewMode: () => false,
        orientation: () => orientation,
        ...extra,
      });
      return () => null;
    },
  });
  return api;
}

describe("useClockBar barPadding", () => {
  beforeEach(() => setActivePinia(createPinia()));

  it("respects a vertical padding of 0 instead of forcing the 8px default (calvin-ny3)", () => {
    useConfigStore().clockBarVerticalPadding = 0;
    expect(useBar("vertical").barPadding.value).toBe(0);
  });

  it("respects a horizontal padding of 0", () => {
    useConfigStore().clockBarPadding = 0;
    expect(useBar("horizontal").barPadding.value).toBe(0);
  });

  it("falls back to 8 when padding is unset", () => {
    useConfigStore().clockBarVerticalPadding = undefined;
    expect(useBar("vertical").barPadding.value).toBe(8);
  });

  it("prefers a live preview padding (including 0) when in preview mode", () => {
    const api = useBar("vertical", { previewMode: () => true, previewPadding: () => 0 });
    expect(api.barPadding.value).toBe(0);
  });
});

describe("useClockBar barPaddingStyle", () => {
  beforeEach(() => setActivePinia(createPinia()));

  it("pads only the cross-axis (Y) for a horizontal bar, fixed gutter on X", () => {
    useConfigStore().clockBarPadding = 10;
    expect(useBar("horizontal").barPaddingStyle.value).toBe("10px 8px");
  });

  it("pads only the cross-axis (X) for a vertical bar, fixed gutter on Y", () => {
    useConfigStore().clockBarVerticalPadding = 10;
    expect(useBar("vertical").barPaddingStyle.value).toBe("8px 10px");
  });

  it("keeps the fixed gutter when cross-axis padding is 0 (flush to edge)", () => {
    useConfigStore().clockBarPadding = 0;
    expect(useBar("horizontal").barPaddingStyle.value).toBe("0px 8px");
    useConfigStore().clockBarVerticalPadding = 0;
    expect(useBar("vertical").barPaddingStyle.value).toBe("8px 0px");
  });
});
