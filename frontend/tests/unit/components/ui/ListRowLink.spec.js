import { describe, it, expect } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { createRouter, createMemoryHistory } from "vue-router";
import ListRowLink from "@/components/ui/ListRowLink.vue";

const makeRouter = () =>
  createRouter({
    history: createMemoryHistory(),
    routes: [{ path: "/settings", component: { template: "<div />" } }],
  });

describe("ListRowLink", () => {
  it("never marks a row as the current page, even when its path matches", async () => {
    const router = makeRouter();
    router.push("/settings?category=content");
    await router.isReady();
    const wrapper = mount(
      {
        components: { ListRowLink },
        template: `<div>
          <ListRowLink :to="{ path: '/settings', query: { category: 'content' } }" name="Content" />
          <ListRowLink :to="{ path: '/settings', query: { category: 'screens' } }" name="Screens" />
        </div>`,
      },
      { global: { plugins: [router] } }
    );
    const links = wrapper.findAll("a.list-row-link");
    expect(links).toHaveLength(2);
    for (const link of links) expect(link.attributes("aria-current")).toBeUndefined();
    expect(links[1].attributes("href")).toBe("/settings?category=screens");
  });

  it("navigates on click", async () => {
    const router = makeRouter();
    router.push("/settings");
    await router.isReady();
    const wrapper = mount(ListRowLink, {
      props: { to: { path: "/settings", query: { category: "screens" } }, name: "Screens" },
      global: { plugins: [router] },
    });
    await wrapper.find("a").trigger("click");
    await flushPromises();
    expect(router.currentRoute.value.query.category).toBe("screens");
  });
});
