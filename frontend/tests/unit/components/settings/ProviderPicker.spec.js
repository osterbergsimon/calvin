import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import { mdiUpload } from "@mdi/js";
import ProviderPicker from "@/components/settings/specialized/ProviderPicker.vue";

const mountPicker = (props = {}) =>
  mount(ProviderPicker, {
    props: {
      show: true,
      title: "Add photos from…",
      providers: [],
      catalogProviders: [],
      ...props,
    },
  });

describe("ProviderPicker tile icons (§6)", () => {
  it("falls back to the first letter when a plugin has no icon", () => {
    const w = mountPicker({ providers: [{ id: "immich", name: "Immich" }] });
    expect(w.find(".pp-icon").text()).toBe("I");
    expect(w.find(".pp-icon img").exists()).toBe(false);
  });

  it("renders an emoji icon as text", () => {
    const w = mountPicker({ providers: [{ id: "immich", name: "Immich", icon: "🖼" }] });
    expect(w.find(".pp-icon").text()).toBe("🖼");
  });

  it("renders an SVG glyph for a non-plugin choice (Upload), not a letter", () => {
    const w = mountPicker({
      providers: [{ id: "__upload", label: "Upload from this device", svg: mdiUpload }],
    });
    expect(w.find(".pp-icon svg").exists()).toBe(true);
    expect(w.find(".pp-icon svg path").attributes("d")).toBe(mdiUpload);
    expect(w.find(".pp-icon").text()).toBe("");
  });

  it("serves a file icon from the plugin's static route", () => {
    const w = mountPicker({ providers: [{ id: "immich", name: "Immich", icon: "icon.svg" }] });
    const img = w.find(".pp-icon img");
    expect(img.exists()).toBe(true);
    expect(img.attributes("src")).toBe("/api/plugins/immich/static/icon.svg");
  });
});

describe("ProviderPicker catalog group", () => {
  it("is absent when no catalog entries were offered", () => {
    const w = mountPicker();
    expect(w.find(".pp-group").exists()).toBe(false);
  });

  it("lists catalog entries with Install and emits the row", async () => {
    const w = mountPicker({
      catalogProviders: [
        {
          id: "frame_art",
          label: "Frame art",
          description: "A curated gallery of paintings.",
          icon: "🎨",
          status: "idle",
          error: "",
        },
      ],
    });

    expect(w.find(".pp-group").text()).toBe("From the Calvin catalog");
    await w.find('[data-install-id="frame_art"]').trigger("click");
    expect(w.emitted("install")?.[0][0]).toMatchObject({ id: "frame_art" });
  });

  it("shows Installing… and Installed states without an Install button", () => {
    const installing = mountPicker({
      catalogProviders: [{ id: "a", label: "A", status: "installing" }],
    });
    expect(installing.text()).toContain("Installing…");
    expect(installing.find('[data-install-id="a"]').exists()).toBe(false);

    const installed = mountPicker({
      catalogProviders: [{ id: "b", label: "B", status: "installed" }],
    });
    expect(installed.text()).toContain("Installed ✓");
    expect(installed.find('[data-install-id="b"]').exists()).toBe(false);
  });

  it("shows a failure with the Plugins details link", async () => {
    const w = mountPicker({
      catalogProviders: [{ id: "a", label: "A", status: "error", error: "pip failed" }],
      moreLabel: "Get more in Plugins ›",
    });

    expect(w.text()).toContain("pip failed");
    await w.find(".pp-error-link").trigger("click");
    expect(w.emitted("more")?.length).toBe(1);
  });
});
