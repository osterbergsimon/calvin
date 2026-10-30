import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import PluginCard from "@/components/settings/specialized/PluginCard.vue";
import InstanceModal from "@/components/settings/specialized/InstanceModal.vue";
import SourceList from "@/components/settings/specialized/SourceList.vue";

setActivePinia(createPinia());

const STUBS = {
  PluginFieldRenderer: true,
  PluginActions: true,
  PluginSections: true,
  PluginInstances: true,
  IconButton: true,
};

const service = (over = {}) => ({
  id: "mealie",
  name: "Mealie",
  type: "service",
  enabled: true,
  _installed: true,
  ...over,
});

const mountCard = (plugin, instances = []) =>
  mount(PluginCard, { props: { plugin, instances }, global: { stubs: STUBS } });

describe("Settings words: plain kind chips", () => {
  it.each([
    ["calendar", "Calendar"],
    ["image", "Photos"],
    ["service", "Web page & app"],
    ["backend", "Background"],
    ["theme", "Theme"],
  ])("labels a %s plugin as %s", (type, label) => {
    const w = mountCard(service({ type }));
    expect(w.find(".pc-badge").text()).toBe(label);
  });

  it("calls a clock-bar-only service plugin 'Clock bar'", () => {
    const w = mountCard(service({ display_schema: null, statusbar_schema: { kind: "status" } }));
    expect(w.find(".pc-badge").text()).toBe("Clock bar");
  });

  it("never shows the raw type or the word statusbar", () => {
    const w = mountCard(service({ statusbar_schema: { kind: "status" } }));
    expect(w.text().toLowerCase()).not.toContain("statusbar");
    expect(w.find(".pc-badge").text()).not.toBe("service");
  });
});

describe("Settings words: a source, not an instance", () => {
  it("invites a first source on an empty service card", () => {
    const w = mountCard(service());
    expect(w.find(".pc-summary").text().replace(/\s+/g, " ").trim()).toBe(
      "Not used yet · Add a source"
    );
  });

  it("counts sources on a card with providers", () => {
    const w = mountCard(service(), [
      { id: "a", running: true },
      { id: "b", running: true },
    ]);
    expect(w.find(".pc-summary").text()).toBe("Used by 2 sources");
  });

  it("uses plain words throughout a plugin card", () => {
    const w = mountCard(service({ instance_config_schema: { url: { type: "string" } } }));
    expect(w.text()).not.toMatch(/instance/i);
  });
});

describe("Settings words: the source modal", () => {
  const mountModal = plugin =>
    mount(InstanceModal, {
      props: { show: true, plugin, instance: null },
      global: { stubs: STUBS },
    });

  it("labels the name field 'Name' with a plain placeholder", () => {
    const w = mountModal(service({ instance_config_schema: { url: { type: "string" } } }));
    expect(w.find(".form-group label").text()).toBe("Name");
    expect(w.find('input[type="text"]').attributes("placeholder")).toBe("e.g. Family photos");
  });

  it("titles the add form with the plugin's own label", () => {
    const w = mountModal(
      service({
        instance_config_schema: { url: { type: "string" } },
        instance_label: "Recipe list",
      })
    );
    expect(w.find(".modal-header h3").text()).toBe("Add Recipe list");
    expect(w.find('input[type="text"]').attributes("placeholder")).toBe("e.g. Recipe list");
  });

  it("never says instance", () => {
    const w = mountModal(service({ instance_config_schema: { url: { type: "string" } } }));
    expect(w.text()).not.toMatch(/instance/i);
  });
});

describe("Settings words: Content source lists", () => {
  it("never says instance or a raw plugin type on a row", () => {
    const w = mount(SourceList, {
      props: {
        rows: [
          {
            id: "a",
            providerId: "immich",
            providerName: "Immich",
            name: "Family albums",
            summary: "2 albums",
            enabled: true,
            running: true,
          },
        ],
      },
    });
    expect(w.text()).not.toMatch(/instance/i);
    expect(w.text()).not.toMatch(/\bimage\b/i);
  });
});
