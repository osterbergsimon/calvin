import { describe, it, expect, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import { setActivePinia, createPinia } from "pinia";
import { useClockBar } from "@/composables/useClockBar";
import { resolveClockBarDesign } from "@/utils/clockBarDesign";

// useClockBar registers a timer in setup, so call it inside a mounted component.
function useBar(orientation, config = {}) {
  const design = resolveClockBarDesign(config, [])[orientation];
  let api;
  mount({
    setup() {
      api = useClockBar({
        enabled: () => true,
        showInKiosk: () => false,
        showInNonKiosk: () => true,
        orientation: () => orientation,
        design: () => design,
      });
      return () => null;
    },
  });
  return api;
}

describe("useClockBar reads the resolved design only", () => {
  beforeEach(() => setActivePinia(createPinia()));

  it("takes the padding from the design, 0 included (calvin-ny3)", () => {
    expect(useBar("vertical", { clockBarVerticalPadding: 0 }).barPadding.value).toBe(0);
    expect(useBar("horizontal", { clockBarPadding: 0 }).barPadding.value).toBe(0);
  });

  it("falls back to 8 when padding is unset", () => {
    expect(useBar("vertical").barPadding.value).toBe(8);
  });

  it("shows the date and seconds the design asks for", () => {
    const api = useBar("horizontal", { clockShowDate: true, clockShowSeconds: true });
    expect(api.showDate.value).toBe(true);
    expect(api.showSeconds.value).toBe(true);
  });

  it("no longer exposes the retired per-key readers", () => {
    const api = useBar("horizontal");
    for (const key of ["fontSize", "dateFontSize", "pluginItemSize", "layout"]) {
      expect(api, key).not.toHaveProperty(key);
    }
  });
});

describe("useClockBar barPaddingStyle", () => {
  beforeEach(() => setActivePinia(createPinia()));

  it("pads only the cross-axis (Y) for a horizontal bar, fixed gutter on X", () => {
    expect(useBar("horizontal", { clockBarPadding: 10 }).barPaddingStyle.value).toBe("10px 8px");
  });

  it("pads only the cross-axis (X) for a vertical bar, fixed gutter on Y", () => {
    expect(useBar("vertical", { clockBarVerticalPadding: 10 }).barPaddingStyle.value).toBe(
      "8px 10px"
    );
  });

  it("keeps the fixed gutter when cross-axis padding is 0 (flush to edge)", () => {
    expect(useBar("horizontal", { clockBarPadding: 0 }).barPaddingStyle.value).toBe("0px 8px");
    expect(useBar("vertical", { clockBarVerticalPadding: 0 }).barPaddingStyle.value).toBe(
      "8px 0px"
    );
  });
});
