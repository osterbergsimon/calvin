import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";

vi.mock("@/composables", async () => {
  const { ref } = await import("vue");
  return {
    usePlugins: () => ({
      plugins: ref([]),
      pluginInstances: ref({}),
      loadingPlugins: ref(false),
      loadPlugins: vi.fn(),
    }),
  };
});

import ScreenRegionEditor from "@/components/settings/shared/ScreenRegionEditor.vue";

const nodeStub = {
  name: "RegionNode",
  props: ["region", "path", "selectedId", "layoutDir", "parentDirection"],
  emits: ["select", "resize"],
  template: '<div class="node-stub" />',
};

const region = (over = {}) => ({ size: 50, instanceIds: [], ...over });

const config = {
  dashboardScreens: {
    version: 2,
    activeScreenId: "home",
    screens: [
      {
        id: "home",
        name: "Home",
        activeRegionId: "r1",
        layout: {
          regions: [
            region({ id: "r1", kind: "calendar" }),
            region({
              id: "r2",
              kind: "service",
              serviceId: "mealie-1",
              instanceIds: ["mealie-1"],
            }),
          ],
        },
      },
    ],
  },
};

const mountEditor = async (props = {}) => {
  const w = mount(ScreenRegionEditor, {
    props: { config, open: true, placeSource: { id: "mealie-2", name: "Recipes" }, ...props },
    global: { stubs: { teleport: true, RegionNode: nodeStub, ScreenInspector: true } },
  });
  await flushPromises();
  return w;
};

const node = (w, id) =>
  w.findAllComponents({ name: "RegionNode" }).find(n => n.props("region").id === id);

describe("Pages & regions place mode", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it("shows a Choose a region banner and Cancel leaves it unplaced", async () => {
    const w = await mountEditor();

    expect(w.find('[data-test="place-banner"]').text()).toContain("Choose a region for");
    expect(w.find('[data-test="place-banner"]').text()).toContain("Recipes");

    await w.find('[data-test="place-cancel"]').trigger("click");
    expect(w.emitted("place-cancel")?.length).toBe(1);
    expect(w.emitted("update:config")).toBeUndefined();
  });

  it("fills an empty region with the source and reports it placed", async () => {
    const w = await mountEditor();

    node(w, "r1").vm.$emit("select", "r1");
    await flushPromises();

    const patch = w.emitted("update:config")?.[0][0];
    const placed = patch.dashboardScreens.screens
      .find(s => s.id === "home")
      .layout.regions.find(r => r.id === "r1");
    expect(placed.kind).toBe("service");
    expect(placed.serviceId).toBe("mealie-2");
    expect(w.emitted("placed")?.[0]).toEqual(["mealie-2"]);
  });

  it("asks before replacing a filled region, and Cancel changes nothing", async () => {
    const w = await mountEditor();

    node(w, "r2").vm.$emit("select", "r2");
    await flushPromises();

    const confirm = w.findComponent({ name: "ConfirmModal" });
    expect(confirm.props("show")).toBe(true);
    expect(confirm.props("message")).toBe("Replace another app with Recipes?");
    expect(w.emitted("update:config")).toBeUndefined();

    confirm.vm.$emit("cancel");
    await flushPromises();
    expect(w.emitted("update:config")).toBeUndefined();
  });

  it("replaces a filled region after confirming", async () => {
    const w = await mountEditor();

    node(w, "r2").vm.$emit("select", "r2");
    await flushPromises();
    w.findComponent({ name: "ConfirmModal" }).vm.$emit("confirm");
    await flushPromises();

    const patch = w.emitted("update:config")?.[0][0];
    const replaced = patch.dashboardScreens.screens
      .find(s => s.id === "home")
      .layout.regions.find(r => r.id === "r2");
    expect(replaced.serviceId).toBe("mealie-2");
    expect(replaced.instanceIds).toEqual(["mealie-2"]);
    expect(w.emitted("placed")?.length).toBe(1);
  });

  it("fills a region with a calendar when placing a kind", async () => {
    const w = await mountEditor({
      placeSource: { id: "calendar", name: "calendars", kind: "calendar" },
    });

    node(w, "r1").vm.$emit("select", "r1");
    await flushPromises();

    const patch = w.emitted("update:config")?.[0][0];
    const placed = patch.dashboardScreens.screens
      .find(s => s.id === "home")
      .layout.regions.find(r => r.id === "r1");
    expect(placed.kind).toBe("calendar");
    expect(placed.instanceIds).toEqual([]);
  });
});

describe("Pages & regions editor deep link", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it("opens with the requested region selected", async () => {
    const w = await mountEditor({
      open: false,
      placeSource: null,
      initialPageId: "home",
      initialRegionId: "r2",
    });
    await w.setProps({ open: true });
    await flushPromises();
    await flushPromises();
    expect(node(w, "r2").props("selectedId")).toBe("r2");
  });
});
