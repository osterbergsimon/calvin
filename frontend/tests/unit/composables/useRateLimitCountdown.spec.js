import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { effectScope } from "vue";
import { useRateLimitCountdown } from "@/composables/useRateLimitCountdown";

function inScope(fn) {
  const scope = effectScope();
  const result = scope.run(fn);
  return { ...result, stop: () => scope.stop() };
}

describe("useRateLimitCountdown", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-29T12:00:00Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("starts locked and formats m:ss", () => {
    const countdown = inScope(() => useRateLimitCountdown());
    expect(countdown.locked.value).toBe(false);

    countdown.start(47);
    expect(countdown.locked.value).toBe(true);
    expect(countdown.remaining.value).toBe("0:47");

    countdown.stop();
  });

  it("ticks down every second against an absolute deadline", () => {
    const countdown = inScope(() => useRateLimitCountdown());

    countdown.start(120);
    vi.advanceTimersByTime(1000);
    expect(countdown.remaining.value).toBe("1:59");
    vi.advanceTimersByTime(59000);
    expect(countdown.remaining.value).toBe("1:00");

    countdown.stop();
  });

  it("reaches 0:00, unlocks and stops its interval", () => {
    const countdown = inScope(() => useRateLimitCountdown());

    countdown.start(2);
    vi.advanceTimersByTime(2000);

    expect(countdown.remaining.value).toBe("0:00");
    expect(countdown.locked.value).toBe(false);

    countdown.stop();
  });

  it("does not drift when the timer fires late (background tab)", () => {
    const countdown = inScope(() => useRateLimitCountdown());

    countdown.start(60);
    vi.setSystemTime(new Date("2026-10-29T12:00:30Z"));
    vi.advanceTimersByTime(1000);

    expect(countdown.remaining.value).toBe("0:29");

    countdown.stop();
  });

  it("can be reset and started again", () => {
    const countdown = inScope(() => useRateLimitCountdown());

    countdown.start(10);
    countdown.reset();
    expect(countdown.locked.value).toBe(false);
    expect(countdown.remaining.value).toBe("0:00");

    countdown.start(5);
    expect(countdown.remaining.value).toBe("0:05");

    countdown.stop();
  });
});
