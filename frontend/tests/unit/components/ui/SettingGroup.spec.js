import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { mount } from "@vue/test-utils";
import SettingGroup from "@/components/ui/SettingGroup.vue";

const SOURCE = readFileSync(
  resolve(__dirname, "../../../../src/components/ui/SettingGroup.vue"),
  "utf-8"
);
const STYLE = SOURCE.slice(SOURCE.indexOf("<style"), SOURCE.indexOf("</style>"));

describe("SettingGroup", () => {
  it("renders a sentence-case sub-heading and its rows", () => {
    const w = mount(SettingGroup, {
      props: { title: "Notifications" },
      slots: { default: '<div class="row">Email me</div>' },
    });
    const heading = w.find("h3");
    expect(heading.text()).toBe("Notifications");
    expect(w.find(".row").text()).toBe("Email me");
  });

  it("uses the label type role, not an eyebrow", () => {
    expect(STYLE).toMatch(/font-size:\s*var\(--text-label\)/);
    expect(STYLE).not.toMatch(/text-transform:\s*uppercase/);
    expect(STYLE).not.toMatch(/letter-spacing/);
  });

  it("insets its heading with the panel padding tokens", () => {
    expect(STYLE).toMatch(/var\(--panel-pad-x\)/);
    expect(STYLE).toMatch(/var\(--panel-pad-y\)/);
    expect(STYLE).not.toMatch(/var\(--fs-/);
    expect(STYLE).not.toMatch(/var\(--space-/);
    expect(STYLE).not.toMatch(/var\(--radius-(xs|sm|md|lg|xl|2xl)\)/);
  });
});
