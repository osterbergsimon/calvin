import { describe, it, expect, vi } from "vitest";
import { showSystemRebootFailed, showSystemRebootScheduled } from "@/utils/systemNotifications";

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

describe("showSystemRebootFailed", () => {
  it("shows the server's host-control message instead of a generic error", () => {
    const notify = vi.fn();
    const message =
      "Rebooting is disabled on this deployment. Set CALVIN_HOST_CONTROL=1 if Calvin owns this machine.";

    showSystemRebootFailed({ notify }, message);

    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({ severity: "error", eyebrow: "Reboot", message })
    );
  });

  it("falls back when no message is available", () => {
    const notify = vi.fn();
    showSystemRebootFailed({ notify }, "");

    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({ severity: "error", message: "Failed to reboot this device." })
    );
  });
});
