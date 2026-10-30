import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";

import { ref } from "vue";
import { flushPromises } from "@vue/test-utils";

const restartBackend = vi.fn();
const restartFrontend = vi.fn();
const turnDisplayOn = vi.fn();
const turnDisplayOff = vi.fn();
const environment = ref(null);
const loadEnvironment = vi.fn(() => Promise.resolve(null));
vi.mock("@/composables", () => ({
  useSystem: () => ({
    restartBackend,
    restartFrontend,
    turnDisplayOn,
    turnDisplayOff,
    environment,
    loadEnvironment,
  }),
}));

import MaintenanceSettings from "@/components/settings/categories/MaintenanceSettings.vue";
import { collapseSettingsSection, expandSettingsSection } from "@/utils/settingsSectionExpansion";
import { filterSettingsDestinations } from "@/components/settings/settingsRegistry";
import ConfirmModal from "@/components/settings/shared/ConfirmModal.vue";
import KioskSoftwarePointer from "@/components/settings/shared/KioskSoftwarePointer.vue";

const stubs = { UpdatesTab: true, BackupSettings: true, UpdateSourceRows: true };
const baseConfig = { consoleLogEnabled: true, consoleLogLevel: "info", configPollInterval: 30 };

describe("MaintenanceSettings", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    restartBackend.mockClear();
    restartFrontend.mockClear();
    turnDisplayOn.mockClear();
    turnDisplayOff.mockClear();
    environment.value = null;
    loadEnvironment.mockReset();
    loadEnvironment.mockResolvedValue(null);
  });

  it("defaults the tracked branch to develop, not the release-only main", () => {
    const wrapper = mount(MaintenanceSettings, {
      props: { config: baseConfig, gitRepoUrl: "" },
      global: { stubs },
    });
    expect(wrapper.findComponent({ name: "UpdateSourceRows" }).props("gitBranch")).toBe("develop");
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
      "maintenance-advanced",
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
      "section-maintenance-advanced",
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

  it("shows the log level only when console logging is on", async () => {
    expandSettingsSection("maintenance-advanced");
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

// Settings copy audit §3.4 + §4.
describe("System copy (§3.4) and the Advanced disclosure (§4)", () => {
  const row = (w, label) =>
    w.findAllComponents({ name: "SettingRow" }).find(r => r.props("label") === label);

  beforeEach(() => {
    setActivePinia(createPinia());
    environment.value = null;
    collapseSettingsSection("maintenance-advanced");
  });

  it("shows one Version row, and the screen's bundle only when it differs", async () => {
    const same = mount(MaintenanceSettings, {
      props: { config: baseConfig, version: "1.2.3", frontendVersion: "1.2.3" },
      global: { stubs },
    });
    expect(row(same, "Version").text()).toContain("1.2.3");
    expect(row(same, "Version").text()).not.toContain("screen");
    expect(row(same, "Backend version")).toBeUndefined();

    const differ = mount(MaintenanceSettings, {
      props: { config: baseConfig, version: "1.2.3", frontendVersion: "4.5.6" },
      global: { stubs },
    });
    expect(row(differ, "Version").text()).toContain("1.2.3 (screen 4.5.6)");
  });

  it("offers Reload this screen", () => {
    const w = mount(MaintenanceSettings, {
      props: { config: baseConfig },
      global: { stubs },
    });
    expect(row(w, "Reload this screen")).toBeTruthy();
    expect(row(w, "Reload this screen").text()).toContain("Reload");
  });

  it("keeps Advanced closed by default, last in the category", () => {
    const w = mount(MaintenanceSettings, {
      props: { config: baseConfig },
      global: { stubs },
    });
    const sections = w.findAll("section.settings-section").map(s => s.attributes("id"));
    expect(sections.at(-1)).toBe("section-maintenance-advanced");
    const advanced = w.find("#section-maintenance-advanced");
    expect(advanced.find(".settings-section__eyebrow").text()).toBe("Advanced");
    expect(advanced.find(".settings-section__panel").isVisible()).toBe(false);
    expect(row(w, "Console logging").isVisible()).toBe(false);
  });

  it("opens Advanced for a search hit and shows the installer rows", async () => {
    // Searching "branch" resolves to the Advanced destination (§4).
    const [hit] = filterSettingsDestinations("branch");
    expect(hit.id).toBe("maintenance-diagnostics");

    const w = mount(MaintenanceSettings, {
      props: { config: baseConfig },
      global: { stubs },
    });
    expandSettingsSection("maintenance-advanced");
    await flushPromises();

    expect(w.find("#section-maintenance-advanced .settings-section__panel").isVisible()).toBe(true);
    expect(row(w, "Console logging")).toBeTruthy();
    expect(row(w, "Check for setting changes every").props("description")).toBe(
      "How fast other screens pick up a change."
    );
    expect(w.findComponent({ name: "UpdateSourceRows" }).exists()).toBe(true);
  });

  it("keeps the update source out of a Docker install", async () => {
    environment.value = { deployment: "docker", capabilities: {} };
    const w = mount(MaintenanceSettings, {
      props: { config: baseConfig, gitRepoUrl: "", gitBranch: "main" },
      global: { stubs },
    });
    await flushPromises();
    expandSettingsSection("maintenance-advanced");
    await flushPromises();
    expect(w.findComponent({ name: "UpdateSourceRows" }).exists()).toBe(false);
    expect(row(w, "Check for setting changes every")).toBeTruthy();
  });
});

// Default-is-a-screen §3: "Screen now" moved here as This server's screen.
describe("MaintenanceSettings — This server's screen", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    environment.value = null;
    loadEnvironment.mockReset();
    loadEnvironment.mockResolvedValue(null);
    turnDisplayOn.mockClear();
    turnDisplayOff.mockClear();
  });

  const mountWith = env => {
    environment.value = env;
    return mount(MaintenanceSettings, {
      props: { config: baseConfig, gitRepoUrl: "", gitBranch: "develop" },
      global: { stubs },
    });
  };

  it("is hidden without host control", () => {
    const w = mountWith({
      deployment: "native",
      host_control: false,
      capabilities: { update: false, restart: false, reboot: false },
    });
    expect(w.find("[data-test='server-display-row']").exists()).toBe(false);
  });

  it("is hidden in a container", () => {
    const w = mountWith({
      deployment: "docker",
      host_control: false,
      capabilities: { update: false, restart: false, reboot: false },
    });
    expect(w.find("[data-test='server-display-row']").exists()).toBe(false);
  });

  it("appears with host control, in the Restart section", async () => {
    const w = mountWith({
      deployment: "native",
      host_control: true,
      capabilities: { update: true, restart: true, reboot: true },
    });
    const row = w.find("[data-test='server-display-row']");
    expect(row.exists()).toBe(true);
    expect(row.text()).toContain("This server's screen");
    expect(w.find("#section-maintenance-system [data-test='server-display-row']").exists()).toBe(
      true
    );

    await w.find("[data-test='server-display-off']").trigger("click");
    await flushPromises();
    expect(turnDisplayOff).toHaveBeenCalled();

    await w.find("[data-test='server-display-on']").trigger("click");
    await flushPromises();
    expect(turnDisplayOn).toHaveBeenCalled();
  });

  it("keeps the Screen now words out of Screens' Default page", () => {
    const w = mountWith({
      deployment: "native",
      host_control: true,
      capabilities: { update: true, restart: true, reboot: true },
    });
    expect(w.text()).toContain("Turn off");
    expect(w.text()).toContain("Turn on");
  });
});
