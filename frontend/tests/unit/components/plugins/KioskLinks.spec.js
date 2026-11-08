import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mount, enableAutoUnmount } from "@vue/test-utils";
import HandoffOverlay from "@/components/plugins/overlays/HandoffOverlay.vue";
import IframeRenderer from "@/components/plugins/renderers/IframeRenderer.vue";
import IframeViewer from "@/components/service/IframeViewer.vue";
import { useLinkOpen } from "@/composables/useLinkOpen";

vi.mock("qrcode", () => ({
  default: { toDataURL: vi.fn().mockResolvedValue("data:image/png;base64,ZZ") },
}));

enableAutoUnmount(afterEach);

const global = { stubs: { teleport: true } };
const URL_ = "https://svc.home/panel";

describe("kiosk links never navigate away (calvin-eugy, calvin-ks7)", () => {
  let open;
  beforeEach(() => {
    sessionStorage.setItem("calvin_kiosk_id", "calvin-test");
    open = vi.spyOn(window, "open").mockReturnValue(null);
  });
  afterEach(() => {
    sessionStorage.removeItem("calvin_kiosk_id");
    open.mockRestore();
  });

  it("handoff Open on a kiosk asks to embed and never calls window.open", async () => {
    const w = mount(HandoffOverlay, { props: { url: URL_ }, global });
    await w.find('[data-test="open"]').trigger("click");
    expect(w.emitted("embed")).toBeTruthy();
    expect(open).not.toHaveBeenCalled();
  });

  it("handoff hides Open once the site refused embedding (QR only)", async () => {
    const w = mount(HandoffOverlay, { props: { url: URL_, embedRefused: true }, global });
    await new Promise(r => setTimeout(r, 0));
    expect(w.find('[data-test="open"]').exists()).toBe(false);
    expect(w.find('[data-test="qr"]').exists()).toBe(true);
  });

  it("useLinkOpen: Open swaps handoff for embed; a refused embed returns to a QR-only handoff", () => {
    const { overlay, openLink, openEmbedded, fallbackToHandoff } = useLinkOpen(() => null);
    openLink(URL_);
    expect(overlay.value.kind).toBe("handoff");
    openEmbedded();
    expect(overlay.value).toEqual({ kind: "embed", url: URL_ });
    fallbackToHandoff();
    expect(overlay.value).toEqual({ kind: "handoff", url: URL_, embedRefused: true });
  });

  it("IframeRenderer error card has no target=_blank link on a kiosk", async () => {
    const w = mount(IframeRenderer, { props: { schema: { url: URL_ } }, global });
    await w.find("iframe").trigger("error");
    expect(w.find('a[target="_blank"]').exists()).toBe(false);
    await w.find('[data-test="show-qr"]').trigger("click");
    expect(w.findComponent(HandoffOverlay).props("embedRefused")).toBe(true);
  });

  it("IframeViewer error panel has no target=_blank link on a kiosk", async () => {
    const w = mount(IframeViewer, { props: { url: URL_ }, global });
    await w.find("iframe").trigger("error");
    expect(w.find('a[target="_blank"]').exists()).toBe(false);
    await w.find('[data-test="show-qr"]').trigger("click");
    expect(w.findComponent(HandoffOverlay).exists()).toBe(true);
  });
});

describe("non-kiosk keeps a new tab", () => {
  beforeEach(() => sessionStorage.removeItem("calvin_kiosk_id"));
  it("IframeRenderer keeps the Open in new window anchor", async () => {
    const w = mount(IframeRenderer, { props: { schema: { url: URL_ } }, global });
    await w.find("iframe").trigger("error");
    expect(w.find('a[target="_blank"]').exists()).toBe(true);
  });
  it("IframeViewer keeps the Open in New Window anchor", async () => {
    const w = mount(IframeViewer, { props: { url: URL_ }, global });
    await w.find("iframe").trigger("error");
    expect(w.find('a[target="_blank"]').exists()).toBe(true);
  });
});

// ---- coordinator review of #340 ----------------------------------------

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import EmbedOverlay from "@/components/plugins/overlays/EmbedOverlay.vue";
import ExternalLink from "@/components/ui/ExternalLink.vue";
import { isKioskDisplay } from "@/utils/kioskId";
import { isHttpUrl } from "@/utils/safeUrl";

