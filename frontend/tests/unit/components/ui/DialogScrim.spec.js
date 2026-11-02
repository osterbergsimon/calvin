import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import DialogScrim from "@/components/ui/DialogScrim.vue";

describe("DialogScrim", () => {
  it("emits dismiss on click", async () => {
    const w = mount(DialogScrim);
    await w.find(".dialog-scrim").trigger("click");
    expect(w.emitted("dismiss")).toHaveLength(1);
  });

  it("applies the blur class only when blur=true", () => {
    const plain = mount(DialogScrim);
    expect(plain.find(".dialog-scrim").classes()).not.toContain("is-blurred");
    const blurred = mount(DialogScrim, { props: { blur: true } });
    expect(blurred.find(".dialog-scrim").classes()).toContain("is-blurred");
  });
});
