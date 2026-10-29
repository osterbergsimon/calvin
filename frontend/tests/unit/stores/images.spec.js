/** Tests for images store. */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { setActivePinia, createPinia } from "pinia";
import { useImagesStore } from "@/stores/images";
import api from "@/services/api";

vi.mock("@/services/api", () => ({
  default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
  LONG_REQUEST_TIMEOUT: 600000,
}));

// Mock cache utilities so the offline-fallback path is deterministic.
vi.mock("@/utils/cache", () => ({
  getCachedData: vi.fn(() => null),
  setCachedData: vi.fn(),
  clearCachedData: vi.fn(),
}));

import { getCachedData, setCachedData } from "@/utils/cache";

describe("Images Store", () => {
  beforeEach(() => {
    // Create a fresh pinia instance for each test
    setActivePinia(createPinia());
    vi.clearAllMocks();
    getCachedData.mockReturnValue(null);
  });

  describe("Initialization", () => {
    it("should initialize with default values", () => {
      const store = useImagesStore();

      expect(store.images).toEqual([]);
      expect(store.currentImage).toBe(null);
      expect(store.loading).toBe(false);
      expect(store.error).toBe(null);
    });
  });

  describe("fetchImages", () => {
    it("should fetch images from API", async () => {
      const mockImages = {
        images: [
          { id: "1", filename: "image1.jpg", path: "/images/image1.jpg" },
          { id: "2", filename: "image2.jpg", path: "/images/image2.jpg" },
        ],
      };

      api.get.mockResolvedValue({ data: mockImages });
      api.get.mockResolvedValueOnce({ data: mockImages });
      api.get.mockResolvedValueOnce({
        data: { image: mockImages.images[0] },
      });

      const store = useImagesStore();
      await store.fetchImages();

      expect(api.get).toHaveBeenCalledWith("/images/list");
      expect(store.images).toEqual(mockImages.images);
      expect(store.loading).toBe(false);
      expect(store.error).toBe(null);
    });

    it("should fetch images for selected source IDs", async () => {
      const mockImages = {
        images: [{ id: "1", filename: "image1.jpg", source: "family" }],
      };

      api.get.mockResolvedValueOnce({ data: mockImages });
      api.get.mockResolvedValueOnce({
        data: { image: mockImages.images[0] },
      });

      const store = useImagesStore();
      await store.fetchImages(["family", "personal"]);

      expect(api.get).toHaveBeenCalledWith("/images/list", {
        params: { source_ids: "family,personal" },
      });
      expect(store.getImagesForSource(["personal", "family"])).toEqual(mockImages.images);
    });

    it("should fetch current image when images are available", async () => {
      const mockImages = {
        images: [{ id: "1", filename: "image1.jpg" }],
      };
      const mockCurrentImage = { image: mockImages.images[0] };

      api.get.mockResolvedValueOnce({ data: mockImages });
      api.get.mockResolvedValueOnce({ data: mockCurrentImage });

      const store = useImagesStore();
      await store.fetchImages();

      expect(api.get).toHaveBeenCalledWith("/images/current");
      expect(store.currentImage).toEqual(mockCurrentImage.image);
    });

    it("should handle API errors", async () => {
      const error = new Error("Network error");
      api.get.mockRejectedValue(error);

      const store = useImagesStore();

      await expect(store.fetchImages()).rejects.toThrow("Network error");
      expect(store.error).toBe("Network error");
      expect(store.loading).toBe(false);
    });

    it("should serve the cached feed when the backend is down (calvin-txp)", async () => {
      const cachedImages = [{ id: "1", filename: "cached.jpg" }];
      getCachedData.mockReturnValue(cachedImages);
      api.get.mockRejectedValue(new Error("Network error"));

      const store = useImagesStore();
      const result = await store.fetchImages();

      expect(getCachedData).toHaveBeenCalledWith(expect.any(String), expect.any(Number), {
        allowStale: true,
      });
      expect(result).toEqual({ images: cachedImages, cached: true });
      expect(store.images).toEqual(cachedImages);
    });

    it("should cache the feed on a successful fetch (calvin-txp)", async () => {
      const mockImages = { images: [{ id: "1", filename: "a.jpg" }] };
      api.get.mockResolvedValueOnce({ data: mockImages });
      api.get.mockResolvedValueOnce({ data: { image: null } });

      const store = useImagesStore();
      await store.fetchImages();

      expect(setCachedData).toHaveBeenCalledWith("images_all", mockImages.images);
    });
  });

  describe("fetchCurrentImage", () => {
    it("should fetch current image from API", async () => {
      const mockImage = {
        id: "1",
        filename: "current.jpg",
        path: "/images/current.jpg",
      };
      api.get.mockResolvedValue({ data: { image: mockImage } });

      const store = useImagesStore();
      const result = await store.fetchCurrentImage();

      expect(api.get).toHaveBeenCalledWith("/images/current");
      expect(store.currentImage).toEqual(mockImage);
      expect(result).toEqual({ image: mockImage });
    });

    it("should handle API errors", async () => {
      const error = new Error("Network error");
      api.get.mockRejectedValue(error);

      const store = useImagesStore();

      await expect(store.fetchCurrentImage()).rejects.toThrow("Network error");
    });

    it("should fall back to the last-known image on failure (calvin-txp)", async () => {
      const cachedImage = { id: "9", filename: "last.jpg" };
      getCachedData.mockReturnValue(cachedImage);
      api.get.mockRejectedValue(new Error("Network error"));

      const store = useImagesStore();
      const result = await store.fetchCurrentImage();

      expect(result).toEqual({ image: cachedImage, cached: true });
      expect(store.currentImage).toEqual(cachedImage);
    });
  });

  describe("nextImage", () => {
    it("should navigate to next image", async () => {
      const mockImage = { id: "2", filename: "next.jpg" };
      api.post.mockResolvedValue({ data: { image: mockImage } });

      const store = useImagesStore();
      const result = await store.nextImage();

      expect(api.post).toHaveBeenCalledWith("/images/next");
      expect(store.currentImage).toEqual(mockImage);
      expect(result).toEqual({ image: mockImage });
    });

    it("should handle API errors", async () => {
      const error = new Error("Network error");
      api.post.mockRejectedValue(error);

      const store = useImagesStore();

      await expect(store.nextImage()).rejects.toThrow("Network error");
    });
  });

  describe("previousImage", () => {
    it("should navigate to previous image", async () => {
      const mockImage = { id: "1", filename: "prev.jpg" };
      api.post.mockResolvedValue({ data: { image: mockImage } });

      const store = useImagesStore();
      const result = await store.previousImage();

      expect(api.post).toHaveBeenCalledWith("/images/previous");
      expect(store.currentImage).toEqual(mockImage);
      expect(result).toEqual({ image: mockImage });
    });

    it("should handle API errors", async () => {
      const error = new Error("Network error");
      api.post.mockRejectedValue(error);

      const store = useImagesStore();

      await expect(store.previousImage()).rejects.toThrow("Network error");
    });
  });

  describe("getCurrentImageUrl", () => {
    it("should return API URL for local images (no URL field)", () => {
      const store = useImagesStore();
      store.currentImage = {
        id: "1",
        filename: "image.jpg",
        path: "/images/image.jpg",
      };

      expect(store.getCurrentImageUrl).toBe("/api/images/1");
    });

    it("should return API proxy URL for remote images (never a raw CDN URL)", () => {
      const store = useImagesStore();
      store.currentImage = {
        id: "1",
        filename: "image.jpg",
        url: "https://picsum.photos/id/123/800/600",
      };

      expect(store.getCurrentImageUrl).toBe("/api/images/1");
    });

    it("should return API proxy URL even when only raw_url is present", () => {
      const store = useImagesStore();
      store.currentImage = {
        id: "1",
        filename: "image.jpg",
        raw_url: "https://picsum.photos/id/123/1920/1080",
      };

      expect(store.getCurrentImageUrl).toBe("/api/images/1");
    });

    it("should return null when no current image", () => {
      const store = useImagesStore();
      store.currentImage = null;

      expect(store.getCurrentImageUrl).toBe(null);
    });
  });

  describe("uploadImage", () => {
    it("should upload an image file", async () => {
      const file = new File(["content"], "image.jpg", { type: "image/jpeg" });
      const mockResponse = { data: { id: "3", filename: "image.jpg" } };
      const mockImagesResponse = {
        data: { images: [{ id: "3", filename: "image.jpg" }] },
      };

      api.post.mockResolvedValue(mockResponse);
      api.get.mockResolvedValue(mockImagesResponse);

      const store = useImagesStore();
      const result = await store.uploadImage(file);

      // Test functionality: image is uploaded and images list is refreshed
      expect(api.post).toHaveBeenCalled();
      expect(api.get).toHaveBeenCalledWith("/images/list");
      expect(store.images.length).toBeGreaterThan(0);
      expect(store.loading).toBe(false);
      expect(store.error).toBe(null);
      // uploadImage returns response.data, not the full response
      expect(result).toEqual(mockResponse.data);
    });

    it("should handle upload errors", async () => {
      const file = new File(["content"], "image.jpg", { type: "image/jpeg" });
      const error = new Error("Upload failed");
      api.post.mockRejectedValue(error);

      const store = useImagesStore();

      await expect(store.uploadImage(file)).rejects.toThrow("Upload failed");
      expect(store.error).toBe("Upload failed");
      expect(store.loading).toBe(false);
    });
  });

  describe("deleteImage", () => {
    it("should delete an image", async () => {
      const mockImages = {
        images: [{ id: "2", filename: "image2.jpg" }],
      };
      const mockCurrentImage = { data: { image: mockImages.images[0] } };

      api.delete.mockResolvedValue({ data: { success: true } });
      api.get.mockResolvedValueOnce({ data: mockImages }).mockResolvedValueOnce(mockCurrentImage);

      const store = useImagesStore();
      store.currentImage = { id: "1", filename: "image1.jpg" };

      await store.deleteImage("1");

      expect(api.delete).toHaveBeenCalledWith("/images/1");
      expect(api.get).toHaveBeenCalledWith("/images/list");
      expect(api.get).toHaveBeenCalledWith("/images/current");
      expect(store.loading).toBe(false);
    });

    it("should fetch new current image when deleting current image", async () => {
      const mockImages = {
        images: [{ id: "2", filename: "image2.jpg" }],
      };
      const mockCurrentImageResponse = {
        data: { image: mockImages.images[0] },
      };

      api.delete.mockResolvedValue({ data: { success: true } });
      api.get
        .mockResolvedValueOnce({ data: mockImages })
        .mockResolvedValueOnce(mockCurrentImageResponse);

      const store = useImagesStore();
      store.currentImage = { id: "1", filename: "image1.jpg" };

      await store.deleteImage("1");

      // Test functionality: when current image is deleted, a new current image is fetched
      expect(api.get).toHaveBeenCalledWith("/images/current");
      expect(store.currentImage).toEqual(mockCurrentImageResponse.data.image);
    });

    it("should not fetch current image when deleting different image", async () => {
      const mockImages = {
        images: [
          { id: "1", filename: "image1.jpg" },
          { id: "3", filename: "image3.jpg" },
        ],
      };

      api.delete.mockResolvedValue({ data: { success: true } });
      api.get.mockResolvedValue({ data: mockImages });

      const store = useImagesStore();
      store.currentImage = { id: "1", filename: "image1.jpg" };

      await store.deleteImage("2");

      expect(api.delete).toHaveBeenCalledWith("/images/2");
      expect(api.get).toHaveBeenCalledWith("/images/list");
      expect(api.get).not.toHaveBeenCalledWith("/images/current");
    });

    it("should handle delete errors", async () => {
      const error = new Error("Delete failed");
      api.delete.mockRejectedValue(error);

      const store = useImagesStore();

      await expect(store.deleteImage("1")).rejects.toThrow("Delete failed");
      expect(store.error).toBe("Delete failed");
      expect(store.loading).toBe(false);
    });
  });
});