describe("kiosk embed is sandboxed and always offers the QR (B1, B2, S2)", () => {
  beforeEach(() => sessionStorage.setItem("calvin_kiosk_id", "calvin-test"));
  afterEach(() => sessionStorage.removeItem("calvin_kiosk_id"));

  it("IframeViewer sandbox allows neither popups nor top navigation on a kiosk", () => {
    const w = mount(IframeViewer, { props: { url: URL_ }, global });
    const sandbox = w.find("iframe").attributes("sandbox");
    expect(sandbox).toBeDefined();
    expect(sandbox).not.toContain("allow-popups");
    expect(sandbox).not.toContain("allow-top-navigation");
  });

  it("IframeViewer has no sandbox off a kiosk (unchanged behaviour)", () => {
    sessionStorage.removeItem("calvin_kiosk_id");
    const w = mount(IframeViewer, { props: { url: URL_ }, global });
    expect(w.find("iframe").attributes("sandbox")).toBeUndefined();
  });

  it("IframeRenderer drops allow-popups on a kiosk and keeps it elsewhere", () => {
    const kiosk = mount(IframeRenderer, { props: { schema: { url: URL_ } }, global });
    expect(kiosk.find("iframe").attributes("sandbox")).not.toContain("allow-popups");
    expect(kiosk.find("iframe").attributes("sandbox")).not.toContain("allow-top-navigation");
    sessionStorage.removeItem("calvin_kiosk_id");
    const desk = mount(IframeRenderer, { props: { schema: { url: URL_ } }, global });
    expect(desk.find("iframe").attributes("sandbox")).toContain("allow-popups");
  });

  it("IframeRenderer shows the QR action without any error", async () => {
    const w = mount(IframeRenderer, { props: { schema: { url: URL_ } }, global });
    await w.find('[data-test="show-qr-always"]').trigger("click");
    expect(w.findComponent(HandoffOverlay).props("embedRefused")).toBe(true);
  });

  it("EmbedOverlay offers Show QR code next to Close with no load error, and asks for the handoff", async () => {
    const w = mount(EmbedOverlay, {
      props: { url: URL_ },
      attachTo: document.body,
      global,
    });
    await w.find('[data-test="embed-qr"]').trigger("click");
    expect(w.emitted("fallback")).toBeTruthy();
    expect(w.find("[aria-label='Close']").exists()).toBe(true);
  });

  it("EmbedOverlay has no QR action off a kiosk", () => {
    sessionStorage.removeItem("calvin_kiosk_id");
    const w = mount(EmbedOverlay, { props: { url: URL_ }, attachTo: document.body, global });
    expect(w.find('[data-test="embed-qr"]').exists()).toBe(false);
  });
});

describe("kiosk embed idle cap (S3)", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    sessionStorage.removeItem("calvin_kiosk_id");
  });

  it("closes itself after 5 minutes on a kiosk", () => {
    sessionStorage.setItem("calvin_kiosk_id", "calvin-test");
    const w = mount(EmbedOverlay, { props: { url: URL_ }, attachTo: document.body, global });
    vi.advanceTimersByTime(5 * 60 * 1000 - 1000);
    expect(w.emitted("close")).toBeFalsy();
    vi.advanceTimersByTime(2000);
    expect(w.emitted("close")).toBeTruthy();
  });

  it("does not auto-close on a desktop", () => {
    const w = mount(EmbedOverlay, { props: { url: URL_ }, attachTo: document.body, global });
    vi.advanceTimersByTime(30 * 60 * 1000);
    expect(w.emitted("close")).toBeFalsy();
  });

  it("HandoffOverlay still auto-closes after 45 s", () => {
    const w = mount(HandoffOverlay, { props: { url: URL_ }, global });
    vi.advanceTimersByTime(46000);
    expect(w.emitted("close")).toBeTruthy();
  });
});

describe("the all-in-one Pi's display counts as a kiosk for links (S1)", () => {
  const setHost = hostname =>
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...window.location, hostname, search: "" },
    });
  const setFullscreen = matches =>
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: () => ({ matches }),
    });
  let originalLocation;
  let originalMatchMedia;
  beforeEach(() => {
    originalLocation = window.location;
    originalMatchMedia = window.matchMedia;
    sessionStorage.clear();
  });
  afterEach(() => {
    Object.defineProperty(window, "location", { configurable: true, value: originalLocation });
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: originalMatchMedia,
    });
    sessionStorage.clear();
  });

  it("a fullscreen loopback origin is a kiosk display without a kiosk id", () => {
    setHost("localhost");
    setFullscreen(true);
    expect(isKioskDisplay()).toBe(true);
    expect(sessionStorage.getItem("calvin_kiosk_id")).toBeNull(); // not registered
  });

  it("a developer's localhost tab (not fullscreen) is not", () => {
    setHost("localhost");
    setFullscreen(false);
    expect(isKioskDisplay()).toBe(false);
  });

  it("a fullscreen page on a real host is not", () => {
    setHost("calvin.example.com");
    setFullscreen(true);
    expect(isKioskDisplay()).toBe(false);
  });

  it("an explicit ?display=kiosk is remembered", () => {
    setHost("calvin.local");
    setFullscreen(false);
    sessionStorage.setItem("calvin_display_mode", "kiosk");
    expect(isKioskDisplay()).toBe(true);
  });

  it("handoff Open on that display embeds instead of window.open", async () => {
    setHost("localhost");
    setFullscreen(true);
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    const w = mount(HandoffOverlay, { props: { url: URL_ }, global });
    await w.find('[data-test="open"]').trigger("click");
    expect(w.emitted("embed")).toBeTruthy();
    expect(open).not.toHaveBeenCalled();
    open.mockRestore();
  });
});

