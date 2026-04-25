import { describe, it, expect, vi } from "vitest";
import { ref } from "vue";
import { showSystemRebootScheduled } from "@/utils/systemNotifications";

describe("showSystemRebootScheduled", () => {
  it("calls NotificationSystem.show with success payload when available", () => {
    const show = vi.fn();
    const notificationRef = ref({ show });

    showSystemRebootScheduled(notificationRef);

    expect(show).toHaveBeenCalledTimes(1);
    expect(show).toHaveBeenCalledWith("success", "✓", "System rebooting in a few seconds…", 3500);
  });

  it("does nothing when ref is null", () => {
    expect(() => showSystemRebootScheduled(ref(null))).not.toThrow();
  });

  it("does nothing when show is missing", () => {
    const notificationRef = ref({});
    expect(() => showSystemRebootScheduled(notificationRef)).not.toThrow();
  });
});
