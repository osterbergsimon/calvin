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
  ceilingMax: null,
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
        if (backend.ceilingMax !== null && (body.value ?? 0) > backend.ceilingMax) {
          throw {
            response: {
              status: 422,
              data: { detail: { code: "value_above_ceiling", max: backend.ceilingMax } },
            },
          };
        }
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
      if (action === "menu-at-start") {
        backend.run = { ...backend.run, menuAtStart: body.menu };
        return { data: backend.run };
      }
      if (action === "verdict" && backend.failVerdict) throw { response: { status: 500 } };
      if (action === "save-limit" && backend.failSaveLimit) throw { response: { status: 500 } };
      if (action === "save-limit") {
        const faultLimit = backend.run?.fault
          ? Math.min(backend.run.fault.lastGood, backend.run.fault.level) - 2
          : 26;
        return { data: { id: "kitchen", brightnessLimit: faultLimit, overrides: {} } };
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
    ceilingMax: null,
  });
});
afterEach(() => {
  wrapper?.unmount();
  document.body.innerHTML = "";
  vi.useRealTimers();
});

const CLEAN = { status: "clean", faults: [] };
const KNOWN = { level: 19, known: true, source: "read" };
const UNKNOWN = { level: null, known: false, source: null };
const DETECT = { detail: "NOMAD TOUCH · DDC/CI 2.1 · HDMI-A-1" };
const status = w => find(w, "check-status").text();
const primary = w => w.find("[data-primary]");
const clickPrimary = async w => {
  await primary(w).trigger("click");
  await flushPromises();
};

async function toFound(start = KNOWN, props) {
  wrapper = mountDialog(props);
  await flushPromises();
  agent({ preflight: CLEAN, start });
  agentStep("detect", DETECT);
  await settle();
}
async function toQuestion(start = KNOWN, props) {
  await toFound(start, props);
  await clickPrimary(wrapper);
  agentStep("write", { level: start.level ?? 5 });
  await settle();
}
async function toReading1(props) {
  await toQuestion(KNOWN, props);
  await click(wrapper, "writes-yes");
  agentStep("conversion", { value: 19, level: 19 });
  await settle();
}

async function throughDetectAndWrite(props) {
  await toQuestion(KNOWN, props);
}

describe("power check before step 1", () => {
  it("watches the power for 10 s first and counts down, with no primary action", async () => {
    wrapper = mountDialog();
    await flushPromises();
    expect(status(wrapper)).toContain("Checking Kitchen's power before changing anything · 10 s");
    expect(wrapper.text()).toContain("watches the power supply for 10 s");
    expect(primary(wrapper).exists()).toBe(false);
    await settle(3000);
    expect(status(wrapper)).toContain("· 7 s");
  });

  it("refuses to start when the power already shows trouble at idle", async () => {
    wrapper = mountDialog();
    await flushPromises();
    agent({
      preflight: { status: "fault", faults: [{ kind: "under-voltage" }] },
      status: "error",
      reason: "power_at_idle",
    });
    await settle();
    expect(status(wrapper)).toContain("Check not started · power trouble at idle");
    expect(wrapper.text()).toContain("Kitchen has power trouble already");
    expect(wrapper.text()).toContain("before Calvin changed anything");
    expect(wrapper.text()).toContain("USB power blocker");
    expect(primary(wrapper).text()).toBe("How to fix the power");
    expect(primary(wrapper).attributes("href")).toContain("KIOSK_POWER.md");
    expect(primary(wrapper).attributes("target")).toBe("_blank");
    expect(find(wrapper, "check-close").exists()).toBe(true);
    expect(posts("step")).toHaveLength(0);
  });

  it("Check again runs the power check again, only on the click", async () => {
    wrapper = mountDialog();
    await flushPromises();
    agent({ preflight: { status: "fault", faults: [] }, status: "error", reason: "power_at_idle" });
    await settle();
    await settle(20000);
    expect(posts("start")).toHaveLength(1);
    await click(wrapper, "check-again");
    expect(posts("start")).toHaveLength(2);
    expect(status(wrapper)).toContain("Checking Kitchen's power");
  });
});

