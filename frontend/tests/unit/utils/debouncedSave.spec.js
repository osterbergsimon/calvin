import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createDebouncedSave, SAVE_DEBOUNCE_MS } from "@/utils/debouncedSave";

describe("createDebouncedSave", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("saves once after the quiet period, with the latest payload", async () => {
    const save = vi.fn(async payload => payload);
    const saver = createDebouncedSave({ save });

    const first = saver.schedule("portrait");
    const second = saver.schedule("landscape");

    expect(save).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(SAVE_DEBOUNCE_MS);

    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith("landscape");
    await expect(first).resolves.toBe("landscape");
    await expect(second).resolves.toBe("landscape");
  });

  it("restarts the quiet period on every write", async () => {
    const save = vi.fn(async payload => payload);
    const saver = createDebouncedSave({ save });

    saver.schedule("a");
    await vi.advanceTimersByTimeAsync(SAVE_DEBOUNCE_MS - 50);
    saver.schedule("b");
    await vi.advanceTimersByTimeAsync(SAVE_DEBOUNCE_MS - 50);

    expect(save).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(50);
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith("b");
  });

  it("settles every waiting caller with the final save", async () => {
    const save = vi.fn(async () => "saved");
    const saver = createDebouncedSave({ save });

    const first = saver.schedule({ key: "a" });
    const second = saver.schedule({ key: "b" });
    await vi.advanceTimersByTimeAsync(SAVE_DEBOUNCE_MS);

    await expect(first).resolves.toBe("saved");
    await expect(second).resolves.toBe("saved");
  });

  it("rejects every waiting caller when the save fails", async () => {
    const error = new Error("offline");
    const save = vi.fn(async () => {
      throw error;
    });
    const saver = createDebouncedSave({ save });

    const first = saver.schedule("on");
    const second = saver.schedule("off");
    const settled = Promise.allSettled([first, second]);
    await vi.advanceTimersByTimeAsync(SAVE_DEBOUNCE_MS);

    await expect(settled).resolves.toEqual([
      { status: "rejected", reason: error },
      { status: "rejected", reason: error },
    ]);
  });

  it("sends a write made during an in-flight save as one follow-up", async () => {
    let release;
    const save = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise(resolve => {
            release = () => resolve("first");
          })
      )
      .mockImplementationOnce(async () => "second");
    const saver = createDebouncedSave({ save });

    saver.schedule("a");
    await vi.advanceTimersByTimeAsync(SAVE_DEBOUNCE_MS);
    expect(save).toHaveBeenCalledTimes(1);

    saver.schedule("b");
    saver.schedule("c");
    release();
    await vi.advanceTimersByTimeAsync(SAVE_DEBOUNCE_MS);

    expect(save).toHaveBeenCalledTimes(2);
    expect(save).toHaveBeenLastCalledWith("c");
  });

  it("flushes a pending write immediately", async () => {
    const save = vi.fn(async payload => payload);
    const saver = createDebouncedSave({ save });

    const pending = saver.schedule("portrait");
    await saver.flush();

    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith("portrait");
    await expect(pending).resolves.toBe("portrait");
  });

  it("cancels a pending write without calling save", async () => {
    const save = vi.fn();
    const saver = createDebouncedSave({ save });

    saver.schedule("portrait");
    saver.cancel();
    await vi.advanceTimersByTimeAsync(SAVE_DEBOUNCE_MS);

    expect(save).not.toHaveBeenCalled();
  });
});
