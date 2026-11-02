import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import api from "@/services/api";
import LocalPhotosBrowser from "@/components/settings/shared/LocalPhotosBrowser.vue";

const photo = (over = {}) => ({
  id: "img-1",
  filename: "garden.jpg",
  source: "local-images",
  folder: "",
  modified: "2026-10-28T10:00:00Z",
  width: 1200,
  height: 800,
  size: 1024,
  ...over,
});

const link = (over = {}) => ({
  id: "l1",
  name: "Grandma",
  folder: "Guests",
  createdAt: "2026-10-30T09:00:00Z",
  lastUsedAt: null,
  expiresAt: null,
  expired: false,
  uploadCount: 2,
  ...over,
});

let wrapper;
let images;
let links;
let folders;

function mockApi({ photos = [], shareLinks = [], shareFolders = [] } = {}) {
  images = [...photos];
  links = [...shareLinks];
  folders = [...shareFolders];
  api.get.mockImplementation(url => {
    if (url === "/images/list") return Promise.resolve({ data: { images } });
    if (url === "/share/links") return Promise.resolve({ data: { links } });
    if (url === "/share/folders") return Promise.resolve({ data: { folders } });
    return Promise.resolve({ data: {} });
  });
  api.delete.mockImplementation(url => {
    const imageId = String(url).split("/").pop();
    images = images.filter(image => image.id !== imageId);
    return Promise.resolve({ data: {} });
  });
}

async function mountBrowser() {
  wrapper = mount(LocalPhotosBrowser, { attachTo: document.body });
  await flushPromises();
  await flushPromises();
  return wrapper;
}

const tiles = () => wrapper.findAll("[data-test='photo-tile']");
const tileNames = () => tiles().map(tile => tile.get("[data-test='photo-name']").text());
const radio = label => wrapper.findAll('[role="radio"]').find(button => button.text() === label);
const select = filename => wrapper.get(`[aria-label='Select ${filename}']`);

describe("LocalPhotosBrowser", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  afterEach(() => {
    wrapper?.unmount();
    document.body.innerHTML = "";
  });

  it("shows every local photo in a thumbnail grid with its date", async () => {
    mockApi({
      photos: [photo(), photo({ id: "img-2", filename: "party.jpg", folder: "Guests" })],
      shareLinks: [link()],
      shareFolders: ["Guests"],
    });
    await mountBrowser();

    expect(wrapper.get("[data-test='local-photos-browser']").exists()).toBe(true);
    expect(tiles()).toHaveLength(2);
    expect(wrapper.text()).toContain("garden.jpg");
    expect(wrapper.text()).toContain("28 Oct");
    expect(tiles()[0].get("img").attributes("src")).toBe("/api/images/img-1/thumbnail");
  });

  it("filters by All, the top-level library and each share-link folder", async () => {
    mockApi({
      photos: [
        photo(),
        photo({ id: "img-2", filename: "party.jpg", folder: "Guests" }),
        photo({ id: "img-3", filename: "beach.jpg", folder: "Holiday" }),
      ],
      shareLinks: [link()],
      shareFolders: ["Guests", "Holiday"],
    });
    await mountBrowser();

    expect(wrapper.findAll('[role="radio"]').map(button => button.text())).toEqual([
      "All",
      "Library",
      "Grandma",
      "Holiday",
    ]);
    expect(tiles()).toHaveLength(3);

    await radio("Grandma").trigger("click");
    expect(tileNames()).toEqual(["party.jpg"]);
    expect(tiles()[0].text()).toContain("From Grandma");

    await radio("Holiday").trigger("click");
    expect(tileNames()).toEqual(["beach.jpg"]);
    expect(tiles()[0].text()).toContain("From Holiday");

    await radio("Library").trigger("click");
    expect(tileNames()).toEqual(["garden.jpg"]);
    expect(tiles()[0].text()).not.toContain("From ");

    await radio("All").trigger("click");
    expect(tiles()).toHaveLength(3);
  });

  it("attributes a guest photo to the share link that used its folder", async () => {
    mockApi({
      photos: [photo({ id: "img-2", filename: "party.jpg", folder: "Guests" })],
      shareLinks: [link()],
      shareFolders: ["Guests"],
    });
    await mountBrowser();

    expect(tiles()[0].text()).toContain("From Grandma");
  });

  it("asks before deleting one photo", async () => {
    mockApi({ photos: [photo(), photo({ id: "img-2", filename: "party.jpg" })] });
    await mountBrowser();

    await select("garden.jpg").trigger("click");
    await wrapper.get("[data-test='delete-selected']").trigger("click");

    expect(document.body.textContent).toContain("Delete garden.jpg?");
    expect(api.delete).not.toHaveBeenCalled();

    document.querySelector("[data-test='confirm-accept']").click();
    await flushPromises();

    expect(api.delete).toHaveBeenCalledWith("/images/img-1");
    expect(tiles()).toHaveLength(1);
    expect(document.body.textContent).not.toContain("Delete garden.jpg?");
  });

  it("deletes a multi-photo selection in one confirm", async () => {
    mockApi({ photos: [photo(), photo({ id: "img-2", filename: "party.jpg" })] });
    await mountBrowser();

    await select("garden.jpg").trigger("click");
    await select("party.jpg").trigger("click");
    await wrapper.get("[data-test='delete-selected']").trigger("click");

    expect(document.body.textContent).toContain("Delete 2 photos?");
    document.querySelector("[data-test='confirm-accept']").click();
    await flushPromises();

    expect(api.delete).toHaveBeenCalledTimes(2);
    expect(tiles()).toHaveLength(0);
  });

  it("shows an empty state with an upload action when Local photos is empty", async () => {
    mockApi({ photos: [], shareLinks: [link()], shareFolders: ["Guests"] });
    await mountBrowser();

    expect(wrapper.get("[data-test='local-photos-empty']").text()).toContain("No photos yet.");
    expect(wrapper.get("[data-test='empty-state-action']").text()).toBe("Upload photos");
  });

  it("uploads through the existing image upload path", async () => {
    mockApi({ photos: [] });
    await mountBrowser();

    const input = wrapper.get("[data-test='local-photos-input']");
    Object.defineProperty(input.element, "files", {
      value: [new File(["x"], "new.jpg", { type: "image/jpeg" })],
      configurable: true,
    });
    await input.trigger("change");
    await flushPromises();

    expect(api.post).toHaveBeenCalledWith(
      "/images/upload",
      expect.any(FormData),
      expect.objectContaining({ timeout: expect.any(Number) })
    );
  });
});
