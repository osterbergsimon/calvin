import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { mount } from "@vue/test-utils";
import ScopeLine from "@/components/ui/ScopeLine.vue";
import Button from "@/components/ui/Button.vue";

const SOURCE = readFileSync(
  resolve(__dirname, "../../../../src/components/ui/ScopeLine.vue"),
  "utf-8"
);
const STYLE = SOURCE.slice(SOURCE.indexOf("<style"), SOURCE.indexOf("</style>"));

describe("ScopeLine", () => {
  it("says a row inherits from Default", () => {
    const w = mount(ScopeLine);
    expect(w.text()).toContain("Same as Default");
    expect(w.findComponent(Button).exists()).toBe(false);
  });

  it("says a row is overridden here and offers a way back", async () => {
    const w = mount(ScopeLine, { props: { overridden: true } });
    expect(w.text()).toContain("Changed here");
    const reset = w.findComponent(Button);
    expect(reset.text()).toBe("Reset to default");
    expect(reset.props("variant")).toBe("link");
    await reset.trigger("click");
    expect(w.emitted("reset")).toHaveLength(1);
  });

  it("lets a caller pin the reset button's test id", () => {
    const w = mount(ScopeLine, { props: { overridden: true, resetTest: "reset-region-clock" } });
    expect(w.find("[data-test='reset-region-clock']").exists()).toBe(true);
  });

  it("uses the meta type role and no primitive scale", () => {
    expect(STYLE).toMatch(/font-size:\s*var\(--text-meta\)/);
    expect(STYLE).not.toMatch(/var\(--fs-/);
    expect(STYLE).not.toMatch(/var\(--space-/);
    expect(STYLE).not.toMatch(/var\(--radius-(xs|sm|md|lg|xl|2xl)\)/);
  });
});
