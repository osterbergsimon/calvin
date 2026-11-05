import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";

// A tiny in-memory backend: the dialog starts runs, the test plays the agent.
const backend = vi.hoisted(() => ({ run: null, posts: [], seq: 0, activeOnStart: null }));
vi.mock("@/services/api", () => ({
  default: {
    get: vi.fn(async () => ({ data: { run: backend.run } })),
    post: vi.fn(async (url, body) => {
      backend.posts.push([url, body]);
      if (url.endsWith("/start")) {
        if (backend.activeOnStart) {
          throw {
            response: {
              status: 409,
              data: { detail: { code: "display_check_active", run: backend.activeOnStart } },
            },
          };
        }
        backend.run = {
          id: `r${++backend.seq}`,
          step: body.step,
          value: body.value ?? null,
          status: "requested",
          active: true,
          level: null,
          limit: null,
          log: [],
          requestedAt: new Date().toISOString(),
          updatedAt: null,
        };
        return { data: backend.run };
      }
      if (url.endsWith("/stop")) {
        backend.run = { ...backend.run, action: "stop" };
        return { data: backend.run };
      }
      if (url.endsWith("/save-limit")) {
        return { data: { id: "kitchen", brightnessLimit: 26, overrides: {} } };
      }
      return { data: {} };
    }),
  },
}));

import DisplayCheckDialog from "@/components/settings/shared/DisplayCheckDialog.vue";

const agent = (over = {}) => {
  backend.run = {
    ...backend.run,
    status: "running",
    active: true,
    updatedAt: new Date().toISOString(),
    ...over,
  };
  if (
    ["done", "error", "stopped", "asleep", "timeout", "interrupted"].includes(backend.run.status)
  ) {
    backend.run.active = false;
  }
};
const lastStart = () => backend.posts.filter(([u]) => u.endsWith("/start")).at(-1)?.[1];

function mountDialog(props = {}) {
  return mount(DisplayCheckDialog, {
    props: {
      modelValue: true,
      kioskId: "kitchen",
      screenName: "Kitchen",
      asleep: false,
      onPanel: false,
      overrides: { brightness: 19, brightnessStep: 2, brightnessStepSeconds: 1.5 },
      ...props,
    },
    attachTo: document.body,
  });
}
const find = (wrapper, name) => wrapper.find(`[data-test="${name}"]`);
const settle = async (ms = 2100) => {
  await vi.advanceTimersByTimeAsync(ms);
  await flushPromises();
};
const click = async (wrapper, name) => {
  await find(wrapper, name).trigger("click");
  await flushPromises();
};

let wrapper;
beforeEach(() => {
  vi.useFakeTimers();
  backend.run = null;
  backend.posts = [];
  backend.seq = 0;
  backend.activeOnStart = null;
});
afterEach(() => {
  wrapper?.unmount();
  document.body.innerHTML = "";
  vi.useRealTimers();
});

async function throughDetectAndWrite(props) {
  wrapper = mountDialog(props);
  await flushPromises();
  agent({
    status: "done",
    detail: "NOMAD TOUCH · DDC/CI 2.1 · card0-HDMI-A-1",
    info: { model: "NOMAD TOUCH" },
  });
  await settle();
  agent({ status: "done", level: 19 });
  await settle();
}

describe("DisplayCheckDialog step 1 and 2", () => {
  it("is titled for the screen and starts the detect step on its own", async () => {
    wrapper = mountDialog();
    await flushPromises();
    expect(wrapper.text()).toContain("Check the Kitchen display");
    expect(lastStart()).toEqual({ step: "detect" });
    expect(find(wrapper, "check-step-body").text()).toContain("Asking Kitchen's screen…");
  });

  it("ends the check when detect fails, with Try again", async () => {
    wrapper = mountDialog();
    await flushPromises();
    agent({ status: "error", detail: "no display answered DDC/CI" });
    await settle();
    expect(find(wrapper, "check-end").text()).toContain(
      "doesn't answer brightness commands (DDC/CI)"
    );
    await click(wrapper, "check-retry");
    expect(backend.posts.filter(([u]) => u.endsWith("/start"))).toHaveLength(2);
  });

  it("shows what was found and moves on to the writes step", async () => {
    wrapper = mountDialog();
    await flushPromises();
    agent({ status: "done", detail: "NOMAD TOUCH · DDC/CI 2.1 · card0-HDMI-A-1" });
    await settle();
    expect(wrapper.text()).toContain("Found NOMAD TOUCH · DDC/CI 2.1 · card0-HDMI-A-1");
    expect(lastStart()).toEqual({ step: "write", brightness: 19 });
  });

  it("asks whether it changed and offers three answers", async () => {
    await throughDetectAndWrite();
    expect(wrapper.text()).toContain("Did Kitchen get dimmer for a moment, then brighter again?");
    expect(find(wrapper, "writes-yes").exists()).toBe(true);
    expect(find(wrapper, "writes-no").exists()).toBe(true);
    await click(wrapper, "writes-again");
    expect(lastStart()).toEqual({ step: "write", brightness: 19 });
  });

  it("ends in the writes-don't-take-effect state on No", async () => {
    await throughDetectAndWrite();
    await click(wrapper, "writes-no");
    expect(find(wrapper, "check-end").text()).toContain("don't change it");
    expect(backend.posts.some(([u, b]) => u.endsWith("/verdict") && b.writes === false)).toBe(true);
    expect(find(wrapper, "writes-yes").exists()).toBe(false);
  });

  it("continues to the menu match on Yes and tells the page it works", async () => {
    await throughDetectAndWrite();
    await click(wrapper, "writes-yes");
    expect(wrapper.emitted("writes-ok")).toHaveLength(1);
    expect(lastStart()).toEqual({ step: "conversion", value: 5 });
  });
});

