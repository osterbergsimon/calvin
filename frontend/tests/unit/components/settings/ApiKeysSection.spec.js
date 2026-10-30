import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { ref } from "vue";
import api from "@/services/api";
import { logDebug, logError } from "@/utils/logger";
import ApiKeysSection from "@/components/settings/categories/security/ApiKeysSection.vue";

const environment = ref(null);
vi.mock("@/composables/useSystem", () => ({
  useSystem: () => ({ environment, loadEnvironment: vi.fn(() => Promise.resolve(null)) }),
}));
vi.mock("@/utils/logger", () => ({ logDebug: vi.fn(), logError: vi.fn(), logWarn: vi.fn() }));

const SECRET = "clv_7Hq2abcDEFghiJKLmnoPQRstuVWXyz0123456789AB";

const NOW = new Date("2026-10-30T12:00:00Z");
const key = (over = {}) => ({
  id: "k1",
  name: "Home Assistant",
  scope: "read",
  prefix: "clv_7Hq2",
  createdAt: "2026-10-28T09:00:00Z",
  lastUsedAt: null,
  ...over,
});

function httpError(status, detail = {}) {
  return { response: { status, data: { detail } }, config: { url: "/auth/keys" } };
}

let wrapper;
async function mountSection(keys = []) {
  api.get.mockResolvedValueOnce({ data: { keys } });
  wrapper = mount(ApiKeysSection, { attachTo: document.body });
  await flushPromises();
  return wrapper;
}
const find = sel => wrapper.find(`[data-test='${sel}']`);
const get = sel => wrapper.get(`[data-test='${sel}']`);

async function openForm() {
  await get("api-keys-create").trigger("click");
}
async function fillName(name) {
  await get("api-key-name").setValue(name);
}
async function submit() {
  await get("api-key-form").trigger("submit");
  await flushPromises();
}
async function createKey(name = "Home Assistant", record = key()) {
  await openForm();
  await fillName(name);
  api.post.mockResolvedValueOnce({ data: { key: record, secret: SECRET } });
  await submit();
}

