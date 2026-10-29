import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";

import { ref } from "vue";
import { flushPromises } from "@vue/test-utils";

const restartBackend = vi.fn();
const restartFrontend = vi.fn();
const environment = ref(null);
const loadEnvironment = vi.fn(() => Promise.resolve(null));
vi.mock("@/composables", () => ({
  useSystem: () => ({ restartBackend, restartFrontend, environment, loadEnvironment }),
}));

import MaintenanceSettings from "@/components/settings/categories/MaintenanceSettings.vue";

const stubs = { UpdatesTab: true, BackupSettings: true };
const baseConfig = { consoleLogEnabled: true, consoleLogLevel: "info", configPollInterval: 30 };

describe("MaintenanceSettings", () => {
  beforeEach(() => {
    restartBackend.mockClear();
    restartFrontend.mockClear();
    environment.value = null;
    loadEnvironment.mockReset();
    loadEnvironment.mockResolvedValue(null);
  });

  it("defaults the update branch to develop, not the release-only main", () => {
    const wrapper = mount(MaintenanceSettings, {
      props: { config: baseConfig, gitRepoUrl: "" },
      global: { stubs },
    });
    expect(wrapper.findComponent({ name: "UpdatesTab" }).props("gitBranch")).toBe("develop");
  });

  it("renders its sections and the backup & restore block", () => {
    const wrapper = mount(MaintenanceSettings, {
      props: { config: baseConfig, gitRepoUrl: "", gitBranch: "main" },
      global: { stubs },
    });
    for (const id of ["maintenance-updates", "maintenance-system", "maintenance-diagnostics"]) {
      expect(wrapper.find(`#section-${id}`).exists()).toBe(true);
    }
    expect(wrapper.findComponent({ name: "BackupSettings" }).exists()).toBe(true);
  });

  it("calls restartBackend after confirming Restart backend", async () => {
    const wrapper = mount(MaintenanceSettings, {
      props: { config: baseConfig, gitRepoUrl: "", gitBranch: "main" },
      global: { stubs },
    });
    const btn = wrapper.findAll("button").find(b => b.text() === "Restart backend");
    await btn.trigger("click");
    // ConfirmModal is real; find its confirm button and click it
    const confirmBtn = wrapper
      .findAll("button")
      .find(
        b =>
          /restart/i.test(b.text()) &&
          b.text() !== "Restart backend" &&
          b.text() !== "Restart frontend"
      );
    await confirmBtn.trigger("click");
    expect(restartBackend).toHaveBeenCalled();
  });

  it("shows the log level only when console logging is on", () => {
    const on = mount(MaintenanceSettings, {
      props: {
        config: { ...baseConfig, consoleLogEnabled: true },
        gitRepoUrl: "",
        gitBranch: "main",
      },
      global: { stubs },
    });
    expect(on.text()).toContain("Log level");
    const off = mount(MaintenanceSettings, {
      props: {
        config: { ...baseConfig, consoleLogEnabled: false },
        gitRepoUrl: "",
        gitBranch: "main",
      },
      global: { stubs },
    });
    expect(off.text()).not.toContain("Log level");
  });

  it("hides the restart actions in a Docker container", async () => {
    loadEnvironment.mockImplementation(() => {
      environment.value = {
        deployment: "docker",
        capabilities: { update: false, restart: false, reboot: false },
        update_instructions: "docker compose pull && docker compose up -d",
      };
      return Promise.resolve(environment.value);
    });
    const wrapper = mount(MaintenanceSettings, {
      props: { config: baseConfig, gitRepoUrl: "", gitBranch: "main" },
      global: { stubs },
    });
    await flushPromises();

    expect(wrapper.text()).not.toContain("Restart backend");
    expect(wrapper.text()).not.toContain("Restart frontend");
    expect(wrapper.text()).toContain("Reload UI");
  });

  it("hides the restart actions when the backend does not control the host", async () => {
    loadEnvironment.mockImplementation(() => {
      environment.value = {
        deployment: "native",
        host_control: false,
        capabilities: { update: false, restart: false, reboot: false },
        update_instructions: null,
      };
      return Promise.resolve(environment.value);
    });
    const wrapper = mount(MaintenanceSettings, {
      props: { config: baseConfig, gitRepoUrl: "", gitBranch: "main" },
      global: { stubs },
    });
    await flushPromises();

    expect(wrapper.text()).not.toContain("Restart backend");
    expect(wrapper.text()).not.toContain("Restart frontend");
  });

  it("keeps the restart actions when the environment can't be loaded", async () => {
    const wrapper = mount(MaintenanceSettings, {
      props: { config: baseConfig, gitRepoUrl: "", gitBranch: "main" },
      global: { stubs },
    });
    await flushPromises();

    expect(wrapper.text()).toContain("Restart backend");
  });
});
