import { describe, it, expect, afterEach } from "vitest";
import { mount, enableAutoUnmount } from "@vue/test-utils";
import EmbedOverlay from "@/components/plugins/overlays/EmbedOverlay.vue";
import IframeViewer from "@/components/service/IframeViewer.vue";
import DialogScrim from "@/components/ui/DialogScrim.vue";

enableAutoUnmount(afterEach);

describe("EmbedOverlay", () => {
  const mountIt = () =>
    mount(EmbedOverlay, {
      props: { url: "https://svc.home/panel" },
      attachTo: document.body,
      global: { stubs: { teleport: true } },
    });

  it("mounts an IframeViewer with the url inside the shared Dialog", () => {
    const w = mountIt();
    expect(w.findComponent(IframeViewer).props("url")).toBe("https://svc.home/panel");
    expect(w.findComponent({ name: "Dialog" }).exists() || w.find("[role='dialog']").exists()).toBe(
      true
    );
  });

  it("emits close on the Dialog's close button and on the scrim", async () => {
    const w = mountIt();
    await w.find("[aria-label='Close']").trigger("click");
    w.findComponent(DialogScrim).vm.$emit("dismiss");
    expect(w.emitted("close")?.length).toBeGreaterThanOrEqual(1);
  });

  it("re-emits IframeViewer error as fallback", () => {
    const w = mountIt();
    w.findComponent(IframeViewer).vm.$emit("error");
    expect(w.emitted("fallback")).toBeTruthy();
  });
});