describe("ApiKeysSection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"] });
    vi.setSystemTime(NOW);
    environment.value = null;
    localStorage.clear();
    sessionStorage.clear();
  });
  afterEach(() => {
    wrapper?.unmount();
    vi.useRealTimers();
    document.body.innerHTML = "";
  });

  describe("empty state and form", () => {
    it("shows the empty state and opens the form from Create key", async () => {
      await mountSection();
      expect(wrapper.text()).toContain("No API keys yet.");
      expect(wrapper.text()).toContain(
        "Create one to let Home Assistant or a script read or change Calvin."
      );
      expect(find("api-key-form").exists()).toBe(false);
      await openForm();
      expect(find("api-key-form").exists()).toBe(true);
      expect(find("api-keys-empty").exists()).toBe(false);
    });

    it("renders the section title, intro and id", async () => {
      await mountSection();
      expect(wrapper.find("#section-security-api-keys").exists()).toBe(true);
      expect(wrapper.text()).toContain("API keys");
      expect(wrapper.text()).toContain(
        "Let apps and scripts, like Home Assistant, use Calvin without the admin password. Give each one its own key."
      );
    });

    it("requires a name and does not send the request", async () => {
      await mountSection();
      await openForm();
      await submit();
      expect(wrapper.text()).toContain("Give the key a name.");
      expect(api.post).not.toHaveBeenCalled();
    });

    it("limits the name to 40 characters", async () => {
      await mountSection();
      await openForm();
      expect(get("api-key-name").attributes("maxlength")).toBe("40");
      expect(get("api-key-name").attributes("placeholder")).toBe("Home Assistant");
      expect(wrapper.text()).toContain("So you know which app uses it.");
    });

    it("rejects a duplicate name, case-insensitively, before any request", async () => {
      await mountSection([key()]);
      await openForm();
      await fillName("home assistant");
      await submit();
      expect(wrapper.text()).toContain("You already have a key called home assistant.");
      expect(api.post).not.toHaveBeenCalled();
    });

    it("shows the duplicate error when the server answers 409", async () => {
      await mountSection();
      await openForm();
      await fillName("Script");
      api.post.mockRejectedValueOnce(httpError(409, { code: "duplicate_name" }));
      await submit();
      expect(wrapper.text()).toContain("You already have a key called Script.");
    });

    it("defaults to Read and sends the chosen scope", async () => {
      await mountSection();
      await openForm();
      expect(get("scope-read").element.checked).toBe(true);
      await get("scope-admin").setValue(true);
      await fillName("Script");
      api.post.mockResolvedValueOnce({ data: { key: key({ scope: "admin" }), secret: SECRET } });
      await submit();
      expect(api.post).toHaveBeenCalledWith("/auth/keys", { name: "Script", scope: "admin" });
    });

    it("uses the verbatim scope copy in a labelled fieldset", async () => {
      await mountSection();
      await openForm();
      expect(wrapper.get("fieldset legend").text()).toBe("What it can do");
      const text = wrapper.get("fieldset").text();
      expect(text).toContain("See calendars, photos, settings and status. Can't change anything.");
      expect(text).toContain(
        "Everything Read can, plus change settings and content, like signing in as admin."
      );
      expect(text).toContain(
        "Everything Admin can, plus restart Calvin, reboot this machine and install updates."
      );
    });

    it("Host control shows the warning and needs the checkbox before Create", async () => {
      await mountSection();
      await openForm();
      await fillName("Script");
      expect(find("api-key-host-ack").exists()).toBe(false);
      await get("scope-host").setValue(true);
      expect(wrapper.text()).toContain(
        "Anyone with this key can reboot the machine Calvin runs on."
      );
      expect(wrapper.text()).toContain("I understand this key can reboot this machine.");
      expect(get("api-key-submit").attributes("disabled")).toBeDefined();
      await get("api-key-host-ack").setValue(true);
      expect(get("api-key-submit").attributes("disabled")).toBeUndefined();
    });

    it("clears the tick when the scope changes away", async () => {
      await mountSection();
      await openForm();
      await get("scope-host").setValue(true);
      await get("api-key-host-ack").setValue(true);
      await get("scope-admin").setValue(true);
      await get("scope-host").setValue(true);
      expect(get("api-key-host-ack").element.checked).toBe(false);
      expect(get("api-key-submit").attributes("disabled")).toBeDefined();
    });

    it("disables Host control when the server has no host control", async () => {
      environment.value = { host_control: false };
      await mountSection();
      await openForm();
      const radio = get("scope-host");
      expect(radio.attributes("disabled")).toBeDefined();
      expect(get("scope-card-host").attributes("aria-disabled")).toBe("true");
      expect(wrapper.text()).toContain("Not available: this Calvin doesn't control its machine.");
    });

    it("keeps Host control enabled while the environment is unknown", async () => {
      environment.value = null;
      await mountSection();
      await openForm();
      expect(get("scope-host").attributes("disabled")).toBeUndefined();
      expect(get("scope-card-host").attributes("aria-disabled")).toBeUndefined();
    });

    it("shows the touch hint only on a wide touch kiosk", async () => {
      Object.defineProperty(navigator, "maxTouchPoints", { value: 5, configurable: true });
      Object.defineProperty(window, "innerWidth", { value: 1024, configurable: true });
      await mountSection();
      await openForm();
      expect(wrapper.text()).toContain(
        "Easier on the computer where you'll paste it: the key is only shown once."
      );
      Object.defineProperty(navigator, "maxTouchPoints", { value: 0, configurable: true });
    });

    it("Cancel closes the form without a request", async () => {
      await mountSection();
      await openForm();
      await get("api-key-cancel").trigger("click");
      expect(find("api-key-form").exists()).toBe(false);
      expect(api.post).not.toHaveBeenCalled();
    });

    it("a failed create keeps the form values and says so", async () => {
      await mountSection();
      await openForm();
      await fillName("Script");
      await get("scope-admin").setValue(true);
      api.post.mockRejectedValueOnce(httpError(500));
      await submit();
      expect(wrapper.text()).toContain("Couldn't create the key. Try again.");
      expect(get("api-key-name").element.value).toBe("Script");
      expect(get("scope-admin").element.checked).toBe(true);
    });

    it("a 401 keeps the form and leaves the sign-in dialog to the global handler", async () => {
      await mountSection();
      await openForm();
      await fillName("Script");
      api.post.mockRejectedValueOnce(httpError(401, { code: "admin_required" }));
      await submit();
      expect(get("api-key-name").element.value).toBe("Script");
      expect(wrapper.text()).not.toContain("Couldn't create the key.");
    });

    it("shows Creating… and disables the button while saving", async () => {
      await mountSection();
      await openForm();
      await fillName("Script");
      let resolve;
      api.post.mockReturnValueOnce(new Promise(r => (resolve = r)));
      await get("api-key-form").trigger("submit");
      expect(get("api-key-submit").text()).toBe("Creating…");
      expect(get("api-key-submit").attributes("disabled")).toBeDefined();
      resolve({ data: { key: key(), secret: SECRET } });
      await flushPromises();
    });
  });

  describe("show once", () => {
    it("shows the secret panel and moves focus to its title", async () => {
      await mountSection();
      await createKey();
      expect(find("api-key-form").exists()).toBe(false);
      expect(get("api-key-result-title").text()).toBe("Copy your key now");
      expect(wrapper.text()).toContain(
        "You won't be able to see it again. If you lose it, revoke it and create a new one."
      );
      const input = get("api-key-secret");
      expect(input.element.value).toBe(SECRET);
      expect(input.attributes("readonly")).toBeDefined();
      expect(input.attributes("aria-label")).toBe("New API key for Home Assistant");
      expect(wrapper.text()).toContain("Authorization: Bearer <key>");
      expect(document.activeElement).toBe(get("api-key-result-title").element);
    });

    it("Done removes the secret everywhere and lists the new key first", async () => {
      await mountSection([key({ id: "old", name: "Old", createdAt: "2026-10-01T00:00:00Z" })]);
      await createKey("Home Assistant", key({ id: "new" }));
      await get("api-key-done").trigger("click");
      expect(find("api-key-result").exists()).toBe(false);
      expect(document.body.innerHTML).not.toContain(SECRET);
      expect(wrapper.html()).not.toContain(SECRET);
      const rows = wrapper.findAll("[data-test='api-key-row']");
      expect(rows.map(r => r.text())[0]).toContain("Home Assistant");
      expect(rows).toHaveLength(2);
    });

    it("discards the secret when the section unmounts", async () => {
      await mountSection();
      await createKey();
      wrapper.unmount();
      expect(document.body.innerHTML).not.toContain(SECRET);
      wrapper = null;
    });

    it("never writes the secret to storage or the logger", async () => {
      const setItem = vi.spyOn(Storage.prototype, "setItem");
      await mountSection();
      await createKey();
      await get("api-key-copy").trigger("click");
      await flushPromises();
      await get("api-key-done").trigger("click");
      const everything = JSON.stringify([
        setItem.mock.calls,
        logDebug.mock.calls,
        logError.mock.calls,
        Object.entries(localStorage),
        Object.entries(sessionStorage),
      ]);
      expect(everything).not.toContain(SECRET);
      setItem.mockRestore();
    });

    describe("copy", () => {
      afterEach(() => {
        delete navigator.clipboard;
        delete document.execCommand;
        Object.defineProperty(window, "isSecureContext", { value: false, configurable: true });
      });

      it("uses the Clipboard API in a secure context and announces it", async () => {
        const writeText = vi.fn(() => Promise.resolve());
        Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
        Object.defineProperty(window, "isSecureContext", { value: true, configurable: true });
        await mountSection();
        await createKey();
        await get("api-key-copy").trigger("click");
        await flushPromises();
        expect(writeText).toHaveBeenCalledWith(SECRET);
        expect(get("api-key-copy").text()).toContain("✓ Copied");
        expect(get("api-key-live").text()).toBe("Key copied.");
        expect(get("api-key-live").attributes("aria-live")).toBe("polite");
        vi.advanceTimersByTime(2000);
        await flushPromises();
        expect(get("api-key-copy").text()).not.toContain("Copied");
      });

      it("falls back to execCommand on plain HTTP", async () => {
        document.execCommand = vi.fn(() => true);
        await mountSection();
        await createKey();
        await get("api-key-copy").trigger("click");
        await flushPromises();
        expect(document.execCommand).toHaveBeenCalledWith("copy");
        expect(get("api-key-copy").text()).toContain("✓ Copied");
      });

      it("shows Select and copy plus the Ctrl+C hint when both fail", async () => {
        document.execCommand = vi.fn(() => false);
        await mountSection();
        await createKey();
        await get("api-key-copy").trigger("click");
        await flushPromises();
        expect(get("api-key-copy").text()).toBe("Select and copy");
        expect(wrapper.text()).toContain(
          "Press Ctrl+C (or long-press → Copy) to copy the selected key."
        );
      });
    });
  });

  describe("list", () => {
    it("shows a scope chip per scope, with the warning mark for Host control", async () => {
      await mountSection([
        key({ id: "a", name: "A", scope: "read" }),
        key({ id: "b", name: "B", scope: "admin" }),
        key({ id: "c", name: "C", scope: "host" }),
      ]);
      const chips = wrapper.findAll("[data-test='api-key-scope']").map(c => c.text());
      expect(chips).toEqual(["Read", "Admin", "⚠ Host control"]);
      expect(wrapper.findAll("[data-test='api-key-scope']")[2].classes()).toContain(
        "api-keys__chip--host"
      );
    });

    it("formats prefix, created and last used", async () => {
      await mountSection([
        key({ id: "a", name: "Never" }),
        key({
          id: "b",
          name: "Recent",
          createdAt: "2025-03-04T00:00:00Z",
          lastUsedAt: "2026-10-30T11:48:00Z",
        }),
        key({ id: "c", name: "Hours", lastUsedAt: "2026-10-30T09:00:00Z" }),
        key({ id: "d", name: "Days", lastUsedAt: "2026-10-28T12:00:00Z" }),
        key({ id: "e", name: "Old", lastUsedAt: "2026-09-02T12:00:00Z" }),
        key({ id: "f", name: "Now", lastUsedAt: "2026-10-30T11:59:40Z" }),
      ]);
      const text = id =>
        wrapper
          .findAll("[data-test='api-key-row']")
          .find(r => r.text().includes(id))
          .text();
      expect(text("Never")).toContain("clv_7Hq2…");
      expect(text("Never")).toContain("Created 28 Oct");
      expect(text("Never")).toContain("Never used");
      expect(text("Recent")).toContain("Created 4 Mar 2025");
      expect(text("Recent")).toContain("Last used 12 min ago");
      expect(text("Hours")).toContain("Last used 3 h ago");
      expect(text("Days")).toContain("Last used 2 days ago");
      expect(text("Old")).toContain("Last used 2 Sep");
      expect(text("Now")).toContain("Last used just now");
    });

    it("explains a host key that can't act on this server", async () => {
      environment.value = { host_control: false };
      await mountSection([key({ scope: "host" })]);
      expect(wrapper.text()).toContain(
        "Host actions are blocked: this Calvin doesn't control its machine."
      );
    });

    it("shows Create key below the rows and reopens the form", async () => {
      await mountSection([key()]);
      await openForm();
      expect(find("api-key-form").exists()).toBe(true);
      expect(find("api-key-row").exists()).toBe(true);
    });

    it("shows a retry when loading fails", async () => {
      api.get.mockRejectedValueOnce(httpError(500));
      wrapper = mount(ApiKeysSection, { attachTo: document.body });
      await flushPromises();
      expect(wrapper.text()).toContain("Couldn't load API keys.");
      api.get.mockResolvedValueOnce({ data: { keys: [key()] } });
      await get("api-keys-retry").trigger("click");
      await flushPromises();
      expect(find("api-key-row").exists()).toBe(true);
    });

    it("shows skeleton rows while loading", async () => {
      api.get.mockReturnValueOnce(new Promise(() => {}));
      wrapper = mount(ApiKeysSection, { attachTo: document.body });
      await flushPromises();
      expect(wrapper.findAll("[data-test='api-keys-skeleton']")).toHaveLength(3);
    });
  });

  describe("revoke", () => {
    it("asks first, then deletes, removes the row and announces it", async () => {
      await mountSection([key()]);
      await get("api-key-revoke").trigger("click");
      expect(document.body.textContent).toContain('Revoke "Home Assistant"?');
      expect(document.body.textContent).toContain(
        "Apps using this key stop working right away. This can't be undone."
      );
      expect(api.delete).not.toHaveBeenCalled();
      api.delete.mockResolvedValueOnce({ status: 204 });
      const confirm = [...document.body.querySelectorAll("button")].find(
        b => b.textContent.trim() === "Revoke key"
      );
      confirm.click();
      await flushPromises();
      expect(api.delete).toHaveBeenCalledWith("/auth/keys/k1");
      expect(find("api-key-row").exists()).toBe(false);
      expect(get("api-key-live").text()).toBe("Home Assistant revoked.");
    });

    it("Cancel leaves the key alone", async () => {
      await mountSection([key()]);
      await get("api-key-revoke").trigger("click");
      const cancel = [...document.body.querySelectorAll("button")].find(
        b => b.textContent.trim() === "Cancel"
      );
      cancel.click();
      await flushPromises();
      expect(api.delete).not.toHaveBeenCalled();
      expect(find("api-key-row").exists()).toBe(true);
    });

    it("on failure closes the dialog and shows the error on the row", async () => {
      await mountSection([key()]);
      await get("api-key-revoke").trigger("click");
      api.delete.mockRejectedValueOnce(httpError(500));
      [...document.body.querySelectorAll("button")]
        .find(b => b.textContent.trim() === "Revoke key")
        .click();
      await flushPromises();
      expect(document.body.textContent).not.toContain('Revoke "Home Assistant"?');
      expect(get("api-key-row-error").text()).toBe("Couldn't revoke this key. Try again.");
      expect(find("api-key-row").exists()).toBe(true);
    });
  });
});
