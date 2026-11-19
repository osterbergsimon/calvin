/**
 * switch-grid renderer (homey switch tiles §3, plan Task 2.3).
 *
 * The renderer is not plugin-aware: it draws tiles from the payload, runs each
 * tile's declared action through the `runAction` prop, and settles on what the
 * action answers. Every error the action route can return maps to plain words.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import SwitchGrid from "@/components/plugins/renderers/SwitchGrid.vue";

const ITEMS = [
  {
    id: "d1",
    label: "Lamp A",
    group: "Group A",
    state: "off",
    action: { name: "set_onoff", params: { device: "d1", on: true } },
  },
  {
    id: "d2",
    label: "Lamp B",
    group: "Group B",
    state: "on",
    action: { name: "set_onoff", params: { device: "d2", on: false } },
  },
  { id: "d3", label: "Plug C", group: "Group A", state: "unavailable", action: null },
];

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function httpError(status, code, headers = {}, message = "") {
  const error = new Error(`Request failed with status code ${status}`);
  error.response = { status, data: { detail: { code, message } }, headers };
  return error;
}

let wrapper;
function mountGrid({ items = ITEMS, schema = {}, runAction } = {}) {
  wrapper = mount(SwitchGrid, {
    props: {
      schema: { kind: "switch-grid", ...schema },
      data: { items },
      ...(runAction ? { runAction } : {}),
    },
    attachTo: document.body,
  });
  return wrapper;
}

const tile = (w, label) => w.findAll("button.switch-tile").find(b => b.text().includes(label));
const note = w => w.find('[role="status"]');

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  vi.useRealTimers();
});

describe("SwitchGrid", () => {
  it("renders one button per item with aria-pressed and state words", () => {
    const w = mountGrid();
    const buttons = w.findAll("button.switch-tile");
    expect(buttons).toHaveLength(3);

    const a = tile(w, "Lamp A");
    expect(a.attributes("aria-pressed")).toBe("false");
    expect(a.text()).toContain("Off");

    const b = tile(w, "Lamp B");
    expect(b.attributes("aria-pressed")).toBe("true");
    expect(b.text()).toContain("On");

    const c = tile(w, "Plug C");
    expect(c.attributes("aria-pressed")).toBeUndefined();
    expect(c.attributes("aria-disabled")).toBe("true");
    expect(c.text()).toContain("Not responding");
    // Never the disabled attribute: a focused tile keeps focus when it flips.
    expect(c.attributes("disabled")).toBeUndefined();
  });

  it("groups tiles under their group heading in first-seen order", () => {
    const w = mountGrid();
    const groups = w.findAll(".switch-grid__group");
    expect(groups.map(g => g.find(".switch-grid__heading").text())).toEqual(["Group A", "Group B"]);
    expect(groups[0].text()).toContain("Lamp A");
    expect(groups[0].text()).toContain("Plug C");
    expect(groups[1].text()).toContain("Lamp B");
  });

  it("draws ungrouped items without a heading", () => {
    const w = mountGrid({ items: [{ ...ITEMS[0], group: undefined }] });
    expect(w.find(".switch-grid__heading").exists()).toBe(false);
    expect(w.findAll("button.switch-tile")).toHaveLength(1);
  });

  it("reads items from schema.data_path", () => {
    wrapper = mount(SwitchGrid, {
      props: { schema: { kind: "switch-grid", data_path: "$.devices" }, data: { devices: ITEMS } },
    });
    expect(wrapper.findAll("button.switch-tile")).toHaveLength(3);
  });

  it("tap shows the target state with a pending label at once", async () => {
    const pending = deferred();
    const runAction = vi.fn(() => pending.promise);
    const w = mountGrid({ runAction });

    await tile(w, "Lamp A").trigger("click");

    const a = tile(w, "Lamp A");
    expect(a.text()).toContain("Turning on…");
    expect(a.attributes("aria-busy")).toBe("true");
    expect(a.attributes("aria-disabled")).toBe("true");
    expect(a.attributes("aria-pressed")).toBe("true");
    expect(runAction).toHaveBeenCalledWith(ITEMS[0].action);
  });

  it("a pending turn-off reads Turning off…", async () => {
    const w = mountGrid({ runAction: vi.fn(() => deferred().promise) });
    await tile(w, "Lamp B").trigger("click");
    expect(tile(w, "Lamp B").text()).toContain("Turning off…");
  });

  it("second tap while pending is ignored", async () => {
    const runAction = vi.fn(() => deferred().promise);
    const w = mountGrid({ runAction });
    await tile(w, "Lamp A").trigger("click");
    await tile(w, "Lamp A").trigger("click");
    expect(runAction).toHaveBeenCalledTimes(1);
  });

  it("a tap on an unavailable tile does nothing", async () => {
    const runAction = vi.fn(() => deferred().promise);
    const w = mountGrid({ runAction });
    await tile(w, "Plug C").trigger("click");
    expect(runAction).not.toHaveBeenCalled();
  });

  it("settles on the state the response returns", async () => {
    const pending = deferred();
    const w = mountGrid({ runAction: vi.fn(() => pending.promise) });
    await tile(w, "Lamp A").trigger("click");

    // The hub says it is still off: the real state wins over the tap.
    pending.resolve({ item: { ...ITEMS[0], state: "off" } });
    await flushPromises();

    const a = tile(w, "Lamp A");
    expect(a.text()).toContain("Off");
    expect(a.attributes("aria-pressed")).toBe("false");
    expect(a.attributes("aria-busy")).toBeUndefined();
    expect(a.attributes("aria-disabled")).toBeUndefined();
  });

  it("without an item in the answer the tile shows the data, never a guess", async () => {
    // A refetch that brings identical data keeps the same object, so a guessed
    // state would never be corrected: show what the data says instead.
    const pending = deferred();
    const w = mountGrid({ runAction: vi.fn(() => pending.promise) });
    await tile(w, "Lamp A").trigger("click");
    pending.resolve({});
    await flushPromises();
    expect(tile(w, "Lamp A").text()).toContain("Off");
    expect(tile(w, "Lamp A").attributes("aria-busy")).toBeUndefined();
    await w.setProps({
      data: { items: ITEMS.map(i => (i.id === "d1" ? { ...i, state: "on" } : i)) },
    });
    expect(tile(w, "Lamp A").text()).toContain("On");
  });

  it("an answered item for another id is not applied", async () => {
    const pending = deferred();
    const w = mountGrid({ runAction: vi.fn(() => pending.promise) });
    await tile(w, "Lamp A").trigger("click");
    pending.resolve({ item: { id: "d2", state: "on" } });
    await flushPromises();
    expect(tile(w, "Lamp A").text()).toContain("Off");
  });

  it("keeps a pending tile when data changes", async () => {
    const pending = deferred();
    const w = mountGrid({ runAction: vi.fn(() => pending.promise) });
    await tile(w, "Lamp A").trigger("click");

    // A poll lands mid-tap with the old state.
    await w.setProps({ data: { items: ITEMS.map(i => ({ ...i })) } });
    expect(tile(w, "Lamp A").text()).toContain("Turning on…");

    pending.resolve({ item: { ...ITEMS[0], state: "on" } });
    await flushPromises();
    expect(tile(w, "Lamp A").text()).toContain("On");
  });

  it("an identical refetch hands the tile back to the data (settled clears on dataUpdatedAt)", async () => {
    const items = ITEMS.map(i => ({ ...i }));
    const pending = deferred();
    const w = mount(SwitchGrid, {
      props: {
        schema: { kind: "switch-grid", data_path: "$.devices" },
        data: { devices: items },
        dataUpdatedAt: 1,
        runAction: vi.fn(() => pending.promise),
      },
      attachTo: document.body,
    });
    wrapper = w;
    await tile(w, "Lamp A").trigger("click");
    pending.resolve({ item: { id: "d1", state: "on" } });
    await flushPromises();
    expect(tile(w, "Lamp A").text()).toContain("On");

    // The hub still says off: same data object, only the fetch time moves.
    await w.setProps({ dataUpdatedAt: 2 });
    expect(tile(w, "Lamp A").text()).toContain("Off");
  });

  it("a tile whose action was dropped is inert for a second tap", async () => {
    const runAction = vi.fn().mockResolvedValue({});
    const w = mountGrid({ runAction });
    await tile(w, "Lamp A").trigger("click");
    await flushPromises();
    // The cache patch left the answered item without its action.
    await w.setProps({
      data: {
        items: ITEMS.map(i => (i.id === "d1" ? { ...i, state: "on", action: undefined } : i)),
      },
    });
    await tile(w, "Lamp A").trigger("click");
    expect(runAction).toHaveBeenCalledTimes(1);
    expect(tile(w, "Lamp A").attributes("aria-disabled")).toBe("true");
  });

  it("re-announces a repeated note: the live region empties first", async () => {
    vi.useFakeTimers();
    const w = mountGrid({
      runAction: vi.fn(() => Promise.reject(httpError(429, "rate_limited"))),
    });
    await tile(w, "Lamp A").trigger("click");
    await flushPromises();
    const text = note(w).text();
    expect(text).toContain("Too many taps");

    const seen = [];
    const region = note(w).element;
    const observer = new MutationObserver(() => seen.push(region.textContent));
    observer.observe(region, { childList: true, subtree: true, characterData: true });
    await tile(w, "Lamp A").trigger("click");
    await flushPromises();
    await vi.advanceTimersByTimeAsync(0);
    observer.disconnect();
    expect(seen).toContain("");
    expect(note(w).text()).toBe(text);
  });

  it("reverts on any non-2xx and announces the reach note", async () => {
    const pending = deferred();
    const w = mountGrid({ runAction: vi.fn(() => pending.promise) });
    await tile(w, "Lamp A").trigger("click");
    pending.reject(httpError(502, "plugin_action_failed"));
    await flushPromises();

    const a = tile(w, "Lamp A");
    expect(a.text()).toContain("Off");
    expect(a.attributes("aria-pressed")).toBe("false");
    expect(a.attributes("aria-busy")).toBeUndefined();
    const live = note(w);
    expect(live.attributes("aria-live")).toBe("polite");
    expect(live.text()).toBe("Lamp A: Couldn't reach it.");
  });

  it("uses the schema's unreachable_text for the reach note", async () => {
    const w = mountGrid({
      schema: { unreachable_text: "Couldn't reach Homey" },
      runAction: vi.fn(() => Promise.reject(new Error("Network Error"))),
    });
    await tile(w, "Lamp A").trigger("click");
    await flushPromises();
    expect(note(w).text()).toBe("Lamp A: Couldn't reach Homey");
  });

  it("shows the plugin's own error words for plugin_action_failed", async () => {
    const error = new Error("Request failed with status code 502");
    error.response = {
      status: 502,
      data: {
        detail: { code: "plugin_action_failed", message: "Homey refused the API key." },
      },
    };
    const w = mountGrid({ runAction: vi.fn(() => Promise.reject(error)) });
    await tile(w, "Lamp A").trigger("click");
    await flushPromises();
    expect(tile(w, "Lamp A").text()).toContain("Off");
    expect(note(w).text()).toBe("Lamp A: Homey refused the API key.");
  });

  it("falls back to the reach note when plugin_action_failed has no message", async () => {
    const error = new Error("Request failed with status code 502");
    error.response = {
      status: 502,
      data: { detail: { code: "plugin_action_failed", message: "" } },
    };
    const w = mountGrid({ runAction: vi.fn(() => Promise.reject(error)) });
    await tile(w, "Lamp A").trigger("click");
    await flushPromises();
    expect(note(w).text()).toBe("Lamp A: Couldn't reach it.");
  });

  // Every code the action route returns maps to plain words (Part 1 contract).
  it.each([
    [404, "plugin_not_found", "This switch can't be used right now."],
    [409, "plugin_disabled", "This switch can't be used right now."],
    [409, "plugin_stopped", "This switch can't be used right now."],
    [404, "unknown_action", "This switch can't be used right now."],
    [422, "invalid_action_params", "This switch can't be used right now."],
    [422, "invalid_action_body", "This switch can't be used right now."],
    [429, "rate_limited", "Too many taps. Try again in a moment."],
    [429, "action_busy", "Still busy with the last tap. Try again in a moment."],
    [502, "plugin_action_failed", "Couldn't reach it."],
    [504, "plugin_action_timeout", "No answer in time. Try again."],
    [500, "plugin_action_error", "Couldn't reach it."],
    [401, "admin_required", "Couldn't reach it."],
  ])("%i %s reverts and reads %j", async (status, code, words) => {
    const w = mountGrid({ runAction: vi.fn(() => Promise.reject(httpError(status, code))) });
    await tile(w, "Lamp A").trigger("click");
    await flushPromises();
    expect(tile(w, "Lamp A").text()).toContain("Off");
    expect(tile(w, "Lamp A").attributes("aria-disabled")).toBeUndefined();
    expect(note(w).text()).toBe(`Lamp A: ${words}`);
  });

  it("403 plugin_action_refused shows refusal and turns the tile unavailable", async () => {
    const runAction = vi.fn(() => Promise.reject(httpError(403, "plugin_action_refused", {}, "")));
    const w = mountGrid({ runAction });
    await tile(w, "Lamp A").trigger("click");
    await flushPromises();

    const a = tile(w, "Lamp A");
    expect(a.attributes("aria-disabled")).toBe("true");
    expect(a.attributes("aria-pressed")).toBeUndefined();
    expect(a.text()).toContain("Can't be switched from here");
    expect(note(w).text()).toBe("Lamp A: Can't be switched from here");

    await a.trigger("click");
    expect(runAction).toHaveBeenCalledTimes(1);

    // New data decides again.
    await w.setProps({ data: { items: ITEMS.map(i => ({ ...i })) } });
    expect(tile(w, "Lamp A").attributes("aria-disabled")).toBeUndefined();
    expect(tile(w, "Lamp A").text()).toContain("Off");
  });

  it("403 plugin_action_refused shows the plugin's own words when it sends one", async () => {
    const error = new Error("Request failed with status code 403");
    error.response = {
      status: 403,
      data: {
        detail: { code: "plugin_action_refused", message: "Homey refused the API key." },
      },
    };
    const w = mountGrid({ runAction: vi.fn(() => Promise.reject(error)) });
    await tile(w, "Lamp A").trigger("click");
    await flushPromises();

    const a = tile(w, "Lamp A");
    expect(a.attributes("aria-disabled")).toBe("true");
    expect(a.text()).toContain("Can't be switched from here");
    expect(note(w).text()).toBe("Lamp A: Homey refused the API key.");
  });

  it("a 403 without the refusal code is a reach failure", async () => {
    const w = mountGrid({ runAction: vi.fn(() => Promise.reject(httpError(403, "csrf"))) });
    await tile(w, "Lamp A").trigger("click");
    await flushPromises();
    expect(tile(w, "Lamp A").attributes("aria-disabled")).toBeUndefined();
    expect(note(w).text()).toBe("Lamp A: Couldn't reach it.");
  });

  it("a failed tap can be retried and a success clears the note", async () => {
    const runAction = vi
      .fn()
      .mockRejectedValueOnce(httpError(429, "rate_limited"))
      .mockResolvedValueOnce({ item: { ...ITEMS[0], state: "on" } });
    const w = mountGrid({ runAction });
    await tile(w, "Lamp A").trigger("click");
    await flushPromises();
    expect(note(w).text()).not.toBe("");

    await tile(w, "Lamp A").trigger("click");
    await flushPromises();
    expect(runAction).toHaveBeenCalledTimes(2);
    expect(tile(w, "Lamp A").text()).toContain("On");
    expect(note(w).text()).toBe("");
  });

  it("the note clears after 6 seconds", async () => {
    vi.useFakeTimers();
    const w = mountGrid({ runAction: vi.fn(() => Promise.reject(httpError(502, "x"))) });
    await tile(w, "Lamp A").trigger("click");
    await flushPromises();
    expect(note(w).text()).not.toBe("");
    vi.advanceTimersByTime(6000);
    await flushPromises();
    expect(note(w).text()).toBe("");
  });

  it("without runAction a tap reverts with the reach note", async () => {
    const w = mountGrid();
    await tile(w, "Lamp A").trigger("click");
    await flushPromises();
    expect(tile(w, "Lamp A").text()).toContain("Off");
    expect(note(w).text()).toBe("Lamp A: Couldn't reach it.");
  });

  it("focus stays on the tapped tile through pending and settle", async () => {
    const pending = deferred();
    const w = mountGrid({ runAction: vi.fn(() => pending.promise) });
    const a = tile(w, "Lamp A");
    a.element.focus();
    await a.trigger("click");
    expect(document.activeElement).toBe(a.element);
    pending.resolve({ item: { ...ITEMS[0], state: "on" } });
    await flushPromises();
    expect(document.activeElement).toBe(tile(w, "Lamp A").element);
  });

  it("focus stays on a tile that a refusal turns unavailable", async () => {
    const w = mountGrid({
      runAction: vi.fn(() => Promise.reject(httpError(403, "plugin_action_refused"))),
    });
    const a = tile(w, "Lamp A");
    a.element.focus();
    await a.trigger("click");
    await flushPromises();
    expect(document.activeElement).toBe(tile(w, "Lamp A").element);
  });

  it("empty items render EmptyState with schema.empty_text", () => {
    const w = mountGrid({ items: [], schema: { empty_text: "No switches chosen." } });
    expect(w.findAll("button.switch-tile")).toHaveLength(0);
    expect(w.text()).toContain("No switches chosen.");
  });

  it("drops items without an id or label", () => {
    const w = mountGrid({ items: [{ state: "on" }, null, "x", ITEMS[0]] });
    expect(w.findAll("button.switch-tile")).toHaveLength(1);
  });
});
