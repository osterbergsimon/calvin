import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { createRouter, createMemoryHistory } from "vue-router";
import api from "@/services/api";
import GuestShare from "@/views/GuestShare.vue";

vi.mock("@/utils/logger", () => ({ logDebug: vi.fn(), logError: vi.fn(), logWarn: vi.fn() }));

const TOKEN = "abc123.SECRET";
const upload = id => ({
  imageId: id,
  uploadedAt: "2026-11-01T11:00:00Z",
  thumbnail: `/api/guest/${TOKEN}/uploads/${id}/thumbnail`,
});

let wrapper;
let router;

function respond({ info = { name: "Grandma", available: true }, uploads = [] } = {}) {
  api.get.mockImplementation(url => {
    if (url === `/guest/${encodeURIComponent(TOKEN)}`) {
      return info instanceof Error ? Promise.reject(info) : Promise.resolve({ data: info });
    }
    if (url.endsWith("/uploads")) return Promise.resolve({ data: { uploads } });
    return Promise.reject(new Error(`unexpected ${url}`));
  });
}

async function mountPage(query = "") {
  router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: "/share/:token/", component: GuestShare, meta: { guest: true } }],
  });
  router.push(`/share/${TOKEN}/${query}`);
  await router.isReady();
  wrapper = mount(GuestShare, { global: { plugins: [router] }, attachTo: document.body });
  await flushPromises();
  return wrapper;
}

const find = sel => wrapper.find(`[data-test='${sel}']`);
const get = sel => wrapper.get(`[data-test='${sel}']`);

function pick(files) {
  const input = get("guest-file-input");
  Object.defineProperty(input.element, "files", { value: files, configurable: true });
  return input.trigger("change");
}

const photo = name => new File(["x"], name, { type: "image/jpeg" });

