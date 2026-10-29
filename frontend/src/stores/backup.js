import { defineStore } from "pinia";
import api, { LONG_REQUEST_TIMEOUT } from "@/services/api";

// Backup and restore of the whole Calvin setup (calvin-8gx). Stateless: the
// Backup & restore settings section owns the UI state.
export const useBackupStore = defineStore("backup", () => {
  async function exportBackup({ includePackages, includeSecrets, includeSigningKey }) {
    const response = await api.get("/backup/export", {
      params: {
        include_packages: includePackages,
        include_secrets: includeSecrets,
        include_signing_key: includeSigningKey,
      },
      responseType: "blob",
      timeout: LONG_REQUEST_TIMEOUT,
    });
    const disposition = response.headers?.["content-disposition"] || "";
    const match = /filename="?([^";]+)"?/.exec(disposition);
    return { filename: match ? match[1] : "calvin-backup.zip", blob: response.data };
  }

  function form(file, fields) {
    const body = new FormData();
    body.append("file", file);
    for (const [key, value] of Object.entries(fields)) body.append(key, String(value));
    return body;
  }

  async function previewRestore(file, mode) {
    const response = await api.post("/backup/preview", form(file, { mode }), {
      timeout: LONG_REQUEST_TIMEOUT,
    });
    return response.data;
  }

  async function restore(file, mode, restoreSigningKey) {
    const response = await api.post(
      "/backup/restore",
      form(file, { mode, restore_signing_key: restoreSigningKey }),
      { timeout: LONG_REQUEST_TIMEOUT }
    );
    return response.data;
  }

  async function fetchSchedule() {
    const response = await api.get("/backup/schedule");
    return response.data;
  }

  async function saveSchedule(schedule) {
    const response = await api.put("/backup/schedule", schedule);
    return response.data;
  }

  async function listFiles() {
    const response = await api.get("/backup/files");
    return response.data;
  }

  async function createFile() {
    const response = await api.post("/backup/files", null, { timeout: LONG_REQUEST_TIMEOUT });
    return response.data;
  }

  return {
    exportBackup,
    previewRestore,
    restore,
    fetchSchedule,
    saveSchedule,
    listFiles,
    createFile,
  };
});
