import api, { LONG_REQUEST_TIMEOUT } from "./api";

// Share links for guest photo upload (calvin-mwqo). Admin calls manage links;
// guest calls carry the link's token in the path and work without admin.

const guestBase = token => `/guest/${encodeURIComponent(token)}`;

export async function listLinks() {
  const { data } = await api.get("/share/links");
  return data?.links ?? [];
}

export async function listFolders() {
  const { data } = await api.get("/share/folders");
  return data?.folders ?? [];
}

export async function createLink({ name, folder, expiresInDays = null, maxPhotos = null }) {
  const body = { name, folder };
  if (expiresInDays) body.expires_in_days = expiresInDays;
  if (maxPhotos) body.max_photos = maxPhotos;
  const { data } = await api.post("/share/links", body);
  return data.link;
}

export async function renameLink(id, name) {
  const { data } = await api.patch(`/share/links/${encodeURIComponent(id)}`, { name });
  return data.link;
}

export async function revokeLink(id, { removePhotos = false } = {}) {
  await api.delete(`/share/links/${encodeURIComponent(id)}`, {
    params: removePhotos ? { remove_photos: true } : undefined,
  });
}

export async function getGuest(token) {
  const { data } = await api.get(guestBase(token));
  return data;
}

export async function listGuestUploads(token) {
  const { data } = await api.get(`${guestBase(token)}/uploads`);
  return data?.uploads ?? [];
}

/** Upload one photo; `onProgress` gets 0..1. Resolves to `{ uploaded, failed }`. */
export async function uploadGuestPhoto(token, file, onProgress) {
  const form = new FormData();
  form.append("photos", file, file.name);
  const { data } = await api.post(`${guestBase(token)}/uploads`, form, {
    timeout: LONG_REQUEST_TIMEOUT,
    onUploadProgress: event => {
      if (onProgress && event.total) onProgress(Math.min(1, event.loaded / event.total));
    },
  });
  return data;
}

export async function removeGuestUpload(token, imageId) {
  await api.delete(`${guestBase(token)}/uploads/${encodeURIComponent(imageId)}`);
}

/** The guest page's absolute address, for the QR code and copy button. */
export function shareUrl(serverUrl, path) {
  if (!path) return "";
  return `${(serverUrl || "").replace(/\/+$/, "")}${path}`;
}
