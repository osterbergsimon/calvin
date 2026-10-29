import { describe, it, expect, vi, beforeEach } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { ref } from "vue";
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
  loadEnvironment: vi.fn(() => Promise.resolve(null)),
  triggerUpdate: vi.fn(),
  getUpdateStatus: vi.fn(() => Promise.resolve({ status: "unknown" })),
  getBackendHealth: vi.fn(() => Promise.resolve({ status: "healthy" })),
  restartBackend: vi.fn(() => Promise.resolve()),
  restartFrontend: vi.fn(() => Promise.resolve()),
}));

// A real ref: UpdatesTab derives isContainer from it in a computed.
systemMock.environment = ref(null);

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
    systemMock.environment.value = null;
    systemMock.loadEnvironment.mockResolvedValue(null);
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

  describe("in a Docker container", () => {
    const dockerEnv = {
      deployment: "docker",
      capabilities: { update: false, restart: false, reboot: false },
      update_instructions:
        "Calvin runs in a Docker container. Unraid: Docker tab → Check for Updates. " +
        "Docker Compose: docker compose pull && docker compose up -d.",
    };

    beforeEach(() => {
      systemMock.loadEnvironment.mockImplementation(() => {
        systemMock.environment.value = dockerEnv;
        return Promise.resolve(dockerEnv);
      });
    });

    it("replaces the git update controls with host update instructions", async () => {
      const wrapper = mount(UpdatesTab, { props: { gitRepoUrl: "", gitBranch: "main" } });
      await flushPromises();

      expect(wrapper.text()).not.toContain("Update now");
      expect(wrapper.text()).not.toContain("Repository");
      expect(wrapper.find("select").exists()).toBe(false);
      expect(wrapper.text()).toContain("docker compose pull && docker compose up -d");
      expect(wrapper.text()).toContain("Check for Updates");
    });

    it("skips the git branch and update-script status calls", async () => {
      const { getGitBranches } = await import("@/services/configApi");
      mount(UpdatesTab, { props: { gitRepoUrl: "", gitBranch: "main" } });
      await flushPromises();

      expect(getGitBranches).not.toHaveBeenCalled();
      expect(systemMock.getUpdateStatus).not.toHaveBeenCalled();
      expect(systemMock.getBackendHealth).toHaveBeenCalled();
    });

    it("keeps the native controls when the environment can't be loaded", async () => {
      systemMock.loadEnvironment.mockResolvedValue(null);
      const wrapper = mount(UpdatesTab, { props: { gitRepoUrl: "", gitBranch: "main" } });
      await flushPromises();

      expect(wrapper.text()).toContain("Update now");
    });
  });
});
