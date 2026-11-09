import { describe, it, expect, beforeEach, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { setActivePinia, createPinia } from "pinia";
import { QueryClient } from "@tanstack/vue-query";

vi.mock("vue-router", () => ({ useRouter: () => ({ push: vi.fn() }) }));

import { useConfigStore } from "@/stores/config";
import { useModeStore } from "@/stores/mode";
import { useWebServicesStore } from "@/stores/webServices";
import { useKeyboardActions } from "@/composables/useKeyboardActions";

const view = { cardSize: "large", linkAction: "off" };

function setup() {
  setActivePinia(createPinia());
  useConfigStore().setDashboardScreens({
    version: 2,
    activeScreenId: "s1",
    screens: [
      {
        id: "s1",
        name: "Home",
        activeRegionId: "svc",
        layout: {
          regions: [{ id: "svc", kind: "service", instanceIds: ["mealie-1"], size: 100, view }],
        },
      },
    ],
  });
  let actions;
  // useKeyboardActions runs inside a component so useQueryClient() resolves.
  mount({
    setup() {
      actions = useKeyboardActions();
      return () => null;
    },
  });
  return actions;
}

describe("keyboard actions on a service region", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("fullscreen carries the region's view so Card size and Link behavior still apply", () => {
    const { handleAction } = setup();
    handleAction("web_service_enter_fullscreen");
    expect(useModeStore().fullscreenContext).toEqual({ serviceId: "mealie-1", view });
  });

  it("refresh refetches the widget's data, not just the service list", async () => {
    const refetch = vi.spyOn(QueryClient.prototype, "refetchQueries").mockResolvedValue();
    const { handleAction } = setup();
    useWebServicesStore().refreshCurrentService = vi.fn().mockResolvedValue();
    handleAction("service_refresh");
    await vi.waitFor(() =>
      expect(refetch).toHaveBeenCalledWith({ queryKey: ["plugin-data", "mealie-1"] })
    );
  });
});
