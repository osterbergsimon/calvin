import { describe, it, expect, beforeEach, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { setActivePinia, createPinia } from "pinia";

const handleAction = vi.fn();
vi.mock("@/composables/useKeyboardActions", () => ({
  useKeyboardActions: () => ({ handleAction }),
}));
vi.mock("@/composables/useTouchCapability", () => ({
  useTouchCapability: () => ({ isTouch: { value: true } }),
}));

import PhotoSlideshow from "@/components/PhotoSlideshow.vue";
import { useImagesStore } from "@/stores/images";
import { useConfigStore } from "@/stores/config";

describe("fullscreen touch close", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    handleAction.mockClear();
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
    const close = w.get('[data-action="exit-fullscreen"]');
    await close.trigger("click");
    expect(handleAction).toHaveBeenCalledWith("photos_exit_fullscreen");
  });
});
