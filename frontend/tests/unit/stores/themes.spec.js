/** Tests for themes store. */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { setActivePinia, createPinia } from "pinia";
import { useThemesStore } from "@/stores/themes";
import api from "@/services/api";

vi.mock("@/services/api", () => ({
  default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
  LONG_REQUEST_TIMEOUT: 600000,
}));

// Mock logger
vi.mock("@/utils/logger", () => ({
  logError: vi.fn(),
  logInfo: vi.fn(),
}));

import { logError, logInfo } from "@/utils/logger";

describe("Themes Store", () => {
  beforeEach(() => {
    // Create a fresh pinia instance for each test
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  describe("Initialization", () => {
    it("should initialize with default values", () => {
      const store = useThemesStore();

      expect(store.themes).toEqual([]);
      expect(store.installedThemes).toEqual([]);
      expect(store.selectedTheme).toBe(null);
      expect(store.loading).toBe(false);
      expect(store.error).toBe(null);
    });
  });

  describe("fetchThemes", () => {
    it("should fetch all themes", async () => {
      const mockPlugins = {
        plugins: [
          { id: "theme1", name: "Theme 1", type: "theme" },
          { id: "theme2", name: "Theme 2", type: "theme" },
        ],
      };

      const mockTheme1 = { id: "theme1", name: "Theme 1", variables: {} };
      const mockTheme2 = { id: "theme2", name: "Theme 2", variables: {} };

      api.get
        .mockResolvedValueOnce({ data: mockPlugins })
        .mockResolvedValueOnce({ data: mockTheme1 })
        .mockResolvedValueOnce({ data: mockTheme2 });

      const store = useThemesStore();
      await store.fetchThemes();

      expect(api.get).toHaveBeenCalledWith("/plugins?plugin_type=theme");
      expect(api.get).toHaveBeenCalledWith("/plugins/theme1");
      expect(api.get).toHaveBeenCalledWith("/plugins/theme2");
      expect(store.themes.length).toBe(2);
      expect(store.loading).toBe(false);
      expect(store.error).toBe(null);
    });

    it("should handle errors when fetching theme details", async () => {
      const mockPlugins = {
        plugins: [{ id: "theme1", name: "Theme 1", type: "theme" }],
      };

      api.get
        .mockResolvedValueOnce({ data: mockPlugins })
        .mockRejectedValueOnce(new Error("Theme not found"));

      const store = useThemesStore();
      await store.fetchThemes();

      expect(store.themes.length).toBe(1);
      expect(store.themes[0]).toEqual({
        id: "theme1",
        name: "Theme 1",
        type: "theme",
      });
    });

    it("should handle API errors", async () => {
      const error = new Error("Network error");
      api.get.mockRejectedValue(error);

      const store = useThemesStore();

      await expect(store.fetchThemes()).rejects.toThrow("Network error");
      expect(store.error).toBe("Network error");
      expect(store.loading).toBe(false);
      expect(logError).toHaveBeenCalled();
    });
  });

  describe("fetchInstalledThemes", () => {
    it("should fetch installed themes only", async () => {
      const mockResponse = {
        plugins: [
          { id: "theme1", type: "theme", is_builtin: false },
          { id: "theme2", type: "theme", is_builtin: false },
          { id: "plugin1", type: "plugin" },
        ],
      };

      api.get.mockResolvedValue({ data: mockResponse });

      const store = useThemesStore();
      const result = await store.fetchInstalledThemes();

      expect(api.get).toHaveBeenCalledWith("/plugins/installed");
      expect(store.loading).toBe(false);
      // The endpoint has no `themes` key — read `plugins` and filter (calvin-8lr).
      expect(result).toEqual([
        { id: "theme1", type: "theme", is_builtin: false },
        { id: "theme2", type: "theme", is_builtin: false },
      ]);
      expect(store.installedThemes).toEqual(result);
    });

    it("should handle API errors", async () => {
      const error = new Error("Network error");
      api.get.mockRejectedValue(error);

      const store = useThemesStore();

      await expect(store.fetchInstalledThemes()).rejects.toThrow("Network error");
      expect(store.error).toBe("Network error");
      expect(store.loading).toBe(false);
      expect(logError).toHaveBeenCalled();
    });
  });

  describe("getTheme", () => {
    it("should get a specific theme by ID", async () => {
      const mockTheme = { id: "theme1", name: "Theme 1", variables: {} };
      api.get.mockResolvedValue({ data: mockTheme });

      const store = useThemesStore();
      const result = await store.getTheme("theme1");

      expect(api.get).toHaveBeenCalledWith("/plugins/theme1");
      expect(result).toEqual(mockTheme);
    });

    it("should handle API errors", async () => {
      const error = new Error("Theme not found");
      api.get.mockRejectedValue(error);

      const store = useThemesStore();

      await expect(store.getTheme("theme1")).rejects.toThrow("Theme not found");
      expect(logError).toHaveBeenCalled();
    });
  });

  describe("installTheme", () => {
    it("should install a theme from a file", async () => {
      const file = new File(["content"], "theme.zip", {
        type: "application/zip",
      });
      const mockResponse = {
        data: {
          manifest: { id: "new-theme", name: "New Theme" },
        },
      };

      api.post.mockResolvedValue(mockResponse);
      api.get
        .mockResolvedValueOnce({ data: { plugins: [] } })
        .mockResolvedValueOnce({ data: { plugins: [] } });

      const store = useThemesStore();
      await store.installTheme(file);

      expect(api.post).toHaveBeenCalledWith("/plugins/install", expect.any(FormData), {
        timeout: 600000,
      });
      expect(store.loading).toBe(false);
      expect(store.error).toBe(null);
      expect(logInfo).toHaveBeenCalled();
    });

    it("should handle installation errors", async () => {
      const file = new File(["content"], "theme.zip", {
        type: "application/zip",
      });
      const error = new Error("Installation failed");
      api.post.mockRejectedValue(error);

      const store = useThemesStore();

      await expect(store.installTheme(file)).rejects.toThrow("Installation failed");
      expect(store.error).toBe("Installation failed");
      expect(store.loading).toBe(false);
      expect(logError).toHaveBeenCalled();
    });
  });

  describe("installThemeFromGitHub", () => {
    it("should install a theme from GitHub", async () => {
      const mockResponse = {
        data: {
          manifest: { id: "github-theme", name: "GitHub Theme" },
        },
      };

      api.post.mockResolvedValue(mockResponse);
      api.get
        .mockResolvedValueOnce({ data: { plugins: [] } })
        .mockResolvedValueOnce({ data: { plugins: [] } });

      const store = useThemesStore();
      await store.installThemeFromGitHub("https://github.com/user/repo", "theme.json", "main");

      // The handler requires plugin_path (not theme_path) or it 400s (calvin-8lr).
      expect(api.post).toHaveBeenCalledWith(
        "/plugins/github/install",
        {
          repo_url: "https://github.com/user/repo",
          plugin_path: "theme.json",
          branch: "main",
        },
        { timeout: 600000 }
      );
      expect(store.loading).toBe(false);
      expect(store.error).toBe(null);
      expect(logInfo).toHaveBeenCalled();
    });

    it("should use default branch when not specified", async () => {
      const mockResponse = {
        data: {
          manifest: { id: "github-theme", name: "GitHub Theme" },
        },
      };

      api.post.mockResolvedValue(mockResponse);
      api.get
        .mockResolvedValueOnce({ data: { plugins: [] } })
        .mockResolvedValueOnce({ data: { plugins: [] } });

      const store = useThemesStore();
      await store.installThemeFromGitHub("https://github.com/user/repo", "theme.json");

      expect(api.post).toHaveBeenCalledWith(
        "/plugins/github/install",
        {
          repo_url: "https://github.com/user/repo",
          plugin_path: "theme.json",
          branch: "main",
        },
        { timeout: 600000 }
      );
    });

    it("should handle installation errors", async () => {
      const error = new Error("GitHub installation failed");
      api.post.mockRejectedValue(error);

      const store = useThemesStore();

      await expect(
        store.installThemeFromGitHub("https://github.com/user/repo", "theme.json")
      ).rejects.toThrow("GitHub installation failed");
      expect(store.error).toBe("GitHub installation failed");
      expect(store.loading).toBe(false);
      expect(logError).toHaveBeenCalled();
    });
  });

  describe("enumerateThemesFromGitHub", () => {
    it("should enumerate themes from GitHub", async () => {
      const mockResponse = {
        data: {
          themes: [
            { id: "theme1", name: "Theme 1" },
            { id: "theme2", name: "Theme 2" },
          ],
        },
      };

      api.post.mockResolvedValue(mockResponse);

      const store = useThemesStore();
      const result = await store.enumerateThemesFromGitHub("https://github.com/user/repo", "main");

      expect(api.post).toHaveBeenCalledWith(
        "/plugins/github/enumerate",
        {
          repo_url: "https://github.com/user/repo",
          branch: "main",
        },
        { timeout: 600000 }
      );
      // The function returns response.data, not the full response
      expect(result).toEqual(mockResponse.data);
      expect(store.loading).toBe(false);
    });

    it("should return empty array when no themes in response", async () => {
      const mockResponse = { data: {} };

      api.post.mockResolvedValue(mockResponse);

      const store = useThemesStore();
      const result = await store.enumerateThemesFromGitHub("https://github.com/user/repo");

      expect(result).toEqual({ themes: [] });
    });

    it("should handle API errors", async () => {
      const error = new Error("Network error");
      api.post.mockRejectedValue(error);

      const store = useThemesStore();

      await expect(store.enumerateThemesFromGitHub("https://github.com/user/repo")).rejects.toThrow(
        "Network error"
      );
      expect(store.error).toBe("Network error");
      expect(store.loading).toBe(false);
      expect(logError).toHaveBeenCalled();
    });
  });

  describe("uninstallTheme", () => {
    it("should uninstall a theme", async () => {
      api.delete.mockResolvedValue({ data: { success: true } });
      api.get
        .mockResolvedValueOnce({ data: { plugins: [] } })
        .mockResolvedValueOnce({ data: { plugins: [] } });

      const store = useThemesStore();
      const result = await store.uninstallTheme("theme1");

      expect(api.delete).toHaveBeenCalledWith("/plugins/installed/theme1");
      expect(result).toEqual({ success: true });
      expect(store.loading).toBe(false);
      expect(logInfo).toHaveBeenCalled();
    });

    it("should handle uninstall errors", async () => {
      const error = new Error("Uninstall failed");
      api.delete.mockRejectedValue(error);

      const store = useThemesStore();

      await expect(store.uninstallTheme("theme1")).rejects.toThrow("Uninstall failed");
      expect(store.error).toBe("Uninstall failed");
      expect(store.loading).toBe(false);
      expect(logError).toHaveBeenCalled();
    });
  });

  describe("setSelectedTheme", () => {
    it("should set selected theme", () => {
      const store = useThemesStore();

      store.setSelectedTheme("theme1");

      expect(store.selectedTheme).toBe("theme1");
    });
  });

  describe("Computed Properties", () => {
    it("should return built-in themes", () => {
      const store = useThemesStore();
      store.themes = [
        { id: "theme1", is_builtin: true },
        { id: "theme2", is_builtin: false },
        { id: "theme3", is_builtin: true },
      ];

      expect(store.builtInThemes.length).toBe(2);
      expect(store.builtInThemes[0].id).toBe("theme1");
      expect(store.builtInThemes[1].id).toBe("theme3");
    });

    it("should return custom themes", () => {
      const store = useThemesStore();
      store.themes = [
        { id: "theme1", is_builtin: true },
        { id: "theme2", is_builtin: false },
        { id: "theme3", is_builtin: true },
        { id: "theme4" }, // undefined is_builtin should be treated as custom
      ];

      expect(store.customThemes.length).toBe(2);
      expect(store.customThemes[0].id).toBe("theme2");
      expect(store.customThemes[1].id).toBe("theme4");
    });
  });
});