describe("only http(s) links are ever opened or framed (S4)", () => {
  const BAD = ["javascript:alert(1)", "data:text/html,<b>x</b>", "file:///etc/passwd", "", "x"];

  it.each(BAD)("isHttpUrl rejects %j", value => {
    expect(isHttpUrl(value)).toBe(false);
  });
  it("isHttpUrl accepts http and https", () => {
    expect(isHttpUrl("http://a.b/c")).toBe(true);
    expect(isHttpUrl("https://a.b/c")).toBe(true);
  });

  it.each(BAD.slice(0, 3))("useLinkOpen neither clicks nor opens %j", value => {
    const { overlay, isClickable, openLink } = useLinkOpen(() => null);
    expect(isClickable(value)).toBe(false);
    openLink(value);
    expect(overlay.value).toBeNull();
  });

  it("IframeViewer never frames a javascript: url", () => {
    const w = mount(IframeViewer, { props: { url: "javascript:alert(1)" }, global });
    expect(w.find("iframe").attributes("src")).toBe("about:blank");
  });

  it("IframeRenderer never frames a javascript: url", () => {
    const w = mount(IframeRenderer, { props: { schema: { url: "javascript:alert(1)" } }, global });
    expect(w.find("iframe").exists()).toBe(false);
  });

  it("HandoffOverlay's Open does nothing for a javascript: url", async () => {
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    const w = mount(HandoffOverlay, { props: { url: "javascript:alert(1)" }, global });
    await w.find('[data-test="open"]').trigger("click");
    expect(open).not.toHaveBeenCalled();
    expect(w.emitted("embed")).toBeFalsy();
    open.mockRestore();
  });

  it("ExternalLink renders an unsafe href as plain text, not a link", () => {
    const w = mount(ExternalLink, {
      props: { href: "javascript:alert(1)" },
      slots: { default: "docs" },
      global,
    });
    expect(w.find("a").exists()).toBe(false);
    expect(w.text()).toBe("docs");
  });
});

describe("ExternalLink: the one way to leave Calvin (S6)", () => {
  afterEach(() => sessionStorage.removeItem("calvin_kiosk_id"));

  it("opens a new tab off a kiosk", () => {
    const w = mount(ExternalLink, {
      props: { href: URL_ },
      slots: { default: "docs" },
      global,
    });
    expect(w.find("a").attributes("target")).toBe("_blank");
    expect(w.find("a").attributes("rel")).toContain("noopener");
  });

  it("shows the QR handoff and never navigates on a kiosk", async () => {
    sessionStorage.setItem("calvin_kiosk_id", "calvin-test");
    const w = mount(ExternalLink, {
      props: { href: URL_ },
      slots: { default: "docs" },
      global,
    });
    const a = w.find("a");
    expect(a.attributes("target")).toBeUndefined();
    const click = new MouseEvent("click", { bubbles: true, cancelable: true });
    a.element.dispatchEvent(click);
    await w.vm.$nextTick();
    expect(click.defaultPrevented).toBe(true);
    expect(w.findComponent(HandoffOverlay).props("embedRefused")).toBe(true);
  });

  it("no component links out with a raw target=_blank (use ExternalLink)", () => {
    const ALLOWED = [
      "components/ui/ExternalLink.vue",
      // Non-kiosk branches that sit behind isKioskDisplay():
      "components/service/IframeViewer.vue",
      "components/plugins/renderers/IframeRenderer.vue",
    ];
    const found = [];
    const walk = dir => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) walk(path);
        else if (/\.vue$/.test(name) && /target\s*=\s*"_blank"/.test(readFileSync(path, "utf8"))) {
          found.push(path.replace(/^src\//, ""));
        }
      }
    };
    walk("src");
    expect(found.filter(f => !ALLOWED.includes(f))).toEqual([]);
  });
});
