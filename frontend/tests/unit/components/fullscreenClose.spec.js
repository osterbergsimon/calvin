import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { setActivePinia, createPinia } from "pinia";
import { ref } from "vue";

const handleAction = vi.fn();
vi.mock("@/composables/useKeyboardActions", () => ({
  useKeyboardActions: () => ({ handleAction }),
}));
const capability = { isTouch: ref(true), hasPointer: ref(true) };
vi.mock("@/composables/useTouchCapability", () => ({
  useTouchCapability: () => capability,
}));

import PhotoSlideshow from "@/components/PhotoSlideshow.vue";
import { useImagesStore } from "@/stores/images";
import { useConfigStore } from "@/stores/config";

describe("fullscreen photos close", () => {
  const wrappers = [];
  afterEach(() => wrappers.splice(0).forEach(w => w.unmount()));

  beforeEach(() => {
    setActivePinia(createPinia());
    handleAction.mockClear();
    capability.isTouch.value = true;
    capability.hasPointer.value = true;
    const images = useImagesStore();
    images.fetchImages = vi.fn().mockResolvedValue({ images: [] });
    images.fetchCurrentImage = vi.fn().mockResolvedValue(undefined);
    images.images = [];
    images.loading = false;
    images.error = null;
    useConfigStore().showUI = true;
  });

  it("shows a touch close button in fullscreen and calls the exit action", async () => {
    const w = mount(PhotoSlideshow, { props: { isFullscreen: true } });
    wrappers.push(w);
    const close = w.get('[data-action="exit-fullscreen"]');
    await close.trigger("click");
    expect(handleAction).toHaveBeenCalledWith("photos_exit_fullscreen");
  });

  it("shows the close button for a mouse with no touch", async () => {
    capability.isTouch.value = false;
    const w = mount(PhotoSlideshow, { props: { isFullscreen: true } });
    wrappers.push(w);
    await w.get('[data-action="exit-fullscreen"]').trigger("click");
    expect(handleAction).toHaveBeenCalledWith("photos_exit_fullscreen");
  });

  it("exits fullscreen on Escape", async () => {
    const w = mount(PhotoSlideshow, { props: { isFullscreen: true }, attachTo: document.body });
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(handleAction).toHaveBeenCalledWith("photos_exit_fullscreen");
    w.unmount();
  });

  it("ignores Escape when not fullscreen", async () => {
    const w = mount(PhotoSlideshow, { props: { isFullscreen: false }, attachTo: document.body });
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(handleAction).not.toHaveBeenCalled();
    w.unmount();
  });
});
