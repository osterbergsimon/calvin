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

    expect(wrapper.text()).toContain("Calvin");
    expect(wrapper.text()).toContain("Running");
    expect(wrapper.text()).toContain("Updates");
    expect(wrapper.text()).toContain("Updating");
    expect(wrapper.text()).toContain("Downloading");
    expect(wrapper.text()).toContain("Pulling latest code");
    // Never the raw server vocabulary (CLV-63).
    expect(wrapper.text()).not.toContain("Backend API");
    expect(wrapper.text()).not.toContain("healthy");
    expect(wrapper.text()).not.toContain("pulling_code");
  });

  it("shows system status as setting rows, with no nested cards", async () => {
    systemMock.backendHealth.value = { status: "healthy" };
    systemMock.backendHealthCheckedAt.value = "2026-05-03T10:15:00Z";
    systemMock.updateStatus.value = { status: "idle" };
    systemMock.updateStatusCheckedAt.value = "2026-05-03T10:16:00Z";

    const wrapper = mount(UpdatesTab, {
      props: { gitRepoUrl: "https://github.com/example/calvin.git", gitBranch: "main" },
    });

    for (const test of ["readout-calvin", "readout-updates", "readout-last-checked"]) {
      const row = wrapper.find(`[data-test="${test}"]`);
      expect(row.classes()).toContain("setting-row");
      expect(row.find(".list-row").exists()).toBe(false);
    }
    expect(wrapper.find('[data-test="readout-calvin"]').text()).toContain(
      "Whether Calvin is running and if an update is under way."
    );
    expect(wrapper.find('[data-test="readout-last-checked"]').text()).toMatch(/\d{1,2}:\d{2}/);
  });

  it("reads the health status the backend actually sends", async () => {
    systemMock.backendHealth.value = { status: "healthy" };
    systemMock.backendHealthCheckedAt.value = "2026-05-03T10:15:00Z";

    const wrapper = mount(UpdatesTab, { props: { gitRepoUrl: "", gitBranch: "main" } });
    const row = wrapper.find('[data-test="readout-calvin"]');

    expect(row.find('[data-test="backend-health-value"]').text()).toBe("Running");
    // A completed check never claims it was not checked.
    expect(row.text()).not.toContain("Not checked yet");
  });

  it("says Unknown, not Not checked yet, beside a check time", async () => {
    systemMock.backendHealth.value = { status: "ok" };
    systemMock.backendHealthCheckedAt.value = "2026-05-03T10:15:00Z";

    const wrapper = mount(UpdatesTab, { props: { gitRepoUrl: "", gitBranch: "main" } });
    const row = wrapper.find('[data-test="readout-calvin"]');

    expect(row.find('[data-test="backend-health-value"]').text()).toBe("Unknown");
    expect(row.text()).not.toContain("Not checked yet");
  });

  it("maps every update status to plain words", async () => {
    const labelFor = async status => {
      systemMock.updateStatus.value = { status };
      const wrapper = mount(UpdatesTab, { props: { gitRepoUrl: "", gitBranch: "main" } });
      const row = wrapper.find('[data-test="readout-updates"]');
      return row.find('[data-test="update-status-value"]').text();
    };

    expect(await labelFor("idle")).toBe("Up to date");
    expect(await labelFor("running")).toBe("Updating");
    expect(await labelFor("error")).toBe("Update failed");
    // Unknown or not-yet-checked statuses never print the raw value.
    expect(await labelFor("scheduled")).toBe("Not checked yet");
    expect(await labelFor(undefined)).toBe("Not checked yet");
  });

  it("hides an unknown update phase", async () => {
    systemMock.updateStatus.value = { status: "running", phase: "quantum_flux" };
    const wrapper = mount(UpdatesTab, { props: { gitRepoUrl: "", gitBranch: "main" } });
    expect(wrapper.text()).not.toContain("quantum_flux");
    expect(wrapper.text()).not.toContain("Quantum Flux");
  });

  it("puts the raw health detail behind Details", async () => {
    systemMock.backendHealth.value = {
      status: "unhealthy",
      error: "Request failed with status code 500",
      errorText: "Something went wrong on the Calvin server while trying to check on Calvin.",
    };
    const wrapper = mount(UpdatesTab, { props: { gitRepoUrl: "", gitBranch: "main" } });

    expect(wrapper.find('[data-test="readout-note"]').text()).toBe(
      "Something went wrong on the Calvin server while trying to check on Calvin."
    );
    const details = wrapper.find('[data-test="readout-details"]');
    expect(details.exists()).toBe(true);
    expect(details.find("summary").text()).toBe("Details");
    expect(details.text()).toContain("Request failed with status code 500");
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

    it("skips the update-script status call", async () => {
      mount(UpdatesTab, { props: { gitBranch: "main" } });
      await flushPromises();

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
