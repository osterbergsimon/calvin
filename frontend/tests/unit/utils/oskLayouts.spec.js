/**
 * Unit tests for the on-screen keyboard letter layouts
 * (docs/design/2026-10-29-on-screen-keyboard.md §4, §7, §9).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  DEFAULT_OSK_LAYOUT,
  OSK_DEVICE_LAYOUT_STORAGE_KEY,
  OSK_LAYOUT_CHANGE_EVENT,
  OSK_LAYOUT_HINT_STORAGE_KEY,
  OSK_LAYOUT_IDS,
  OSK_LEGACY_LAYOUT_STORAGE_KEY,
  OSK_LAYOUTS_BY_ID,
  buildOskLayouts,
  clearStoredOskLayout,
  isOskLayoutId,
  layoutFromLanguageTag,
  layoutSwitchOrder,
  nextOskLayout,
  normalizeOskExtraLayouts,
  normalizeOskLayout,
  readOskLayoutHint,
  readStoredOskLayout,
  resolveOskMainLayout,
  storeOskLayout,
} from "@/utils/oskLayouts";

const rowsOf = layout => OSK_LAYOUTS_BY_ID[layout].rows;
const keysOf = row => row.split(" ");

describe("oskLayouts", () => {
  beforeEach(() => window.localStorage.clear());
  afterEach(() => {
    vi.restoreAllMocks();
    window.localStorage.clear();
  });

  describe("letter layers", () => {
    it("offers en, sv, fi, no, da, de and fr in the spec's order", () => {
      expect(OSK_LAYOUT_IDS).toEqual(["en", "sv", "fi", "no", "da", "de", "fr"]);
      expect(DEFAULT_OSK_LAYOUT).toBe("en");
      for (const id of OSK_LAYOUT_IDS) {
        expect(OSK_LAYOUTS_BY_ID[id].name).toBeTruthy();
        expect(OSK_LAYOUTS_BY_ID[id].code).toBe(id.toUpperCase());
        expect(OSK_LAYOUTS_BY_ID[id].rows).toHaveLength(3);
      }
    });

    it("names each layout in its own language", () => {
      expect(OSK_LAYOUT_IDS.map(id => OSK_LAYOUTS_BY_ID[id].name)).toEqual([
        "English",
        "Svenska",
        "Suomi",
        "Norsk",
        "Dansk",
        "Deutsch",
        "Français",
      ]);
    });

    it("keeps å ö ä on the Swedish letter layer, in their Swedish positions", () => {
      const [top, home, bottom] = rowsOf("sv");
      expect(keysOf(top).slice(-2)).toEqual(["å", "{bksp}"]);
      expect(keysOf(home).slice(-3)).toEqual(["ö", "ä", "{enter}"]);
      expect(keysOf(bottom)).toContain("z");
    });

    it("gives fi the same letter layer as sv", () => {
      expect(rowsOf("fi")).toEqual(rowsOf("sv"));
    });

    it("keeps ø and æ on the Norwegian and Danish layers", () => {
      expect(keysOf(rowsOf("no")[1]).slice(-3)).toEqual(["ø", "æ", "{enter}"]);
      expect(keysOf(rowsOf("da")[1]).slice(-3)).toEqual(["æ", "ø", "{enter}"]);
      expect(keysOf(rowsOf("no")[0]).slice(-2)).toEqual(["å", "{bksp}"]);
    });

    it("makes de a QWERTZ layer with ü ö ä and ß", () => {
      const [top, home, bottom] = rowsOf("de");
      expect(keysOf(top).slice(0, 7)).toEqual(["q", "w", "e", "r", "t", "z", "u"]);
      expect(keysOf(top)).toContain("ü");
      expect(keysOf(home)).toContain("ö");
      expect(keysOf(home)).toContain("ä");
      expect(keysOf(bottom)[1]).toBe("y");
      expect(keysOf(bottom)).toContain("ß");
    });

    it("makes fr an AZERTY layer with its accented keys", () => {
      const [top, home, bottom] = rowsOf("fr");
      expect(keysOf(top).slice(0, 4)).toEqual(["a", "z", "e", "r"]);
      expect(keysOf(home).slice(0, 2)).toEqual(["q", "s"]);
      expect(keysOf(bottom)).toEqual(
        expect.arrayContaining(["é", "è", "ç", "à", "w", "x", "c", "v", "b", "n"])
      );
    });

    it("never mentions the app language on a layer", () => {
      for (const id of OSK_LAYOUT_IDS) {
        expect(rowsOf(id).join(" ")).not.toMatch(
          /\b(english|svenska|suomi|norsk|dansk|deutsch|français)\b/i
        );
      }
    });
  });

  describe("buildOskLayouts", () => {
    it("uses the active layout's letter rows for the default layer", () => {
      const layouts = buildOskLayouts({ layout: "sv" });
      expect(layouts.default.slice(0, 3)).toEqual(rowsOf("sv"));
      expect(layouts.default[3]).toBe("{numbers} {layout} {accents} {space} {hide}");
    });

    it("keeps the shared symbols, accents and numeric layers whatever the layout", () => {
      const en = buildOskLayouts({ layout: "en" });
      const fr = buildOskLayouts({ layout: "fr" });
      expect(fr.symbols).toEqual(en.symbols);
      expect(fr.accents).toEqual(en.accents);
      expect(fr.numeric).toEqual(en.numeric);
      expect(en.symbols[0]).toBe("1 2 3 4 5 6 7 8 9 0 {bksp}");
    });

    it("always includes the layout key, even without extra layouts (CLV-21)", () => {
      expect(buildOskLayouts({ layout: "sv" }).default[3]).toBe(
        "{numbers} {layout} {accents} {space} {hide}"
      );
      for (const id of OSK_LAYOUT_IDS) {
        expect(buildOskLayouts({ layout: id }).default[3]).toContain("{layout}");
      }
    });

    it("keeps the en and fr bottom rows' extra keys", () => {
      expect(buildOskLayouts({ layout: "en" }).default[3]).toBe(
        "{numbers} {layout} {accents} {space} - {hide}"
      );
      expect(buildOskLayouts({ layout: "fr" }).default[3]).toBe(
        "{numbers} {layout} {accents} , {space} . {hide}"
      );
    });

    it("builds url and email from the active layout's first two rows and their own bottom row", () => {
      const layouts = buildOskLayouts({ layout: "de" });
      expect(layouts.url.slice(0, 2)).toEqual(rowsOf("de").slice(0, 2));
      expect(layouts.url[3]).toBe("{numbers} {layout} / : {space} . .com {hide}");
      expect(layouts.email.slice(0, 2)).toEqual(rowsOf("de").slice(0, 2));
      expect(layouts.email[3]).toBe("{numbers} {layout} @ {space} . .com {hide}");
    });

    it("puts the layout key after {numbers} on the url and email rows", () => {
      for (const id of OSK_LAYOUT_IDS) {
        const layouts = buildOskLayouts({ layout: id });
        expect(layouts.url[3]).toBe("{numbers} {layout} / : {space} . .com {hide}");
        expect(layouts.email[3]).toBe("{numbers} {layout} @ {space} . .com {hide}");
      }
    });

    it("gives every layout the spec's url and email third row (a–z letters then - _)", () => {
      const expected = {
        en: "{shift} z x c v b n m - _ {shift}",
        sv: "{shift} z x c v b n m - _ {shift}",
        fi: "{shift} z x c v b n m - _ {shift}",
        no: "{shift} z x c v b n m - _ {shift}",
        da: "{shift} z x c v b n m - _ {shift}",
        de: "{shift} y x c v b n m - _ {shift}",
        fr: "{shift} w x c v b n - _ {shift}",
      };

      for (const id of OSK_LAYOUT_IDS) {
        const layouts = buildOskLayouts({ layout: id });
        expect(layouts.url[2]).toBe(expected[id]);
        expect(layouts.email[2]).toBe(expected[id]);
        // Rows 1-2 are the layout's own, unchanged.
        expect(layouts.url.slice(0, 2)).toEqual(rowsOf(id).slice(0, 2));
        expect(layouts.email.slice(0, 2)).toEqual(rowsOf(id).slice(0, 2));
      }
    });

    it("keeps only a–z on the url third row, never accents or punctuation", () => {
      for (const id of OSK_LAYOUT_IDS) {
        const row = buildOskLayouts({ layout: id }).url[2].split(" ");
        for (const key of row.slice(1, -1)) {
          expect(key === "-" || key === "_" || /^[a-z]$/.test(key)).toBe(true);
        }
        expect(row.slice(-3)).toEqual(["-", "_", "{shift}"]);
      }
    });

    it("falls back to the default letter layer for an unknown layout", () => {
      const layouts = buildOskLayouts({ layout: "xx" });
      expect(layouts.default.slice(0, 3)).toEqual(rowsOf("en"));
    });
  });

  describe("layout resolution", () => {
    it("maps the browser's language tag to a layout once", () => {
      expect(layoutFromLanguageTag("sv-SE")).toBe("sv");
      expect(layoutFromLanguageTag("fi")).toBe("fi");
      expect(layoutFromLanguageTag("nb-NO")).toBe("no");
      expect(layoutFromLanguageTag("nn")).toBe("no");
      expect(layoutFromLanguageTag("no")).toBe("no");
      expect(layoutFromLanguageTag("da-DK")).toBe("da");
      expect(layoutFromLanguageTag("de-AT")).toBe("de");
      expect(layoutFromLanguageTag("fr-CA")).toBe("fr");
      expect(layoutFromLanguageTag("en-GB")).toBe("en");
      expect(layoutFromLanguageTag("ja-JP")).toBe("en");
      expect(layoutFromLanguageTag("")).toBe("en");
      expect(layoutFromLanguageTag(undefined)).toBe("en");
    });

    it("uses a configured layout and only hints when none is set", () => {
      expect(resolveOskMainLayout("fr", "sv-SE")).toBe("fr");
      expect(resolveOskMainLayout(null, "sv-SE")).toBe("sv");
      // The hint is cached on first use, so a later tag no longer matters.
      expect(resolveOskMainLayout(undefined, "de-DE")).toBe("sv");

      window.localStorage.clear();
      expect(resolveOskMainLayout("", "de-DE")).toBe("de");
      window.localStorage.clear();
      expect(resolveOskMainLayout("nonsense", "da-DK")).toBe("da");
    });

    it("caches the hint per device so it stops following the browser", () => {
      expect(readOskLayoutHint("sv-SE")).toBe("sv");
      expect(window.localStorage.getItem(OSK_LAYOUT_HINT_STORAGE_KEY)).toBe("sv");
      expect(readOskLayoutHint("de-DE")).toBe("sv");
      expect(resolveOskMainLayout(undefined, "de-DE")).toBe("sv");
    });

    it("ignores an invalid cached hint", () => {
      window.localStorage.setItem(OSK_LAYOUT_HINT_STORAGE_KEY, "xx");
      expect(readOskLayoutHint("da-DK")).toBe("da");
      expect(window.localStorage.getItem(OSK_LAYOUT_HINT_STORAGE_KEY)).toBe("da");
    });
  });

  describe("per-device persistence", () => {
    it("stores and reads the active layout under the device key", () => {
      expect(readStoredOskLayout()).toBeNull();
      storeOskLayout("no");
      expect(readStoredOskLayout()).toBe("no");
      expect(window.localStorage.getItem(OSK_DEVICE_LAYOUT_STORAGE_KEY)).toBe("no");
      expect(window.localStorage.getItem(OSK_LEGACY_LAYOUT_STORAGE_KEY)).toBeNull();
    });

    it("ignores and removes the legacy auto-written key (CLV-21 migration)", () => {
      // Older builds wrote this on every device, so it is not a device choice.
      window.localStorage.setItem(OSK_LEGACY_LAYOUT_STORAGE_KEY, "de");

      expect(readStoredOskLayout()).toBeNull();
      expect(window.localStorage.getItem(OSK_LEGACY_LAYOUT_STORAGE_KEY)).toBeNull();
    });

    it("keeps a real device choice and still drops the legacy key", () => {
      window.localStorage.setItem(OSK_LEGACY_LAYOUT_STORAGE_KEY, "de");
      window.localStorage.setItem(OSK_DEVICE_LAYOUT_STORAGE_KEY, "fr");

      expect(readStoredOskLayout()).toBe("fr");
      expect(window.localStorage.getItem(OSK_LEGACY_LAYOUT_STORAGE_KEY)).toBeNull();
      expect(window.localStorage.getItem(OSK_DEVICE_LAYOUT_STORAGE_KEY)).toBe("fr");
    });

    it("clears the device choice and announces the change", () => {
      const listener = vi.fn();
      window.addEventListener(OSK_LAYOUT_CHANGE_EVENT, listener);
      storeOskLayout("no");
      expect(readStoredOskLayout()).toBe("no");

      clearStoredOskLayout();

      expect(readStoredOskLayout()).toBeNull();
      expect(window.localStorage.getItem(OSK_DEVICE_LAYOUT_STORAGE_KEY)).toBeNull();
      expect(listener).toHaveBeenCalledTimes(2);
      window.removeEventListener(OSK_LAYOUT_CHANGE_EVENT, listener);
    });

    it("never throws when localStorage is unavailable", () => {
      vi.spyOn(window.localStorage, "getItem").mockImplementation(() => {
        throw new Error("blocked");
      });
      vi.spyOn(window.localStorage, "setItem").mockImplementation(() => {
        throw new Error("blocked");
      });

      expect(readStoredOskLayout()).toBeNull();
      expect(() => storeOskLayout("sv")).not.toThrow();
      expect(readOskLayoutHint("sv-SE")).toBe("sv");
    });

    it("normalises values coming from config", () => {
      expect(normalizeOskLayout("sv")).toBe("sv");
      expect(normalizeOskLayout("xx")).toBeNull();
      expect(normalizeOskLayout(undefined)).toBeNull();
      expect(normalizeOskExtraLayouts(["en", "xx", "sv"])).toEqual(["en", "sv"]);
      expect(normalizeOskExtraLayouts("en")).toEqual([]);
      expect(normalizeOskExtraLayouts(null)).toEqual([]);
      expect(normalizeOskExtraLayouts(["en", "sv"], "en")).toEqual(["sv"]);
    });
  });

  describe("switching order", () => {
    it("puts the main layout first, then the extras in list order", () => {
      expect(layoutSwitchOrder("sv", ["en", "fi"])).toEqual(["sv", "en", "fi"]);
      expect(layoutSwitchOrder("sv", [])).toEqual(["sv"]);
      expect(layoutSwitchOrder("sv", ["sv", "en"])).toEqual(["sv", "en"]);
      expect(layoutSwitchOrder("sv", ["xx", "de"])).toEqual(["sv", "de"]);
    });

    it("cycles main → extras → main", () => {
      const order = layoutSwitchOrder("sv", ["en", "fi"]);
      expect(nextOskLayout(order, "sv")).toBe("en");
      expect(nextOskLayout(order, "en")).toBe("fi");
      expect(nextOskLayout(order, "fi")).toBe("sv");
    });

    it("falls back to the main layout when the active one left the order", () => {
      expect(nextOskLayout(layoutSwitchOrder("sv", []), "en")).toBe("sv");
      expect(nextOskLayout([], "en")).toBe(DEFAULT_OSK_LAYOUT);
    });

    it("knows which ids are layouts", () => {
      expect(isOskLayoutId("sv")).toBe(true);
      expect(isOskLayoutId("SV")).toBe(false);
      expect(isOskLayoutId(null)).toBe(false);
    });
  });
});
