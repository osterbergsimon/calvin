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

  it("adds a valid origin and persists the full list immediately", async () => {
    const { wrapper, store } = mountWith(["grafana.lab"]);
    await flushPromises();
    await wrapper.find("#origin-input").setValue("*.lab.example.com");
    await wrapper.find("[data-test='origin-add']").trigger("click");
    await flushPromises();
    expect(store.saveAllowedOrigins).toHaveBeenCalledWith(["grafana.lab", "*.lab.example.com"]);
    expect(wrapper.find("[data-test='origins-save']").exists()).toBe(false);
  });

  it("says it saved and that open screens need a reload", async () => {
    const { wrapper } = mountWith([]);
    await flushPromises();
    await wrapper.find("#origin-input").setValue("grafana.lab");
    await wrapper.find("[data-test='origin-add']").trigger("click");
    await flushPromises();
    const note = wrapper.find("[data-test='origins-saved']");
    expect(note.text()).toBe("Saved. Screens already open need a reload to apply this.");
    expect(note.attributes("role")).toBe("status");
  });

  it("only says Saved while sealed mode is on", async () => {
    const { wrapper } = mountWith([], true);
    await flushPromises();
    await wrapper.find("#origin-input").setValue("grafana.lab");
    await wrapper.find("[data-test='origin-add']").trigger("click");
    await flushPromises();
    expect(wrapper.find("[data-test='origins-saved']").text()).toBe("Saved.");
  });

  it("persists a removal immediately", async () => {
    const { wrapper, store } = mountWith(["a.lab", "b.lab"]);
    await flushPromises();
    await wrapper.find("[data-test='origin-remove']").trigger("click");
    await flushPromises();
    expect(store.saveAllowedOrigins).toHaveBeenCalledWith(["b.lab"]);
  });

  it("rolls back the list and restores the typed text when a save fails", async () => {
    const { wrapper, store } = mountWith(["a.lab"]);
    await flushPromises();
    store.saveAllowedOrigins.mockRejectedValueOnce(new Error("nope"));
    await wrapper.find("#origin-input").setValue("b.lab");
    await wrapper.find("[data-test='origin-add']").trigger("click");
    await flushPromises();
    expect(wrapper.find("[data-test='origin-error']").exists()).toBe(true);
    expect(wrapper.find("[data-test='origins-saved']").exists()).toBe(false);
    expect(wrapper.text()).not.toContain("b.lab\nRemove");
    expect(wrapper.findAll("[data-test='origin-remove']")).toHaveLength(1);
    expect(wrapper.find("#origin-input").element.value).toBe("b.lab");
  });

  it("disables Add and Remove while a save is running", async () => {
    const { wrapper, store } = mountWith(["a.lab"]);
    await flushPromises();
    let release;
    store.saveAllowedOrigins.mockImplementationOnce(() => new Promise(r => (release = r)));
    await wrapper.find("#origin-input").setValue("b.lab");
    await wrapper.find("[data-test='origin-add']").trigger("click");
    expect(wrapper.find("[data-test='origin-add']").attributes("disabled")).toBeDefined();
    expect(wrapper.find("[data-test='origin-remove']").attributes("disabled")).toBeDefined();
    release();
    await flushPromises();
    expect(wrapper.find("[data-test='origin-add']").attributes("disabled")).toBeUndefined();
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
