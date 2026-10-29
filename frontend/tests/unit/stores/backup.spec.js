import { describe, it, expect, beforeEach, vi } from "vitest";
import { setActivePinia, createPinia } from "pinia";
import axios from "axios";
import { useBackupStore } from "@/stores/backup";

vi.mock("axios");

describe("backup store", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  it("exportBackup GETs a blob with the chosen options and returns name + blob", async () => {
    const blob = new Blob(["zip"]);
    axios.get.mockResolvedValue({
      data: blob,
      headers: { "content-disposition": 'attachment; filename="calvin-backup-pi-1.zip"' },
    });
    const store = useBackupStore();
    const result = await store.exportBackup({
      includePackages: true,
      includeSecrets: false,
      includeSigningKey: false,
    });
    expect(axios.get).toHaveBeenCalledWith("/api/backup/export", {
      params: { include_packages: true, include_secrets: false, include_signing_key: false },
      responseType: "blob",
    });
    expect(result).toEqual({ filename: "calvin-backup-pi-1.zip", blob });
  });

  it("previewRestore posts the file and mode as multipart", async () => {
    axios.post.mockResolvedValue({ data: { mode: "merge", counts: {} } });
    const store = useBackupStore();
    const file = new File(["{}"], "b.zip");
    const plan = await store.previewRestore(file, "merge");
    expect(plan.mode).toBe("merge");
    const [url, body] = axios.post.mock.calls[0];
    expect(url).toBe("/api/backup/preview");
    expect(body.get("file")).toBe(file);
    expect(body.get("mode")).toBe("merge");
  });

  it("restore posts mode and the signing-key choice", async () => {
    axios.post.mockResolvedValue({ data: { applied: true } });
    const store = useBackupStore();
    await store.restore(new File(["{}"], "b.zip"), "replace", true);
    const [url, body] = axios.post.mock.calls[0];
    expect(url).toBe("/api/backup/restore");
    expect(body.get("mode")).toBe("replace");
    expect(body.get("restore_signing_key")).toBe("true");
  });

  it("schedule round-trips through GET/PUT", async () => {
    axios.get.mockResolvedValue({ data: { enabled: false, interval_hours: 24, retention: 7 } });
    axios.put.mockResolvedValue({ data: { enabled: true, interval_hours: 12, retention: 3 } });
    const store = useBackupStore();
    expect(await store.fetchSchedule()).toEqual({
      enabled: false,
      interval_hours: 24,
      retention: 7,
    });
    await store.saveSchedule({ enabled: true, interval_hours: 12, retention: 3 });
    expect(axios.put).toHaveBeenCalledWith("/api/backup/schedule", {
      enabled: true,
      interval_hours: 12,
      retention: 3,
    });
  });
});
