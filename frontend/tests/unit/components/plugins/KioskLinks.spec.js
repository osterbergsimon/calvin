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
