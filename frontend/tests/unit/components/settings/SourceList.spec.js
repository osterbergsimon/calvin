import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import SourceList from "@/components/settings/specialized/SourceList.vue";

const row = (over = {}) => ({
  id: "immich-1",
  providerId: "immich",
  providerName: "Immich",
  name: "Family albums",
  summary: "2 albums",
  enabled: true,
  running: true,
  error: null,
  ...over,
});

const mountList = (props = {}) =>
  mount(SourceList, {
    props: { rows: [row()], ...props },
    // The ⋯ menu lives in a teleported Popover; render it in place.
    global: { stubs: { draggable: false, teleport: true } },
  });

describe("SourceList", () => {
  it("shows the name and a provider · summary line", () => {
    const w = mountList();
    const item = w.find(".sl-row");
    expect(item.find(".sl-name").text()).toBe("Family albums");
    expect(item.find(".sl-provider").text()).toBe("Immich · 2 albums");
  });

  it("shows a running dot and omits it when the source has no run flag", () => {
    expect(mountList().find(".sl-dot--on").exists()).toBe(true);
    const unknown = mountList({ rows: [row({ running: undefined })] });
    expect(unknown.find(".sl-dot").exists()).toBe(false);
  });

  it("titles the dot Working or Off, like the other source lists (CLV-63)", () => {
    expect(mountList().find(".sl-dot--on").attributes("title")).toBe("Working");
    const off = mountList({ rows: [row({ running: false })] });
    expect(off.find(".sl-dot--off").attributes("title")).toBe("Off");
    // A plugin error still wins: it is the useful thing to show.
    const broken = mountList({ rows: [row({ error: "Couldn't sign in." })] });
    expect(broken.find(".sl-dot--err").attributes("title")).toBe("Couldn't sign in.");
  });

  it("shows the plugin error in place of the summary", () => {
    const w = mountList({ rows: [row({ error: "Couldn't sign in. Check the API key." })] });
    expect(w.find(".sl-dot--err").exists()).toBe(true);
    expect(w.find(".sl-provider").text()).toBe("Couldn't sign in. Check the API key.");
  });

  it("offers a toggle, Edit and a ⋯ Remove on every row", async () => {
    const w = mountList();
    const item = w.find(".sl-row");
    expect(item.findComponent({ name: "ToggleSwitch" }).exists()).toBe(true);
    const edit = item.findAll("button").find(b => b.text() === "Edit");
    expect(edit).toBeTruthy();
    await edit.trigger("click");
    expect(w.emitted("edit")?.[0][0].id).toBe("immich-1");

    const more = item.find('button[aria-label="More actions for Family albums"]');
    expect(more.attributes("aria-haspopup")).toBe("menu");
    await more.trigger("click");
    const menu = w.find('[role="menu"]');
    expect(menu.exists()).toBe(true);
    await menu.findAll('[role="menuitem"]')[0].trigger("click");
    const confirm = w.findComponent({ name: "ConfirmModal" });
    expect(confirm.props("show")).toBe(true);
    confirm.vm.$emit("confirm");
    expect(w.emitted("remove")?.[0][0].id).toBe("immich-1");
  });

  it("only offers a drag handle when the section orders its sources", () => {
    expect(mountList().find(".sl-grip").exists()).toBe(false);
    expect(mountList({ drag: true }).find(".sl-grip").exists()).toBe(true);
  });

  it("shows the empty copy plus the Add button, which emits add", async () => {
    const w = mountList({
      rows: [],
      addLabel: "Add photos from…",
      emptyText: "No photo sources yet.",
    });
    expect(w.find(".sl-empty").text()).toBe("No photo sources yet.");
    const add = w.find(".sl-add-row button");
    expect(add.text()).toBe("Add photos from…");
    // The only button in an empty list is the primary one (§4.6).
    expect(add.classes()).toContain("btn--primary");
    await add.trigger("click");
    expect(w.emitted("add")?.length).toBe(1);
  });

  it("highlights a provider's rows when arriving from a Used by link", async () => {
    const w = mountList({
      rows: [row(), row({ id: "other", providerId: "mealie", providerName: "Mealie" })],
      highlightProvider: "immich",
    });
    // The pulse is a class on the matching row only.
    expect(w.findAll(".sl-row")[0].classes()).toContain("sl-row--focus");
    expect(w.findAll(".sl-row")[1].classes()).not.toContain("sl-row--focus");
  });
});