describe("step 1: find the display", () => {
  it("is titled for the screen and starts the detect step on its own", async () => {
    wrapper = mountDialog();
    await flushPromises();
    expect(wrapper.text()).toContain("Check the Kitchen display");
    expect(lastStart()).toEqual({ step: "detect" });
  });

  it("asks the screen once the power check is clean", async () => {
    wrapper = mountDialog();
    await flushPromises();
    agent({ preflight: CLEAN });
    await settle();
    expect(status(wrapper)).toContain("Step 1 of 3 · Asking Kitchen's screen…");
    expect(primary(wrapper).exists()).toBe(false);
  });

  it("ends with Close and Try again when the screen has no brightness control", async () => {
    wrapper = mountDialog();
    await flushPromises();
    agent({ preflight: CLEAN });
    agentStep("detect", { status: "error", detail: "no display answered DDC/CI" });
    await settle();
    expect(status(wrapper)).toContain("Check ended · no brightness control");
    expect(find(wrapper, "check-end").text()).toContain(
      "doesn't answer brightness commands (DDC/CI)"
    );
    expect(primary(wrapper).text()).toBe("Close");
    await click(wrapper, "check-retry");
    expect(posts("stop")).toHaveLength(1);
    expect(posts("start")).toHaveLength(2);
  });

  it("with a known start: found, stays at or below it, Next is the one action", async () => {
    await toFound();
    expect(status(wrapper)).toContain("Step 1 of 3 · Found · Kitchen is at Calvin 19");
    expect(wrapper.text()).toContain("Found NOMAD TOUCH · DDC/CI 2.1 · HDMI-A-1.");
    expect(wrapper.text()).toContain("The check stays at Calvin 19 or below. It only dims.");
    expect(primary(wrapper).text()).toBe("Next");
    expect(find(wrapper, "menu-start-input").exists()).toBe(false);
    expect(posts("step")).toHaveLength(0);
  });

  it("with an unknown start: explains, asks the menu value, and saves it before dimming", async () => {
    await toFound(UNKNOWN);
    expect(status(wrapper)).toContain("Kitchen can't report its brightness");
    expect(wrapper.text()).toContain("Kitchen always reports brightness 0");
    expect(wrapper.text()).toContain("dims it to 5 first");
    expect(primary(wrapper).text()).toBe("Next: dim to 5");
    await find(wrapper, "menu-start-input").setValue("28");
    await clickPrimary(wrapper);
    expect(posts("menu-at-start").at(-1)[1]).toEqual({ menu: 28 });
    expect(lastStep()).toEqual({ step: "write" });
  });

  it("I can't reach the menu now dims without saving a value", async () => {
    await toFound(UNKNOWN);
    await click(wrapper, "menu-start-skip");
    expect(posts("menu-at-start")).toHaveLength(0);
    expect(lastStep()).toEqual({ step: "write" });
  });
});

