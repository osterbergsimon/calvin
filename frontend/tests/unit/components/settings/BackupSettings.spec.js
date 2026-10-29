import { describe, it, expect, beforeEach, vi } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import BackupSettings from "@/components/settings/categories/BackupSettings.vue";
import { useBackupStore } from "@/stores/backup";

const PLAN = {
  mode: "replace",
  format_version: 1,
  created_at: "2026-10-29T10:00:00Z",
  calvin_version: "0.1.0",
  source: { hostname: "pi-kitchen" },
  counts: { config: 30, keyboard_mappings: 7, plugin_types: 5, plugin_instances: 3, kiosks: 1 },
  packages: { install: ["mealie"], themes_install: [], version_mismatch: [] },
  instances: { create: ["a", "b"], update: ["c"], remove: [], skip: [] },
  config: { added: 2, changed: 1, removed: 0 },
  kiosks: ["hallway"],
  stripped_secrets: [],
  signing_key: true,
  warnings: ["Plugin x is installed at version 2"],
};

function mountWith({ plan = PLAN, files = [] } = {}) {
  setActivePinia(createPinia());
  const store = useBackupStore();
  store.exportBackup = vi.fn(async () => ({
    filename: "calvin-backup.zip",
    blob: new Blob(["z"]),
  }));
  store.previewRestore = vi.fn(async (_file, mode) => ({ ...plan, mode }));
  store.restore = vi.fn(async () => ({
    applied: true,
    plan,
    safety_backup: "pre-restore-x.zip",
    installed: ["mealie"],
    instances: { created: ["a", "b"], updated: ["c"], removed: [], skipped: [] },
    needs_credentials: ["b"],
    warnings: [],
    errors: [],
  }));
  store.fetchSchedule = vi.fn(async () => ({ enabled: false, interval_hours: 24, retention: 7 }));
  store.saveSchedule = vi.fn(async s => s);
  store.listFiles = vi.fn(async () => ({ directory: "/data/backups", files }));
  store.createFile = vi.fn(async () => ({ name: "calvin-backup-now.zip" }));
  const saveBlob = vi.fn();
  const reload = vi.fn();
  const wrapper = mount(BackupSettings, { props: { saveBlob, reload } });
  return { wrapper, store, saveBlob, reload };
}

async function pickFile(wrapper) {
  const input = wrapper.find("[data-test='restore-file']");
  const file = new File(["zip"], "calvin-backup.zip");
  Object.defineProperty(input.element, "files", { value: [file] });
  await input.trigger("change");
  await flushPromises();
  return file;
}

describe("BackupSettings", () => {
  beforeEach(() => vi.clearAllMocks());

  it("downloads a backup with packages and secrets on and the signing key off by default", async () => {
    const { wrapper, store, saveBlob } = mountWith();
    await flushPromises();
    await wrapper.find("[data-test='backup-download']").trigger("click");
    await flushPromises();
    expect(store.exportBackup).toHaveBeenCalledWith({
      includePackages: true,
      includeSecrets: true,
      includeSigningKey: false,
    });
    expect(saveBlob).toHaveBeenCalledWith(expect.any(Blob), "calvin-backup.zip");
  });

  it("warns that secrets are in plain text while they are included", async () => {
    const { wrapper } = mountWith();
    await flushPromises();
    expect(wrapper.find("[data-test='secrets-warning']").exists()).toBe(true);
    await wrapper.find("[data-test='include-secrets']").trigger("click");
    expect(wrapper.find("[data-test='secrets-warning']").exists()).toBe(false);
  });

  it("previews an uploaded backup before restoring anything", async () => {
    const { wrapper, store } = mountWith();
    await flushPromises();
    const file = await pickFile(wrapper);
    expect(store.previewRestore).toHaveBeenCalledWith(file, "replace");
    expect(store.restore).not.toHaveBeenCalled();
    const preview = wrapper.find("[data-test='restore-preview']");
    expect(preview.text()).toContain("pi-kitchen");
    expect(preview.text()).toContain("mealie");
    expect(preview.text()).toContain("Plugin x is installed at version 2");
  });

  it("re-previews when the mode changes to merge", async () => {
    const { wrapper, store } = mountWith();
    await flushPromises();
    const file = await pickFile(wrapper);
    const merge = wrapper
      .find("[data-test='restore-mode']")
      .findAll("button")
      .find(b => b.text() === "Merge");
    await merge.trigger("click");
    await flushPromises();
    expect(store.previewRestore).toHaveBeenLastCalledWith(file, "merge");
  });

  it("restores after confirmation, shows the result and offers a reload", async () => {
    const { wrapper, store, reload } = mountWith();
    await flushPromises();
    const file = await pickFile(wrapper);
    await wrapper.find("[data-test='restore-signing-key']").trigger("click");
    await wrapper.find("[data-test='restore-start']").trigger("click");
    const confirm = wrapper.findAll("button").find(b => b.text() === "Restore");
    await confirm.trigger("click");
    await flushPromises();
    expect(store.restore).toHaveBeenCalledWith(file, "replace", true);
    const result = wrapper.find("[data-test='restore-result']");
    expect(result.text()).toContain("pre-restore-x.zip");
    expect(result.text()).toContain("b");
    await wrapper.find("[data-test='restore-reload']").trigger("click");
    expect(reload).toHaveBeenCalled();
  });

  it("shows the server's reason when a backup is rejected", async () => {
    const { wrapper, store } = mountWith();
    store.previewRestore = vi.fn(async () => {
      const err = new Error("400");
      err.response = { data: { detail: "This backup was made by a newer Calvin" } };
      throw err;
    });
    await flushPromises();
    await pickFile(wrapper);
    expect(wrapper.find("[data-test='restore-error']").text()).toContain("newer Calvin");
    expect(wrapper.find("[data-test='restore-start']").exists()).toBe(false);
  });

  it("saves the automatic backup schedule", async () => {
    const { wrapper, store } = mountWith();
    await flushPromises();
    await wrapper.find("[data-test='auto-backup-toggle']").trigger("click");
    await flushPromises();
    expect(store.saveSchedule).toHaveBeenCalledWith({
      enabled: true,
      interval_hours: 24,
      retention: 7,
    });
  });

  it("lists stored backups with download links", async () => {
    const { wrapper } = mountWith({
      files: [
        { name: "auto-pi-1.zip", size: 2048, modified: "2026-10-29T10:00:00Z", kind: "auto" },
      ],
    });
    await flushPromises();
    const link = wrapper.find("[data-test='stored-backup'] a");
    expect(link.attributes("href")).toBe("/api/backup/files/auto-pi-1.zip");
  });
});
