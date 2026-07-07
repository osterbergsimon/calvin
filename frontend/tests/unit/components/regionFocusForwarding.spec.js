import { describe, it, expect, beforeEach, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { setActivePinia, createPinia } from "pinia";

vi.mock("@/composables/useTouchCapability", () => ({
  useTouchCapability: () => ({ isTouch: { value: true }, hasPointer: { value: true } }),
}));
vi.mock("@/composables/useKeyboardActions", () => ({
  useKeyboardActions: () => ({ handleAction: vi.fn() }),
}));

import PhotoSlideshow from "@/components/PhotoSlideshow.vue";
import { useConfigStore } from "@/stores/config";
import { useImagesStore } from "@/stores/images";

const stubs = {
  // stub DashboardPanel to expose the actions slot + props it received
  DashboardPanel: {
    name: "DashboardPanel",
    props: ["title", "focused", "dim", "headerVisible", "variant"],
    template:
      '<section class="panel-stub" :data-focused="focused" :data-dim="dim"><slot name="actions" /><slot /></section>',
  },
};

describe("region focus forwarding (PhotoSlideshow)", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    const images = useImagesStore();
    images.fetchImages = vi.fn().mockResolvedValue({ images: [] });
    images.fetchCurrentImage = vi.fn().mockResolvedValue(undefined);
    images.images = [];
    images.loading = false;
    images.error = null;
    const config = useConfigStore();
    config.showUI = true;
  });

  it("forwards focused/dim to its panel", () => {
    const w = mount(PhotoSlideshow, {
      props: { focused: true, dim: false, isFullscreen: false },
      global: { stubs },
    });
    const panel = w.find(".panel-stub");
    expect(panel.attributes("data-focused")).toBe("true");
  });

  it("renders touch nav in the actions slot when focused", () => {
    const w = mount(PhotoSlideshow, {
      props: { focused: true, isFullscreen: false },
      global: { stubs },
    });
    expect(w.find('[data-action="next"]').exists()).toBe(true);
    expect(w.find('[data-action="expand"]').exists()).toBe(true);
  });

  it("hides touch nav when not focused", () => {
    const w = mount(PhotoSlideshow, {
      props: { focused: false, isFullscreen: false },
      global: { stubs },
    });
    expect(w.find('[data-action="next"]').exists()).toBe(false);
  });
});
