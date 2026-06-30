import { describe, it, expect, vi, beforeEach } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import UpdatesTab from "@/components/settings/tabs/system/UpdatesTab.vue";

const systemMock = vi.hoisted(() => ({
  updating: { value: false, __v_isRef: true },
  updateStatus: { value: null, __v_isRef: true },
  updateStatusLoading: { value: false, __v_isRef: true },
  updateStatusCheckedAt: { value: null, __v_isRef: true },
  updateMessage: { value: "", __v_isRef: true },
  updateMessageClass: { value: "", __v_isRef: true },
  backendHealth: { value: null, __v_isRef: true },
  backendHealthLoading: { value: false, __v_isRef: true },
  backendHealthCheckedAt: { value: null, __v_isRef: true },
  triggerUpdate: vi.fn(),
  getUpdateStatus: vi.fn(() => Promise.resolve({ status: "unknown" })),
  getBackendHealth: vi.fn(() => Promise.resolve({ status: "healthy" })),
  restartBackend: vi.fn(() => Promise.resolve()),
  restartFrontend: vi.fn(() => Promise.resolve()),
}));

vi.mock("@/composables", () => ({
  useSystem: () => systemMock,
}));

vi.mock("@/services/configApi", () => ({
  getGitBranches: vi.fn(() => Promise.resolve({ branches: ["main", "develop", "release"] })),
}));

describe("UpdatesTab", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    systemMock.updating.value = false;
    systemMock.updateStatus.value = null;
    systemMock.updateStatusLoading.value = false;
    systemMock.updateStatusCheckedAt.value = null;
    systemMock.updateMessage.value = "";
    systemMock.updateMessageClass.value = "";
    systemMock.backendHealth.value = null;
    systemMock.backendHealthLoading.value = false;
    systemMock.backendHealthCheckedAt.value = null;
    systemMock.getUpdateStatus.mockResolvedValue({ status: "unknown" });
    systemMock.getBackendHealth.mockResolvedValue({ status: "healthy" });
    systemMock.restartBackend.mockResolvedValue();
    systemMock.restartFrontend.mockResolvedValue();
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

  it("refreshes backend and update status on mount", async () => {
    mount(UpdatesTab, {
      props: {
        gitRepoUrl: "https://github.com/example/calvin.git",
        gitBranch: "main",
      },
    });

    await flushPromises();

    expect(systemMock.getBackendHealth).toHaveBeenCalled();
    expect(systemMock.getUpdateStatus).toHaveBeenCalled();
  });

  it("shows backend health and structured update phase", async () => {
    systemMock.backendHealth.value = { status: "healthy" };
    systemMock.backendHealthCheckedAt.value = "2026-05-03T10:15:00Z";
    systemMock.updateStatus.value = {
      status: "running",
      phase: "pulling_code",
      message: "Pulling latest code",
    };

    const wrapper = mount(UpdatesTab, {
      props: {
        gitRepoUrl: "https://github.com/example/calvin.git",
        gitBranch: "main",
      },
    });

    expect(wrapper.text()).toContain("Backend API");
    expect(wrapper.text()).toContain("healthy");
    expect(wrapper.text()).toContain("Pulling Code");
    expect(wrapper.text()).toContain("Pulling latest code");
  });

  it("no longer renders the System restart/reload section", () => {
    const wrapper = mount(UpdatesTab, {
      props: { gitRepoUrl: "", gitBranch: "main" },
    });
    expect(wrapper.text()).not.toContain("Restart Backend");
    expect(wrapper.text()).not.toContain("Reload UI");
  });
});
