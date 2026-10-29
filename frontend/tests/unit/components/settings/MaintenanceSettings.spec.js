import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";

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
import ConfirmModal from "@/components/settings/shared/ConfirmModal.vue";
import KioskSoftwarePointer from "@/components/settings/shared/KioskSoftwarePointer.vue";

const stubs = { UpdatesTab: true, BackupSettings: true };
const baseConfig = { consoleLogEnabled: true, consoleLogLevel: "info", configPollInterval: 30 };

describe("MaintenanceSettings", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
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
    for (const id of [
      "maintenance-updates",
      "device-hardware",
      "maintenance-system",
      "maintenance-diagnostics",
    ]) {
      expect(wrapper.find(`#section-${id}`).exists()).toBe(true);
    }
    expect(wrapper.findComponent({ name: "BackupSettings" }).exists()).toBe(true);
  });

  it("puts Versions & status second and renames the restart section", () => {
    const wrapper = mount(MaintenanceSettings, {
      props: { config: baseConfig, gitRepoUrl: "", gitBranch: "main" },
      global: { stubs },
    });
    expect(wrapper.findAll("section.settings-section").map(s => s.attributes("id"))).toEqual([
      "section-maintenance-updates",
      "section-device-hardware",
      "section-maintenance-system",
      "section-maintenance-diagnostics",
    ]);
    expect(wrapper.find("#section-device-hardware .settings-section__eyebrow").text()).toBe(
      "Versions & status"
    );
    expect(wrapper.find("#section-maintenance-system .settings-section__eyebrow").text()).toBe(
      "Restart"
    );
  });

  it("renders the backend and frontend versions in Versions & status", () => {
    const wrapper = mount(MaintenanceSettings, {
      props: {
        config: baseConfig,
        gitRepoUrl: "",
        version: "1.2.3",
        frontendVersion: "4.5.6",
      },
      global: { stubs },
    });
    const hardware = wrapper.find("#section-device-hardware").text();
    expect(hardware).toContain("1.2.3");
    expect(hardware).toContain("4.5.6");
  });

  it("calls restartBackend after confirming Restart Calvin server", async () => {
    environment.value = null;
    const wrapper = mount(MaintenanceSettings, {
      props: { config: baseConfig, gitRepoUrl: "", gitBranch: "main" },
      global: { stubs },
    });
    const btn = wrapper.findAll("button").find(b => b.text() === "Restart server");
    await btn.trigger("click");

    const confirm = wrapper.findComponent(ConfirmModal);
    expect(confirm.props("title")).toBe("Restart the Calvin server?");
    expect(confirm.props("message")).toBe(
      "Settings and screens lose connection for about 15 seconds."
    );
    expect(confirm.props("confirmText")).toBe("Restart server");

    await confirm.findAll("button").at(-1).trigger("click");
    expect(restartBackend).toHaveBeenCalled();
  });

  it("confirms the kiosk browser restart with its honest copy", async () => {
    environment.value = null;
    const wrapper = mount(MaintenanceSettings, {
      props: { config: baseConfig, gitRepoUrl: "", gitBranch: "main" },
      global: { stubs },
    });
    const row = wrapper.find('[data-test="restart-frontend"]');
    expect(row.text()).toBe("Restart browser");
    await row.trigger("click");

    const confirm = wrapper.findComponent(ConfirmModal);
    expect(confirm.props("title")).toBe("Restart the kiosk browser?");
    expect(confirm.props("message")).toBe("The screen goes blank for a few seconds.");
    expect(confirm.props("confirmText")).toBe("Restart browser");

    await confirm.findAll("button").at(-1).trigger("click");
    expect(restartFrontend).toHaveBeenCalled();
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

  it("hides the restart actions and points to Docker in a container", async () => {
    loadEnvironment.mockImplementation(() => {
      environment.value = {
        deployment: "docker",
        host_control: false,
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

    expect(wrapper.find('[data-test="restart-backend"]').exists()).toBe(false);
    expect(wrapper.find('[data-test="restart-frontend"]').exists()).toBe(false);
    expect(wrapper.find('[data-test="reload-ui"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="docker-restart-hint"]').text()).toBe(
      "To restart the server, restart the Calvin container from Docker (Unraid: Docker tab)."
    );
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

    expect(wrapper.find('[data-test="restart-backend"]').exists()).toBe(false);
    expect(wrapper.find('[data-test="restart-frontend"]').exists()).toBe(false);
    expect(wrapper.find('[data-test="docker-restart-hint"]').exists()).toBe(false);
  });

  it("hides the restart actions when a native host lacks the restart helper", async () => {
    loadEnvironment.mockImplementation(() => {
      environment.value = {
        deployment: "native",
        host_control: true,
        capabilities: { update: true, restart: false, reboot: true },
        update_instructions: null,
      };
      return Promise.resolve(environment.value);
    });
    const wrapper = mount(MaintenanceSettings, {
      props: { config: baseConfig, gitRepoUrl: "", gitBranch: "main" },
      global: { stubs },
    });
    await flushPromises();

    expect(wrapper.find('[data-test="restart-backend"]').exists()).toBe(false);
    expect(wrapper.find('[data-test="restart-frontend"]').exists()).toBe(false);
  });

  it("shows both restart rows when the environment reports restart capability", async () => {
    loadEnvironment.mockImplementation(() => {
      environment.value = {
        deployment: "native",
        host_control: true,
        capabilities: { update: true, restart: true, reboot: true },
        update_instructions: null,
      };
      return Promise.resolve(environment.value);
    });
    const wrapper = mount(MaintenanceSettings, {
      props: { config: baseConfig, gitRepoUrl: "", gitBranch: "main" },
      global: { stubs },
    });
    await flushPromises();

    const backend = wrapper.find('[data-test="restart-backend"]');
    expect(backend.text()).toBe("Restart server");
    expect(wrapper.text()).toContain("Restart kiosk browser");
    expect(wrapper.text()).toContain(
      "Restarts the browser on this Pi's screen. The server keeps running."
    );
    expect(wrapper.text()).toContain(
      "Restarts Calvin. Screens reconnect on their own in about 15 seconds."
    );
    expect(wrapper.find('[data-test="docker-restart-hint"]').exists()).toBe(false);
  });

  it("keeps the restart actions when the environment can't be loaded", async () => {
    const wrapper = mount(MaintenanceSettings, {
      props: { config: baseConfig, gitRepoUrl: "", gitBranch: "main" },
      global: { stubs },
    });
    await flushPromises();

    expect(wrapper.find('[data-test="restart-backend"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="restart-frontend"]').exists()).toBe(true);
  });

  it("renders the kiosk software pointer in the Updates section", async () => {
    const wrapper = mount(MaintenanceSettings, {
      props: { config: baseConfig, gitRepoUrl: "", gitBranch: "main" },
      global: { stubs },
    });
    await flushPromises();
    const updates = wrapper.find("#section-maintenance-updates");
    expect(updates.findComponent(KioskSoftwarePointer).exists()).toBe(true);
  });
});
