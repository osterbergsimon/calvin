/**
 * usePluginAction (homey switch tiles §3, plan Task 2.4): runs a declared
 * plugin action, patches the plugin's cached data with the returned item and
 * then invalidates it, so every tile ends on the hub's truth.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent, h, ref } from "vue";
import { config, mount } from "@vue/test-utils";
import { QueryClient, VUE_QUERY_CLIENT } from "@tanstack/vue-query";

vi.mock("@/services/pluginsApi", () => ({
  runPluginAction: vi.fn(),
}));

import { runPluginAction } from "@/services/pluginsApi";
import { usePluginAction } from "@/composables/usePluginAction";

const KEY = ["plugin-data", "inst-1"];
const ACTION = { name: "set_onoff", params: { device: "d1", on: true } };

let queryClient;
let wrapper;

function withAction(pluginId, { client = queryClient } = {}) {
  let run;
  const Host = defineComponent({
    setup() {
      run = usePluginAction(pluginId);
      return () => h("div");
    },
  });
  // tests/setup.js installs a global VueQueryPlugin, whose client would win
  // over a provided one: drop it, then provide this test's client (or none).
  const saved = config.global.plugins;
  config.global.plugins = [];
  try {
    wrapper = mount(Host, {
      global: { provide: client ? { [VUE_QUERY_CLIENT]: client } : {} },
    });
  } finally {
    config.global.plugins = saved;
  }
  return run;
}

beforeEach(() => {
  vi.clearAllMocks();
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  queryClient.setQueryData(KEY, {
    items: [
      { id: "d1", label: "Lamp A", state: "off" },
      { id: "d2", label: "Lamp B", state: "on" },
    ],
  });
});

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  queryClient.clear();
});

describe("usePluginAction", () => {
  it("posts the action for the unref'd id", async () => {
    runPluginAction.mockResolvedValue({});
    const run = withAction(ref("inst-1"));
    await run(ACTION);
    expect(runPluginAction).toHaveBeenCalledWith("inst-1", "set_onoff", {
      device: "d1",
      on: true,
    });
    expect(String(runPluginAction.mock.calls[0][0])).not.toContain("[object");
  });

  it("accepts a getter for the id", async () => {
    runPluginAction.mockResolvedValue({});
    const run = withAction(() => "inst-1");
    await run(ACTION);
    expect(runPluginAction.mock.calls[0][0]).toBe("inst-1");
  });

  it("patches cache then invalidates", async () => {
    const result = { item: { id: "d1", label: "Lamp A", state: "on" } };
    runPluginAction.mockResolvedValue(result);
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");
    const run = withAction("inst-1");

    await expect(run(ACTION)).resolves.toEqual(result);

    const cached = queryClient.getQueryData(KEY);
    expect(cached.items[0].state).toBe("on");
    expect(cached.items[1]).toEqual({ id: "d2", label: "Lamp B", state: "on" });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: KEY });
  });

  it("leaves the cache alone when the item is unknown or missing", async () => {
    runPluginAction.mockResolvedValue({ item: { id: "zz", state: "on" } });
    const run = withAction("inst-1");
    await run(ACTION);
    expect(queryClient.getQueryData(KEY).items.map(i => i.state)).toEqual(["off", "on"]);
  });

  it("invalidates even when the action fails, and rethrows", async () => {
    const error = Object.assign(new Error("Request failed"), { response: { status: 502 } });
    runPluginAction.mockRejectedValue(error);
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");
    const run = withAction("inst-1");

    await expect(run(ACTION)).rejects.toBe(error);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: KEY });
    expect(queryClient.getQueryData(KEY).items[0].state).toBe("off");
  });

  it("works without a QueryClient (gallery, bare tests)", async () => {
    runPluginAction.mockResolvedValue({ item: { id: "d1", state: "on" } });
    const run = withAction("inst-1", { client: null });
    await expect(run(ACTION)).resolves.toEqual({ item: { id: "d1", state: "on" } });
  });

  it("refuses to run without an id", async () => {
    const run = withAction("");
    await expect(run(ACTION)).rejects.toThrow();
    expect(runPluginAction).not.toHaveBeenCalled();
  });
});
