import { describe, it, expect, beforeEach, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { setActivePinia, createPinia } from "pinia";
import ServiceRegionViewOptions from "@/components/dashboard/ServiceRegionViewOptions.vue";
import { useConfigStore } from "@/stores/config";

function mountOptions(view) {
  const cfg = useConfigStore();
  cfg.updateRegionView = vi.fn().mockResolvedValue();
  const w = mount(ServiceRegionViewOptions, {
    attachTo: document.body,
    props: { regionId: "svc-1", view },
  });
  return { w, cfg };
}
const open = w => w.find(".region-view-options__trigger").trigger("click");

describe("ServiceRegionViewOptions", () => {
  beforeEach(() => setActivePinia(createPinia()));

  it("shows Default selected when no override", async () => {
    const { w } = mountOptions({});
    await open(w);
    expect(w.find('.svo-seg [aria-checked="true"]').text()).toBe("Default");
    w.unmount();
  });

  it("selecting In-app persists linkAction=embed", async () => {
    const { w, cfg } = mountOptions({});
    await open(w);
    await w.find('.svo-seg [aria-label="Link behavior embed"]').trigger("click");
    expect(cfg.updateRegionView).toHaveBeenCalledWith("svc-1", { linkAction: "embed" });
    w.unmount();
  });

  it("selecting Default clears the override", async () => {
    const { w, cfg } = mountOptions({ linkAction: "embed" });
    await open(w);
    await w.find('.svo-seg [aria-label="Link behavior default"]').trigger("click");
    expect(cfg.updateRegionView).toHaveBeenCalledWith("svc-1", { linkAction: undefined });
    w.unmount();
  });

  it("lights the trigger when an override is set", () => {
    const { w } = mountOptions({ linkAction: "off" });
    expect(w.find(".region-view-options__trigger").classes()).toContain("active");
    w.unmount();
  });
});
