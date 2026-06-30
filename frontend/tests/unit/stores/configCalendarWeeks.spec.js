import { describe, it, expect, beforeEach } from "vitest";
import { setActivePinia, createPinia } from "pinia";
import { useConfigStore } from "@/stores/config";

describe("config store — calendarWeeks", () => {
  beforeEach(() => setActivePinia(createPinia()));
  it("defaults to 4", () => {
    expect(useConfigStore().calendarWeeks).toBe(4);
  });
  it("syncs from a backend payload (snake_case)", async () => {
    const store = useConfigStore();
    await store.updateConfig({ calendar_weeks: 6 });
    expect(store.calendarWeeks).toBe(6);
  });
});
