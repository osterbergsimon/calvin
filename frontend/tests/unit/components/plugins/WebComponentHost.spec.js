/** Tests for the web-component escape-hatch host. */

import { describe, it, expect } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import WebComponentHost from "@/components/plugins/WebComponentHost.vue";

describe("WebComponentHost", () => {
  it("renders an error when schema.element is missing", async () => {
    const wrapper = mount(WebComponentHost, {
      props: {
        schema: { kind: "web-component" },
        data: null,
        pluginId: "test-plugin",
      },
    });
    await flushPromises();
    expect(wrapper.text()).toContain("schema.element missing");
  });

  it("appends a stylesheet link when schema.stylesheet is set", async () => {
    mount(WebComponentHost, {
      props: {
        schema: {
          kind: "web-component",
          element: "calvin-css-test",
          module: "dist.js",
          stylesheet: "dist.css",
        },
        data: null,
        pluginId: "css-plugin",
      },
    });
    await flushPromises();
    const link = document.head.querySelector(
      'link[href="/api/plugins/css-plugin/static/dist.css"]'
    );
    expect(link).not.toBeNull();
  });
});
