import { describe, it, expect } from "vitest";
import { resolveLinkAction, useLinkOpen } from "@/composables/useLinkOpen";

describe("resolveLinkAction", () => {
  it("region override beats item hint beats default", () => {
    expect(resolveLinkAction("embed", "handoff")).toBe("embed");
    expect(resolveLinkAction(null, "embed")).toBe("embed");
    expect(resolveLinkAction(null, null)).toBe("handoff");
  });
  it("region 'off' wins; invalid values fall through", () => {
    expect(resolveLinkAction("off", "embed")).toBe("off");
    expect(resolveLinkAction("bogus", "embed")).toBe("embed");
    expect(resolveLinkAction(null, "off")).toBe("handoff"); // item hint never 'off'
  });
});

describe("useLinkOpen", () => {
  it("opens a handoff overlay by default", () => {
    const { overlay, openLink } = useLinkOpen(() => null);
    openLink("https://x/r/1", undefined);
    expect(overlay.value).toEqual({ kind: "handoff", url: "https://x/r/1" });
  });
  it("region embed override opens an embed overlay", () => {
    const { overlay, openLink } = useLinkOpen(() => "embed");
    openLink("https://x/r/1", "handoff");
    expect(overlay.value.kind).toBe("embed");
  });
  it("'off' is inert and not clickable", () => {
    const { overlay, openLink, isClickable } = useLinkOpen(() => "off");
    openLink("https://x/r/1", undefined);
    expect(overlay.value).toBe(null);
    expect(isClickable("https://x/r/1", undefined)).toBe(false);
  });
  it("no url is never clickable and never opens", () => {
    const { overlay, openLink, isClickable } = useLinkOpen(() => null);
    openLink("", undefined);
    expect(overlay.value).toBe(null);
    expect(isClickable("", "handoff")).toBe(false);
  });
  it("fallbackToHandoff switches an embed overlay to handoff", () => {
    const { overlay, openLink, fallbackToHandoff } = useLinkOpen(() => "embed");
    openLink("https://x", undefined);
    fallbackToHandoff();
    expect(overlay.value).toEqual({ kind: "handoff", url: "https://x" });
  });
  it("closeOverlay clears state", () => {
    const { overlay, openLink, closeOverlay } = useLinkOpen(() => null);
    openLink("https://x", undefined);
    closeOverlay();
    expect(overlay.value).toBe(null);
  });
});
