import { describe, it, expect, vi } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import AddKioskPanel from "@/components/settings/shared/AddKioskPanel.vue";

vi.mock("@/utils/serverUrl", () => ({
  resolveServerUrl: vi.fn(() => Promise.resolve("http://192.0.2.20:8000")),
  settingsLink: (base, id) => `${base}/settings?setting=${id}`,
}));

vi.mock("qrcode", () => ({
  default: { toDataURL: vi.fn(async () => "data:image/png;base64,QR") },
}));

describe("AddKioskPanel (F6)", () => {
  it("shows the one-command Pi installer against this server", async () => {
    const w = mount(AddKioskPanel);
    await flushPromises();
    expect(w.find('[data-test="add-kiosk-command"]').text()).toBe(
      "curl -fsSL http://192.0.2.20:8000/api/kiosks/install.sh | sudo bash"
    );
  });

  it("builds a ?kiosk= URL (and QR) from a sanitised name", async () => {
    const w = mount(AddKioskPanel);
    await flushPromises();
    await w.find('[data-test="add-kiosk-name"]').setValue("Living room/TV");
    await flushPromises();
    expect(w.find('[data-test="phone-setup-url"]').text()).toBe(
      "http://192.0.2.20:8000/?kiosk=Living-roomTV"
    );
    expect(w.find(".phone-setup__qr").exists()).toBe(true);
  });

  it("copies the install command", async () => {
    const writeText = vi.fn().mockResolvedValue();
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    const w = mount(AddKioskPanel);
    await flushPromises();
    await w.find('[data-test="add-kiosk-copy"]').trigger("click");
    await flushPromises();
    expect(writeText).toHaveBeenCalledWith(
      "curl -fsSL http://192.0.2.20:8000/api/kiosks/install.sh | sudo bash"
    );
    expect(w.find('[data-test="add-kiosk-copy"]').text()).toBe("Copied");
  });
});
