import { describe, it, expect, vi, beforeEach } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import MaintenanceSettings from "@/components/settings/categories/MaintenanceSettings.vue";

const systemMock = vi.hoisted(() => ({
  restartBackend: vi.fn(() => Promise.resolve()),
  restartFrontend: vi.fn(() => Promise.resolve()),
}));

vi.mock("@/composables", () => ({
  useSystem: () => systemMock,
}));

const apiMock = vi.hoisted(() => ({
  getSystemEnvironment: vi.fn(),
}));

vi.mock("@/services/systemApi", () => apiMock);

// UpdatesTab pulls in the full update flow; stub it — this spec only cares
// about whether MaintenanceSettings renders it.
const stubs = {
  UpdatesTab: { template: '<div data-test="updates-tab" />' },
  // Uses Pinia; stubbed so this spec stays isolated from the kiosks store.
  KioskAgentsSection: { template: "<div />" },
};

const mountTab = (env, extraStubs = {}) => {
  apiMock.getSystemEnvironment.mockResolvedValue(env);
  return mount(MaintenanceSettings, {
    props: { config: {}, gitRepoUrl: "", gitBranch: "main" },
    global: { stubs: { ...stubs, ...extraStubs } },
  });
};

const DOCKER_ENV = {
  deployment: "docker",
  is_dev_mode: false,
  update_supported: false,
  restart_backend_supported: true,
  restart_frontend_supported: false,
};

const NATIVE_ENV = {
  deployment: "native",
  is_dev_mode: false,
  update_supported: true,
  restart_backend_supported: true,
  restart_frontend_supported: true,
};

describe("MaintenanceSettings — deployment awareness", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renders the UpdatesTab when updates are supported", async () => {
    const wrapper = mountTab(NATIVE_ENV);
    await flushPromises();
    expect(wrapper.find('[data-test="updates-tab"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="update-guidance"]').exists()).toBe(false);
  });

  it("renders host-update guidance instead of the UpdatesTab in Docker", async () => {
    const wrapper = mountTab(DOCKER_ENV);
    await flushPromises();
    expect(wrapper.find('[data-test="updates-tab"]').exists()).toBe(false);
    const guidance = wrapper.find('[data-test="update-guidance"]');
    expect(guidance.exists()).toBe(true);
    expect(guidance.text()).toContain("update-calvin.sh");
  });

  it("hides the frontend restart row when unsupported, keeps backend restart", async () => {
    const wrapper = mountTab(DOCKER_ENV);
    await flushPromises();
    expect(wrapper.find('[data-test="restart-backend"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="restart-frontend"]').exists()).toBe(false);
    expect(wrapper.find('[data-test="reload-ui"]').exists()).toBe(true);
  });

  it("shows all restart rows on a full native install", async () => {
    const wrapper = mountTab(NATIVE_ENV);
    await flushPromises();
    expect(wrapper.find('[data-test="restart-backend"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="restart-frontend"]').exists()).toBe(true);
  });

  it("falls back to showing everything when the environment fetch fails", async () => {
    apiMock.getSystemEnvironment.mockRejectedValue(new Error("network"));
    const wrapper = mount(MaintenanceSettings, {
      props: { config: {}, gitRepoUrl: "", gitBranch: "main" },
      global: { stubs },
    });
    await flushPromises();
    expect(wrapper.find('[data-test="updates-tab"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="restart-backend"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="restart-frontend"]').exists()).toBe(true);
  });
});
