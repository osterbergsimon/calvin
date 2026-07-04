import { describe, it, expect, vi } from "vitest";
import { showSystemRebootScheduled } from "@/utils/systemNotifications";

describe("showSystemRebootScheduled", () => {
  it("pushes a success notification with the reboot payload", () => {
    const notify = vi.fn();
    showSystemRebootScheduled({ notify });

    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify).toHaveBeenCalledWith({
      severity: "success",
      eyebrow: "Reboot",
      message: "System rebooting in a few seconds…",
      duration: 3500,
    });
  });

  it("does nothing when the store is null", () => {
    expect(() => showSystemRebootScheduled(null)).not.toThrow();
  });

  it("does nothing when notify is missing", () => {
    expect(() => showSystemRebootScheduled({})).not.toThrow();
  });
});
