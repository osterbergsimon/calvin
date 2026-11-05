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
});
