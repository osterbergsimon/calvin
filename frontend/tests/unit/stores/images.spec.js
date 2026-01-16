/** Tests for images store. */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { setActivePinia, createPinia } from "pinia";
import { useImagesStore } from "@/stores/images";
import axios from "axios";

// Mock axios
vi.mock("axios");

describe("Images Store", () => {
  beforeEach(() => {
    // Create a fresh pinia instance for each test
    setActivePinia(createPinia());
    vi.clearAllMocks();
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

      axios.get.mockResolvedValue({ data: mockImages });
      axios.get.mockResolvedValueOnce({ data: mockImages });
      axios.get.mockResolvedValueOnce({
        data: { image: mockImages.images[0] },
      });

      const store = useImagesStore();
      await store.fetchImages();

      expect(axios.get).toHaveBeenCalledWith("/api/images/list");
      expect(store.images).toEqual(mockImages.images);
      expect(store.loading).toBe(false);
      expect(store.error).toBe(null);
    });

    it("should fetch current image when images are available", async () => {
      const mockImages = {
        images: [{ id: "1", filename: "image1.jpg" }],
      };
      const mockCurrentImage = { image: mockImages.images[0] };

      axios.get.mockResolvedValueOnce({ data: mockImages });
      axios.get.mockResolvedValueOnce({ data: mockCurrentImage });

      const store = useImagesStore();
      await store.fetchImages();

      expect(axios.get).toHaveBeenCalledWith("/api/images/current");
      expect(store.currentImage).toEqual(mockCurrentImage.image);
    });

    it("should handle API errors", async () => {
      const error = new Error("Network error");
      axios.get.mockRejectedValue(error);

      const store = useImagesStore();

      await expect(store.fetchImages()).rejects.toThrow("Network error");
      expect(store.error).toBe("Network error");
      expect(store.loading).toBe(false);
    });
  });

  describe("fetchCurrentImage", () => {
    it("should fetch current image from API", async () => {
      const mockImage = {
        id: "1",
        filename: "current.jpg",
        path: "/images/current.jpg",
      };
      axios.get.mockResolvedValue({ data: { image: mockImage } });

      const store = useImagesStore();
      const result = await store.fetchCurrentImage();

      expect(axios.get).toHaveBeenCalledWith("/api/images/current");
      expect(store.currentImage).toEqual(mockImage);
      expect(result).toEqual({ image: mockImage });
    });

    it("should handle API errors", async () => {
      const error = new Error("Network error");
      axios.get.mockRejectedValue(error);

      const store = useImagesStore();

      await expect(store.fetchCurrentImage()).rejects.toThrow("Network error");
    });
  });

  describe("nextImage", () => {
    it("should navigate to next image", async () => {
      const mockImage = { id: "2", filename: "next.jpg" };
      axios.post.mockResolvedValue({ data: { image: mockImage } });

      const store = useImagesStore();
      const result = await store.nextImage();

      expect(axios.post).toHaveBeenCalledWith("/api/images/next");
      expect(store.currentImage).toEqual(mockImage);
      expect(result).toEqual({ image: mockImage });
    });

    it("should handle API errors", async () => {
      const error = new Error("Network error");
      axios.post.mockRejectedValue(error);

      const store = useImagesStore();

      await expect(store.nextImage()).rejects.toThrow("Network error");
    });
  });

  describe("previousImage", () => {
    it("should navigate to previous image", async () => {
      const mockImage = { id: "1", filename: "prev.jpg" };
      axios.post.mockResolvedValue({ data: { image: mockImage } });

      const store = useImagesStore();
      const result = await store.previousImage();

      expect(axios.post).toHaveBeenCalledWith("/api/images/previous");
      expect(store.currentImage).toEqual(mockImage);
      expect(result).toEqual({ image: mockImage });
    });

    it("should handle API errors", async () => {
      const error = new Error("Network error");
      axios.post.mockRejectedValue(error);

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

    it("should return direct URL for remote images (has URL field)", () => {
      const store = useImagesStore();
      store.currentImage = {
        id: "1",
        filename: "image.jpg",
        url: "https://picsum.photos/id/123/800/600",
      };

      expect(store.getCurrentImageUrl).toBe(
        "https://picsum.photos/id/123/800/600",
      );
    });

    it("should prefer url over raw_url for remote images", () => {
      const store = useImagesStore();
      store.currentImage = {
        id: "1",
        filename: "image.jpg",
        url: "https://picsum.photos/id/123/800/600",
        raw_url: "https://picsum.photos/id/123/1920/1080",
      };

      expect(store.getCurrentImageUrl).toBe(
        "https://picsum.photos/id/123/800/600",
      );
    });

    it("should use raw_url if url is not available", () => {
      const store = useImagesStore();
      store.currentImage = {
        id: "1",
        filename: "image.jpg",
        raw_url: "https://picsum.photos/id/123/1920/1080",
      };

      expect(store.getCurrentImageUrl).toBe(
        "https://picsum.photos/id/123/1920/1080",
      );
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

      axios.post.mockResolvedValue(mockResponse);
      axios.get.mockResolvedValue(mockImagesResponse);

      const store = useImagesStore();
      const result = await store.uploadImage(file);

      // Test functionality: image is uploaded and images list is refreshed
      expect(axios.post).toHaveBeenCalled();
      expect(axios.get).toHaveBeenCalledWith("/api/images/list");
      expect(store.images.length).toBeGreaterThan(0);
      expect(store.loading).toBe(false);
      expect(store.error).toBe(null);
      // uploadImage returns response.data, not the full response
      expect(result).toEqual(mockResponse.data);
    });

    it("should handle upload errors", async () => {
      const file = new File(["content"], "image.jpg", { type: "image/jpeg" });
      const error = new Error("Upload failed");
      axios.post.mockRejectedValue(error);

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

      axios.delete.mockResolvedValue({ data: { success: true } });
      axios.get
        .mockResolvedValueOnce({ data: mockImages })
        .mockResolvedValueOnce(mockCurrentImage);

      const store = useImagesStore();
      store.currentImage = { id: "1", filename: "image1.jpg" };

      await store.deleteImage("1");

      expect(axios.delete).toHaveBeenCalledWith("/api/images/1");
      expect(axios.get).toHaveBeenCalledWith("/api/images/list");
      expect(axios.get).toHaveBeenCalledWith("/api/images/current");
      expect(store.loading).toBe(false);
    });

    it("should fetch new current image when deleting current image", async () => {
      const mockImages = {
        images: [{ id: "2", filename: "image2.jpg" }],
      };
      const mockCurrentImageResponse = {
        data: { image: mockImages.images[0] },
      };

      axios.delete.mockResolvedValue({ data: { success: true } });
      axios.get
        .mockResolvedValueOnce({ data: mockImages })
        .mockResolvedValueOnce(mockCurrentImageResponse);

      const store = useImagesStore();
      store.currentImage = { id: "1", filename: "image1.jpg" };

      await store.deleteImage("1");

      // Test functionality: when current image is deleted, a new current image is fetched
      expect(axios.get).toHaveBeenCalledWith("/api/images/current");
      expect(store.currentImage).toEqual(mockCurrentImageResponse.data.image);
    });

    it("should not fetch current image when deleting different image", async () => {
      const mockImages = {
        images: [
          { id: "1", filename: "image1.jpg" },
          { id: "3", filename: "image3.jpg" },
        ],
      };

      axios.delete.mockResolvedValue({ data: { success: true } });
      axios.get.mockResolvedValue({ data: mockImages });

      const store = useImagesStore();
      store.currentImage = { id: "1", filename: "image1.jpg" };

      await store.deleteImage("2");

      expect(axios.delete).toHaveBeenCalledWith("/api/images/2");
      expect(axios.get).toHaveBeenCalledWith("/api/images/list");
      expect(axios.get).not.toHaveBeenCalledWith("/api/images/current");
    });

    it("should handle delete errors", async () => {
      const error = new Error("Delete failed");
      axios.delete.mockRejectedValue(error);

      const store = useImagesStore();

      await expect(store.deleteImage("1")).rejects.toThrow("Delete failed");
      expect(store.error).toBe("Delete failed");
      expect(store.loading).toBe(false);
    });
  });
});
