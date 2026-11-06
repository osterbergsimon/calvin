import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { effectScope, ref } from "vue";

const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock("@/services/api", () => ({ default: api }));

import { useDisplayCheck } from "@/composables/useDisplayCheck";

const NOW = new Date("2026-11-05T10:00:00Z");

const run = (over = {}) => ({
  id: "r1",
  step: "detect",
  status: "running",
  active: true,
  level: 0,
  limit: null,
  log: [],
  requestedAt: "2026-11-05T09:59:58Z",
  updatedAt: "2026-11-05T09:59:59Z",
  ...over,
});

let scope;
function make(id = "kitchen") {
  scope = effectScope();
  return scope.run(() => useDisplayCheck(ref(id)));
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  api.get.mockReset();
  api.post.mockReset();
});
afterEach(() => {
  scope?.stop();
  vi.useRealTimers();
});

describe("useDisplayCheck", () => {
  it("loads the latest run from the public status endpoint", async () => {
    api.get.mockResolvedValue({ data: { run: run({ active: false, status: "done" }) } });
    const check = make();
    await check.load();
    expect(api.get).toHaveBeenCalledWith("/kiosks/kitchen/display-check");
    expect(check.run.value.status).toBe("done");
    expect(check.isActive.value).toBe(false);
  });

  it("starts a step, owns the run and polls every 2 s while it is active", async () => {
    api.post.mockResolvedValue({ data: run({ status: "requested" }) });
    api.get.mockResolvedValue({ data: { run: run() } });
    const check = make();
    await check.start("detect");
    expect(api.post).toHaveBeenCalledWith("/kiosks/kitchen/display-check/start", {
      step: "detect",
    });
    expect(check.ownsRun.value).toBe(true);
    expect(check.readOnly.value).toBe(false);
    await vi.advanceTimersByTimeAsync(2000);
    expect(api.get).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(4000);
    expect(api.get).toHaveBeenCalledTimes(3);
  });

  it("stops polling once the run is finished", async () => {
    api.post.mockResolvedValue({ data: run({ status: "requested" }) });
    api.get.mockResolvedValue({ data: { run: run({ status: "done", active: false }) } });
    const check = make();
    await check.start("detect");
    await vi.advanceTimersByTimeAsync(2000);
    expect(check.run.value.status).toBe("done");
    await vi.advanceTimersByTimeAsync(10000);
    expect(api.get).toHaveBeenCalledTimes(1);
  });

  it("opens read-only when another device already runs a check (409)", async () => {
    api.post.mockRejectedValue({
      response: { status: 409, data: { detail: { code: "display_check_active", run: run() } } },
    });
    api.get.mockResolvedValue({ data: { run: run() } });
    const check = make();
    await check.start("detect");
    expect(check.run.value.id).toBe("r1");
    expect(check.readOnly.value).toBe(true);
    expect(check.error.value).toBe("");
  });

  it("treats a run it did not start as read-only", async () => {
    api.get.mockResolvedValue({ data: { run: run({ id: "elsewhere" }) } });
    const check = make();
    await check.load();
    expect(check.readOnly.value).toBe(true);
  });

  it("sends the value for a conversion point", async () => {
    api.post.mockResolvedValue({ data: run({ step: "conversion", status: "requested" }) });
    const check = make();
    await check.start("conversion", { value: 19 });
    expect(api.post).toHaveBeenCalledWith("/kiosks/kitchen/display-check/start", {
      step: "conversion",
      value: 19,
    });
  });

  it("stop posts to the stop endpoint, even for a run it did not start", async () => {
    api.get.mockResolvedValue({ data: { run: run({ id: "elsewhere" }) } });
    api.post.mockResolvedValue({ data: run({ id: "elsewhere", action: "stop" }) });
    const check = make();
    await check.load();
    await check.stop();
    expect(api.post).toHaveBeenCalledWith("/kiosks/kitchen/display-check/stop");
  });

  it("stop ignores a 404 (the run already ended)", async () => {
    api.get.mockResolvedValue({ data: { run: run() } });
    api.post.mockRejectedValue({ response: { status: 404 } });
    const check = make();
    await check.load();
    await expect(check.stop()).resolves.toBeUndefined();
    expect(check.error.value).toBe("");
  });

  it("reports waiting after 10 s and not answering after 60 s of silence", async () => {
    api.get.mockResolvedValue({ data: { run: run() } });
    const check = make();
    await check.load();
    expect(check.silence.value).toBe("ok");
    await vi.advanceTimersByTimeAsync(12000);
    expect(check.silence.value).toBe("waiting");
    await vi.advanceTimersByTimeAsync(50000);
    expect(check.silence.value).toBe("silent");
  });

  it("saves the found limit", async () => {
    api.post.mockResolvedValue({ data: { id: "kitchen", brightnessLimit: 26, overrides: {} } });
    const check = make();
    const saved = await check.saveLimit();
    expect(api.post).toHaveBeenCalledWith("/kiosks/kitchen/display-check/save-limit");
    expect(saved.brightnessLimit).toBe(26);
  });

  it("says why a start failed", async () => {
    api.post.mockRejectedValue({ response: { status: 500 }, message: "boom" });
    const check = make();
    await check.start("detect");
    expect(check.error.value).toMatch(/Couldn't start/);
  });

  it("keeps the own-run marker only for runs it started", async () => {
    api.post.mockResolvedValue({ data: run({ id: "mine", status: "requested" }) });
    api.get.mockResolvedValue({ data: { run: run({ id: "mine" }) } });
    const check = make();
    await check.start("detect");
    expect(check.ownsRun.value).toBe(true);
    api.get.mockResolvedValue({ data: { run: run({ id: "other" }) } });
    await check.load();
    expect(check.ownsRun.value).toBe(false);
  });

  it("polls again after the dialog is closed and reopened while a run is still active", async () => {
    api.get.mockResolvedValue({ data: { run: run() } });
    const check = make();
    await check.load();
    await vi.advanceTimersByTimeAsync(2000);
    expect(api.get).toHaveBeenCalledTimes(2);
    check.dispose();
    await vi.advanceTimersByTimeAsync(10000);
    expect(api.get).toHaveBeenCalledTimes(2);
    await check.load();
    check.resume();
    await vi.advanceTimersByTimeAsync(4000);
    expect(api.get.mock.calls.length).toBeGreaterThanOrEqual(5);
  });

  it("resume does nothing without an active run", async () => {
    api.get.mockResolvedValue({ data: { run: run({ active: false, status: "done" }) } });
    const check = make();
    await check.load();
    check.resume();
    await vi.advanceTimersByTimeAsync(6000);
    expect(api.get).toHaveBeenCalledTimes(1);
  });

  it("recordVerdict tolerates an older backend but reports other failures", async () => {
    const check = make();
    api.post.mockRejectedValueOnce({ response: { status: 404 } });
    expect(await check.recordVerdict(true)).toBe(true);
    api.post.mockRejectedValueOnce({ response: { status: 500 } });
    expect(await check.recordVerdict(true)).toBe(false);
    expect(check.error.value).toMatch(/Couldn't save your answer/);
  });

  it("moves the running session to another step with the step endpoint", async () => {
    api.get.mockResolvedValue({ data: { run: run() } });
    api.post.mockResolvedValue({ data: run({ step: "conversion", value: 5 }) });
    const check = make();
    await check.load();
    const result = await check.changeStep("conversion", 5);
    expect(api.post).toHaveBeenCalledWith("/kiosks/kitchen/display-check/step", {
      step: "conversion",
      value: 5,
    });
    expect(result).toEqual({ ok: true });
    expect(check.run.value.step).toBe("conversion");
  });

  it("omits the value when a step has none", async () => {
    api.post.mockResolvedValue({ data: run({ step: "limit" }) });
    const check = make();
    await check.changeStep("limit");
    expect(api.post).toHaveBeenCalledWith("/kiosks/kitchen/display-check/step", { step: "limit" });
  });

  it("says the session is gone on 404 and already stopping on 409", async () => {
    const check = make();
    api.post.mockRejectedValueOnce({ response: { status: 404 } });
    expect(await check.changeStep("write")).toEqual({ gone: true });
    api.post.mockRejectedValueOnce({
      response: { status: 409, data: { detail: { code: "display_check_stopping" } } },
    });
    expect(await check.changeStep("write")).toEqual({ stopping: true });
    expect(check.error.value).toMatch(/already stopping/);
  });

  it("shows the cap inline when a value is above the safe limit", async () => {
    const check = make();
    api.post.mockRejectedValueOnce({
      response: {
        status: 422,
        data: { detail: { code: "value_above_limit", max: 22, message: "x" } },
      },
    });
    expect(await check.changeStep("conversion", 40)).toEqual({ capped: true, max: 22 });
    expect(check.error.value).toBe(
      "That's above this screen's safe limit. The most Calvin can set is 22."
    );
    api.post.mockRejectedValueOnce({
      response: { status: 422, data: { detail: { code: "value_above_limit", max: 22 } } },
    });
    await check.start("conversion", { value: 40 });
    expect(check.error.value).toMatch(/most Calvin can set is 22/);
  });

  it("explains a value above the run's ceiling, in a step and in a start", async () => {
    api.get.mockResolvedValue({ data: { run: run() } });
    const check = make();
    await check.load();
    api.post.mockRejectedValueOnce({
      response: {
        status: 422,
        data: { detail: { code: "value_above_ceiling", max: 12, message: "x" } },
      },
    });
    expect(await check.changeStep("conversion", 20)).toEqual({ capped: true, max: 12 });
    expect(check.error.value).toBe(
      "That's above what's safe for this check. The most Calvin can set is 12."
    );
    api.post.mockRejectedValueOnce({
      response: { status: 422, data: { detail: { code: "value_above_ceiling", max: 12 } } },
    });
    expect(await check.start("conversion", { value: 20 })).toBeNull();
    expect(check.error.value).toMatch(/most Calvin can set is 12/);
  });

  it("records the menu value the screen showed at the start", async () => {
    api.get.mockResolvedValue({ data: { run: run() } });
    const check = make();
    await check.load();
    api.post.mockResolvedValueOnce({ data: run({ menuAtStart: 28 }) });
    expect(await check.recordMenuAtStart(28)).toBe(true);
    expect(api.post).toHaveBeenLastCalledWith("/kiosks/kitchen/display-check/menu-at-start", {
      menu: 28,
    });
    expect(check.run.value.menuAtStart).toBe(28);
    api.post.mockRejectedValueOnce({ response: { status: 500 } });
    expect(await check.recordMenuAtStart(28)).toBe(false);
    expect(check.error.value).toMatch(/Couldn't save/);
  });

  it("does not call a long wait between steps silence", async () => {
    api.get.mockResolvedValue({ data: { run: run() } });
    const check = make();
    await check.load();
    await vi.advanceTimersByTimeAsync(120000);
    expect(check.silence.value).toBe("silent");
    api.post.mockResolvedValue({ data: run({ step: "limit" }) });
    await check.changeStep("limit");
    expect(check.silence.value).toBe("ok");
  });
});
