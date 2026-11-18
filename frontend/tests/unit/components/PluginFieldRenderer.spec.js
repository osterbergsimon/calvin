import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import PluginFieldRenderer from "@/components/PluginFieldRenderer.vue";

vi.mock("@/services/pluginsApi", () => ({
  scanWithConfig: vi.fn(),
}));

import { scanWithConfig } from "@/services/pluginsApi";

describe("PluginFieldRenderer number field", () => {
  it("applies min/max from ui.validation to the number input", () => {
    // Canonical contract-1.0 shape: numeric bounds live under ui.validation.
    const wrapper = mount(PluginFieldRenderer, {
      props: {
        pluginId: "yr_weather",
        fieldKey: "latitude",
        schema: {
          type: "number",
          ui: { component: "number", validation: { min: -90, max: 90 } },
        },
        value: 0,
      },
    });

    const input = wrapper.find('input[type="number"]');
    expect(input.exists()).toBe(true);
    expect(input.attributes("min")).toBe("-90");
    expect(input.attributes("max")).toBe("90");
  });

  const mountNumber = schema =>
    mount(PluginFieldRenderer, {
      props: { pluginId: "p", fieldKey: "f", schema, value: 0 },
    }).find('input[type="number"]');

  it('allows decimals for type "number" via step="any"', () => {
    // Without an explicit step the browser defaults to step=1, which rejects
    // decimal values (e.g. geographic coordinates) as a stepMismatch on submit.
    const input = mountNumber({ type: "number", ui: { component: "number" } });
    expect(input.attributes("step")).toBe("any");
  });

  it('keeps whole-number stepping for type "integer"', () => {
    const input = mountNumber({ type: "integer", ui: { component: "number" } });
    expect(input.attributes("step")).toBe("1");
  });

  it("lets an explicit ui.step override the type-derived default", () => {
    const input = mountNumber({ type: "number", ui: { component: "number", step: "0.0001" } });
    expect(input.attributes("step")).toBe("0.0001");
  });
});

