/**
 * Unit tests for OrderingManager — focus on the instance sub-list gating and
 * per-plugin drag isolation (calvin-5io follow-up).
 */
import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import { defineComponent, h } from "vue";
import OrderingManager from "@/components/settings/specialized/OrderingManager.vue";

// Stub vuedraggable: render the #item slot once per model-value element and
// expose the group name as a data attribute so we can assert drag isolation
// without pulling in SortableJS/jsdom drag mechanics.
const DraggableStub = defineComponent({
  name: "DraggableStub",
  props: {
    modelValue: { type: Array, default: () => [] },
    group: { type: String, default: "" },
  },
  setup(props, { slots }) {
    return () =>
      h(
        "div",
        { class: "draggable-stub", "data-group": props.group },
        (props.modelValue || []).map((element, index) => slots.item?.({ element, index }))
      );
  },
});

const mountManager = (plugins, pluginInstances) =>
  mount(OrderingManager, {
    props: { type: "image", plugins, pluginInstances },
    global: { stubs: { draggable: DraggableStub } },
  });

describe("OrderingManager instance gating", () => {
  const multi = { id: "gallery", name: "Gallery", supports_multiple_instances: true };
  const single = { id: "picsum", name: "Picsum", supports_multiple_instances: false };

  it("renders an instance sub-list for a multi-instance plugin", () => {
    const w = mountManager([multi], {
      gallery: [
        { id: "a", name: "A" },
        { id: "b", name: "B" },
      ],
    });
    expect(w.find(".plugin-instances-tree").exists()).toBe(true);
    expect(w.findAll(".instance-tree-item")).toHaveLength(2);
    expect(w.find(".instance-count-badge").text()).toContain("2");
  });

  it("omits the sub-list and count badge for a single-instance plugin", () => {
    const w = mountManager([single], { picsum: [{ id: "picsum-instance", name: "Picsum" }] });
    expect(w.find(".plugin-tree-item").exists()).toBe(true); // still a draggable plugin card
    expect(w.find(".plugin-instances-tree").exists()).toBe(false);
    expect(w.find(".no-instances-message").exists()).toBe(false);
    expect(w.find(".instance-count-badge").exists()).toBe(false);
  });

  it("gives each plugin's instance list its own drag group (no cross-plugin drops)", () => {
    const w = mountManager(
      [multi, { id: "widgets", name: "Widgets", supports_multiple_instances: true }],
      { gallery: [{ id: "a", name: "A" }], widgets: [{ id: "c", name: "C" }] }
    );
    const groups = w
      .findAll(".plugin-instances-tree .draggable-stub")
      .map(d => d.attributes("data-group"));
    expect(groups).toEqual(["image-instances-gallery", "image-instances-widgets"]);
    // distinct group names → SortableJS won't accept cross-plugin puts
    expect(new Set(groups).size).toBe(groups.length);
  });
});
