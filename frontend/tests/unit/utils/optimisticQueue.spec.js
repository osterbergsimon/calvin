import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createOptimisticQueue, SAVE_DEBOUNCE_MS } from "@/utils/optimisticQueue";

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("createOptimisticQueue", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows a pending value at once and saves after the quiet period", async () => {
    const save = vi.fn(async () => {});
    const queue = createOptimisticQueue({ initial: { x: "a" }, save });

    const pending = queue.setPartial({ x: "b" });
    expect(queue.display.value.x).toBe("b");
    expect(save).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(SAVE_DEBOUNCE_MS);
    expect(save).toHaveBeenCalledTimes(1);
    expect(save.mock.calls[0][0].changes).toEqual({ x: "b" });
    await pending;
    expect(queue.display.value.x).toBe("b");
    expect(queue.pending.value).toEqual({});
  });

  it("sends one save carrying every key changed inside the debounce (cross-key)", async () => {
    const save = vi.fn(async () => {});
    const queue = createOptimisticQueue({ initial: { x: 1, y: 2 }, save });

    queue.setPartial({ x: 10 });
    queue.setPartial({ y: 20 });
    await vi.advanceTimersByTimeAsync(SAVE_DEBOUNCE_MS);

    expect(save).toHaveBeenCalledTimes(1);
    expect(save.mock.calls[0][0].changes).toEqual({ x: 10, y: 20 });
    expect(queue.display.value).toEqual({ x: 10, y: 20 });
  });

  it("sends a key queued during an in-flight save on top of the confirmed value", async () => {
    const first = deferred();
    const save = vi
      .fn()
      .mockImplementationOnce(() => first.promise)
      .mockResolvedValueOnce();
    const queue = createOptimisticQueue({ initial: { x: 1, y: 2 }, save });

    queue.setPartial({ x: 10 });
    await vi.advanceTimersByTimeAsync(SAVE_DEBOUNCE_MS);
    expect(save).toHaveBeenCalledTimes(1);

    queue.setPartial({ y: 20 });
    first.resolve();
    await vi.advanceTimersByTimeAsync(SAVE_DEBOUNCE_MS);

    expect(save).toHaveBeenCalledTimes(2);
    expect(save.mock.calls[1][0].changes).toEqual({ y: 20 });
    expect(save.mock.calls[1][0].snapshot).toEqual({ x: 10, y: 20 });
    expect(queue.display.value).toEqual({ x: 10, y: 20 });
  });

  it("keeps a newer tap when an earlier in-flight save fails", async () => {
    const first = deferred();
    const save = vi
      .fn()
      .mockImplementationOnce(() => first.promise)
      .mockResolvedValueOnce();
    const queue = createOptimisticQueue({ initial: { x: "server", y: "same" }, save });

    const firstTap = queue.setPartial({ x: "first" });
    const firstFailure = expect(firstTap).rejects.toThrow("offline");
    await vi.advanceTimersByTimeAsync(SAVE_DEBOUNCE_MS);

    const secondTap = queue.setPartial({ x: "second" });
    first.reject(new Error("offline"));
    await firstFailure;

    // The failed first value is gone, the newer tap is still displayed.
    expect(queue.display.value.x).toBe("second");
    expect(queue.display.value.y).toBe("same");

    await vi.advanceTimersByTimeAsync(SAVE_DEBOUNCE_MS);
    expect(save).toHaveBeenCalledTimes(2);
    expect(save.mock.calls[1][0].changes).toEqual({ x: "second" });
    await secondTap;
  });

  it("rolls a double failure back to the last confirmed value", async () => {
    const save = vi.fn().mockRejectedValue(new Error("offline"));
    const queue = createOptimisticQueue({ initial: { x: "server" }, save });

    const first = queue.setPartial({ x: "first" });
    const firstFailure = expect(first).rejects.toThrow("offline");
    await vi.advanceTimersByTimeAsync(SAVE_DEBOUNCE_MS);
    await firstFailure;
    expect(queue.display.value.x).toBe("server");

    const second = queue.setPartial({ x: "second" });
    const secondFailure = expect(second).rejects.toThrow("offline");
    await vi.advanceTimersByTimeAsync(SAVE_DEBOUNCE_MS);
    await secondFailure;

    // Not "first" (a value that was never persisted).
    expect(queue.display.value.x).toBe("server");
  });

  it("shows a later server change after a failed save", async () => {
    const save = vi.fn().mockRejectedValue(new Error("offline"));
    const queue = createOptimisticQueue({ initial: { x: "server" }, save });

    const failed = queue.setPartial({ x: "mine" });
    const failure = expect(failed).rejects.toThrow("offline");
    await vi.advanceTimersByTimeAsync(SAVE_DEBOUNCE_MS);
    await failure;
    expect(queue.display.value.x).toBe("server");

    queue.confirm({ x: "changed elsewhere" });
    expect(queue.display.value.x).toBe("changed elsewhere");
  });

  it("does not let a server change overwrite a pending key", async () => {
    const save = vi.fn(async () => {});
    const queue = createOptimisticQueue({ initial: { x: "server", y: "old" }, save });

    queue.setPartial({ x: "mine" });
    queue.confirm({ x: "server", y: "new" });

    expect(queue.display.value).toEqual({ x: "mine", y: "new" });
    await vi.advanceTimersByTimeAsync(SAVE_DEBOUNCE_MS);
    expect(save.mock.calls[0][0].changes).toEqual({ x: "mine" });
    expect(save.mock.calls[0][0].snapshot).toEqual({ x: "mine", y: "new" });
  });

  it("replaces the whole target and saves deletions", async () => {
    const save = vi.fn(async () => {});
    const queue = createOptimisticQueue({ initial: { x: 1, y: 2 }, save });

    queue.replaceAll({ x: 1 });
    expect(queue.display.value).toEqual({ x: 1 });

    await vi.advanceTimersByTimeAsync(SAVE_DEBOUNCE_MS);
    expect(save.mock.calls[0][0]).toEqual({
      changes: {},
      deleted: ["y"],
      snapshot: { x: 1 },
      merge: false,
    });
    expect(queue.display.value).toEqual({ x: 1 });
  });

  it("marks a batch as mergeable only when every pending key is a partial write", async () => {
    const save = vi.fn(async () => {});
    const queue = createOptimisticQueue({ initial: { x: 1, y: 2 }, save });

    queue.setPartial({ x: 10 }, { merge: true });
    await vi.advanceTimersByTimeAsync(SAVE_DEBOUNCE_MS);
    expect(save.mock.calls[0][0].merge).toBe(true);

    // A whole-target write (or a deletion) is not a partial write.
    queue.replaceAll({ x: 1, y: 2 });
    await vi.advanceTimersByTimeAsync(SAVE_DEBOUNCE_MS);
    expect(save.mock.calls[1][0].merge).toBe(false);

    queue.setPartial({ y: 3 }, { merge: true });
    queue.deleteKeys(["x"]);
    await vi.advanceTimersByTimeAsync(SAVE_DEBOUNCE_MS);
    expect(save.mock.calls[2][0].merge).toBe(false);
  });

  it("moves only the successfully sent keys onto confirmed", async () => {
    const save = vi.fn().mockResolvedValueOnce().mockRejectedValueOnce(new Error("offline"));
    const queue = createOptimisticQueue({ initial: { x: "a", y: "b" }, save });

    const first = queue.setPartial({ x: "x1" });
    await vi.advanceTimersByTimeAsync(SAVE_DEBOUNCE_MS);
    await first;

    const second = queue.setPartial({ y: "y1" });
    const failure = expect(second).rejects.toThrow("offline");
    await vi.advanceTimersByTimeAsync(SAVE_DEBOUNCE_MS);
    await failure;

    expect(queue.display.value).toEqual({ x: "x1", y: "b" });
  });

  it("flushes a pending save immediately", async () => {
    const save = vi.fn(async () => {});
    const queue = createOptimisticQueue({ initial: {}, save });

    const pending = queue.setPartial({ x: 1 });
    await queue.flush();

    expect(save).toHaveBeenCalledTimes(1);
    expect(save.mock.calls[0][0].changes).toEqual({ x: 1 });
    await pending;
  });

  it("flushes both an in-flight save and a newer queued value", async () => {
    const first = deferred();
    const save = vi
      .fn()
      .mockImplementationOnce(() => first.promise)
      .mockResolvedValueOnce();
    const queue = createOptimisticQueue({ initial: {}, save });

    queue.setPartial({ x: 1 });
    await vi.advanceTimersByTimeAsync(SAVE_DEBOUNCE_MS);
    queue.setPartial({ y: 2 });

    const flushing = queue.flush();
    first.resolve();
    await flushing;

    expect(save).toHaveBeenCalledTimes(2);
    expect(save.mock.calls[1][0].changes).toEqual({ y: 2 });
    expect(queue.display.value).toEqual({ x: 1, y: 2 });
  });

  it("loads the confirmed target before the first save when it is not loaded yet", async () => {
    const save = vi.fn(async () => {});
    const load = vi.fn(async () => ({ x: "server", y: "kept" }));
    const queue = createOptimisticQueue({ initial: {}, loaded: false, load, save });

    queue.setPartial({ x: "mine" });
    await vi.advanceTimersByTimeAsync(SAVE_DEBOUNCE_MS);

    expect(load).toHaveBeenCalledTimes(1);
    expect(save.mock.calls[0][0].changes).toEqual({ x: "mine" });
    expect(save.mock.calls[0][0].snapshot).toEqual({ x: "mine", y: "kept" });
    expect(queue.display.value).toEqual({ x: "mine", y: "kept" });
  });

  describe("page close (calvin-msa8)", () => {
    it("tells save to use keepalive only for a flush made on page close", async () => {
      const save = vi.fn(async () => {});
      const queue = createOptimisticQueue({ initial: {}, save });

      queue.setPartial({ x: 1 });
      await queue.flush({ keepalive: true });
      queue.setPartial({ x: 2 });
      await queue.flush();

      expect(save.mock.calls[0][1]).toEqual({ keepalive: true });
      expect(save.mock.calls[1][1]).toEqual({ keepalive: false });
    });

    it("keeps a caller waiting while its key is re-tapped, until the newer value saves", async () => {
      const first = deferred();
      const save = vi
        .fn()
        .mockImplementationOnce(() => first.promise)
        .mockResolvedValueOnce();
      const queue = createOptimisticQueue({ initial: {}, save });
      const settled = [];

      const early = queue.setPartial({ x: 1 }).then(() => settled.push("early"));
      await vi.advanceTimersByTimeAsync(SAVE_DEBOUNCE_MS);
      // x is tapped again while the first save is in flight.
      const late = queue.setPartial({ x: 2 }).then(() => settled.push("late"));

      first.resolve();
      await vi.advanceTimersByTimeAsync(0);
      expect(settled).toEqual([]);

      await vi.advanceTimersByTimeAsync(SAVE_DEBOUNCE_MS);
      await Promise.all([early, late]);
      expect(save).toHaveBeenCalledTimes(2);
      expect(save.mock.calls[1][0].changes).toEqual({ x: 2 });
      expect(settled.sort()).toEqual(["early", "late"]);
    });
  });
});
