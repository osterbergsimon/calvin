import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { mount } from "@vue/test-utils";
import { mdiCalendar } from "@mdi/js";
import ListRow from "@/components/ui/ListRow.vue";

const SOURCE = readFileSync(
  resolve(__dirname, "../../../../src/components/ui/ListRow.vue"),
  "utf-8"
);
const STYLE = SOURCE.slice(SOURCE.indexOf("<style"), SOURCE.indexOf("</style>"));

describe("ListRow", () => {
  it("renders lead · body · actions", () => {
    const w = mount(ListRow, {
      props: {
        name: "Family calendar",
        meta: ["CalDAV · 12 events", "Synced just now"],
        lead: mdiCalendar,
      },
      slots: { actions: '<button type="button">Edit</button>' },
    });
    expect(w.classes()).toContain("list-row");
    expect(w.find(".list-row__lead svg path").attributes("d")).toBe(mdiCalendar);
    expect(w.find(".list-row__name").text()).toBe("Family calendar");
    expect(w.findAll(".list-row__meta").map(node => node.text())).toEqual([
      "CalDAV · 12 events",
      "Synced just now",
    ]);
    expect(w.find(".list-row__actions button").text()).toBe("Edit");
  });

  it("accepts meta lines with a tone", () => {
    const w = mount(ListRow, {
      props: {
        name: "Photos",
        meta: [{ text: "Synced" }, { text: "Last sync failed", tone: "err" }],
      },
    });
    const lines = w.findAll(".list-row__meta");
    expect(lines[1].classes()).toContain("list-row__meta--err");
  });

  it("omits the lead and actions when nothing is given", () => {
    const w = mount(ListRow, { props: { name: "Keyboard shortcut" } });
    expect(w.find(".list-row__lead").exists()).toBe(false);
    expect(w.find(".list-row__actions").exists()).toBe(false);
  });

  it("accepts a custom lead (a dot or a thumbnail)", () => {
    const w = mount(ListRow, {
      props: { name: "Screens" },
      slots: { lead: '<span class="dot" />' },
    });
    expect(w.find(".list-row__lead .dot").exists()).toBe(true);
  });

  it("marks the selected and disabled states", () => {
    const selected = mount(ListRow, { props: { name: "Selected", selected: true } });
    expect(selected.classes()).toContain("list-row--selected");
    expect(selected.attributes("aria-current")).toBe("true");

    const disabled = mount(ListRow, { props: { name: "Disabled", disabled: true } });
    expect(disabled.classes()).toContain("list-row--disabled");
    expect(disabled.attributes("aria-disabled")).toBe("true");
  });

  it("uses the card radius, label type and a single action group", () => {
    expect(STYLE).not.toMatch(/var\(--radius-(xs|sm|md|lg|xl|2xl)\)/);
    expect(STYLE).toMatch(/border-radius:\s*var\(--radius-card\)/);
    expect(STYLE).toMatch(/font-size:\s*var\(--text-label\)/);
    expect(STYLE).toMatch(/\.list-row__actions\s*\{[^}]*flex-wrap:\s*nowrap/s);
    expect(STYLE).toMatch(/@media \(--bp-phone\)[\s\S]*\.list-row__actions\s*\{[^}]*width:\s*100%/);
  });
});
