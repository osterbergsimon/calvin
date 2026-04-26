/** Tests for the schema-driven StatusTile renderer. */

import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import StatusTile from "@/components/plugins/renderers/StatusTile.vue";

const sampleData = {
  current: {
    icon: "🌤",
    label: "Weather",
    temperature: 12.456,
    units: { temperature: "°C" },
    status: "ok",
  },
};

describe("StatusTile", () => {
  it("renders icon, value, and unit from paths", () => {
    const wrapper = mount(StatusTile, {
      props: {
        schema: {
          kind: "status-tile",
          data_path: "$.current",
          icon_path: "$.icon",
          value_path: "$.temperature",
          value_format: "round-1",
          unit_path: "$.units.temperature",
        },
        data: sampleData,
      },
    });
    expect(wrapper.text()).toContain("🌤");
    expect(wrapper.text()).toContain("12.5");
    expect(wrapper.text()).toContain("°C");
  });

  it("supports literal icon/label/value as fallback when no path provided", () => {
    const wrapper = mount(StatusTile, {
      props: {
        schema: {
          kind: "status-tile",
          icon: "⚡",
          label: "Power",
          value: "120",
          unit: "W",
        },
        data: null,
      },
    });
    expect(wrapper.text()).toContain("⚡");
    expect(wrapper.text()).toContain("Power");
    expect(wrapper.text()).toContain("120");
    expect(wrapper.text()).toContain("W");
  });

  it("applies status class from path", () => {
    const wrapper = mount(StatusTile, {
      props: {
        schema: { kind: "status-tile", data_path: "$.current", status_path: "$.status" },
        data: sampleData,
      },
    });
    expect(wrapper.classes()).toContain("status-tile--ok");
  });

  it("renders nothing visible when data is missing and no literals", () => {
    const wrapper = mount(StatusTile, {
      props: {
        schema: { kind: "status-tile", value_path: "$.missing" },
        data: null,
      },
    });
    expect(wrapper.find(".status-tile__value").exists()).toBe(false);
  });
});
