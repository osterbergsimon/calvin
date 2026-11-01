/**
 * ReloadLight (CLV-115): Settings and phone views get no loading light, except
 * the app light while Reload UI or a service-worker update is under way.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";

const route = { name: "settings", path: "/settings" };
vi.mock("vue-router", () => ({ useRoute: () => route }));

import ReloadLight from "@/components/ReloadLight.vue";
import { RELOAD_SOURCE_ID, useProgressStore } from "@/stores/progress";
import { reloadWithLight } from "@/utils/reloadWithLight";

const light = wrapper => wrapper.find(".loading-indicator");

describe("ReloadLight (CLV-115)", () => {
  let progress;

  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    setActivePinia(createPinia());
    progress = useProgressStore();
    route.name = "settings";
    route.path = "/settings";
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("Settings shows no light for ordinary loads", async () => {
    const wrapper = mount(ReloadLight);
    progress.begin("calendar:sources:settings");
    progress.begin("plugin:statusbar");
    await vi.advanceTimersByTimeAsync(1000);
    expect(light(wrapper).exists()).toBe(false);
  });

  it("Settings shows the app light during Reload UI, fixed to the viewport", async () => {
    const wrapper = mount(ReloadLight);
    reloadWithLight({ reload: () => {} });
    await vi.advanceTimersByTimeAsync(0);
    expect(light(wrapper).exists()).toBe(true);
    expect(light(wrapper).classes()).toContain("loading-light--viewport");
    expect(light(wrapper).classes()).not.toContain("is-active");

    await vi.advanceTimersByTimeAsync(400);
    expect(light(wrapper).classes()).toContain("is-active");
  });

  it("a quick reload never lights up (same 400 ms delay)", async () => {
    const wrapper = mount(ReloadLight);
    progress.begin(RELOAD_SOURCE_ID);
    await vi.advanceTimersByTimeAsync(300);
    expect(light(wrapper).classes()).not.toContain("is-active");
  });

  it("stays out of the dashboard, which draws its own app light", async () => {
    route.name = "dashboard";
    route.path = "/";
    const wrapper = mount(ReloadLight);
    progress.begin(RELOAD_SOURCE_ID);
    await vi.advanceTimersByTimeAsync(1000);
    expect(light(wrapper).exists()).toBe(false);
  });
});
