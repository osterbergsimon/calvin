/**
 * Unit tests for PhotoSlideshow component
 * Tests functionality: image display, loading/error states, auto-rotation, display modes
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { flushPromises, mount } from "@vue/test-utils";
import { setActivePinia, createPinia } from "pinia";
import { mdiChevronLeft, mdiChevronRight, mdiFullscreen } from "@mdi/js";
import PhotoSlideshow from "@/components/PhotoSlideshow.vue";
import { useImagesStore } from "@/stores/images";
import { useConfigStore } from "@/stores/config";
import { useProgressStore } from "@/stores/progress";
import { styleRules } from "../styles/lint-helpers.js";

describe("PhotoSlideshow", () => {
  let imagesStore;
  let configStore;
  let pinia;
  let originalInnerWidth;

  beforeEach(() => {
    pinia = createPinia();
    setActivePinia(pinia);
    vi.useFakeTimers();
    originalInnerWidth = window.innerWidth;
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 640 });

    imagesStore = useImagesStore();
    configStore = useConfigStore();

    // Reset stores
    imagesStore.loading = false;
    imagesStore.error = null;
    imagesStore.images = [];
    imagesStore.currentImage = null;
    configStore.showUI = true;
    configStore.imageDisplayMode = "smart";
    configStore.orientation = "landscape";

    // Mock store methods
    imagesStore.fetchImages = vi.fn().mockResolvedValue(undefined);
    imagesStore.fetchCurrentImage = vi.fn().mockResolvedValue(undefined);
    imagesStore.nextImage = vi.fn();
  });

  afterEach(() => {
    document.documentElement.removeAttribute("data-effects");
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: originalInnerWidth,
    });
    vi.useRealTimers();
  });

  const createImage = (overrides = {}) => ({
    id: "1",
    filename: "test.jpg",
    url: "/api/images/1",
    width: 1920,
    height: 1080,
    ...overrides,
  });

  const createWrapper = (props = {}) => {
    return mount(PhotoSlideshow, {
      props: {
        isFullscreen: false,
        autoRotate: false,
        rotationInterval: 30000,
        ...props,
      },
      global: {
        plugins: [pinia],
      },
    });
  };

  describe("Visibility and States", () => {
    it("should show loading state when images are loading", () => {
      imagesStore.loading = true;
      const wrapper = createWrapper();

      expect(wrapper.find(".loading").exists()).toBe(true);
      expect(wrapper.find(".loading").text()).toContain("Loading images...");
    });

    it("should show placeholder when no images available", () => {
      imagesStore.loading = false;
      imagesStore.currentImage = null;
      const wrapper = createWrapper();

      expect(wrapper.find(".photo-placeholder").exists()).toBe(true);
      expect(wrapper.find(".photo-placeholder").text()).toContain("No photos yet");
      // Points at the real place to add photos, not a server directory (F3)
      expect(wrapper.find(".photo-placeholder").text()).toContain(
        "Settings › Content › Image sources"
      );
      expect(wrapper.find(".photo-placeholder").text()).not.toContain("data/images");
    });

    it("the empty state's button deep-links to photo upload", () => {
      imagesStore.loading = false;
      imagesStore.currentImage = null;
      const wrapper = createWrapper();
      const empty = wrapper.findComponent({ name: "EmptyState" });
      expect(empty.props("settingId")).toBe("content-images");
      expect(wrapper.find('[data-test="empty-state-action"]').text()).toBe("Add photos");
    });

    it("should display image when available", () => {
      const image = createImage();
      imagesStore.loading = false;
      imagesStore.currentImage = image;

      const wrapper = createWrapper();

      expect(wrapper.find(".photo-container").exists()).toBe(true);
      expect(wrapper.find(".photo-image").exists()).toBe(true);
      expect(wrapper.find(".photo-image").attributes("src")).toBe("/api/images/1?w=640");
    });

    it("keeps raw error text off the wall (CLV-63)", () => {
      imagesStore.error = "Failed to load images";
      configStore.showUI = true;
      const wrapper = createWrapper();

      expect(wrapper.find(".error-message").exists()).toBe(false);
      expect(wrapper.text()).not.toContain("Failed to load images");
    });
  });

  describe("Header Display", () => {
    it("does not render a region title (content speaks for itself)", () => {
      configStore.showUI = true;
      const wrapper = createWrapper({ isFullscreen: false });

      // Cycle B removed the large region title; the header is a slim controls
      // strip only (no "Photos" heading).
      expect(wrapper.find(".dashboard-panel__title").exists()).toBe(false);
      expect(wrapper.find("h2").exists()).toBe(false);
    });

    it("should hide header when fullscreen", () => {
      configStore.showUI = true;
      const wrapper = createWrapper({ isFullscreen: true });

      expect(wrapper.find(".dashboard-panel__header").exists()).toBe(false);
    });

    it("should hide header when UI is hidden", () => {
      configStore.showUI = false;
      const wrapper = createWrapper({ isFullscreen: false });

      expect(wrapper.find(".dashboard-panel__header").exists()).toBe(false);
    });

    it("follows Dashboard size for the header controls", () => {
      configStore.touchControlSize = "xsmall";
      const small = createWrapper({ focused: true });
      configStore.touchControlSize = "xlarge";
      const large = createWrapper({ focused: true });
      const rail = w =>
        w.find(".region-header-controls").element.style.getPropertyValue("--region-rail-h");

      expect(rail(small)).toBe("22px");
      expect(rail(large)).toBe("40px");
    });

    it("uses mdi chevrons and a mdi fullscreen icon, not text glyphs", () => {
      const wrapper = createWrapper({ focused: true });
      const buttons = wrapper.findAll(".region-header-controls .icon-btn");

      expect(buttons).toHaveLength(3);
      expect(buttons.map(b => b.find("path").attributes("d"))).toEqual([
        mdiChevronLeft,
        mdiChevronRight,
        mdiFullscreen,
      ]);
      for (const button of buttons) expect(button.text()).toBe("");
    });

    it("uses the neutral fullscreen control, matching calendar and service", () => {
      const wrapper = createWrapper({ focused: true });
      const fullscreen = wrapper.find('.region-header-controls [data-action="expand"]');

      expect(fullscreen.classes()).toContain("icon-btn--default");
      expect(fullscreen.classes()).not.toContain("icon-btn--primary");
    });
  });

  describe("Image Display", () => {
    it("should display image with correct alt text", () => {
      const image = createImage({ filename: "vacation.jpg" });
      imagesStore.currentImage = image;
      const wrapper = createWrapper();

      const img = wrapper.find(".photo-image");
      expect(img.attributes("alt")).toBe("vacation.jpg");
    });

    it("should use default alt text when filename not available", () => {
      const image = createImage({ filename: null });
      imagesStore.currentImage = image;
      const wrapper = createWrapper();

      const img = wrapper.find(".photo-image");
      expect(img.attributes("alt")).toBe("Photo");
    });
  });

  describe("Display Modes", () => {
    it("should apply fit class passed by the region", () => {
      const image = createImage();
      imagesStore.currentImage = image;
      const wrapper = createWrapper({ fit: "fill" });

      expect(wrapper.find(".photo-image").classes()).toContain("photo-image-fill");
    });

    it("defaults to smart when the region has no fit", () => {
      const image = createImage();
      imagesStore.currentImage = image;
      const wrapper = createWrapper();

      expect(wrapper.find(".photo-image").classes()).toContain("photo-image-smart");
    });
  });

  describe("Smart fit measures the region (CLV-49)", () => {
    let observers;

    beforeEach(() => {
      observers = [];
      globalThis.ResizeObserver = class {
        constructor(callback) {
          this.callback = callback;
          this.observe = vi.fn();
          this.disconnect = vi.fn();
          this.unobserve = vi.fn();
          observers.push(this);
        }
      };
    });

    afterEach(() => {
      delete globalThis.ResizeObserver;
    });

    const setContainer = async (wrapper, width, height) => {
      // Mount's async hook observes the container after its image fetch settles.
      for (let i = 0; i < 10 && observers.length === 0; i += 1) {
        await Promise.resolve();
      }
      await wrapper.vm.$nextTick();
      // The component's own observer is the one watching the photo container.
      const observer = observers[observers.length - 1];
      observer.callback([{ contentRect: { width, height } }]);
      await wrapper.vm.$nextTick();
    };

    it("fills a 16:9 region with a 3:2 photo", async () => {
      imagesStore.currentImage = createImage({ width: 1500, height: 1000 });
      const wrapper = createWrapper({ fit: "smart" });
      await setContainer(wrapper, 1600, 900);

      const img = wrapper.find(".photo-image");
      expect(img.attributes("style")).toContain("object-fit: cover");
      expect(wrapper.find(".photo-backdrop").exists()).toBe(false);
    });

    it("shows a portrait photo whole over a soft backdrop in a full-width region", async () => {
      imagesStore.currentImage = createImage({ width: 1000, height: 1500 });
      const wrapper = createWrapper({ fit: "smart" });
      await setContainer(wrapper, 1600, 900);

      const img = wrapper.find(".photo-image");
      expect(img.attributes("style")).toContain("object-fit: contain");
      const backdrop = wrapper.find(".photo-backdrop");
      expect(backdrop.exists()).toBe(true);
      expect(backdrop.find(".photo-backdrop__image").attributes("src")).toBe("/api/images/1?w=640");
      expect(backdrop.attributes("aria-hidden")).toBe("true");
    });

    it('uses the source photo and its blur backdrop under data-effects="full"', async () => {
      document.documentElement.setAttribute("data-effects", "full");
      Object.defineProperty(window, "innerWidth", { configurable: true, value: 1920 });
      imagesStore.currentImage = createImage({ width: 1000, height: 1500 });
      const wrapper = createWrapper({ fit: "smart" });
      await setContainer(wrapper, 1600, 900);

      const backdrop = wrapper.find("img.photo-backdrop--full");
      expect(backdrop.exists()).toBe(true);
      // The display source, not the small Standard thumbnail.
      expect(backdrop.attributes("src")).toBe("/api/images/1?w=1920");
      expect(wrapper.find(".photo-backdrop--soft").exists()).toBe(false);
    });

    it("keeps the tiny thumbnail backdrop under standard effects", async () => {
      document.documentElement.setAttribute("data-effects", "standard");
      imagesStore.currentImage = createImage({ width: 1000, height: 1500 });
      const wrapper = createWrapper({ fit: "smart" });
      await setContainer(wrapper, 1600, 900);

      expect(wrapper.find("img.photo-backdrop--full").exists()).toBe(false);
      const soft = wrapper.find(".photo-backdrop--soft");
      expect(soft.exists()).toBe(true);
      const image = soft.find("img.photo-backdrop__image");
      // Smallest width variant: upscaling it is naturally soft, so the kiosk
      // never runs a full-region filter.
      expect(image.attributes("src")).toBe("/api/images/1?w=640");
      expect(soft.attributes("style") || "").not.toMatch(/filter/);
      expect(image.attributes("style") || "").not.toMatch(/filter/);
    });

    it("shows a landscape photo whole in a 9:16 region", async () => {
      imagesStore.currentImage = createImage({ width: 1600, height: 900 });
      const wrapper = createWrapper({ fit: "smart" });
      await setContainer(wrapper, 900, 1600);

      expect(wrapper.find(".photo-image").attributes("style")).toContain("object-fit: contain");
      expect(wrapper.find(".photo-backdrop").exists()).toBe(true);
    });

    it("recomputes the decision when the region is resized", async () => {
      imagesStore.currentImage = createImage({ width: 1000, height: 1500 });
      const wrapper = createWrapper({ fit: "smart" });

      await setContainer(wrapper, 1600, 900); // 16:9 → whole photo
      expect(wrapper.find(".photo-image").attributes("style")).toContain("object-fit: contain");

      await setContainer(wrapper, 1000, 1500); // portrait → fill
      expect(wrapper.find(".photo-image").attributes("style")).toContain("object-fit: cover");
      expect(wrapper.find(".photo-backdrop").exists()).toBe(false);
    });

    it("uses naturalWidth/naturalHeight when stored dimensions are missing", async () => {
      imagesStore.currentImage = createImage({ width: undefined, height: undefined });
      const wrapper = createWrapper({ fit: "smart" });
      await setContainer(wrapper, 1600, 900);

      // Unknown shape: contain until the photo reports its own size.
      expect(wrapper.find(".photo-image").attributes("style")).toContain("object-fit: contain");

      const img = wrapper.find(".photo-image");
      Object.defineProperty(img.element, "naturalWidth", { value: 1600 });
      Object.defineProperty(img.element, "naturalHeight", { value: 900 });
      await img.trigger("load");
      await wrapper.vm.$nextTick();

      expect(img.attributes("style")).toContain("object-fit: cover");
    });

    it("Whole photo renders the backdrop", async () => {
      imagesStore.currentImage = createImage({ width: 1500, height: 1000 });
      const wrapper = createWrapper({ fit: "fit" });
      await setContainer(wrapper, 1600, 1000);

      expect(wrapper.find(".photo-image").attributes("style")).toContain("object-fit: contain");
      expect(wrapper.find(".photo-backdrop").exists()).toBe(true);
    });

    it("photo frame uses Smart whatever the region's fit is", async () => {
      imagesStore.currentImage = createImage({ width: 1000, height: 1500 });
      const wrapper = createWrapper({ fit: "fill", isFullscreen: true });
      await setContainer(wrapper, 1600, 900);

      expect(wrapper.find(".photo-image").classes()).toContain("photo-image-smart");
      expect(wrapper.find(".photo-image").attributes("style")).toContain("object-fit: contain");
    });
  });

  describe("Fullscreen Mode", () => {
    it("should apply fullscreen class when isFullscreen is true", () => {
      const wrapper = createWrapper({ isFullscreen: true });

      expect(wrapper.find(".photo-slideshow").classes()).toContain("fullscreen");
    });

    it("should not apply fullscreen class when isFullscreen is false", () => {
      const wrapper = createWrapper({ isFullscreen: false });

      expect(wrapper.find(".photo-slideshow").classes()).not.toContain("fullscreen");
    });
  });

  describe("Auto Rotation", () => {
    it("should rotate images when autoRotate is enabled", async () => {
      const image1 = createImage({ id: "1" });
      const image2 = createImage({ id: "2" });
      imagesStore.currentImage = image1;
      imagesStore.loading = false;
      // Mock fetchImages to set images array so startAutoRotation can check length
      imagesStore.fetchImages = vi.fn().mockImplementation(async () => {
        imagesStore.images = [image1, image2];
        return { images: [image1, image2] };
      });

      const wrapper = createWrapper({
        autoRotate: true,
        rotationInterval: 5000,
      });

      // Wait for mounted hook to complete (async fetchImages)
      await wrapper.vm.$nextTick();
      await vi.waitFor(() => {
        expect(imagesStore.fetchImages).toHaveBeenCalled();
      });
      // Let the mounted hook's fetch chain settle so startAutoRotation runs.
      await flushPromises();

      // Fast-forward past rotation interval
      vi.advanceTimersByTime(5000);
      await wrapper.vm.$nextTick();

      expect(imagesStore.nextImage).toHaveBeenCalled();
    });

    it("restarts the running timer when rotationInterval changes", async () => {
      const image1 = createImage({ id: "1" });
      const image2 = createImage({ id: "2" });
      imagesStore.currentImage = image1;
      imagesStore.loading = false;
      imagesStore.fetchImages = vi.fn().mockImplementation(async () => {
        imagesStore.images = [image1, image2];
        return { images: [image1, image2] };
      });

      const wrapper = createWrapper({
        autoRotate: true,
        rotationInterval: 3600000,
      });
      await wrapper.vm.$nextTick();
      await vi.waitFor(() => {
        expect(imagesStore.fetchImages).toHaveBeenCalled();
      });
      await flushPromises();

      // The long timer is already running; shorten the interval.
      await wrapper.setProps({ rotationInterval: 10000 });
      imagesStore.nextImage.mockClear();

      vi.advanceTimersByTime(10000);
      await wrapper.vm.$nextTick();

      expect(imagesStore.nextImage).toHaveBeenCalled();
    });

    it("should not rotate when only one image available", async () => {
      const image = createImage();
      imagesStore.images = [image];
      imagesStore.currentImage = image;
      imagesStore.loading = false;

      const wrapper = createWrapper({
        autoRotate: true,
        rotationInterval: 5000,
      });

      await wrapper.vm.$nextTick();
      vi.advanceTimersByTime(100);

      // Fast-forward past rotation interval
      vi.advanceTimersByTime(5000);
      await wrapper.vm.$nextTick();

      expect(imagesStore.nextImage).not.toHaveBeenCalled();
    });

    it("should not rotate when autoRotate is disabled", async () => {
      const image1 = createImage({ id: "1" });
      const image2 = createImage({ id: "2" });
      imagesStore.images = [image1, image2];
      imagesStore.currentImage = image1;
      imagesStore.loading = false;

      const wrapper = createWrapper({
        autoRotate: false,
        rotationInterval: 5000,
      });

      await wrapper.vm.$nextTick();
      vi.advanceTimersByTime(100);

      // Fast-forward past rotation interval
      vi.advanceTimersByTime(5000);
      await wrapper.vm.$nextTick();

      expect(imagesStore.nextImage).not.toHaveBeenCalled();
    });
  });

  describe("Image Loading", () => {
    it("should fetch images on mount", async () => {
      imagesStore.loading = false;
      const wrapper = createWrapper();

      await wrapper.vm.$nextTick();
      vi.advanceTimersByTime(100);

      expect(imagesStore.fetchImages).toHaveBeenCalled();
    });

    it("should fetch current image if images exist but no current image", async () => {
      const image = createImage();
      imagesStore.loading = false;
      // Mock fetchImages to set images and trigger fetchCurrentImage
      imagesStore.fetchImages = vi.fn().mockImplementation(async () => {
        imagesStore.images = [image];
        if (imagesStore.images.length > 0 && !imagesStore.currentImage) {
          await imagesStore.fetchCurrentImage();
        }
        return { images: [image] };
      });

      const wrapper = createWrapper();

      // Wait for mounted async hook to complete
      await wrapper.vm.$nextTick();
      await vi.waitFor(() => {
        expect(imagesStore.fetchImages).toHaveBeenCalled();
      });

      expect(imagesStore.fetchCurrentImage).toHaveBeenCalled();
    });

    it("should handle image load event", async () => {
      const image = createImage();
      imagesStore.currentImage = image;
      const wrapper = createWrapper();

      const img = wrapper.find(".photo-image");
      await img.trigger("load");

      // Should not throw - just verify it handles the event
      expect(img.exists()).toBe(true);
    });

    it("should handle image error event", async () => {
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const image = createImage();
      imagesStore.currentImage = image;
      const wrapper = createWrapper();

      const img = wrapper.find(".photo-image");
      await img.trigger("error");

      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  // CLV-115: loading the photo source lights the region; rotation does not.
  describe("backdrop CSS (kiosk GPU)", () => {
    const SOURCE = readFileSync(
      resolve(__dirname, "../../../src/components/PhotoSlideshow.vue"),
      "utf-8"
    );
    const STYLE = SOURCE.slice(SOURCE.indexOf("<style"), SOURCE.indexOf("</style>"));
    const rules = styleRules("components/PhotoSlideshow.vue");
    const isFull = rule => rule.selector.includes('[data-effects="full"]');

    it("covers the letterbox with the upscaled thumbnail and a plain dark overlay", () => {
      expect(STYLE).toMatch(/\.photo-backdrop\s*\{[^}]*overflow:\s*hidden/);
      expect(STYLE).toMatch(/\.photo-backdrop__image\s*\{[^}]*object-fit:\s*cover/);
      expect(STYLE).toMatch(
        /\.photo-backdrop--soft::after\s*\{[^}]*background:\s*color-mix\(in srgb, var\(--scrim-solid\) 45%, transparent\)/
      );
    });

    it('restores the original blurred source photo only under [data-effects="full"]', () => {
      const blurRules = rules.filter(rule =>
        rule.declarations.some(
          declaration => declaration.prop === "filter" && /blur/.test(declaration.value)
        )
      );
      expect(blurRules.length).toBeGreaterThan(0);
      expect(blurRules.every(isFull)).toBe(true);
      expect(
        blurRules
          .map(rule => rule.declarations.find(declaration => declaration.prop === "filter").value)
          .join(" ")
      ).toMatch(/blur\(28px\)\s*brightness\(0\.55\)/);
      // Standard keeps the cheap thumbnail: no filter rule may live outside Full.
      expect(
        rules
          .filter(rule => !isFull(rule))
          .some(rule => rule.declarations.some(declaration => /filter/.test(declaration.prop)))
      ).toBe(false);
    });

    it("scales the full backdrop slightly like the original", () => {
      const full = rules.find(
        rule => isFull(rule) && rule.selector.includes(".photo-backdrop--full")
      );
      expect(full).toBeTruthy();
      const transform = full.declarations.find(declaration => declaration.prop === "transform");
      expect(transform?.value).toBe("scale(1.1)");
    });
  });

  describe("loading light", () => {
    it("fetching the photo source lights this region's frame", async () => {
      let resolve;
      imagesStore.fetchImages = vi.fn(() => new Promise(r => (resolve = r)));
      const progress = useProgressStore();
      createWrapper({ regionId: "photos-1" });

      await vi.advanceTimersByTimeAsync(500);
      expect(progress.isFrameVisible("photos-1")).toBe(true);
      expect(progress.appVisible).toBe(false);

      resolve();
      await flushPromises();
      await vi.advanceTimersByTimeAsync(1000);
      expect(progress.isFrameVisible("photos-1")).toBe(false);
    });

    it("rotating and prefetching from cache never begin a source", async () => {
      const image1 = createImage({ id: "1" });
      const image2 = createImage({ id: "2" });
      imagesStore.currentImage = image1;
      imagesStore.fetchImages = vi.fn().mockImplementation(async () => {
        imagesStore.images = [image1, image2];
      });
      const progress = useProgressStore();
      createWrapper({ regionId: "photos-1", autoRotate: true, rotationInterval: 5000 });
      await flushPromises();

      const begin = vi.spyOn(progress, "begin");
      const track = vi.spyOn(progress, "track");
      await vi.advanceTimersByTimeAsync(15000);
      expect(imagesStore.nextImage).toHaveBeenCalled();
      expect(begin).not.toHaveBeenCalled();
      expect(track).not.toHaveBeenCalled();
    });
  });

  describe("Display variants (calvin-ax77)", () => {
    let observers;
    let originalDpr;
    let OriginalImage;

    beforeEach(() => {
      observers = [];
      originalDpr = window.devicePixelRatio;
      OriginalImage = globalThis.Image;
      globalThis.ResizeObserver = class {
        constructor(callback) {
          this.callback = callback;
          this.observe = vi.fn();
          this.disconnect = vi.fn();
          this.unobserve = vi.fn();
          observers.push(this);
        }
      };
    });

    afterEach(() => {
      delete globalThis.ResizeObserver;
      globalThis.Image = OriginalImage;
      Object.defineProperty(window, "devicePixelRatio", {
        configurable: true,
        value: originalDpr,
      });
    });

    const setDpr = value => {
      Object.defineProperty(window, "devicePixelRatio", { configurable: true, value });
    };

    const resize = async (wrapper, width, height) => {
      for (let i = 0; i < 10 && observers.length === 0; i += 1) {
        await Promise.resolve();
      }
      await wrapper.vm.$nextTick();
      observers[observers.length - 1].callback([{ contentRect: { width, height } }]);
      await wrapper.vm.$nextTick();
    };

    it("requests the viewport bucket until the region can be measured", async () => {
      setDpr(2);
      Object.defineProperty(window, "innerWidth", { configurable: true, value: 700 });
      imagesStore.currentImage = createImage();
      const wrapper = createWrapper();
      await flushPromises();

      // 700 CSS px x 2 DPR = 1400 -> 1920, not a 640-first probe.
      expect(wrapper.find(".photo-image").attributes("src")).toBe("/api/images/1?w=1920");

      // The measured region can still grow the request.
      await resize(wrapper, 1600, 900);
      expect(wrapper.find(".photo-image").attributes("src")).toBe("/api/images/1?w=2560");
    });

    it("renders and observes a photo that arrives after the empty state", async () => {
      imagesStore.currentImage = null;
      const wrapper = createWrapper();
      await flushPromises();
      expect(wrapper.find(".photo-container").exists()).toBe(false);

      imagesStore.currentImage = createImage();
      await wrapper.vm.$nextTick();
      await flushPromises();

      // The image is not blocked on measurement, and the new container has an
      // observer rather than only the one onMounted would have created.
      expect(wrapper.find(".photo-image").attributes("src")).toMatch(/^\/api\/images\/1\?w=\d+$/);
      const observer = observers[observers.length - 1];
      expect(observer.observe).toHaveBeenCalledWith(wrapper.find(".photo-container").element);
    });

    it("re-observes the container after a loading branch replaces it", async () => {
      imagesStore.currentImage = createImage();
      const wrapper = createWrapper();
      await flushPromises();
      const first = observers[observers.length - 1];
      expect(first.observe).toHaveBeenCalled();

      imagesStore.loading = true;
      await wrapper.vm.$nextTick();
      expect(wrapper.find(".photo-container").exists()).toBe(false);

      imagesStore.loading = false;
      await wrapper.vm.$nextTick();
      await flushPromises();

      const latest = observers[observers.length - 1];
      expect(latest).not.toBe(first);
      expect(latest.observe).toHaveBeenCalledWith(wrapper.find(".photo-container").element);
    });

    it("requests the bucket for the measured region and devicePixelRatio", async () => {
      setDpr(2);
      imagesStore.currentImage = createImage({ width: 4000, height: 3000 });
      const wrapper = createWrapper();
      await resize(wrapper, 700, 400);

      // 700 CSS px x 2 DPR = 1400 -> the 1920 bucket.
      expect(wrapper.find(".photo-image").attributes("src")).toBe("/api/images/1?w=1920");
      // The backdrop is deliberately the smallest bucket, never the display one.
      expect(wrapper.find(".photo-backdrop__image").attributes("src")).toBe("/api/images/1?w=640");
    });

    it("only re-requests when the region grows into a bigger bucket", async () => {
      setDpr(1);
      imagesStore.currentImage = createImage();
      const wrapper = createWrapper();

      await resize(wrapper, 900, 500);
      expect(wrapper.find(".photo-image").attributes("src")).toBe("/api/images/1?w=960");

      // Same bucket: no new URL.
      await resize(wrapper, 800, 400);
      expect(wrapper.find(".photo-image").attributes("src")).toBe("/api/images/1?w=960");

      // Crosses into 1280.
      await resize(wrapper, 1100, 600);
      expect(wrapper.find(".photo-image").attributes("src")).toBe("/api/images/1?w=1280");

      // Shrinking keeps the bigger file that is already decoded.
      await resize(wrapper, 700, 400);
      expect(wrapper.find(".photo-image").attributes("src")).toBe("/api/images/1?w=1280");
    });

    it("pre-decodes the next photo before the rotation swaps to it", async () => {
      const decoded = [];
      let resolveDecode;
      const decode = vi.fn(
        () =>
          new Promise(resolve => {
            resolveDecode = () => resolve();
          })
      );
      globalThis.Image = class {
        constructor() {
          this.decode = decode;
        }
        set src(value) {
          this._src = value;
          decoded.push(value);
        }
        get src() {
          return this._src;
        }
      };

      try {
        const image1 = createImage({ id: "1" });
        const image2 = createImage({ id: "2" });
        imagesStore.currentImage = image1;
        imagesStore.fetchImages = vi.fn().mockImplementation(async () => {
          imagesStore.images = [image1, image2];
        });

        const wrapper = createWrapper({ autoRotate: true, rotationInterval: 5000 });
        await resize(wrapper, 800, 600);
        await flushPromises();

        decode.mockClear();
        decoded.length = 0;
        await vi.advanceTimersByTimeAsync(5000);
        // A second tick while the first preload is still pending must not stack.
        await vi.advanceTimersByTimeAsync(5000);

        expect(decoded.some(url => url.startsWith("/api/images/2?w=960"))).toBe(true);
        expect(imagesStore.nextImage).not.toHaveBeenCalled();

        resolveDecode();
        await flushPromises();

        expect(imagesStore.nextImage).toHaveBeenCalledTimes(1);
        wrapper.unmount();
      } finally {
        delete globalThis.Image;
      }
    });

    it("preloads the next image in the randomized order", async () => {
      const decoded = [];
      globalThis.Image = class {
        constructor() {
          this.decode = vi.fn(() => Promise.resolve());
        }
        set src(value) {
          this._src = value;
          decoded.push(value);
        }
        get src() {
          return this._src;
        }
      };

      try {
        const image1 = createImage({ id: "1" });
        const image2 = createImage({ id: "2" });
        // The backend shuffled the list: 2 then 1. The original `images`
        // array keeps the unshuffled order on purpose.
        imagesStore.currentImage = image2;
        imagesStore.imagesBySourceKey["__all__"] = [image2, image1];
        imagesStore.images = [image1, image2];
        imagesStore.fetchImages = vi.fn().mockResolvedValue(undefined);

        const wrapper = createWrapper();
        await resize(wrapper, 800, 600);
        await flushPromises();

        expect(decoded.some(url => url.startsWith("/api/images/1?w=960"))).toBe(true);
        wrapper.unmount();
      } finally {
        delete globalThis.Image;
      }
    });

    it("advances anyway when the pre-decode rejects", async () => {
      globalThis.Image = class {
        constructor() {
          this.decode = vi.fn(() => Promise.reject(new Error("cannot decode")));
        }
        set src(value) {
          this._src = value;
        }
        get src() {
          return this._src;
        }
      };

      try {
        const image1 = createImage({ id: "1" });
        const image2 = createImage({ id: "2" });
        imagesStore.currentImage = image1;
        imagesStore.fetchImages = vi.fn().mockImplementation(async () => {
          imagesStore.images = [image1, image2];
        });

        const wrapper = createWrapper({ autoRotate: true, rotationInterval: 5000 });
        await resize(wrapper, 800, 600);
        await flushPromises();
        await vi.advanceTimersByTimeAsync(5000);
        await flushPromises();

        expect(imagesStore.nextImage).toHaveBeenCalled();
        wrapper.unmount();
      } finally {
        delete globalThis.Image;
      }
    });

    it("stops rotation after unmount while a preload is pending", async () => {
      const pending = [];
      globalThis.Image = class {
        constructor() {
          this.decode = vi.fn(
            () =>
              new Promise(resolve => {
                pending.push(resolve);
              })
          );
        }
        set src(value) {
          this._src = value;
        }
        get src() {
          return this._src;
        }
      };

      try {
        const image1 = createImage({ id: "1" });
        const image2 = createImage({ id: "2" });
        imagesStore.currentImage = image1;
        imagesStore.fetchImages = vi.fn().mockImplementation(async () => {
          imagesStore.images = [image1, image2];
        });

        const wrapper = createWrapper({ autoRotate: true, rotationInterval: 5000 });
        await resize(wrapper, 800, 600);
        await flushPromises();
        await vi.advanceTimersByTimeAsync(5000); // tick is awaiting the preload

        wrapper.unmount();
        pending.splice(0).forEach(resolve => resolve());
        await flushPromises();
        await vi.advanceTimersByTimeAsync(30000);

        expect(imagesStore.nextImage).not.toHaveBeenCalled();
      } finally {
        delete globalThis.Image;
      }
    });

    it("keeps a single rotation chain after a source change mid-tick", async () => {
      const pending = [];
      let block = true;
      globalThis.Image = class {
        constructor() {
          this.decode = vi.fn(() => {
            if (!block) return Promise.resolve();
            return new Promise(resolve => {
              pending.push(resolve);
            });
          });
        }
        set src(value) {
          this._src = value;
        }
        get src() {
          return this._src;
        }
      };

      try {
        const a1 = createImage({ id: "a1" });
        const a2 = createImage({ id: "a2" });
        const b1 = createImage({ id: "b1" });
        const b2 = createImage({ id: "b2" });
        imagesStore.imagesBySourceKey.a = [a1, a2];
        imagesStore.currentImagesBySourceKey.a = a1;
        imagesStore.imagesBySourceKey.b = [b1, b2];
        imagesStore.currentImagesBySourceKey.b = b1;
        imagesStore.fetchImages = vi.fn().mockResolvedValue(undefined);

        const wrapper = createWrapper({
          sourceIds: ["a"],
          autoRotate: true,
          rotationInterval: 5000,
        });
        await resize(wrapper, 800, 600);
        await flushPromises();
        await vi.advanceTimersByTimeAsync(5000); // old chain awaiting preload

        await wrapper.setProps({ sourceIds: ["b"] });
        await flushPromises();
        block = false;
        pending.splice(0).forEach(resolve => resolve());
        await flushPromises();

        // Three intervals, one live chain: the stale tick must not double it.
        await vi.advanceTimersByTimeAsync(15000);
        expect(imagesStore.nextImage).toHaveBeenCalledTimes(3);
        wrapper.unmount();
      } finally {
        delete globalThis.Image;
      }
    });
  });
});
