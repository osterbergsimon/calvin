/** The embedded-page viewer speaks plain words and titles its frame. */

import { describe, it, expect, afterEach } from "vitest";
import { mount, enableAutoUnmount } from "@vue/test-utils";
import IframeViewer from "@/components/service/IframeViewer.vue";
import ExternalLink from "@/components/ui/ExternalLink.vue";
import Button from "@/components/ui/Button.vue";

enableAutoUnmount(afterEach);

const URL_ = "https://svc.home/panel";

async function mountFailing(props = {}) {
  const w = mount(IframeViewer, { props: { url: URL_, ...props }, attachTo: document.body });
  await w.find("iframe").trigger("error");
  return w;
}

describe("IframeViewer frame title", () => {
  it("uses the title it is given", () => {
    const w = mount(IframeViewer, { props: { url: URL_, title: "Page from svc.home" } });
    expect(w.find("iframe").attributes("title")).toBe("Page from svc.home");
  });

  it("falls back to Web page", () => {
    const w = mount(IframeViewer, { props: { url: URL_ } });
    expect(w.find("iframe").attributes("title")).toBe("Web page");
  });
});

describe("IframeViewer error copy", () => {
  it("says the site won't open here, and why, without developer words", async () => {
    const w = await mountFailing();
    expect(w.find(".heading-title").text()).toBe("This site won't open here");
    expect(w.text()).toContain("This site doesn't allow being shown inside Calvin.");
    expect(w.text()).not.toMatch(/iframe|cors|x-frame|csp/i);
  });

  it("offers Open in a new window and Try again, as shared controls", async () => {
    const w = await mountFailing();
    const link = w.findComponent(ExternalLink);
    expect(link.find("a").attributes("href")).toBe(URL_);
    expect(link.text()).toBe("Open in a new window");

    const retry = w.findAllComponents(Button).find(button => button.text() === "Try again");
    expect(retry).toBeTruthy();
  });
});
