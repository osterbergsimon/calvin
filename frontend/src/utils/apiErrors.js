/**
 * Helpers for reading FastAPI error bodies.
 *
 * Routes return either a plain string `detail` or a structured detail such as
 * `{ code: "host_control_disabled", message: "..." }`. Rendering the latter
 * directly shows "[object Object]", so unwrap the message first.
 */

export function detailMessage(detail, fallback = "Something went wrong") {
  if (typeof detail === "string" && detail) return detail;
  if (detail && typeof detail === "object" && typeof detail.message === "string") {
    return detail.message;
  }
  return fallback;
}

export function errorDetailMessage(error, fallback = "Something went wrong") {
  return detailMessage(error?.response?.data?.detail, fallback);
}
