import { describe, it, expect, beforeEach, vi } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import SecuritySettings from "@/components/settings/categories/SecuritySettings.vue";
import { useSecurityStore } from "@/stores/security";

function mountWith(list = []) {
  setActivePinia(createPinia());
  const store = useSecurityStore();
  store.fetchAllowedOrigins = vi.fn(async () => list);
  store.saveAllowedOrigins = vi.fn(async () => {});
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
    await wrapper.find("[data-test='origin-input']").setValue("10.0.0.0/24");
    await wrapper.find("[data-test='origin-add']").trigger("click");
    expect(wrapper.text().toLowerCase()).toContain("wildcard");
    expect(wrapper.text()).not.toContain("10.0.0.0/24");
  });

  it("adds a valid origin and saves the full list", async () => {
    const { wrapper, store } = mountWith(["grafana.lab"]);
    await flushPromises();
    await wrapper.find("[data-test='origin-input']").setValue("*.lab.example.com");
    await wrapper.find("[data-test='origin-add']").trigger("click");
    await wrapper.find("[data-test='origins-save']").trigger("click");
    await flushPromises();
    expect(store.saveAllowedOrigins).toHaveBeenCalledWith(["grafana.lab", "*.lab.example.com"]);
  });
});
