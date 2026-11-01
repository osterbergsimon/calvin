import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import api from "@/services/api";
import ShareLinksSection from "@/components/settings/tabs/content/ShareLinksSection.vue";

vi.mock("@/utils/serverUrl", () => ({
  resolveServerUrl: vi.fn(() => Promise.resolve("http://calvin.local:8000")),
}));
vi.mock("@/utils/logger", () => ({ logDebug: vi.fn(), logError: vi.fn(), logWarn: vi.fn() }));
vi.mock("qrcode", () => ({
  default: { toDataURL: vi.fn(value => Promise.resolve(`data:image/png;qr,${value}`)) },
}));

const NOW = new Date("2026-11-01T12:00:00Z");
const link = (over = {}) => ({
  id: "l1",
  name: "Grandma",
  folder: "Guests",
  createdAt: "2026-10-30T09:00:00Z",
  lastUsedAt: null,
  expiresAt: null,
  expired: false,
  uploadCount: 0,
  path: "/share/l1.TOKEN/",
  ...over,
});

let wrapper;
async function mountSection(links = [], folders = []) {
  api.get.mockImplementation(url =>
    Promise.resolve({ data: url === "/share/folders" ? { folders } : { links } })
  );
  wrapper = mount(ShareLinksSection, { attachTo: document.body });
  await flushPromises();
  return wrapper;
}
const find = sel => wrapper.find(`[data-test='${sel}']`);
const get = sel => wrapper.get(`[data-test='${sel}']`);
const rows = () => wrapper.findAll("[data-test='share-link-row']");

describe("ShareLinksSection", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
  });
  afterEach(() => {
    wrapper?.unmount();
    vi.useRealTimers();
    document.body.innerHTML = "";
  });

  it("shows an empty state with a create button", async () => {
    await mountSection();
    expect(find("share-links-empty").exists()).toBe(true);
    await get("share-links-create").trigger("click");
    expect(find("share-link-form").exists()).toBe(true);
  });

  it("lists links with folder, dates and photo count", async () => {
    await mountSection([
      link(),
      link({
        id: "l2",
        name: "Party",
        folder: "Party",
        uploadCount: 3,
        lastUsedAt: "2026-11-01T11:00:00Z",
        expired: true,
      }),
    ]);
    expect(rows()).toHaveLength(2);
    expect(rows()[0].text()).toContain("Grandma");
    expect(rows()[0].text()).toContain("Folder Guests");
    expect(rows()[0].text()).toContain("Created 30 Oct");
    expect(rows()[0].text()).toContain("Never used");
    expect(rows()[0].text()).toContain("0 photos");
    expect(rows()[1].text()).toContain("Last used 1 h ago");
    expect(rows()[1].text()).toContain("3 photos");
    expect(rows()[1].find("[data-test='share-link-expired']").exists()).toBe(true);
  });

  it("creates a link and shows its QR code and URL right away", async () => {
    await mountSection([], ["Party"]);
    await get("share-links-create").trigger("click");
    await wrapper.get("#share-link-name").setValue("Grandma");
    expect(wrapper.get("#share-link-folder").element.value).toBe("Guests");
    api.post.mockResolvedValueOnce({ data: { link: link() } });
    await get("share-link-form").trigger("submit");
    await flushPromises();

    expect(api.post).toHaveBeenCalledWith("/share/links", { name: "Grandma", folder: "Guests" });
    expect(find("share-link-form").exists()).toBe(false);
    expect(rows()).toHaveLength(1);
    const qr = get("share-link-qr");
    expect(qr.text()).toContain("http://calvin.local:8000/share/l1.TOKEN/");
    expect(qr.find("img").attributes("src")).toContain("/share/l1.TOKEN/");
  });

  it("sends the chosen expiry", async () => {
    await mountSection();
    await get("share-links-create").trigger("click");
    await wrapper.get("#share-link-name").setValue("Party");
    wrapper.findComponent({ name: "SelectPill" }).vm.$emit("update:modelValue", 7);
    api.post.mockResolvedValueOnce({ data: { link: link({ name: "Party" }) } });
    await get("share-link-form").trigger("submit");
    await flushPromises();
    expect(api.post).toHaveBeenCalledWith("/share/links", {
      name: "Party",
      folder: "Guests",
      expires_in_days: 7,
    });
  });

  it("asks for a name and reports a duplicate", async () => {
    await mountSection([link()]);
    await get("share-links-create").trigger("click");
    await get("share-link-form").trigger("submit");
    expect(wrapper.text()).toContain("Give the link a name.");
    expect(api.post).not.toHaveBeenCalled();

    await wrapper.get("#share-link-name").setValue("Other");
    api.post.mockRejectedValueOnce({ response: { status: 409 } });
    await get("share-link-form").trigger("submit");
    await flushPromises();
    expect(wrapper.text()).toContain("You already have a link called Other.");
  });

  it("re-shows the QR code and URL of an existing link", async () => {
    await mountSection([link()]);
    expect(find("share-link-qr").exists()).toBe(false);
    await get("share-link-show").trigger("click");
    await flushPromises();
    expect(get("share-link-qr").text()).toContain("http://calvin.local:8000/share/l1.TOKEN/");
    await get("share-link-show").trigger("click");
    expect(find("share-link-qr").exists()).toBe(false);
  });

  it("renames a link", async () => {
    await mountSection([link()]);
    await get("share-link-rename").trigger("click");
    await wrapper.get("#share-link-rename-l1").setValue("Nana");
    api.patch.mockResolvedValueOnce({ data: { link: link({ name: "Nana" }) } });
    await get("share-link-rename-form").trigger("submit");
    await flushPromises();
    expect(api.patch).toHaveBeenCalledWith("/share/links/l1", { name: "Nana" });
    expect(rows()[0].text()).toContain("Nana");
  });

  it("revokes a link, keeping its photos by default", async () => {
    await mountSection([link({ uploadCount: 2 })]);
    await get("share-link-revoke").trigger("click");
    await flushPromises();
    expect(document.body.textContent).toContain("Also remove the 2 photos sent with this link");
    api.delete.mockResolvedValueOnce({});
    document.querySelector("[data-test='share-link-revoke-confirm']").click();
    await flushPromises();
    expect(api.delete).toHaveBeenCalledWith("/share/links/l1", { params: undefined });
    expect(rows()).toHaveLength(0);
  });

  it("revokes a link and removes its photos when asked", async () => {
    await mountSection([link({ uploadCount: 2 })]);
    await get("share-link-revoke").trigger("click");
    await flushPromises();
    const box = document.querySelector("[data-test='share-link-remove-photos']");
    box.click();
    await flushPromises();
    api.delete.mockResolvedValueOnce({});
    document.querySelector("[data-test='share-link-revoke-confirm']").click();
    await flushPromises();
    expect(api.delete).toHaveBeenCalledWith("/share/links/l1", {
      params: { remove_photos: true },
    });
  });

  it("offers a retry when loading fails", async () => {
    api.get.mockRejectedValue({ response: { status: 500 } });
    wrapper = mount(ShareLinksSection, { attachTo: document.body });
    await flushPromises();
    expect(find("share-links-retry").exists()).toBe(true);
  });
});
