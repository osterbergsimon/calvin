import { describe, it, expect, vi, beforeEach } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import UpdatesTab from "@/components/settings/tabs/system/UpdatesTab.vue";

vi.mock("@/composables", () => ({
  useSystem: () => ({
    updating: false,
    updateStatus: null,
    updateMessage: "",
    updateMessageClass: "",
    triggerUpdate: vi.fn(),
  }),
}));

vi.mock("@/services/configApi", () => ({
  getGitBranches: vi.fn(() =>
    Promise.resolve({ branches: ["main", "develop", "release"] }),
  ),
}));

describe("UpdatesTab", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does not save repo URL on every keystroke", async () => {
    const wrapper = mount(UpdatesTab, {
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
    const wrapper = mount(UpdatesTab, {
      props: {
        gitRepoUrl: "https://github.com/example/calvin.git",
        gitBranch: "main",
      },
    });

    const repoInput = wrapper.find('input[type="text"]');
    await repoInput.setValue("https://github.com/example/other.git");
    await repoInput.trigger("change");

    expect(wrapper.emitted("update:gitRepoUrl")).toEqual([
      ["https://github.com/example/other.git"],
    ]);
  });

  it("emits selected branch value", async () => {
    const wrapper = mount(UpdatesTab, {
      props: {
        gitRepoUrl: "https://github.com/example/calvin.git",
        gitBranch: "main",
      },
    });

    await flushPromises();

    const branchSelect = wrapper.find("select");
    await branchSelect.setValue("develop");

    expect(wrapper.emitted("update:gitBranch")).toEqual([["develop"]]);
  });
});
