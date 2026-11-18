/**
 * SchemaRenderer passes the two switch-tile safety wirings through (homey
 * switch tiles §3): the action's cache patch goes to the schema's `data_path`,
 * and `dataUpdatedAt` reaches renderers that declare it. Both were only tested
 * on their own halves (usePluginAction.spec, SwitchGrid.spec with a hand-built
 * prop), so a broken wire here would silently bring back the stale-action tap.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent, h } from "vue";
import { config, flushPromises, mount } from "@vue/test-utils";
import { QueryClient, VUE_QUERY_CLIENT, useQuery } from "@tanstack/vue-query";

vi.mock("@/services/pluginsApi", () => ({
  runPluginAction: vi.fn(),
}));

import { runPluginAction } from "@/services/pluginsApi";
import SchemaRenderer from "@/components/plugins/SchemaRenderer.vue";
import SwitchGrid from "@/components/plugins/renderers/SwitchGrid.vue";

const ID = "inst-1";
const KEY = ["plugin-data", ID];
const SCHEMA = { kind: "switch-grid", data_path: "$.devices" };
const ACTION = { name: "set_onoff", params: { device: "d1", on: true } };

// Each fetch answers the same hub payload: one lamp, off, tappable.
const hubData = () => ({
  title: "Hub",
  devices: [{ id: "d1", label: "Lamp A", state: "off", action: { ...ACTION } }],
});

function deferred() {
  let resolve;
  const promise = new Promise(res => {
    resolve = res;
  });
  return { promise, resolve };
}

let queryClient;
let wrapper;
let refetch;

// ServiceViewer's shape: the data and its update stamp come from the query,
// so the answered item patched into the cache is what the renderer draws.
function mountSchema() {
  const Host = defineComponent({
    setup() {
      const query = useQuery({
        queryKey: KEY,
        queryFn: () => refetch.promise,
        staleTime: Infinity,
        retry: false,
      });
      return () =>
        h(SchemaRenderer, {
          schema: SCHEMA,
          data: query.data.value,
          dataUpdatedAt: query.dataUpdatedAt.value,
          pluginId: ID,
        });
    },
  });
  // tests/setup.js installs a global VueQueryPlugin, whose client would win
  // over the provided one: drop it and provide this test's client.
  const saved = config.global.plugins;
  config.global.plugins = [];
  try {
    wrapper = mount(Host, {
      global: { provide: { [VUE_QUERY_CLIENT]: queryClient } },
    });
  } finally {
    config.global.plugins = saved;
  }
  return wrapper;
}

const tile = (w, label) => w.findAll("button.switch-tile").find(b => b.text().includes(label));

beforeEach(() => {
  vi.clearAllMocks();
  refetch = deferred();
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  queryClient.setQueryData(KEY, hubData());
});

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  queryClient.clear();
});

describe("SchemaRenderer switch-grid wiring", () => {
  it("patches the answer at data_path, so a stale action cannot be tapped twice", async () => {
    runPluginAction.mockResolvedValue({ item: { id: "d1", state: "on" } });
    const w = mountSchema();

    expect(tile(w, "Lamp A").text()).toContain("Off");

    await tile(w, "Lamp A").trigger("click");
    await flushPromises();

    // The answer had no `action`: the tile shows the reported state and is
    // inert, and the cache entry at `$.devices` lost the old action.
    const after = tile(w, "Lamp A");
    expect(after.text()).toContain("On");
    expect(after.attributes("aria-disabled")).toBe("true");
    const cached = queryClient.getQueryData(KEY);
    expect(cached.devices[0]).toEqual({ id: "d1", label: "Lamp A", state: "on" });
    expect(cached.title).toBe("Hub");

    await tile(w, "Lamp A").trigger("click");
    await flushPromises();
    expect(runPluginAction).toHaveBeenCalledTimes(1);
    expect(runPluginAction).toHaveBeenCalledWith(ID, "set_onoff", { device: "d1", on: true });
  });

  it("drops the settled state when a refetch lands, back to what the data says", async () => {
    runPluginAction.mockResolvedValue({ item: { id: "d1", state: "on" } });
    const w = mountSchema();
    const stampBefore = w.findComponent(SwitchGrid).props("dataUpdatedAt");

    await tile(w, "Lamp A").trigger("click");
    await flushPromises();
    expect(tile(w, "Lamp A").text()).toContain("On");

    // The follow-up fetch (usePluginAction invalidates) answers what the hub
    // reports. `dataUpdatedAt` is forwarded, so the settled state goes with it
    // (SwitchGrid.spec covers an identical payload where only the stamp moves).
    refetch.resolve(hubData());
    await flushPromises();

    expect(w.findComponent(SwitchGrid).props("dataUpdatedAt")).toBeGreaterThan(stampBefore);
    const fallen = tile(w, "Lamp A");
    expect(fallen.text()).toContain("Off");
    expect(fallen.attributes("aria-pressed")).toBe("false");
    expect(runPluginAction).toHaveBeenCalledTimes(1);
    // The refetch brought a fresh action, so the tile can be tapped again.
    expect(fallen.attributes("aria-disabled")).toBeUndefined();
  });
});
