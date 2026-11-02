import { describe, it, expect, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import UpdateSourceRows from "@/components/settings/tabs/system/UpdateSourceRows.vue";

vi.mock("@/services/configApi", () => ({
  getGitBranches: vi.fn(() => Promise.resolve({ branches: ["main", "develop", "release"] })),
}));

// The update source rows moved into System › Advanced (settings copy audit §4);
// they keep the same save-on-change behaviour there.
describe("UpdateSourceRows", () => {
  it("does not save repo URL on every keystroke", async () => {
    const wrapper = mount(UpdateSourceRows, {
      props: {
        gitRepoUrl: "https://github.com/example/calvin.git",
        gitBranch: "main",
      },
    });

    const repoInput = wrapper.find('input[type="text"]');
    repoInput.element.value = "https://github.com/example/other.git";
    await repoInput.trigger("input");

    expect(wrapper.emitted("update:gitRepoUrl")).toBeUndefined();
  });

  it("saves repo URL on change", async () => {
    const wrapper = mount(UpdateSourceRows, {
      props: {
        gitRepoUrl: "https://github.com/example/calvin.git",
        gitBranch: "main",
      },
    });

    const repoInput = wrapper.find('input[type="text"]');
    await repoInput.setValue("https://github.com/example/other.git");
    await repoInput.trigger("blur");

    expect(wrapper.emitted("update:gitRepoUrl")).toEqual([
      ["https://github.com/example/other.git"],
    ]);
  });

  it("emits selected branch value", async () => {
    const wrapper = mount(UpdateSourceRows, {
      props: {
        gitRepoUrl: "https://github.com/example/calvin.git",
        gitBranch: "main",
      },
      attachTo: document.body,
    });

    await flushPromises();

    await wrapper.get('[data-test="release-channel"] .pill').trigger("click");
    await flushPromises();
    const option = [...document.body.querySelectorAll(".pill__opt")].find(
      el => el.textContent.trim() === "develop"
    );
    option.click();
    await flushPromises();

    expect(wrapper.emitted("update:gitBranch")).toEqual([["develop"]]);
    wrapper.unmount();
  });
});
