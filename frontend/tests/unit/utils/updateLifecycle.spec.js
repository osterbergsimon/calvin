import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  UPDATE_IDLE,
  UPDATE_PHASES,
  isUpdateBusy,
  nextUpdate,
  serverStatusEvent,
  updatePhaseLabel,
  updateView,
} from "@/utils/updateLifecycle";

const run = (...events) => events.reduce(nextUpdate, UPDATE_IDLE);

describe("Calvin update lifecycle", () => {
  it("goes start → running → restarting → done on a good update", () => {
    const states = [];
    let state = UPDATE_IDLE;
    for (const event of [
      { type: "start" },
      { type: "progress", phase: "pulling_code" },
      { type: "installed" },
      { type: "healthy" },
    ]) {
      state = nextUpdate(state, event);
      states.push(state.stage);
    }
    expect(states).toEqual(["starting", "running", "restarting", "done"]);
    expect(updateView(state)).toMatchObject({ message: "Calvin is up to date.", tone: "success" });
  });

  it("is busy only while an update is in flight", () => {
    expect(isUpdateBusy(UPDATE_IDLE)).toBe(false);
    for (const stage of ["starting", "running", "following", "waiting", "restarting"]) {
      expect(isUpdateBusy({ stage }), stage).toBe(true);
    }
    for (const stage of ["done", "unconfirmed", "failed", "slow"]) {
      expect(isUpdateBusy({ stage }), stage).toBe(false);
    }
  });

  it("ignores a late event once the update has settled", () => {
    const done = run({ type: "start" }, { type: "installed" }, { type: "healthy" });
    expect(nextUpdate(done, { type: "progress", phase: "restarting" })).toBe(done);
    expect(nextUpdate(done, { type: "failed" })).toBe(done);
    expect(nextUpdate(UPDATE_IDLE, { type: "installed" })).toBe(UPDATE_IDLE);
  });

  it("does not start a second update while one runs", () => {
    const running = run({ type: "start" }, { type: "progress", phase: "pulling_code" });
    expect(nextUpdate(running, { type: "start" })).toBe(running);
  });

  it("ignores late events while Calvin restarts on the new version", () => {
    const restarting = run(
      { type: "start" },
      { type: "progress", phase: "complete" },
      { type: "installed" }
    );
    expect(restarting.stage).toBe("restarting");
    for (const event of [
      { type: "progress", phase: "refreshing_host" },
      { type: "streamLost" },
      { type: "log", line: "> vite build" },
      { type: "unreachable" },
    ]) {
      expect(nextUpdate(restarting, event).stage, event.type).toBe("restarting");
    }
    expect(nextUpdate(restarting, { type: "healthy" }).stage).toBe("done");
  });

  it("keeps following after the stream drops, and waits while Calvin restarts", () => {
    const lost = run({ type: "start" }, { type: "progress" }, { type: "streamLost" });
    expect(lost.stage).toBe("following");
    expect(isUpdateBusy(lost)).toBe(true);
    const waiting = nextUpdate(lost, { type: "unreachable" });
    expect(updateView(waiting)).toMatchObject({ tone: "warning" });
    expect(nextUpdate(waiting, { type: "reachable" }).stage).toBe("following");
    expect(nextUpdate(waiting, { type: "progress", phase: "restarting" }).stage).toBe("running");
  });

  it("only confirms or doubts a restart after the script finished", () => {
    const running = run({ type: "start" }, { type: "progress" });
    expect(nextUpdate(running, { type: "healthy" })).toBe(running);
    const restarting = nextUpdate(running, { type: "installed" });
    expect(nextUpdate(restarting, { type: "notHealthy" }).stage).toBe("unconfirmed");
  });

  it("names each failure, and clears it after a while", () => {
    const failedToStart = run({ type: "start" }, { type: "startFailed", message: "No network." });
    expect(updateView(failedToStart)).toMatchObject({
      message: "No network.",
      tone: "error",
      clearAfterMs: 8000,
    });
    expect(updateView(run({ type: "start" }, { type: "failed" })).message).toBe(
      "The update didn't finish. Calvin is still on the previous version."
    );
    expect(updateView(run({ type: "start" }, { type: "timedOut" }))).toMatchObject({
      tone: "warning",
      clearAfterMs: 12000,
    });
  });

  it("says when the screens are being built, for that phase only", () => {
    const building = run(
      { type: "start" },
      { type: "progress", phase: "pulling_code" },
      { type: "log", line: "> vite build" }
    );
    expect(updateView(building).message).toBe(
      "Preparing the screens. This can take a few minutes."
    );
    const restarting = nextUpdate(building, { type: "progress", phase: "restarting" });
    expect(updateView(restarting).message).toBe("Restarting Calvin…");
  });

  it("maps the server's two words for success to one event", () => {
    expect(serverStatusEvent({ status: "complete" })).toEqual({ type: "installed" });
    expect(serverStatusEvent({ status: "idle" })).toEqual({ type: "installed" });
    expect(serverStatusEvent({ status: "error" })).toEqual({ type: "failed" });
    expect(serverStatusEvent({ status: "running", phase: "rollback" })).toMatchObject({
      type: "progress",
      phase: "rollback",
    });
    expect(serverStatusEvent({ status: "unknown" })).toBeNull();
  });

  it("labels old phase names and leaves unknown ones blank", () => {
    expect(updatePhaseLabel("building_frontend")).toBe("Preparing the screens");
    expect(updatePhaseLabel("building")).toBe("Preparing the screens");
    expect(updatePhaseLabel("deps")).toBe("Installing");
    expect(updatePhaseLabel("PULLING_CODE")).toBe("Downloading");
    expect(updatePhaseLabel("something-new")).toBe("");
    expect(updatePhaseLabel(null)).toBe("");
  });

  // The phases are the update script's; this keeps the words in step with it.
  it("has words for every phase scripts/update-calvin.sh writes", () => {
    // Vitest runs from frontend/; the script is in the repo's scripts/.
    const script = readFileSync(resolve(process.cwd(), "../scripts/update-calvin.sh"), "utf-8");
    const phases = new Set([...script.matchAll(/UPDATE_PHASE="([a-z_]+)"/g)].map(m => m[1]));
    expect(phases.size).toBeGreaterThan(4);
    for (const phase of phases) {
      expect(UPDATE_PHASES[phase], `phase "${phase}" has no words`).toBeTruthy();
    }
  });
});
