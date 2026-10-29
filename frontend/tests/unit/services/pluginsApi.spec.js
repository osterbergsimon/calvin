/** Tests for plugin instance creation through the instance endpoint (audit R6). */

import { describe, it, expect, vi } from "vitest";
import api from "@/services/api";
import { createPluginInstance } from "@/services/pluginsApi";

vi.mock("@/services/api", () => ({
  default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
  LONG_REQUEST_TIMEOUT: 600000,
}));

describe("createPluginInstance", () => {
  it("POSTs to /plugins/{id}/instances, not the plugin-type PUT", async () => {
    api.post.mockResolvedValue({ data: { success: true, instance: { id: "mealie-1" } } });

    const result = await createPluginInstance("mealie", {
      name: "Kitchen",
      config: { url: "https://mealie.local", api_token: "secret" },
      enabled: false,
    });

    expect(api.post).toHaveBeenCalledWith("/plugins/mealie/instances", {
      name: "Kitchen",
      config: { url: "https://mealie.local", api_token: "secret" },
      enabled: false,
    });
    expect(api.put).not.toHaveBeenCalled();
    expect(result.instance.id).toBe("mealie-1");
  });

  it("defaults to enabled", async () => {
    api.post.mockResolvedValue({ data: {} });

    await createPluginInstance("mealie", { name: "Kitchen", config: {} });

    expect(api.post.mock.calls[0][1].enabled).toBe(true);
  });

  it("rejects with the backend error instead of reporting success", async () => {
    const error = {
      response: { status: 400, data: { detail: "Plugin did not create an instance" } },
    };
    api.post.mockRejectedValue(error);

    await expect(createPluginInstance("mealie", { name: "x", config: {} })).rejects.toBe(error);
  });
});
