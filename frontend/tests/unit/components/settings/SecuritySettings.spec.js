import { describe, it, expect, beforeEach, vi } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import SecuritySettings from "@/components/settings/categories/SecuritySettings.vue";
import { useSecurityStore } from "@/stores/security";

function mountWith(list = [], sealed = false) {
  setActivePinia(createPinia());
  const store = useSecurityStore();
  store.fetchAllowedOrigins = vi.fn(async () => list);
  store.saveAllowedOrigins = vi.fn(async () => {});
  store.fetchSealedMode = vi.fn(async () => sealed);
  store.saveSealedMode = vi.fn(async () => {});
  const wrapper = mount(SecuritySettings);
  return { wrapper, store };
}

describe("SecuritySettings", () => {
  beforeEach(() => vi.clearAllMocks());

  it("loads and lists existing origins", async () => {
    const { wrapper } = mountWith(["grafana.lab"]);
    await flushPromises();
    expect(wrapper.text()).toContain("grafana.lab");
  });

  it("rejects a CIDR entry with guidance and does not add it", async () => {
    const { wrapper } = mountWith([]);
    await flushPromises();
    await wrapper.find("#origin-input").setValue("10.0.0.0/24");
    await wrapper.find("[data-test='origin-add']").trigger("click");
    expect(wrapper.text().toLowerCase()).toContain("wildcard");
    expect(wrapper.text()).not.toContain("10.0.0.0/24");
  });

  it("adds a valid origin and saves the full list", async () => {
    const { wrapper, store } = mountWith(["grafana.lab"]);
    await flushPromises();
    await wrapper.find("#origin-input").setValue("*.lab.example.com");
    await wrapper.find("[data-test='origin-add']").trigger("click");
    await wrapper.find("[data-test='origins-save']").trigger("click");
    await flushPromises();
    expect(store.saveAllowedOrigins).toHaveBeenCalledWith(["grafana.lab", "*.lab.example.com"]);
  });

  it("renders the sealed-mode toggle reflecting current state", async () => {
    const { wrapper } = mountWith([], true);
    await flushPromises();
    expect(wrapper.find("[data-test='sealed-mode-toggle']").attributes("aria-checked")).toBe(
      "true"
    );
  });

  it("saves sealed mode when toggled", async () => {
    const { wrapper, store } = mountWith([], false);
    await flushPromises();
    const toggle = wrapper.find("[data-test='sealed-mode-toggle']");
    await toggle.trigger("click");
    await flushPromises();
    expect(store.saveSealedMode).toHaveBeenCalledWith(true);
  });

  it("marks the allowlist inactive while sealed", async () => {
    const { wrapper } = mountWith(["grafana.lab"], true);
    await flushPromises();
    expect(wrapper.find("[data-test='allowlist-inactive']").exists()).toBe(true);
  });
});

// Settings copy audit §3.6 — verbatim.
describe("SecuritySettings copy (§3.6)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("calls the allowlist Allowed sites and explains it in plain words", async () => {
    const { wrapper } = mountWith([]);
    await flushPromises();
    const section = wrapper.find("#section-security-origins");
    expect(section.find(".settings-section__eyebrow").text()).toBe("Allowed sites");
    expect(section.text()).toContain(
      "Sites this dashboard may show or load from. Everything else is blocked. Use a domain like grafana.lab or *.lab.example.com, or a full address."
    );
    expect(section.text()).toContain("No sites allowed.");
    // The CIDR caveat belongs to the input's validation error, not the intro.
    expect(section.text()).not.toContain("CIDR) are not supported");
  });

  it("describes sealed mode without the word origins", async () => {
    const { wrapper } = mountWith([], false);
    await flushPromises();
    expect(wrapper.text()).toContain(
      "Only this Calvin server is reachable: no outside embeds, sites or plugins that go online. Calendars, photos and local plugins keep working."
    );
  });
});
