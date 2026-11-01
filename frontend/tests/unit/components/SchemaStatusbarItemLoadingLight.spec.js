/**
 * CLV-115: clock-bar and status plugins drive the app-frame loading light
 * while their data fetches (docs/design/2026-11-01-loading-light.md §2).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { ref } from "vue";

const isFetching = ref(false);

vi.mock("@tanstack/vue-query", () => ({
  useQuery: () => ({ data: ref(null), isFetching }),
}));
vi.mock("@/services/api", () => ({
  default: { get: vi.fn() },
  isServiceWorkerReplay: () => false,
}));

import SchemaStatusbarItem from "@/components/plugins/SchemaStatusbarItem.vue";
import { APP_FRAME, useProgressStore } from "@/stores/progress";

describe("SchemaStatusbarItem drives the app light (CLV-115)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    setActivePinia(createPinia());
    isFetching.value = false;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("lights the app frame while its data fetches, and ends when done", () => {
    const progress = useProgressStore();
    const wrapper = mount(SchemaStatusbarItem, {
      props: { serviceId: "weather", schema: { kind: "status", poll_interval_ms: 60000 } },
      global: { stubs: { SchemaRenderer: true } },
    });
    isFetching.value = true;
    vi.advanceTimersByTime(400);
    expect(progress.isFrameVisible(APP_FRAME)).toBe(true);
    isFetching.value = false;
    expect(progress.active).toBe(false);
    // A later poll refetch lights it again.
    isFetching.value = true;
    expect(progress.active).toBe(true);
    wrapper.unmount();
    expect(progress.active).toBe(false);
  });
});
