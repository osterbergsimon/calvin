import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import HandoffOverlay from "@/components/plugins/overlays/HandoffOverlay.vue";

vi.mock("qrcode", () => ({
  default: { toDataURL: vi.fn().mockResolvedValue("data:image/png;base64,ZZ") },
}));

describe("HandoffOverlay", () => {
  beforeEach(() => vi.clearAllMocks());

  const mountIt = (url = "https://mealie.home/g/home/r/soup") =>
    mount(HandoffOverlay, {
      props: { url },
      attachTo: document.body,
      global: { stubs: { teleport: true } },
    });

  it("shows the destination host and a QR image", async () => {
    const w = mountIt();
    await new Promise(r => setTimeout(r, 0)); // let toDataURL resolve
    expect(w.text()).toContain("mealie.home");
    expect(w.find("img.link-overlay__qr").attributes("src")).toBe("data:image/png;base64,ZZ");
    w.unmount();
  });

  it("Open button calls window.open with the url", async () => {
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    const w = mountIt("https://x/r/1");
    await w.find('[data-test="open"]').trigger("click");
    expect(open).toHaveBeenCalledWith("https://x/r/1", "_blank", "noopener");
    w.unmount();
  });

  it("emits close on backdrop click and on close button", async () => {
    const w = mountIt();
    await w.find(".link-overlay").trigger("click"); // backdrop (self)
    await w.find('[data-test="close"]').trigger("click");
    expect(w.emitted("close")?.length).toBeGreaterThanOrEqual(1);
    w.unmount();
  });
});