describe("step 2: does it change?", () => {
  it("dims to the floor first when the start is unknown", async () => {
    await toFound(UNKNOWN);
    await clickPrimary(wrapper);
    expect(status(wrapper)).toContain("Step 2 of 3 · Dimming Kitchen to 5…");
    expect(wrapper.text()).toContain("Watch Kitchen's screen.");
    expect(primary(wrapper).exists()).toBe(false);
  });

  it("tests by dimming from the start level and back, with two equal answers", async () => {
    await toFound();
    await clickPrimary(wrapper);
    expect(status(wrapper)).toContain("Step 2 of 3 · Dimming 19 → 9 and back");
    expect(primary(wrapper).exists()).toBe(false);
    agentStep("write", { level: 19 });
    await settle();
    expect(status(wrapper)).toContain("Your answer decides whether Calvin can set the brightness");
    expect(wrapper.text()).toContain("Did Kitchen get dimmer for a moment, then come back?");
    expect(wrapper.text()).toContain("Calvin stepped it from 19 down to 9 and back, 2 at a time.");
    expect(primary(wrapper).exists()).toBe(false);
    expect(find(wrapper, "writes-yes").classes()).toEqual(find(wrapper, "writes-no").classes());
    expect(find(wrapper, "writes-again").exists()).toBe(true);
  });

  it("with an unknown start, the test is 5 → 0 and back", async () => {
    await toQuestion(UNKNOWN);
    expect(wrapper.text()).toContain("from 5 down to 0 and back");
  });

  it("Show me again sends S − 9, then S − 10, because a repeat is ignored", async () => {
    await toQuestion();
    await click(wrapper, "writes-again");
    expect(lastStep()).toEqual({ step: "write", value: 10 });
    agentStep("write", { level: 19 });
    await settle();
    await click(wrapper, "writes-again");
    expect(lastStep()).toEqual({ step: "write", value: 9 });
    expect(posts("start")).toHaveLength(1);
  });

  it("ends on No with the writes-don't-take-effect text and Close as the one action", async () => {
    await toQuestion();
    await click(wrapper, "writes-no");
    expect(find(wrapper, "check-end").text()).toContain("don't change it");
    expect(status(wrapper)).toContain("brightness commands don't take effect");
    expect(posts("verdict").at(-1)[1]).toEqual({ writes: false });
    expect(primary(wrapper).text()).toBe("Close");
  });

  it("keeps the question and shows an error when the answer cannot be saved", async () => {
    await toQuestion();
    backend.failVerdict = true;
    await click(wrapper, "writes-yes");
    expect(wrapper.text()).toContain("Couldn't save your answer");
    expect(find(wrapper, "writes-yes").exists()).toBe(true);
    expect(wrapper.emitted("writes-ok")).toBeUndefined();
  });
});

