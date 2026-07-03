import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import EmbedOverlay from "@/components/plugins/overlays/EmbedOverlay.vue";
import IframeViewer from "@/components/service/IframeViewer.vue";

describe("EmbedOverlay", () => {
  const mountIt = () =>
    mount(EmbedOverlay, {
      props: { url: "https://svc.home/panel" },
      attachTo: document.body,
      global: { stubs: { teleport: true } },
    });

  it("mounts an IframeViewer with the url", () => {
    const w = mountIt();
    expect(w.findComponent(IframeViewer).props("url")).toBe("https://svc.home/panel");
    w.unmount();
  });

  it("emits close on close button and backdrop", async () => {
    const w = mountIt();
    await w.find('[data-test="close"]').trigger("click");
    await w.find(".link-overlay").trigger("click");
    expect(w.emitted("close")?.length).toBeGreaterThanOrEqual(1);
    w.unmount();
  });

  it("re-emits IframeViewer error as fallback", async () => {
    const w = mountIt();
    w.findComponent(IframeViewer).vm.$emit("error");
    expect(w.emitted("fallback")).toBeTruthy();
    w.unmount();
  });
});
