import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";

// A tiny in-memory backend with the session model (spec §10.2): the dialog starts
// one run and moves it from step to step; the test plays the agent.
const backend = vi.hoisted(() => ({
  run: null,
  posts: [],
  seq: 0,
  clock: 0,
  activeOnStart: null,
  failSaveLimit: false,
  failVerdict: false,
  capMax: null,
}));
vi.mock("@/services/api", () => ({
  default: {
    get: vi.fn(async () => ({ data: { run: backend.run } })),
    post: vi.fn(async (url, body) => {
      backend.posts.push([url, body]);
      const action = url.split("/").pop();
      if (action === "start") {
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
          steps: {},
          requestedAt: new Date().toISOString(),
          updatedAt: null,
        };
        return { data: backend.run };
      }
      if (action === "step") {
        if (!backend.run?.active) throw { response: { status: 404 } };
        if (backend.capMax !== null && (body.value ?? 0) > backend.capMax) {
          throw {
            response: {
              status: 422,
              data: { detail: { code: "value_above_limit", max: backend.capMax } },
            },
          };
        }
        backend.run = { ...backend.run, step: body.step, value: body.value ?? null };
        return { data: backend.run };
      }
      if (action === "stop") {
        backend.run = { ...backend.run, action: "stop", status: "stopped", active: false };
        return { data: backend.run };
      }
      if (action === "verdict" && backend.failVerdict) throw { response: { status: 500 } };
      if (action === "save-limit" && backend.failSaveLimit) throw { response: { status: 500 } };
      if (action === "save-limit") {
        return { data: { id: "kitchen", brightnessLimit: 26, overrides: {} } };
      }
      return { data: {} };
    }),
  },
}));

import DisplayCheckDialog from "@/components/settings/shared/DisplayCheckDialog.vue";

// A run-level report (level, log, an ending status).
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
// A step's result: it fills run.steps while the run stays active.
const agentStep = (step, result = {}) => {
  backend.run = {
    ...backend.run,
    status: "running",
    active: true,
    updatedAt: new Date().toISOString(),
    steps: {
      ...backend.run.steps,
      [step]: {
        status: "done",
        value: null,
        level: null,
        limit: null,
        detail: null,
        info: null,
        finishedAt: new Date(1800000000000 + ++backend.clock * 1000).toISOString(),
        ...result,
      },
    },
  };
};
const posts = name => backend.posts.filter(([u]) => u.endsWith(`/${name}`));
const lastStart = () => posts("start").at(-1)?.[1];
const lastStep = () => posts("step").at(-1)?.[1];

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
  Object.assign(backend, {
    run: null,
    posts: [],
    seq: 0,
    clock: 0,
    activeOnStart: null,
    failSaveLimit: false,
    failVerdict: false,
    capMax: null,
  });
});
afterEach(() => {
  wrapper?.unmount();
  document.body.innerHTML = "";
  vi.useRealTimers();
});

async function throughDetectAndWrite(props) {
  wrapper = mountDialog(props);
  await flushPromises();
  agentStep("detect", { detail: "NOMAD TOUCH · DDC/CI 2.1 · card0-HDMI-A-1" });
  await settle();
  agentStep("write", { level: 19 });
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

  it("ends the check when detect fails, with Try again that starts a fresh session", async () => {
    wrapper = mountDialog();
    await flushPromises();
    agentStep("detect", { status: "error", detail: "no display answered DDC/CI" });
    await settle();
    expect(find(wrapper, "check-end").text()).toContain(
      "doesn't answer brightness commands (DDC/CI)"
    );
    await click(wrapper, "check-retry");
    expect(posts("stop")).toHaveLength(1);
    expect(posts("start")).toHaveLength(2);
  });

  it("shows what was found and moves the same session to the writes step", async () => {
    wrapper = mountDialog();
    await flushPromises();
    agentStep("detect", { detail: "NOMAD TOUCH · DDC/CI 2.1 · card0-HDMI-A-1" });
    await settle();
    expect(wrapper.text()).toContain("Found NOMAD TOUCH · DDC/CI 2.1 · card0-HDMI-A-1");
    expect(lastStep()).toEqual({ step: "write" });
    expect(posts("start")).toHaveLength(1);
  });

  it("asks whether it changed and offers three answers", async () => {
    await throughDetectAndWrite();
    expect(wrapper.text()).toContain("Did Kitchen get dimmer for a moment, then brighter again?");
    expect(find(wrapper, "writes-yes").exists()).toBe(true);
    expect(find(wrapper, "writes-no").exists()).toBe(true);
    expect(find(wrapper, "writes-again").exists()).toBe(true);
  });

  it("Show me again sends a changed value each time, because a repeat is ignored", async () => {
    await throughDetectAndWrite();
    await click(wrapper, "writes-again");
    const first = lastStep();
    expect(first.step).toBe("write");
    expect(first.value).toBeDefined();
    agentStep("write", { level: 19 });
    await settle();
    await click(wrapper, "writes-again");
    const second = lastStep();
    expect(second.value).toBeDefined();
    expect(second.value).not.toBe(first.value);
    expect(posts("start")).toHaveLength(1);
  });

  it("ends in the writes-don't-take-effect state on No", async () => {
    await throughDetectAndWrite();
    await click(wrapper, "writes-no");
    expect(find(wrapper, "check-end").text()).toContain("don't change it");
    expect(posts("verdict").at(-1)[1]).toEqual({ writes: false });
    expect(find(wrapper, "writes-yes").exists()).toBe(false);
  });

  it("continues to the menu match on Yes, in the same session", async () => {
    await throughDetectAndWrite();
    await click(wrapper, "writes-yes");
    expect(wrapper.emitted("writes-ok")).toHaveLength(1);
    expect(lastStep()).toEqual({ step: "conversion", value: 5 });
    expect(posts("start")).toHaveLength(1);
  });
});

