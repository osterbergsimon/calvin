import { defineStore } from "pinia";
import axios from "axios";

// Backup and restore of the whole Calvin setup (calvin-8gx). Stateless: the
// Backup & restore settings section owns the UI state.
export const useBackupStore = defineStore("backup", () => {
  async function exportBackup({ includePackages, includeSecrets, includeSigningKey }) {
    const response = await axios.get("/api/backup/export", {
      params: {
        include_packages: includePackages,
        include_secrets: includeSecrets,
        include_signing_key: includeSigningKey,
      },
      responseType: "blob",
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
    const response = await axios.post("/api/backup/preview", form(file, { mode }));
    return response.data;
  }

  async function restore(file, mode, restoreSigningKey) {
    const response = await axios.post(
      "/api/backup/restore",
      form(file, { mode, restore_signing_key: restoreSigningKey })
    );
    return response.data;
  }

  async function fetchSchedule() {
    const response = await axios.get("/api/backup/schedule");
    return response.data;
  }

  async function saveSchedule(schedule) {
    const response = await axios.put("/api/backup/schedule", schedule);
    return response.data;
  }

  async function listFiles() {
    const response = await axios.get("/api/backup/files");
    return response.data;
  }

  async function createFile() {
    const response = await axios.post("/api/backup/files");
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
