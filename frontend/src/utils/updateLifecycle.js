/**
 * Calvin's own update (System › Updates) as one explicit state machine.
 *
 * The server half lives in scripts/update-calvin.sh, which writes a status
 * (running | success | error) and a phase to its state file, and in
 * backend/app/services/update_lifecycle.py, which turns that into the API's
 * status (running | idle | error | unknown; the live stream says "complete"
 * for idle). This half adds what only the browser sees: the live stream
 * dropping, Calvin not answering while it restarts, and watching too long.
 *
 *   idle ──start──▶ starting ──progress──▶ running ◀──progress──┐
 *                      │                  │  │  │              │
 *                 startFailed        streamLost │ unreachable    │
 *                      ▼                  ▼     ▼               │
 *                   failed            following ─▶ waiting ──────┘
 *                                          │    (Calvin restarting)
 *   starting|running|following|waiting ──installed──▶ restarting
 *                    │  │                                │
 *        timedOut ───┘  └──failed──▶ failed              ├─healthy──▶ done
 *                                                       └─notHealthy▶ unconfirmed
 *   restarting ignores late progress, log, streamLost and unreachable events.
 *
 * Every state names what the person sees (message and tone) in one table,
 * so a new phase or outcome is one entry here, not a string in a handler.
 * Events that do not apply to the current state are ignored: a late stream
 * event cannot turn "up to date" back into "updating".
 */

/**
 * Phases the update script writes (UPDATE_PHASE in scripts/update-calvin.sh).
 * A unit test reads the script and fails if a phase is missing here.
 * `label` is the short readout in System › Updates; `message` the progress
 * line under the button.
 */
export const UPDATE_PHASES = {
  starting: { label: "Starting", message: "Starting the update…" },
  healthcheck: { label: "Checking", message: "Checking Calvin before the update…" },
  pulling_code: { label: "Downloading", message: "Downloading the update…" },
  pulling_image: { label: "Downloading", message: "Downloading the update…" },
  refreshing_host: { label: "Installing", message: "Installing…" },
  restarting: { label: "Restarting", message: "Restarting Calvin…" },
  preparing_screens: {
    label: "Preparing the screens",
    message: "Preparing the screens…",
  },
  rollback: {
    label: "Going back to the previous version",
    message: "The new version didn't start. Going back to the previous one…",
  },
  complete: { label: "Finishing", message: "Update installed. Waiting for Calvin to restart…" },
};

// Phase names older update scripts wrote; still read from an old state file.
const LEGACY_PHASES = {
  pulling: "pulling_code",
  downloading: "pulling_code",
  deps: "refreshing_host",
  installing: "refreshing_host",
  dependencies: "refreshing_host",
  building: "preparing_screens",
  building_frontend: "preparing_screens",
};

const knownPhase = phase => {
  const key = String(phase ?? "").toLowerCase();
  if (UPDATE_PHASES[key]) return key;
  return LEGACY_PHASES[key] ?? null;
};

/** The short label for a server phase, or "" for one we don't know. */
export function updatePhaseLabel(phase) {
  const key = knownPhase(phase);
  return key ? UPDATE_PHASES[key].label : "";
}

// A development update builds the screens on the Pi, which takes minutes;
// the log is the only place that says so.
const BUILD_LINE = /(building frontend|vite.*build|npm run build)/i;

export const UPDATE_IDLE = Object.freeze({ stage: "idle" });

const BUSY = new Set(["starting", "running", "following", "waiting", "restarting"]);

/** True while an update is in flight (the Update button shows its spinner). */
export const isUpdateBusy = state => BUSY.has(state.stage);

/**
 * Map an API status to an event. The stream says "complete", the status
 * endpoint "idle", for the same thing: the script finished successfully.
 */
export function serverStatusEvent({ status, phase, message } = {}) {
  if (status === "complete" || status === "idle") return { type: "installed" };
  if (status === "error") return { type: "failed" };
  if (status === "running") return { type: "progress", phase, message };
  return null; // "unknown": nothing to say yet
}

/** The next state. Unknown or out-of-place events leave it unchanged. */
export function nextUpdate(state, event) {
  const busy = isUpdateBusy(state);
  switch (event.type) {
    case "start":
      return busy ? state : { stage: "starting" };
    // Watching an update this page did not start (or picking one up again).
    case "follow":
      return busy ? state : { stage: "following" };
    case "startFailed":
      return state.stage === "starting" ? { stage: "failed", message: event.message || "" } : state;
    default:
      break;
  }
  if (!busy) return state;

  // The script has finished and Calvin is restarting on the new version.
  // Only the restart's own outcome moves it on: a late stream, log or status
  // event must not turn "installed" back into "updating".
  if (state.stage === "restarting") {
    switch (event.type) {
      case "healthy":
        return { stage: "done" };
      case "notHealthy":
        return { stage: "unconfirmed" };
      case "timedOut":
        return { stage: "slow" };
      default:
        return state;
    }
  }

  switch (event.type) {
    case "progress":
      return {
        stage: "running",
        phase: knownPhase(event.phase) ?? state.phase ?? null,
        serverMessage: event.message || "",
        // The build line belongs to the phase it appeared in.
        building:
          Boolean(state.building) && (knownPhase(event.phase) ?? state.phase) === state.phase,
      };
    case "log":
      return BUILD_LINE.test(event.line || "") ? { ...state, building: true } : state;
    case "streamLost":
      return { ...state, stage: "following" };
    case "unreachable":
      return { ...state, stage: "waiting" };
    // The status endpoint did not answer usefully, but Calvin itself did.
    // Already following: return the same state so a poll that changes nothing
    // does not make useSystem rewrite the message (and cancel its timer).
    case "reachable":
      return state.stage === "following" ? state : { ...state, stage: "following" };
    case "installed":
      return { stage: "restarting" };
    case "healthy":
    case "notHealthy":
      // Only a restart can confirm or doubt an update.
      return state;
    case "failed":
      return { stage: "failed", message: "" };
    case "timedOut":
      return { stage: "slow" };
    default:
      return state;
  }
}

const FAILED = "The update didn't finish. Calvin is still on the previous version.";

/**
 * What the person sees for a state: the line under the button, its tone
 * (info | success | warning | error), and when it clears itself.
 */
export function updateView(state) {
  switch (state.stage) {
    case "starting":
      return { message: "Update started.", tone: "info" };
    case "running": {
      if (state.building) {
        return {
          message: "Preparing the screens. This can take a few minutes.",
          tone: "info",
        };
      }
      const phase = state.phase ? UPDATE_PHASES[state.phase] : null;
      return { message: phase?.message || "Update in progress…", tone: "info" };
    }
    case "following":
      return { message: "Checking on the update…", tone: "info" };
    case "waiting":
      return { message: "Calvin is restarting. This takes about 15 seconds.", tone: "warning" };
    case "restarting":
      return { message: "Update installed. Waiting for Calvin to restart…", tone: "info" };
    case "done":
      return { message: "Calvin is up to date.", tone: "success" };
    case "unconfirmed":
      return {
        message: "Update installed, but Calvin hasn't restarted yet. Give it a minute.",
        tone: "warning",
      };
    case "failed":
      return { message: state.message || FAILED, tone: "error", clearAfterMs: 8000 };
    case "slow":
      return {
        message: "The update is taking longer than usual. Leave it running and check back later.",
        tone: "warning",
        clearAfterMs: 12000,
      };
    default:
      return { message: "", tone: "" };
  }
}
