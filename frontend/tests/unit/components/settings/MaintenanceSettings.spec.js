import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";

const restartBackend = vi.fn();
const restartFrontend = vi.fn();
vi.mock("@/composables", () => ({
  useSystem: () => ({ restartBackend, restartFrontend }),
}));

import MaintenanceSettings from "@/components/settings/categories/MaintenanceSettings.vue";

const stubs = { UpdatesTab: true };
const baseConfig = { consoleLogEnabled: true, consoleLogLevel: "info", configPollInterval: 30 };

describe("MaintenanceSettings", () => {
  beforeEach(() => {
    restartBackend.mockClear();
    restartFrontend.mockClear();
  });

  it("renders the three sections", () => {
    const wrapper = mount(MaintenanceSettings, {
      props: { config: baseConfig, gitRepoUrl: "", gitBranch: "main" },
      global: { stubs },
    });
    for (const id of ["maintenance-updates", "maintenance-system", "maintenance-diagnostics"]) {
      expect(wrapper.find(`#section-${id}`).exists()).toBe(true);
    }
  });

  it("calls restartBackend after confirming Restart backend", async () => {
    const wrapper = mount(MaintenanceSettings, {
      props: { config: baseConfig, gitRepoUrl: "", gitBranch: "main" },
      global: { stubs },
    });
    const btn = wrapper.findAll("button").find(b => b.text() === "Restart backend");
    await btn.trigger("click");
    // ConfirmModal is real; find its confirm button and click it
    const confirmBtn = wrapper.findAll("button").find(b => /restart/i.test(b.text()) && b.text() !== "Restart backend" && b.text() !== "Restart frontend");
    await confirmBtn.trigger("click");
    expect(restartBackend).toHaveBeenCalled();
  });

  it("shows the log level only when console logging is on", () => {
    const on = mount(MaintenanceSettings, { props: { config: { ...baseConfig, consoleLogEnabled: true }, gitRepoUrl: "", gitBranch: "main" }, global: { stubs } });
    expect(on.text()).toContain("Log level");
    const off = mount(MaintenanceSettings, { props: { config: { ...baseConfig, consoleLogEnabled: false }, gitRepoUrl: "", gitBranch: "main" }, global: { stubs } });
    expect(off.text()).not.toContain("Log level");
  });
});