describe("GuestShare", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
    document.head.innerHTML = '<link rel="manifest" href="/site.webmanifest">';
  });
  afterEach(() => {
    wrapper?.unmount();
    document.body.innerHTML = "";
  });

  it("greets with the link's name and one big Add photos button", async () => {
    respond();
    await mountPage();
    expect(wrapper.text()).toContain("Add photos for Grandma");
    const button = get("guest-add");
    expect(button.text()).toContain("Add photos");
    const input = get("guest-file-input");
    expect(input.attributes("type")).toBe("file");
    expect(input.attributes("accept")).toContain("image/*");
    expect(input.attributes("multiple")).toBeDefined();
  });

  it("points the page at this link's manifest so it installs as a share target", async () => {
    respond();
    await mountPage();
    expect(document.querySelector('link[rel="manifest"]').getAttribute("href")).toBe(
      `/api/guest/${encodeURIComponent(TOKEN)}/manifest.webmanifest`
    );
  });

  it("explains a revoked or expired link", async () => {
    respond({ info: Object.assign(new Error("404"), { response: { status: 404 } }) });
    await mountPage();
    expect(find("guest-invalid").exists()).toBe(true);
    expect(wrapper.text()).toContain("This link doesn't work any more");
    expect(find("guest-add").exists()).toBe(false);
  });

  it("explains a share-target redirect for a dead link", async () => {
    respond({ info: Object.assign(new Error("404"), { response: { status: 404 } }) });
    await mountPage("?error=share_link_invalid");
    expect(find("guest-invalid").exists()).toBe(true);
  });

  it("shows the guest's own recent uploads as thumbnails", async () => {
    respond({ uploads: [upload("a"), upload("b")] });
    await mountPage();
    const thumbs = wrapper.findAll("[data-test='guest-thumb'] img");
    expect(thumbs).toHaveLength(2);
    expect(thumbs[0].attributes("src")).toBe(`/api/guest/${TOKEN}/uploads/a/thumbnail`);
  });

  it("uploads each picked photo with progress and adds it to the list", async () => {
    respond();
    await mountPage();
    let finish;
    api.post.mockImplementationOnce((url, form, config) => {
      config.onUploadProgress({ loaded: 50, total: 100 });
      return new Promise(resolve => {
        finish = () => resolve({ data: { uploaded: [upload("new1")], failed: [] } });
      });
    });
    api.post.mockResolvedValueOnce({ data: { uploaded: [upload("new2")], failed: [] } });

    await pick([photo("one.jpg"), photo("two.jpg")]);
    await flushPromises();
    expect(get("guest-progress").text()).toContain("Sending 1 of 2");
    expect(get("guest-progress-bar").attributes("aria-valuenow")).toBe("25");

    finish();
    await flushPromises();
    expect(api.post).toHaveBeenCalledTimes(2);
    const [url, form] = api.post.mock.calls[0];
    expect(url).toBe(`/guest/${encodeURIComponent(TOKEN)}/uploads`);
    expect(form.get("photos").name).toBe("one.jpg");
    expect(wrapper.findAll("[data-test='guest-thumb']")).toHaveLength(2);
    expect(get("guest-status").text()).toContain("2 photos added");
  });

  it("reports a photo the server refused and carries on", async () => {
    respond();
    await mountPage();
    api.post.mockRejectedValueOnce({
      response: { status: 400, data: { detail: { message: "This file isn't a photo." } } },
    });
    api.post.mockResolvedValueOnce({ data: { uploaded: [upload("ok")], failed: [] } });
    await pick([photo("bad.jpg"), photo("good.jpg")]);
    await flushPromises();
    expect(get("guest-status").text()).toContain("1 photo added");
    expect(get("guest-errors").text()).toContain("bad.jpg: This file isn't a photo.");
  });

  it("removes one of the guest's own photos", async () => {
    respond({ uploads: [upload("a")] });
    await mountPage();
    api.delete.mockResolvedValueOnce({});
    await get("guest-remove").trigger("click");
    await flushPromises();
    document.querySelector("[data-test='confirm-accept']").click();
    await flushPromises();
    expect(api.delete).toHaveBeenCalledWith(`/guest/${encodeURIComponent(TOKEN)}/uploads/a`);
    expect(find("guest-thumb").exists()).toBe(false);
  });

  it("says how many photos came in after sharing from the gallery", async () => {
    respond({ uploads: [upload("a")] });
    await mountPage("?added=3&failed=1");
    expect(get("guest-status").text()).toBe("3 photos added. 1 couldn't be added.");
    expect(wrapper.text()).not.toContain("Thank you");
    // The query is dropped so a reload doesn't repeat the message.
    expect(router.currentRoute.value.query).toEqual({});
  });

  it("explains a share that was too large", async () => {
    respond();
    await mountPage("?error=too_large");
    expect(get("guest-errors").text()).toContain("Too many photos at once");
  });

  it("uses the shared EmptyState for a dead link and Card for the photos", async () => {
    respond({ info: Object.assign(new Error("404"), { response: { status: 404 } }) });
    await mountPage();
    expect(get("guest-invalid").classes()).toContain("empty-state");
    wrapper.unmount();

    respond({ uploads: [upload("a")] });
    await mountPage();
    expect(get("guest-recent").classes()).toContain("card");
    expect(get("guest-recent").text()).toContain("Your photos");
  });

  it("names each Remove button instead of repeating the thumbnail's alt text", async () => {
    respond({ uploads: [upload("a"), upload("b"), upload("c")] });
    await mountPage();
    const images = wrapper.findAll("[data-test='guest-thumb'] img");
    expect(images.map(img => img.attributes("alt"))).toEqual(["", "", ""]);
    const labels = wrapper
      .findAll("[data-test='guest-remove']")
      .map(b => b.attributes("aria-label"));
    expect(labels).toEqual(["Remove photo 1 of 3", "Remove photo 2 of 3", "Remove photo 3 of 3"]);
  });

  it("announces once: the progress text is not a second live region", async () => {
    respond();
    await mountPage();
    api.post.mockImplementationOnce(() => new Promise(() => {}));
    await pick([photo("one.jpg")]);
    await flushPromises();
    const progress = get("guest-progress");
    expect(progress.find("[aria-live]").exists()).toBe(false);
    expect(progress.attributes("aria-live")).toBeUndefined();
    expect(progress.find("[role='progressbar']").exists()).toBe(true);
    expect(wrapper.findAll("[role='status'], [aria-live]")).toHaveLength(1);
  });
});
