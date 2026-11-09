import { describe, it, expect, afterEach } from "vitest";
import { mount, enableAutoUnmount } from "@vue/test-utils";
import IframeViewer from "@/components/service/IframeViewer.vue";
import HandoffOverlay from "@/components/plugins/overlays/HandoffOverlay.vue";
import IframeRenderer from "@/components/plugins/renderers/IframeRenderer.vue";

enableAutoUnmount(afterEach);

function violation(blockedURI, violatedDirective = "frame-src") {
  const ev = new Event("securitypolicyviolation");
  Object.assign(ev, { blockedURI, violatedDirective, effectiveDirective: violatedDirective });
  document.dispatchEvent(ev);
}

describe("IframeViewer CSP block detection", () => {
  const mountIt = (url = "https://recipes.example.com/recipes/1") =>
    mount(IframeViewer, { props: { url }, attachTo: document.body });

  it("emits error when the frame's origin is blocked by frame-src", async () => {
    const w = mountIt();
    violation("https://recipes.example.com");
    await w.vm.$nextTick();
    expect(w.emitted("error")[0]).toEqual([{ reason: "blocked" }]);
    expect(w.find(".iframe-error-message").exists()).toBe(true);
    expect(w.text()).toContain("This site is blocked");
    expect(w.text()).toContain("Calvin only shows sites on its allowed list.");
    expect(w.text()).toContain("Settings › Security › Allowed sites");
    expect(w.find(".btn-retry").exists()).toBe(false);
  });

  it("keeps the error state when the blocked frame then fires load", async () => {
    const w = mountIt();
    violation("https://recipes.example.com");
    await w.find("iframe").trigger("load");
    expect(w.find(".iframe-error-message").exists()).toBe(true);
  });

  it("ignores other origins and other directives", async () => {
    const w = mountIt();
    violation("https://other.example.com");
    violation("https://recipes.example.com", "img-src");
    await w.vm.$nextTick();
    expect(w.emitted("error")).toBeFalsy();
  });

  it("stops listening after unmount", async () => {
    const w = mountIt();
    w.unmount();
    violation("https://recipes.example.com");
    expect(w.emitted("error")).toBeFalsy();
  });
});

describe("HandoffOverlay blocked note", () => {
  const global = { stubs: { teleport: true } };
  it("shows a neutral note only for a real block", () => {
    const yes = mount(HandoffOverlay, { props: { url: "https://x.io", blocked: true }, global });
    expect(yes.text()).toContain("This site can't be shown inside Calvin.");
    const no = mount(HandoffOverlay, { props: { url: "https://x.io" }, global });
    expect(no.text()).not.toContain("can't be shown inside Calvin");
  });
});

describe("IframeRenderer CSP block detection", () => {
  it("shows its fallback card when the frame is CSP-blocked, even after load", async () => {
    const w = mount(IframeRenderer, {
      props: { schema: { url: "https://recipes.example.com/x" }, data: null },
      attachTo: document.body,
    });
    violation("https://recipes.example.com");
    await w.find("iframe").trigger("load");
    expect(w.find(".iframe-renderer__fallback").exists()).toBe(true);
    expect(w.text()).toContain("This site is blocked");
    expect(w.text()).not.toContain("won't embed");
    expect(w.text()).not.toContain("Retry");
  });
});