describe("step 3: match the screen's menu", () => {
  it("reading 1 is taken where the screen is, unchanged, and Calvin does not change it", async () => {
    await toQuestion();
    await click(wrapper, "writes-yes");
    expect(wrapper.emitted("writes-ok")).toHaveLength(1);
    expect(lastStep()).toEqual({ step: "conversion", value: 19 });
    agentStep("conversion", { value: 19, level: 19 });
    await settle();
    expect(status(wrapper)).toContain("Reading 1 of 2 · Kitchen is at Calvin 19, unchanged");
    expect(wrapper.text()).toContain("Calvin hasn't changed it.");
    expect(find(wrapper, "reading-input").attributes("inputmode")).toBe("numeric");
    expect(primary(wrapper).text()).toBe("Save reading");
    expect(find(wrapper, "check-skip").text()).toContain("Skip: finish without a menu match");
  });

  it("saves a reading as a patch", async () => {
    await toReading1();
    await find(wrapper, "reading-input").setValue("61");
    await clickPrimary(wrapper);
    expect(wrapper.emitted("patch").at(-1)[0]).toEqual({
      brightnessConversion: [{ ddc: 19, menu: 61 }],
    });
  });

  it("after reading 1 the one action is dimming for reading 2, 4 below", async () => {
    await toReading1();
    await wrapper.setProps({
      overrides: { brightness: 19, brightnessConversion: [{ ddc: 19, menu: 61 }] },
    });
    expect(status(wrapper)).toContain("1 of 2 readings · Next, Calvin dims to 15");
    expect(primary(wrapper).text()).toBe("Dim to 15 for reading 2");
    expect(wrapper.text()).toContain("Calvin 19 · menu 61");
    await clickPrimary(wrapper);
    expect(lastStep()).toEqual({ step: "conversion", value: 15 });
    expect(status(wrapper)).toContain("1 of 2 readings · Dimming to 15…");
    expect(primary(wrapper).exists()).toBe(false);
    agentStep("conversion", { value: 15, level: 15 });
    await settle();
    expect(status(wrapper)).toContain("Reading 2 of 2 · Kitchen is at Calvin 15");
  });

  it("two readings are enough: the fit is approximate and Next goes to the limit", async () => {
    await toReading1();
    await wrapper.setProps({
      overrides: {
        brightness: 19,
        brightnessConversion: [
          { ddc: 15, menu: 52 },
          { ddc: 19, menu: 61 },
        ],
      },
    });
    expect(status(wrapper)).toContain("2 of 2 readings · enough for a menu match");
    expect(find(wrapper, "check-fit").text()).toContain("This is approximate");
    expect(find(wrapper, "check-fit").text()).toContain("off by about 4 on the menu");
    expect(find(wrapper, "check-third").exists()).toBe(false);
    expect(primary(wrapper).text()).toBe("Next: safe limit (optional)");
  });

  it("offers a third reading near limit − 2 × step only when a limit is saved", async () => {
    await toReading1({
      overrides: {
        brightness: 19,
        brightnessLimit: 26,
        brightnessConversion: [
          { ddc: 15, menu: 52 },
          { ddc: 19, menu: 61 },
        ],
      },
    });
    expect(find(wrapper, "check-third").text()).toContain(
      "Add a reading near the top (Calvin 22) for a closer match"
    );
    await click(wrapper, "check-third");
    expect(lastStep()).toEqual({ step: "conversion", value: 22 });
    agentStep("conversion", { value: 22, level: 22 });
    await settle();
    expect(status(wrapper)).toContain("Reading 3 · Kitchen is at Calvin 22");
    expect(find(wrapper, "check-skip").exists()).toBe(true);
  });

  it("flags a third reading that is off the line and offers to type it again or remove it", async () => {
    await toReading1({
      overrides: {
        brightness: 19,
        brightnessLimit: 26,
        brightnessConversion: [
          { ddc: 15, menu: 52 },
          { ddc: 19, menu: 61 },
          { ddc: 22, menu: 52 },
        ],
      },
    });
    expect(status(wrapper)).toContain("3 readings · the last one doesn't line up");
    expect(wrapper.text()).toContain("Calvin 22 should be about 68 on the menu, you typed 52");
    expect(primary(wrapper).text()).toBe("Type it again");
    await find(wrapper, "reading-remove-2").trigger("click");
    expect(wrapper.emitted("patch").at(-1)[0]).toEqual({
      brightnessConversion: [
        { ddc: 15, menu: 52 },
        { ddc: 19, menu: 61 },
      ],
    });
  });

  it("with no room to dim, finishes with one reading", async () => {
    await toQuestion({ level: 1, known: true, source: "read" });
    await click(wrapper, "writes-yes");
    agentStep("conversion", { value: 1, level: 1 });
    await settle();
    await wrapper.setProps({
      overrides: { brightness: 1, brightnessConversion: [{ ddc: 1, menu: 30 }] },
    });
    expect(status(wrapper)).toContain("1 reading · Kitchen is already at its lowest");
    expect(wrapper.text()).toContain("so the slider stays on Calvin's scale");
    expect(primary(wrapper).text()).toBe("Finish with 1 reading");
  });

  it("removes a reading", async () => {
    await toReading1();
    await wrapper.setProps({
      overrides: {
        brightness: 19,
        brightnessConversion: [
          { ddc: 15, menu: 52 },
          { ddc: 19, menu: 61 },
        ],
      },
    });
    await find(wrapper, "reading-remove-0").trigger("click");
    expect(wrapper.emitted("patch").at(-1)[0]).toEqual({
      brightnessConversion: [{ ddc: 19, menu: 61 }],
    });
  });

  it("shows the ceiling inline when the agent refuses a point above it", async () => {
    await toReading1();
    await wrapper.setProps({
      overrides: { brightness: 19, brightnessConversion: [{ ddc: 19, menu: 61 }] },
    });
    backend.ceilingMax = 12;
    await clickPrimary(wrapper);
    expect(wrapper.text()).toContain("The most Calvin can set is 12.");
  });

  it("shows what the menu said at the start once there is a fit", async () => {
    await toReading1();
    backend.run = { ...backend.run, menuAtStart: 28 };
    await wrapper.setProps({
      overrides: {
        brightness: 19,
        brightnessConversion: [
          { ddc: 5, menu: 28 },
          { ddc: 19, menu: 61 },
        ],
      },
    });
    await settle();
    expect(find(wrapper, "check-fit").text()).toContain(
      "Kitchen was at menu 28 when you started (about Calvin 5). Calvin stays at or below that."
    );
  });
});

