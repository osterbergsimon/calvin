import { describe, it, expect } from "vitest";
import { detailMessage, errorDetailMessage } from "@/utils/apiErrors";

describe("api error details", () => {
  const hostControlDetail = {
    code: "host_control_disabled",
    message:
      "Rebooting is disabled on this deployment. Set CALVIN_HOST_CONTROL=1 if Calvin owns this machine.",
  };

  it("unwraps a structured host_control_disabled detail", () => {
    const error = { response: { status: 409, data: { detail: hostControlDetail } } };

    expect(errorDetailMessage(error, "Failed")).toBe(hostControlDetail.message);
  });

  it("keeps plain string details working", () => {
    expect(detailMessage("Service unavailable", "Failed")).toBe("Service unavailable");
  });

  it("falls back for missing or unknown details", () => {
    expect(errorDetailMessage({}, "Failed")).toBe("Failed");
    expect(errorDetailMessage(new Error("network"), "Failed")).toBe("Failed");
    expect(detailMessage({ code: "other" }, "Failed")).toBe("Failed");
  });
});