describe("DisplayCheckDialog step 3: menu match", () => {
  async function toStep3(overrides = {}) {
    wrapper = mountDialog({ startStep: "conversion", overrides: { brightness: 19, ...overrides } });
    await flushPromises();
    agent({ status: "done", level: 5 });
    await settle();
  }

  it("asks for the menu reading of the value it set and saves a reading", async () => {
    await toStep3();
    expect(lastStart()).toEqual({ step: "conversion", value: 5 });
    expect(wrapper.text()).toContain("Calvin set Kitchen to 5.");
    const input = find(wrapper, "reading-input");
    expect(input.attributes("inputmode")).toBe("numeric");
    await input.setValue("28");
    await click(wrapper, "reading-save");
    expect(wrapper.emitted("patch").at(-1)[0]).toEqual({
      brightnessConversion: [{ ddc: 5, menu: 28 }],
    });
  });

  it("needs two readings to go on, shows the fit, and can skip", async () => {
    await toStep3({ brightnessConversion: [{ ddc: 5, menu: 28 }] });
    expect(find(wrapper, "check-next").attributes("disabled")).toBeDefined();
    expect(find(wrapper, "check-skip").exists()).toBe(true);
    await wrapper.setProps({
      overrides: {
        brightness: 19,
        brightnessConversion: [
          { ddc: 5, menu: 28 },
          { ddc: 19, menu: 61 },
        ],
      },
    });
    expect(find(wrapper, "check-fit").text()).toContain("menu ≈ 16 + 2.4 × Calvin value");
    expect(find(wrapper, "check-next").attributes("disabled")).toBeUndefined();
  });

  it("warns when the third reading is off the line", async () => {
    await toStep3({
      brightnessConversion: [
        { ddc: 5, menu: 28 },
        { ddc: 19, menu: 61 },
        { ddc: 12, menu: 90 },
      ],
    });
    expect(find(wrapper, "check-fit").text()).toContain(
      "These readings don't line up. Check the last one"
    );
  });

  it("removes a reading", async () => {
    await toStep3({
      brightnessConversion: [
        { ddc: 5, menu: 28 },
        { ddc: 19, menu: 61 },
      ],
    });
    await find(wrapper, "reading-remove-0").trigger("click");
    expect(wrapper.emitted("patch").at(-1)[0]).toEqual({
      brightnessConversion: [{ ddc: 19, menu: 61 }],
    });
  });
});

