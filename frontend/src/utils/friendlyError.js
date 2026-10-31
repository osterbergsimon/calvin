/**
 * One friendly sentence for a failed request (CLV-63 §1).
 *
 * Raw axios text ("Network Error", "Request failed with status code 500") and
 * raw server details are developer words and must never reach a screen. Callers
 * show the return value; the original error still goes to `logError`, and in
 * Settings may sit behind a Details disclosure.
 *
 * `action` completes the sentence ("save your settings" → "…while trying to
 * save your settings"). Server validation details written for people (a 400/422
 * string `detail`) are already a sentence, so they pass through unchanged.
 */

const NETWORK_TEXT = "Couldn't reach Calvin. Check that it's running and on the same network.";
const NOT_FOUND_TEXT = "That's no longer there. Reload and try again.";
const CONFLICT_TEXT = "That conflicts with an existing one.";

// A FastAPI detail is person-readable only when it is a plain string (our own
// route messages) or a structured `{ message }` we wrote. Request-validation
// errors arrive as arrays of {loc, msg, type} — developer text, never shown.
const readableDetail = detail => {
  if (typeof detail === "string" && detail.trim()) return detail;
  if (detail && typeof detail === "object" && typeof detail.message === "string") {
    return detail.message;
  }
  return null;
};

/**
 * @param {unknown} err the caught error (usually an axios error)
 * @param {string} action what the person was trying to do, without "to"
 * @param {{ conflict?: string }} [options] a specific line for a 409
 * @returns {string} one sentence for the screen
 */
export function friendlyError(err, action, options = {}) {
  const response = err?.response;
  if (!response) return NETWORK_TEXT;

  const status = response.status;
  if (status === 401 || status === 403) return `You need to sign in as admin to ${action}.`;
  if (status === 404) return NOT_FOUND_TEXT;
  if (status === 409) return options.conflict || CONFLICT_TEXT;
  if (status === 400 || status === 422) {
    const detail = readableDetail(response.data?.detail);
    if (detail) return detail;
  }
  return `Something went wrong on the Calvin server while trying to ${action}.`;
}

export default friendlyError;