describe("power trouble during the check", () => {
  const FAULT = {
    step: "write",
    level: 12,
    kind: "under-voltage",
    at: "x",
    lastGood: 14,
    alsoAt: [],
  };

  it("shows one red banner and stops safely while it settles", async () => {
    await toQuestion();
    agent({ fault: FAULT });
    await settle();
    const banner = find(wrapper, "check-fault");
    expect(banner.attributes("role")).toBe("alert");
    expect(banner.text()).toContain("Power trouble at Calvin 12 · under-voltage");
    expect(banner.text()).toContain(
      "Calvin is dimming Kitchen to 5 and waiting for the power to settle."
    );
    expect(status(wrapper)).toContain("Stopping safely · waiting for 5 s of clean power");
    expect(primary(wrapper).exists()).toBe(false);
  });

  it("adds later faults to the same incident", async () => {
    await toQuestion();
    agent({ fault: { ...FAULT, alsoAt: [8] } });
    await settle();
    expect(wrapper.findAll('[data-test="check-fault"]')).toHaveLength(1);
    expect(find(wrapper, "check-fault").text()).toContain("Power trouble at Calvin 12");
    expect(find(wrapper, "check-fault").text()).toContain("also at 8 while settling");
  });

  async function ended(readingsCount = 1) {
    await toReading1();
    const readings = [
      { ddc: 19, menu: 61 },
      { ddc: 15, menu: 52 },
    ].slice(0, readingsCount);
    await wrapper.setProps({ overrides: { brightness: 19, brightnessConversion: readings } });
    agent({ fault: FAULT, status: "error", reason: "power_trouble" });
    await settle();
  }

  it("ends calibration with the limit, one step under the fault, as the primary action", async () => {
    await ended();
    expect(status(wrapper)).toContain("Calibration stopped · power trouble at Calvin 12");
    expect(wrapper.text()).toContain("Kitchen's power supply is too weak");
    expect(wrapper.text()).toContain("It won't try again on its own");
    expect(wrapper.text()).toContain(
      "Your 1 reading is saved. A menu match needs 2, so the slider stays on Calvin's scale."
    );
    expect(wrapper.text()).toContain("keep Kitchen at 10 or below");
    expect(wrapper.text()).toContain("USB power blocker");
    expect(primary(wrapper).text()).toBe("Save 10 as Kitchen's limit");
    expect(find(wrapper, "fix-link").attributes("href")).toContain("KIOSK_POWER.md");
    expect(find(wrapper, "check-done").exists()).toBe(true);
  });

  it("keeps a two-reading match", async () => {
    await ended(2);
    expect(wrapper.text()).toContain("Your 2 readings are saved, so the menu match is kept.");
  });

  it("saves the fault limit on the click and then offers Done", async () => {
    await ended();
    await clickPrimary(wrapper);
    expect(posts("save-limit")).toHaveLength(1);
    expect(wrapper.emitted("saved-limit")[0][0]).toBe(10);
    expect(status(wrapper)).toContain("Calvin stays at or below 10 on Kitchen");
    expect(wrapper.text()).toContain("stay under 10 until you fix the power");
    expect(primary(wrapper).text()).toBe("Done");
  });

  it("asks before leaving with the limit unsaved", async () => {
    await ended();
    await click(wrapper, "check-done");
    expect(wrapper.text()).toContain("Leave without saving limit 10?");
    expect(wrapper.emitted("update:modelValue")).toBeUndefined();
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

  it("says in the status line what step 4 is, and what it is doing while it runs", async () => {
    await toStep4();
    expect(status(wrapper)).toContain(
      "Step 4 · optional · raises the brightness until the power shows trouble"
    );
    await click(wrapper, "limit-start");
    agent({ level: 24, log: [] });
    await settle();
    expect(status(wrapper)).toContain("Raising 2 every 1.5 s · Calvin 24 · no trouble yet");
  });

  it("shows a power banner in step 4 the same way", async () => {
    await toStep4();
    await click(wrapper, "limit-start");
    agent({
      level: 28,
      fault: { step: "limit", level: 28, kind: "under-voltage", at: "x", lastGood: 26, alsoAt: [] },
    });
    await settle();
    expect(find(wrapper, "check-fault").text()).toContain("Power trouble at Calvin 28");
  });

  it("after saving, offers a third reading near the top when the match came from two low readings", async () => {
    await toStep4({
      overrides: {
        brightness: 19,
        brightnessConversion: [
          { ddc: 15, menu: 52 },
          { ddc: 19, menu: 61 },
        ],
      },
    });
    await click(wrapper, "limit-start");
    agentStep("limit", { level: 19, limit: 26 });
    await settle();
    await click(wrapper, "limit-save");
    expect(find(wrapper, "limit-saved").text()).toContain("Brightness can go up to");
    expect(find(wrapper, "check-third").text()).toContain("Calvin 22");
    expect(find(wrapper, "check-done").exists()).toBe(true);
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
    agentStep("conversion", { value: 19, level: 19 });
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

  async function toUnsavedLimit() {
    await toStep4();
    await click(wrapper, "limit-start");
    agentStep("limit", { level: 19, limit: 26 });
    await settle();
  }

  it("Done with an unsaved limit asks before leaving, and nothing happens yet", async () => {
    await toUnsavedLimit();
    await click(wrapper, "check-done");
    expect(wrapper.text()).toContain("Leave without saving limit 26?");
    expect(posts("stop")).toHaveLength(0);
    expect(posts("save-limit")).toHaveLength(0);
    expect(wrapper.emitted("update:modelValue")).toBeUndefined();
  });

  it("Save in that question saves the limit, ends the session and closes", async () => {
    await toUnsavedLimit();
    await click(wrapper, "check-done");
    await click(wrapper, "confirm-accept");
    expect(posts("save-limit")).toHaveLength(1);
    expect(wrapper.emitted("saved-limit")[0][0]).toBe(26);
    expect(posts("stop")).toHaveLength(1);
    expect(wrapper.emitted("update:modelValue").at(-1)).toEqual([false]);
  });

  it("Leave in that question ends the session without saving and keeps the old limit", async () => {
    await toUnsavedLimit();
    await click(wrapper, "check-done");
    await click(wrapper, "confirm-alternative");
    expect(posts("save-limit")).toHaveLength(0);
    expect(posts("stop")).toHaveLength(1);
    expect(wrapper.emitted("update:modelValue").at(-1)).toEqual([false]);
  });

  it("Cancel in that question stays on the finish screen", async () => {
    await toUnsavedLimit();
    await click(wrapper, "check-done");
    await click(wrapper, "confirm-cancel");
    expect(find(wrapper, "limit-save").exists()).toBe(true);
    expect(posts("stop")).toHaveLength(0);
    expect(wrapper.emitted("update:modelValue")).toBeUndefined();
  });

  it("the × asks the same question", async () => {
    await toUnsavedLimit();
    wrapper.findComponent({ name: "Dialog" }).vm.$emit("update:modelValue", false);
    await flushPromises();
    expect(wrapper.text()).toContain("Leave without saving limit 26?");
    expect(wrapper.emitted("update:modelValue")).toBeUndefined();
  });

  it("closes without asking once the limit is saved", async () => {
    await toUnsavedLimit();
    await click(wrapper, "limit-save");
    await click(wrapper, "check-done");
    expect(wrapper.text()).not.toContain("Leave without saving");
    expect(posts("stop")).toHaveLength(1);
    expect(wrapper.emitted("update:modelValue").at(-1)).toEqual([false]);
  });

  it("Done with no limit found closes without asking", async () => {
    await toStep4();
    await click(wrapper, "limit-skip");
    await click(wrapper, "check-done");
    expect(wrapper.text()).not.toContain("Leave without saving");
    expect(wrapper.emitted("update:modelValue").at(-1)).toEqual([false]);
  });

  it("explains the limit as offered, and applied once saved", async () => {
    await toStep4();
    expect(wrapper.text()).toContain(
      "Then it steps back down and offers that level as Kitchen's limit. Once you save it, Calvin never goes above it."
    );
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
    agentStep("conversion", { value: 19, level: 19 });
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