describe("DisplayCheckDialog step 4: safe limit", () => {
  const toStep4 = async props => {
    wrapper = mountDialog({ startStep: "limit", ...props });
    await flushPromises();
  };

  it("warns plainly before starting and offers Start and Skip", async () => {
    await toStep4();
    expect(wrapper.text()).toContain("it may restart");
    expect(find(wrapper, "limit-start").exists()).toBe(true);
    expect(find(wrapper, "limit-skip").exists()).toBe(true);
    expect(backend.posts.filter(([u]) => u.endsWith("/start"))).toHaveLength(0);
  });

  it("replaces Start with a red note on the panel itself", async () => {
    await toStep4({ onPanel: true });
    expect(find(wrapper, "limit-start").exists()).toBe(false);
    expect(find(wrapper, "limit-on-panel").text()).toContain(
      "You're on Kitchen itself. Run this step from your phone or computer"
    );
  });

  it("shows the live level, a plain log and an always-visible Stop now while it runs", async () => {
    await toStep4();
    await click(wrapper, "limit-start");
    expect(lastStart()).toEqual({ step: "limit" });
    agent({
      level: 28,
      log: [
        { at: "x", level: 24, note: "fine" },
        { at: "x", level: 28, note: "touch controller reset" },
      ],
    });
    await settle();
    expect(find(wrapper, "limit-level").text()).toContain("28");
    expect(find(wrapper, "limit-log").text()).toContain("24 · fine");
    expect(find(wrapper, "limit-log").text()).toContain("28 · touch controller reset");
    expect(find(wrapper, "limit-stop").exists()).toBe(true);
    await click(wrapper, "limit-stop");
    expect(backend.posts.some(([u]) => u.endsWith("/stop"))).toBe(true);
  });

  it("finishes with the found limit, and saves it only when asked", async () => {
    await toStep4();
    await click(wrapper, "limit-start");
    agent({ status: "done", level: 19, limit: 26, detail: "limit found: 26" });
    await settle();
    expect(find(wrapper, "check-finish").text()).toContain("Limit found: 26");
    expect(backend.posts.some(([u]) => u.endsWith("/save-limit"))).toBe(false);
    await click(wrapper, "limit-save");
    expect(backend.posts.some(([u]) => u.endsWith("/save-limit"))).toBe(true);
    expect(wrapper.emitted("saved-limit")[0][0]).toBe(26);
  });

  it("says Kitchen restarted when the agent reports an interrupted run", async () => {
    await toStep4();
    await click(wrapper, "limit-start");
    agent({ status: "interrupted" });
    await settle();
    expect(find(wrapper, "check-end").text()).toContain("Kitchen restarted");
  });
});

describe("DisplayCheckDialog rules", () => {
  it("stops the run when the dialog is closed", async () => {
    wrapper = mountDialog();
    await flushPromises();
    await wrapper.setProps({ modelValue: false });
    await flushPromises();
    expect(backend.posts.some(([u]) => u.endsWith("/stop"))).toBe(true);
  });

  it("stops the run from the footer", async () => {
    wrapper = mountDialog();
    await flushPromises();
    await click(wrapper, "check-stop");
    expect(backend.posts.some(([u]) => u.endsWith("/stop"))).toBe(true);
  });

  it("says Waiting… after 10 s of silence and not answering after 60 s", async () => {
    wrapper = mountDialog();
    await flushPromises();
    await settle(12000);
    expect(find(wrapper, "check-silence").text()).toContain("Waiting for Kitchen…");
    await settle(50000);
    expect(find(wrapper, "check-silence").text()).toContain(
      "Kitchen isn't answering. Is it on and online?"
    );
  });

  it("opens read-only when another device runs a check, with Stop available", async () => {
    backend.run = {
      id: "elsewhere",
      step: "limit",
      status: "running",
      active: true,
      level: 22,
      log: [],
      requestedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    wrapper = mountDialog();
    await flushPromises();
    expect(wrapper.text()).toContain("A check is running from another device");
    expect(backend.posts.filter(([u]) => u.endsWith("/start"))).toHaveLength(0);
    expect(find(wrapper, "check-stop").exists()).toBe(true);
  });

  it("will not start while the screen is asleep", async () => {
    wrapper = mountDialog({ asleep: true });
    await flushPromises();
    expect(find(wrapper, "check-asleep").text()).toContain(
      "Kitchen is asleep. Turn it on now to check it."
    );
    expect(backend.posts.filter(([u]) => u.endsWith("/start"))).toHaveLength(0);
  });

  it("shows the asleep refusal when the agent refuses a run", async () => {
    wrapper = mountDialog();
    await flushPromises();
    agent({ status: "asleep" });
    await settle();
    expect(find(wrapper, "check-asleep").text()).toContain("Turn it on now to check it");
  });

  it("says that turning the screen off waits until the check ends", async () => {
    wrapper = mountDialog();
    await flushPromises();
    expect(wrapper.text()).toContain("Turn off now");
    expect(wrapper.text()).toContain("waits until the check ends");
    expect(wrapper.text()).toContain("10 min");
  });

  it("shows a timeout as an end state with Try again", async () => {
    wrapper = mountDialog();
    await flushPromises();
    agent({ status: "timeout" });
    await settle();
    expect(find(wrapper, "check-end").text()).toContain("timed out");
    expect(find(wrapper, "check-retry").exists()).toBe(true);
  });
});
