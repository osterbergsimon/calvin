import { describe, it, expect, beforeEach, vi } from "vitest";
import { setActivePinia, createPinia } from "pinia";
import api from "@/services/api";
import { useBackupStore } from "@/stores/backup";

vi.mock("@/services/api", () => ({
  default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
  LONG_REQUEST_TIMEOUT: 600000,
}));

describe("backup store", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  it("exportBackup GETs a blob with the chosen options and returns name + blob", async () => {
    const blob = new Blob(["zip"]);
    api.get.mockResolvedValue({
      data: blob,
      headers: { "content-disposition": 'attachment; filename="calvin-backup-pi-1.zip"' },
    });
    const store = useBackupStore();
    const result = await store.exportBackup({
      includePackages: true,
      includeSecrets: false,
      includeSigningKey: false,
    });
    expect(api.get).toHaveBeenCalledWith("/backup/export", {
      params: { include_packages: true, include_secrets: false, include_signing_key: false },
      responseType: "blob",
      timeout: 600000,
    });
    expect(result).toEqual({ filename: "calvin-backup-pi-1.zip", blob });
  });

  it("previewRestore posts the file and mode as multipart", async () => {
    api.post.mockResolvedValue({ data: { mode: "merge", counts: {} } });
    const store = useBackupStore();
    const file = new File(["{}"], "b.zip");
    const plan = await store.previewRestore(file, "merge");
    expect(plan.mode).toBe("merge");
    const [url, body] = api.post.mock.calls[0];
    expect(url).toBe("/backup/preview");
    expect(api.post.mock.calls[0][2]).toEqual({ timeout: 600000 });
    expect(body.get("file")).toBe(file);
    expect(body.get("mode")).toBe("merge");
  });

  it("restore posts mode and the signing-key choice", async () => {
    api.post.mockResolvedValue({ data: { applied: true } });
    const store = useBackupStore();
    await store.restore(new File(["{}"], "b.zip"), "replace", true);
    const [url, body] = api.post.mock.calls[0];
    expect(url).toBe("/backup/restore");
    expect(api.post.mock.calls[0][2]).toEqual({ timeout: 600000 });
    expect(body.get("mode")).toBe("replace");
    expect(body.get("restore_signing_key")).toBe("true");
  });

  it("schedule round-trips through GET/PUT", async () => {
    api.get.mockResolvedValue({ data: { enabled: false, interval_hours: 24, retention: 7 } });
    api.put.mockResolvedValue({ data: { enabled: true, interval_hours: 12, retention: 3 } });
    const store = useBackupStore();
    expect(await store.fetchSchedule()).toEqual({
      enabled: false,
      interval_hours: 24,
      retention: 7,
    });
    await store.saveSchedule({ enabled: true, interval_hours: 12, retention: 3 });
    expect(api.put).toHaveBeenCalledWith("/backup/schedule", {
      enabled: true,
      interval_hours: 12,
      retention: 3,
    });
  });
});
