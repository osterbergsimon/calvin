import { describe, it, expect, beforeEach, vi } from "vitest";
import { setActivePinia, createPinia } from "pinia";
import axios from "axios";
import { useSecurityStore } from "@/stores/security";

vi.mock("axios");

describe("security store", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  it("fetchAllowedOrigins GETs and returns the origins list", async () => {
    axios.get.mockResolvedValue({ data: { origins: ["grafana.lab"] } });
    const store = useSecurityStore();
    const result = await store.fetchAllowedOrigins();
    expect(result).toEqual(["grafana.lab"]);
    expect(axios.get).toHaveBeenCalledWith("/api/security/allowed-origins");
  });

  it("fetchAllowedOrigins returns [] when the field is missing", async () => {
    axios.get.mockResolvedValue({ data: {} });
    const store = useSecurityStore();
    expect(await store.fetchAllowedOrigins()).toEqual([]);
  });

  it("saveAllowedOrigins PUTs the list under the origins key", async () => {
    axios.put.mockResolvedValue({ data: { origins: ["grafana.lab"] } });
    const store = useSecurityStore();
    await store.saveAllowedOrigins(["grafana.lab"]);
    expect(axios.put).toHaveBeenCalledWith("/api/security/allowed-origins", {
      origins: ["grafana.lab"],
    });
  });

  it("fetchSealedMode GETs and returns the flag", async () => {
    axios.get.mockResolvedValue({ data: { sealed_mode: true } });
    const store = useSecurityStore();
    expect(await store.fetchSealedMode()).toBe(true);
    expect(axios.get).toHaveBeenCalledWith("/api/security/sealed-mode");
  });

  it("fetchSealedMode returns false when the field is missing", async () => {
    axios.get.mockResolvedValue({ data: {} });
    const store = useSecurityStore();
    expect(await store.fetchSealedMode()).toBe(false);
  });

  it("saveSealedMode PUTs under the sealed_mode key", async () => {
    axios.put.mockResolvedValue({ data: { sealed_mode: true } });
    const store = useSecurityStore();
    await store.saveSealedMode(true);
    expect(axios.put).toHaveBeenCalledWith("/api/security/sealed-mode", { sealed_mode: true });
  });
});
