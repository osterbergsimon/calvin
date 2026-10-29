import { describe, it, expect, vi, afterEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";

vi.mock("vue-router", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), currentRoute: { value: { path: "/" } } }),
  useRoute: () => ({ path: "/", query: {} }),
}));

import KeyboardHandler from "@/components/KeyboardHandler.vue";

function setLocation(search) {
  Object.defineProperty(window, "location", {
    value: { search, hostname: "server", pathname: "/", origin: "http://server" },
    writable: true,
  });
}

describe("KeyboardHandler reboot-combo config (F1)", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("fetches the kiosk's effective config, not the global one, on a kiosk", async () => {
    setLocation("?kiosk=kitchen&khost=pi-k");
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
    vi.stubGlobal("fetch", fetchMock);

    const wrapper = mount(KeyboardHandler, {
      global: { stubs: { NotificationSystem: true } },
    });
    await flushPromises();

    expect(fetchMock).toHaveBeenCalledWith("/api/kiosks/kitchen/config?khost=pi-k");
    expect(fetchMock).not.toHaveBeenCalledWith("/api/config");
    wrapper.unmount();
  });

  it("uses /api/config in a plain browser", async () => {
    setLocation("");
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
    vi.stubGlobal("fetch", fetchMock);

    const wrapper = mount(KeyboardHandler, {
      global: { stubs: { NotificationSystem: true } },
    });
    await flushPromises();

    expect(fetchMock).toHaveBeenCalledWith("/api/config");
    wrapper.unmount();
  });
});
