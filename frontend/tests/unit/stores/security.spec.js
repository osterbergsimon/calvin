import { describe, it, expect, beforeEach, vi } from "vitest";
import { setActivePinia, createPinia } from "pinia";
import api from "@/services/api";
import { useSecurityStore } from "@/stores/security";

vi.mock("@/services/api", () => ({
  default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
  LONG_REQUEST_TIMEOUT: 600000,
}));

describe("security store", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  it("fetchAllowedOrigins GETs and returns the origins list", async () => {
    api.get.mockResolvedValue({ data: { origins: ["grafana.lab"] } });
    const store = useSecurityStore();
    const result = await store.fetchAllowedOrigins();
    expect(result).toEqual(["grafana.lab"]);
    expect(api.get).toHaveBeenCalledWith("/security/allowed-origins");
  });

  it("fetchAllowedOrigins returns [] when the field is missing", async () => {
    api.get.mockResolvedValue({ data: {} });
    const store = useSecurityStore();
    expect(await store.fetchAllowedOrigins()).toEqual([]);
  });

  it("saveAllowedOrigins PUTs the list under the origins key", async () => {
    api.put.mockResolvedValue({ data: { origins: ["grafana.lab"] } });
    const store = useSecurityStore();
    await store.saveAllowedOrigins(["grafana.lab"]);
    expect(api.put).toHaveBeenCalledWith("/security/allowed-origins", {
      origins: ["grafana.lab"],
    });
  });

  it("fetchSealedMode GETs and returns the flag", async () => {
    api.get.mockResolvedValue({ data: { sealed_mode: true } });
    const store = useSecurityStore();
    expect(await store.fetchSealedMode()).toBe(true);
    expect(api.get).toHaveBeenCalledWith("/security/sealed-mode");
  });

  it("fetchSealedMode returns false when the field is missing", async () => {
    api.get.mockResolvedValue({ data: {} });
    const store = useSecurityStore();
    expect(await store.fetchSealedMode()).toBe(false);
  });

  it("saveSealedMode PUTs under the sealed_mode key", async () => {
    api.put.mockResolvedValue({ data: { sealed_mode: true } });
    const store = useSecurityStore();
    await store.saveSealedMode(true);
    expect(api.put).toHaveBeenCalledWith("/security/sealed-mode", { sealed_mode: true });
  });
});
