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
});
