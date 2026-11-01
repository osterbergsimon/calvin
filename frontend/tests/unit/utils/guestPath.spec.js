import { describe, it, expect, vi } from "vitest";
import { createRouter, createMemoryHistory } from "vue-router";
import { createGuestGuard, isGuestPath } from "@/utils/guestPath";

// calvin-mwqo: App.vue picks guest mode once, from the address the page loaded
// at. An in-app link to /share/<token>/ (e.g. a QR card's "open" link) would
// otherwise render the guest page inside the dashboard shell.

function routerWith(guard) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: "/", component: { template: "<p />" } },
      { path: "/share/:token/", component: { template: "<p />" }, meta: { guest: true } },
    ],
  });
  router.beforeEach(guard);
  return router;
}

describe("guest path", () => {
  it.each([
    ["/share/abc.TOKEN/", true],
    ["/share/abc.TOKEN", true],
    ["/share/abc/receive", false],
    ["/settings", false],
  ])("isGuestPath(%s) is %s", (path, expected) => {
    expect(isGuestPath(path)).toBe(expected);
  });

  it("turns in-app navigation to a share link into a full page load", async () => {
    const load = vi.fn();
    const router = routerWith(createGuestGuard({ currentPath: () => "/", load }));
    await router.push("/");

    await router.push("/share/abc.TOKEN/?added=1");

    expect(load).toHaveBeenCalledWith("/share/abc.TOKEN/?added=1");
    expect(router.currentRoute.value.path).toBe("/");
  });

  it("lets the guest page itself route normally (first load, query clean-up)", async () => {
    const load = vi.fn();
    const router = routerWith(createGuestGuard({ currentPath: () => "/share/abc.TOKEN/", load }));

    await router.push("/share/abc.TOKEN/?added=1");
    await router.replace("/share/abc.TOKEN/");

    expect(load).not.toHaveBeenCalled();
    expect(router.currentRoute.value.path).toBe("/share/abc.TOKEN/");
  });

  it("turns leaving the guest page for the dashboard into a full page load", async () => {
    const load = vi.fn();
    const router = routerWith(createGuestGuard({ currentPath: () => "/share/abc.TOKEN/", load }));
    await router.push("/share/abc.TOKEN/");

    await router.push("/");

    expect(load).toHaveBeenCalledWith("/");
  });
});
