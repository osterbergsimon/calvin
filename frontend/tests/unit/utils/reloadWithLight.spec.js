import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { reloadWithLight } from "@/utils/reloadWithLight";
import { RELOAD_SOURCE_ID, useProgressStore } from "@/stores/progress";

describe("reloadWithLight (CLV-115)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    setActivePinia(createPinia());
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("starts the app light, then reloads", () => {
    const progress = useProgressStore();
    const reload = vi.fn(() => {
      expect(progress.isActive(RELOAD_SOURCE_ID)).toBe(true);
    });
    reloadWithLight({ reload });
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("shows on the app frame while the old page waits for the new one", async () => {
    const progress = useProgressStore();
    reloadWithLight({ reload: () => {} });
    await vi.advanceTimersByTimeAsync(400);
    expect(progress.appVisible).toBe(true);
  });
});
