import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import PhotoUpload from "@/components/settings/tabs/content/PhotoUpload.vue";
import { useImagesStore } from "@/stores/images";

const file = name => new File(["x"], name, { type: "image/jpeg" });

const choose = async (wrapper, files) => {
  const input = wrapper.find('[data-test="photo-upload-input"]');
  Object.defineProperty(input.element, "files", { value: files, configurable: true });
  await input.trigger("change");
  await flushPromises();
};

describe("PhotoUpload (F3 landing spot for 'Add photos')", () => {
  let store;
  beforeEach(() => {
    store = useImagesStore();
    store.images = [];
    store.fetchImages = vi.fn().mockResolvedValue(undefined);
    store.uploadImage = vi.fn().mockResolvedValue({});
  });

  it("uploads every chosen file and reports success", async () => {
    const wrapper = mount(PhotoUpload);
    await choose(wrapper, [file("a.jpg"), file("b.jpg")]);

    expect(store.uploadImage).toHaveBeenCalledTimes(2);
    expect(wrapper.find('[role="status"]').text()).toBe("Uploaded 2 photos.");
  });

  it("reports which files failed", async () => {
    store.uploadImage = vi
      .fn()
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce({ response: { data: { detail: "Unsupported file format" } } });
    const wrapper = mount(PhotoUpload);
    await choose(wrapper, [file("a.jpg"), file("b.txt")]);

    const text = wrapper.find('[role="status"]').text();
    expect(text).toContain("Uploaded 1 of 2");
    expect(text).toContain("b.txt: Unsupported file format");
  });

  it("describes uploads as landing in Local photos, with the count", () => {
    store.images = [{ id: "a" }, { id: "b" }];
    const wrapper = mount(PhotoUpload);

    const description = wrapper.findComponent({ name: "SettingRow" }).props("description");
    expect(description).toBe(
      "Upload JPG, PNG, WebP or GIF files into Local photos. 2 photos so far."
    );
    expect(description).not.toContain("Local Images");
  });

  it("the button opens the file picker", async () => {
    const wrapper = mount(PhotoUpload);
    const click = vi.spyOn(wrapper.find('[data-test="photo-upload-input"]').element, "click");
    await wrapper.find('[data-test="photo-upload-btn"]').trigger("click");
    expect(click).toHaveBeenCalled();
  });
});