describe("PluginFieldRenderer multi-select-scan field", () => {
  const SCHEMA = {
    type: "string",
    label: "Devices",
    ui: { component: "multi-select-scan" },
  };
  const FORM = { host: "http://h.example", api_key: "" };

  beforeEach(() => vi.clearAllMocks());

  const mountField = (value = "", extra = {}) =>
    mount(PluginFieldRenderer, {
      props: {
        pluginId: "homey",
        fieldKey: "devices",
        schema: SCHEMA,
        value,
        formConfig: FORM,
        instanceId: "inst-1",
        ...extra,
      },
    });

  const chips = wrapper => wrapper.findAll(".chip");
  const scanButton = wrapper => wrapper.findAll("button").find(b => /Scan/.test(b.text()));
  const lastEmit = wrapper => wrapper.emitted("update")?.at(-1)?.[0];

  it("multi-select-scan shows saved ids before scanning", () => {
    const wrapper = mountField("id-1, id-2,,");
    expect(chips(wrapper).map(c => c.text())).toEqual(["id-1", "id-2"]);
    expect(chips(wrapper).map(c => c.attributes("aria-pressed"))).toEqual(["true", "true"]);
    expect(wrapper.find('[role="group"]').attributes("aria-label")).toBe("Devices");
  });

  it("scan posts the form config and instance id", async () => {
    scanWithConfig.mockResolvedValue({ options: [] });
    const wrapper = mountField();
    await scanButton(wrapper).trigger("click");
    expect(scanWithConfig).toHaveBeenCalledWith("homey", "devices", FORM, "inst-1");
  });

  it("password values from the form are passed blank-or-typed, never re-read from has_value", async () => {
    scanWithConfig.mockResolvedValue({ options: [] });
    const typed = { host: "http://h.example", api_key: "typed-key" };
    const wrapper = mountField("", { formConfig: typed, instanceId: undefined });
    await scanButton(wrapper).trigger("click");
    expect(scanWithConfig).toHaveBeenCalledWith("homey", "devices", typed, undefined);
  });

  it("shows Scanning… while the scan runs", async () => {
    let resolve;
    scanWithConfig.mockReturnValue(new Promise(r => (resolve = r)));
    const wrapper = mountField();
    await scanButton(wrapper).trigger("click");
    expect(scanButton(wrapper).text()).toBe("Scanning…");
    resolve({ options: [] });
    await flushPromises();
    expect(scanButton(wrapper).text()).toBe("Scan");
  });

  it("selecting chips emits a comma-joined string", async () => {
    scanWithConfig.mockResolvedValue({
      options: [
        { value: "a", label: "Lamp A (Kitchen)" },
        { value: "b", label: "Lamp B (Hall)" },
      ],
    });
    const wrapper = mountField();
    await scanButton(wrapper).trigger("click");
    await flushPromises();
    expect(chips(wrapper).map(c => c.text())).toEqual(["Lamp A (Kitchen)", "Lamp B (Hall)"]);

    await chips(wrapper)[0].trigger("click");
    expect(lastEmit(wrapper)).toBe("a");
    await wrapper.setProps({ value: "a" });
    await chips(wrapper)[1].trigger("click");
    expect(lastEmit(wrapper)).toBe("a,b");
    await wrapper.setProps({ value: "a,b" });
    await chips(wrapper)[0].trigger("click");
    expect(lastEmit(wrapper)).toBe("b");
  });

  it("keeps saved ids a scan did not find, labelled with the id", async () => {
    scanWithConfig.mockResolvedValue({ options: [{ value: "a", label: "Lamp A" }] });
    const wrapper = mountField("gone-1,a");
    await scanButton(wrapper).trigger("click");
    await flushPromises();
    expect(chips(wrapper).map(c => c.text())).toEqual(["Lamp A", "gone-1"]);
    expect(chips(wrapper).map(c => c.attributes("aria-pressed"))).toEqual(["true", "true"]);
  });

  it("scan error shows an InlineNote and keeps the selection", async () => {
    scanWithConfig.mockRejectedValue(new Error("Network Error"));
    const wrapper = mountField("id-1");
    await scanButton(wrapper).trigger("click");
    await flushPromises();
    expect(wrapper.find(".inline-note").text()).toBe(
      "Couldn't scan. Check the settings above, then try again."
    );
    expect(chips(wrapper).map(c => c.text())).toEqual(["id-1"]);
    expect(wrapper.emitted("update")).toBeUndefined();
  });

  it("shows the plugin's own error words when the scan answers one", async () => {
    scanWithConfig.mockResolvedValue({ options: [], error: "Couldn't reach the hub." });
    const wrapper = mountField();
    await scanButton(wrapper).trigger("click");
    await flushPromises();
    expect(wrapper.find(".inline-note").text()).toBe("Couldn't reach the hub.");
  });

  it("an empty scan says nothing was found", async () => {
    scanWithConfig.mockResolvedValue({ options: [] });
    const wrapper = mountField();
    await scanButton(wrapper).trigger("click");
    await flushPromises();
    expect(wrapper.find(".inline-note").text()).toBe("Nothing found to choose from.");
  });

  it("a 400 asks to type the key again", async () => {
    scanWithConfig.mockRejectedValue(Object.assign(new Error("x"), { response: { status: 400 } }));
    const wrapper = mountField();
    await scanButton(wrapper).trigger("click");
    await flushPromises();
    expect(wrapper.find(".inline-note").text()).toBe(
      "Type the key again before scanning: the saved one isn't reused here."
    );
  });

  it("keeps Scan focusable while scanning: aria-disabled, no native disabled, one scan", async () => {
    let resolve;
    scanWithConfig.mockReturnValue(new Promise(r => (resolve = r)));
    const wrapper = mountField();
    await scanButton(wrapper).trigger("click");
    const button = scanButton(wrapper);
    expect(button.attributes("aria-disabled")).toBe("true");
    expect(button.attributes("aria-busy")).toBe("true");
    expect(button.attributes("disabled")).toBeUndefined();
    await button.trigger("click");
    expect(scanWithConfig).toHaveBeenCalledTimes(1);
    resolve({ options: [] });
    await flushPromises();
    expect(scanButton(wrapper).attributes("aria-disabled")).toBeUndefined();
  });

  it("keeps the note in an always-rendered status region", async () => {
    scanWithConfig.mockResolvedValue({ options: [] });
    const wrapper = mountField();
    const region = wrapper.find('[role="status"]');
    expect(region.exists()).toBe(true);
    expect(region.text()).toBe("");
    await scanButton(wrapper).trigger("click");
    await flushPromises();
    expect(wrapper.find('[role="status"]').element).toBe(region.element);
    expect(region.text()).toBe("Nothing found to choose from.");
  });

  it("re-announces an identical note: the region empties before it is set again", async () => {
    scanWithConfig.mockResolvedValue({ options: [] });
    const wrapper = mountField();
    await scanButton(wrapper).trigger("click");
    await flushPromises();
    const region = wrapper.find('[role="status"]');
    expect(region.text()).toBe("Nothing found to choose from.");

    const seen = [];
    const observer = new MutationObserver(() => seen.push(region.element.textContent));
    observer.observe(region.element, { childList: true, subtree: true, characterData: true });
    await scanButton(wrapper).trigger("click");
    await flushPromises();
    await new Promise(r => setTimeout(r, 0));
    observer.disconnect();
    expect(seen).toContain("");
    expect(region.text()).toBe("Nothing found to choose from.");
  });
});