describe("DisplayCheckDialog step 3: menu match", () => {
  async function toStep3(overrides = {}) {
    wrapper = mountDialog({ startStep: "conversion", overrides: { brightness: 19, ...overrides } });
    await flushPromises();
    const point = backend.run.value;
    agentStep("conversion", { value: point, level: point });
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

  it("Add a reading moves the session to the next point", async () => {
    await toStep3({ brightnessConversion: [{ ddc: 5, menu: 28 }] });
    expect(lastStart()).toEqual({ step: "conversion", value: 10 });
    await wrapper.setProps({
      overrides: {
        brightness: 19,
        brightnessConversion: [
          { ddc: 5, menu: 28 },
          { ddc: 10, menu: 40 },
        ],
      },
    });
    await click(wrapper, "check-add");
    expect(lastStep()).toEqual({ step: "conversion", value: 20 });
    expect(posts("start")).toHaveLength(1);
  });

  it("shows the cap inline when the point is above the safe limit", async () => {
    await toStep3({ brightnessConversion: [{ ddc: 5, menu: 28 }] });
    await wrapper.setProps({
      overrides: {
        brightness: 19,
        brightnessConversion: [
          { ddc: 5, menu: 28 },
          { ddc: 10, menu: 40 },
        ],
      },
    });
    backend.capMax = 8;
    await click(wrapper, "check-add");
    expect(wrapper.text()).toContain("The most Calvin can set is 8.");
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
    expect(posts("start")).toHaveLength(0);
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
    expect(posts("stop")).toHaveLength(1);
  });

  it("moves an already running session to the limit step instead of starting again", async () => {
    await throughDetectAndWrite();
    await click(wrapper, "writes-yes");
    agentStep("conversion", { value: 5, level: 5 });
    await settle();
    await click(wrapper, "check-skip");
    await click(wrapper, "limit-start");
    expect(lastStep()).toEqual({ step: "limit" });
    expect(posts("start")).toHaveLength(1);
  });

  it("only proposes the found limit: nothing is saved until the owner clicks", async () => {
    await toStep4();
    await click(wrapper, "limit-start");
    agentStep("limit", { level: 19, limit: 26, detail: "limit found: 26" });
    await settle();
    await settle(6000);
    expect(find(wrapper, "check-finish").text()).toContain("Limit found: 26");
    expect(find(wrapper, "limit-save").text()).toBe("Save 26 as Kitchen's limit");
    expect(find(wrapper, "limit-pending-note").text()).toContain("stays until you save");
    expect(posts("save-limit")).toHaveLength(0);
    expect(wrapper.emitted("saved-limit")).toBeUndefined();
    expect(wrapper.emitted("patch")).toBeUndefined();
    // The session is still open until Done or Stop.
    expect(posts("stop")).toHaveLength(0);
  });

  it("saves the limit once, on the click, and says so", async () => {
    await toStep4();
    await click(wrapper, "limit-start");
    agentStep("limit", { level: 19, limit: 26 });
    await settle();
    await click(wrapper, "limit-save");
    expect(posts("save-limit")).toHaveLength(1);
    expect(wrapper.emitted("saved-limit")[0][0]).toBe(26);
    expect(find(wrapper, "limit-saved").text()).toContain("Saved");
    expect(find(wrapper, "limit-save").exists()).toBe(false);
    expect(find(wrapper, "limit-pending-note").exists()).toBe(false);
  });

  it("Done without saving ends the session and keeps the old limit", async () => {
    await toStep4();
    await click(wrapper, "limit-start");
    agentStep("limit", { level: 19, limit: 26 });
    await settle();
    await click(wrapper, "check-done");
    expect(posts("stop")).toHaveLength(1);
    expect(posts("save-limit")).toHaveLength(0);
    expect(wrapper.emitted("update:modelValue").at(-1)).toEqual([false]);
  });

  it("keeps the button and shows an error when saving fails, without changing any setting", async () => {
    backend.failSaveLimit = true;
    await toStep4();
    await click(wrapper, "limit-start");
    agentStep("limit", { level: 19, limit: 26 });
    await settle();
    await click(wrapper, "limit-save");
    expect(wrapper.text()).toContain("Couldn't save the limit");
    expect(find(wrapper, "limit-save").exists()).toBe(true);
    expect(wrapper.emitted("patch")).toBeUndefined();
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
    expect(posts("stop")).toHaveLength(1);
  });

  it("stops the run from the footer", async () => {
    wrapper = mountDialog();
    await flushPromises();
    await click(wrapper, "check-stop");
    expect(posts("stop")).toHaveLength(1);
  });

  it("says the check ended when the session is gone while changing step", async () => {
    await throughDetectAndWrite();
    backend.run = { ...backend.run, active: false, status: "timeout" };
    await click(wrapper, "writes-again");
    expect(find(wrapper, "check-end").text()).toContain("The check ended");
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

  it("does not call the owner's time on the reading step silence", async () => {
    wrapper = mountDialog({ startStep: "conversion" });
    await flushPromises();
    agentStep("conversion", { value: 5, level: 5 });
    await settle();
    await settle(30000);
    expect(find(wrapper, "check-silence").exists()).toBe(false);
  });

  it("opens read-only when another device runs a check, with Stop available", async () => {
    backend.run = {
      id: "elsewhere",
      step: "limit",
      status: "running",
      active: true,
      level: 22,
      log: [],
      steps: {},
      requestedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    wrapper = mountDialog();
    await flushPromises();
    expect(wrapper.text()).toContain("A check is running from another device");
    expect(posts("start")).toHaveLength(0);
    expect(find(wrapper, "check-stop").exists()).toBe(true);
  });

  it("will not start while the screen is asleep", async () => {
    wrapper = mountDialog({ asleep: true });
    await flushPromises();
    expect(find(wrapper, "check-asleep").text()).toContain(
      "Kitchen is asleep. Turn it on now to check it."
    );
    expect(posts("start")).toHaveLength(0);
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

  it("keeps the question and shows an error when the answer cannot be saved", async () => {
    await throughDetectAndWrite();
    backend.failVerdict = true;
    await click(wrapper, "writes-yes");
    expect(wrapper.text()).toContain("Couldn't save your answer");
    expect(find(wrapper, "writes-yes").exists()).toBe(true);
    expect(wrapper.emitted("writes-ok")).toBeUndefined();
  });

  it("Try again after silence stops the old run before starting a new one", async () => {
    wrapper = mountDialog();
    await flushPromises();
    await settle(62000);
    backend.posts = [];
    await click(wrapper, "check-silence-retry");
    expect(backend.posts.map(([u]) => u.split("/").pop())).toEqual(["stop", "start"]);
  });

  it("offers Turn on now when asleep, and starts the check once the screen wakes", async () => {
    wrapper = mountDialog({ asleep: true });
    await flushPromises();
    await click(wrapper, "check-turn-on");
    expect(wrapper.emitted("turn-on")).toHaveLength(1);
    expect(posts("start")).toHaveLength(0);
    await wrapper.setProps({ asleep: false });
    await flushPromises();
    expect(lastStart()).toEqual({ step: "detect" });
  });

  it("resumes polling when reopened while another run is active", async () => {
    backend.run = {
      id: "elsewhere",
      step: "limit",
      status: "running",
      active: true,
      level: 22,
      log: [],
      steps: {},
      requestedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    wrapper = mountDialog();
    await flushPromises();
    await wrapper.setProps({ modelValue: false });
    await flushPromises();
    await wrapper.setProps({ modelValue: true });
    await flushPromises();
    backend.run = { ...backend.run, level: 24 };
    await settle(2100);
    expect(find(wrapper, "check-readonly").exists()).toBe(true);
    expect(wrapper.text()).toContain("level 24");
  });
});
