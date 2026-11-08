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
  stopKeepsActive: false,
  stopCalls: 0,
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
          seq: 0,
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
        backend.run = {
          ...backend.run,
          step: body.step,
          value: body.value ?? null,
          seq: (backend.run.seq ?? 0) + 1,
        };
        return { data: backend.run };
      }
      if (action === "stop") {
        backend.stopCalls += 1;
        backend.run = backend.stopKeepsActive
          ? { ...backend.run, action: "stop", status: "stopping", active: true }
          : { ...backend.run, action: "stop", status: "stopped", active: false };
        return { data: backend.run };
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
        seq: backend.run.seq ?? null,
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
  window.sessionStorage.clear();
  Object.assign(backend, {
    run: null,
    posts: [],
    seq: 0,
    clock: 0,
    activeOnStart: null,
    stopKeepsActive: false,
    stopCalls: 0,
    capMax: null,
    ceilingMax: null,
  });
});
afterEach(() => {
  window.sessionStorage.clear();
  wrapper?.unmount();
  document.body.innerHTML = "";
  vi.useRealTimers();
});

const CLEAN = { status: "clean", faults: [] };
const DETECT = { detail: "NOMAD TOUCH · DDC/CI 2.1 · HDMI-A-1" };
const status = w => find(w, "check-status").text();
const primary = w => w.find("[data-primary]");
const clickPrimary = async w => {
  await primary(w).trigger("click");
  await flushPromises();
};

async function toFound(props) {
  wrapper = mountDialog(props);
  await flushPromises();
  agent({ preflight: CLEAN, start: { level: 19, known: true, source: "read" } });
  agentStep("detect", DETECT);
  await settle();
}
// Type what the panel's menu shows and press Read it; the agent answers.
async function readLevel(typed, ddc, lastWrite = null) {
  await find(wrapper, "reading-input").setValue(String(typed));
  await clickPrimary(wrapper);
  agentStep("read", { level: ddc, lastWrite });
  await settle();
}
async function toStep2(props) {
  await toFound(props);
  await clickPrimary(wrapper);
}
async function toStep3(props) {
  await toStep2(props);
  await readLevel(60, 20);
  await clickPrimary(wrapper);
}
async function toStep4(props) {
  await toStep3(props);
  await readLevel(40, 12);
  await clickPrimary(wrapper);
}
async function toSummary(props) {
  await toStep4(props);
  await readLevel(10, 2);
  await clickPrimary(wrapper);
}
const patches = () => wrapper.emitted("patch") || [];

describe("power check before step 1", () => {
  it("carries no fine print about Turn off now or a schedule off", async () => {
    wrapper = mountDialog();
    await flushPromises();
    expect(wrapper.text()).not.toContain("Turn off now");
    expect(wrapper.text()).not.toContain("up to 10 min");
  });

  it("waits for the screen to pick up the check, with no countdown, and keeps Stop", async () => {
    wrapper = mountDialog();
    await flushPromises();
    expect(status(wrapper)).toBe(
      "Waiting for the screen to pick up the check. It checks in about once a minute."
    );
    expect(wrapper.text()).not.toContain("watches the power supply");
    expect(primary(wrapper).exists()).toBe(false);
    await settle(25000);
    expect(status(wrapper)).toContain("Waiting for the screen to pick up the check");
    expect(status(wrapper)).not.toMatch(/\d+ s/);
    expect(wrapper.find("[data-test='check-stop']").exists()).toBe(true);
  });

  it("starts the 10 s power watch from the agent's first report, without the screen name", async () => {
    wrapper = mountDialog();
    await flushPromises();
    await settle(25000);
    agent({});
    await settle();
    // Counted from when the report arrived (the 2 s poll), so 10 s or just under.
    expect(status(wrapper)).toMatch(/^Checking the power before changing anything · (10|9) s$/);
    expect(wrapper.text()).toContain("watches the power supply for 10 s");
    expect(primary(wrapper).exists()).toBe(false);
    await settle(3000);
    expect(status(wrapper)).toMatch(/· [67] s$/);
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
    expect(primary(wrapper).text()).toBe("How to fix the power");
    expect(posts("step")).toHaveLength(0);
  });
});

describe("step 1: find the display", () => {
  it("starts with detect and shows what it found, with Next as the only primary", async () => {
    await toFound();
    expect(lastStart()).toEqual({ step: "detect" });
    expect(status(wrapper)).toContain("Step 1 of 4 · Found the display");
    expect(wrapper.text()).toContain("NOMAD TOUCH");
    expect(wrapper.text()).toContain("Calvin won't change the brightness");
    expect(primary(wrapper).text()).toBe("Next");
  });

  it("ends when the screen has no brightness control", async () => {
    wrapper = mountDialog();
    await flushPromises();
    agent({ preflight: CLEAN });
    agentStep("detect", { status: "error", detail: "no ddc" });
    await settle();
    expect(status(wrapper)).toContain("Check ended · no brightness control");
    expect(primary(wrapper).text()).toBe("Close");
  });

  it("has no safe-limit climb, write test or menu-at-start question anywhere", async () => {
    await toFound();
    for (const gone of ["limit-start", "limit-stop", "writes-yes", "menu-start-input"]) {
      expect(find(wrapper, gone).exists()).toBe(false);
    }
    expect(wrapper.text()).not.toMatch(/safe limit|Does it change|dims it to 5/i);
  });
});

describe("steps 2-4: the panel's own buttons, Calvin reads", () => {
  it("asks for the highest level in the owner's words, with a number field and Read it", async () => {
    await toStep2();
    expect(status(wrapper)).toContain("Step 2 of 4 · Highest level");
    expect(wrapper.text()).toContain(
      "Use the panel's own buttons to set Brightness to the highest level that works: its max, or the highest without flicker or the screen cutting out."
    );
    expect(find(wrapper, "reading-input").attributes("inputmode")).toBe("numeric");
    expect(primary(wrapper).text()).toBe("Read it");
    expect(primary(wrapper).attributes("disabled")).toBeDefined();
    expect(find(wrapper, "same-as-highest").exists()).toBe(false);
  });

  it("tells the person Calvin brings the screen up to the highest level after it turns on", async () => {
    await toStep2();
    expect(wrapper.text()).toContain(
      "Calvin starts the screen at the minimum and brings it up to this after it turns on."
    );
    await readLevel(60, 20);
    await clickPrimary(wrapper);
    expect(wrapper.text()).not.toContain("brings it up to this after");
  });

  it("sends a read step (no value, no write) and shows the pair", async () => {
    await toStep2();
    await find(wrapper, "reading-input").setValue("60");
    expect(primary(wrapper).attributes("disabled")).toBeUndefined();
    await clickPrimary(wrapper);
    expect(lastStep()).toEqual({ step: "read" });
    expect(status(wrapper)).toContain("Reading…");
    expect(primary(wrapper).exists()).toBe(false);
    agentStep("read", { level: 20, lastWrite: null });
    await settle();
    expect(find(wrapper, "level-pair").text()).toBe("Panel 60 · Calvin 20");
    expect(status(wrapper)).toContain("Step 2 of 4 · Highest level · Panel 60 · Calvin 20");
    expect(primary(wrapper).text()).toBe("Next");
    expect(find(wrapper, "read-again").exists()).toBe(true);
  });

  it("reads again on request", async () => {
    await toStep2();
    await readLevel(60, 20);
    await click(wrapper, "read-again");
    expect(find(wrapper, "level-pair").exists()).toBe(false);
    expect(find(wrapper, "reading-input").element.value).toBe("60");
    await clickPrimary(wrapper);
    expect(posts("step")).toHaveLength(2);
  });

  it("asks for the everyday level next, and offers Same as highest only there", async () => {
    await toStep3();
    expect(status(wrapper)).toContain("Step 3 of 4 · Everyday level");
    expect(wrapper.text()).toContain("comfortable level for everyday use");
    expect(find(wrapper, "same-as-highest").exists()).toBe(true);
  });

  it("Same as highest fills in the highest level and reads at once", async () => {
    await toStep3();
    await click(wrapper, "same-as-highest");
    expect(posts("step")).toHaveLength(2);
    agentStep("read", { level: 20, lastWrite: null });
    await settle();
    expect(find(wrapper, "level-pair").text()).toBe("Panel 60 · Calvin 20");
  });

  it("asks for the lowest level last, without Same as highest", async () => {
    await toStep4();
    expect(status(wrapper)).toContain("Step 4 of 4 · Lowest level");
    expect(find(wrapper, "same-as-highest").exists()).toBe(false);
  });

  it("refuses a level higher than the one before it", async () => {
    await toStep3();
    await find(wrapper, "reading-input").setValue("70");
    expect(primary(wrapper).attributes("disabled")).toBeDefined();
    expect(wrapper.text()).toContain("can't be higher than the highest, 60");
  });

  it("does all three steps even when the first pair matches", async () => {
    await toStep2();
    await readLevel(60, 60);
    expect(primary(wrapper).text()).toBe("Next");
    expect(find(wrapper, "check-save").exists()).toBe(false);
  });

  it("never puts the screen name in menu copy", async () => {
    await toStep2({ screenName: "calvin" });
    expect(wrapper.text().toLowerCase()).not.toContain("calvin's own menu");
    expect(wrapper.text()).toContain("the panel's own menu");
  });
});

describe("the summary and Save", () => {
  it("lists highest, everyday and lowest in panel numbers with Calvin values beside", async () => {
    await toSummary();
    expect(status(wrapper)).toContain("Check finished · not saved yet");
    const text = find(wrapper, "check-summary").text();
    expect(text).toContain("Highest");
    expect(text).toContain("Panel 60 · Calvin 20");
    expect(text).toContain("Everyday");
    expect(text).toContain("Panel 40 · Calvin 12");
    expect(text).toContain("Lowest");
    expect(text).toContain("Panel 10 · Calvin 2");
    expect(primary(wrapper).text()).toBe("Save");
    expect(patches()).toHaveLength(0);
  });

  it("repeats the startup line once in the summary", async () => {
    await toSummary();
    const text = find(wrapper, "check-summary").text();
    expect(text).toContain(
      "Calvin starts the screen at the minimum and brings it up to this after it turns on."
    );
  });

  it("Save patches once: this run's pairs replace the old readings, limit, brightness and floor", async () => {
    await toSummary({
      overrides: {
        brightness: 19,
        brightnessConversion: [
          { ddc: 5, menu: 28 },
          { ddc: 19, menu: 61 },
        ],
      },
    });
    await clickPrimary(wrapper);
    expect(patches()).toHaveLength(1);
    expect(patches()[0][0]).toEqual({
      brightnessConversion: [
        { ddc: 2, menu: 10 },
        { ddc: 12, menu: 40 },
        { ddc: 20, menu: 60 },
      ],
      brightnessLimit: 20,
      brightness: 12,
      brightnessFloor: 2,
      brightnessRampEnabled: true,
    });
    expect(status(wrapper)).toContain("Saved");
    expect(primary(wrapper).text()).toBe("Done");
  });

  it("says Calvin never goes above the highest value, and no longer talks of a margin under the limit", async () => {
    await toSummary();
    const text = find(wrapper, "check-summary").text();
    expect(text).toContain("Calvin never goes above 20.");
    expect(text).not.toContain("under the limit");
  });

  it("offers to use the levels when the screen wakes and starts, on by default, in the same save", async () => {
    await toSummary();
    const box = find(wrapper, "use-on-wake");
    expect(find(wrapper, "check-summary").text()).toContain(
      "Use these levels when the screen wakes and starts"
    );
    expect(box.element.checked).toBe(true);
    await clickPrimary(wrapper);
    expect(patches()).toHaveLength(1);
    expect(patches()[0][0].brightnessRampEnabled).toBe(true);
  });

  it("leaves the ramp setting alone when the wake option is turned off", async () => {
    await toSummary();
    await find(wrapper, "use-on-wake").setValue(false);
    await clickPrimary(wrapper);
    expect(patches()[0][0]).not.toHaveProperty("brightnessRampEnabled");
  });

  it("after a successful save says Calvin is bringing the screen back to the everyday level", async () => {
    await toSummary();
    expect(wrapper.text()).not.toContain("bringing the screen back");
    await clickPrimary(wrapper);
    expect(find(wrapper, "check-summary").text()).toContain(
      "Calvin is bringing the screen back to your everyday level."
    );
    expect(find(wrapper, "use-on-wake").exists()).toBe(false);
    expect(primary(wrapper).text()).toBe("Done");
  });

  it("says Calvin and the panel use the same scale when every pair is equal", async () => {
    await toStep2();
    await readLevel(60, 60);
    await clickPrimary(wrapper);
    await readLevel(40, 40);
    await clickPrimary(wrapper);
    await readLevel(10, 10);
    await clickPrimary(wrapper);
    expect(find(wrapper, "check-summary").text()).toContain(
      "Calvin and the panel use the same scale."
    );
  });

  it("does not claim the same scale when the numbers differ", async () => {
    await toSummary();
    expect(find(wrapper, "check-summary").text()).not.toContain("same scale");
  });

  it("emits writes-ok before the patch so the ramp default never overwrites the everyday level", async () => {
    await toSummary();
    await clickPrimary(wrapper);
    expect(wrapper.emitted("writes-ok")).toHaveLength(1);
    expect(wrapper.emitted("writes-ok")[0][0]).toEqual({ rampEnabled: true });
  });

  it("passes the unticked wake choice on with writes-ok", async () => {
    await toSummary();
    await find(wrapper, "use-on-wake").setValue(false);
    await clickPrimary(wrapper);
    expect(wrapper.emitted("writes-ok")[0][0]).toEqual({ rampEnabled: false });
  });
});

describe("retaking a reading checks both neighbours", () => {
  // Readings: highest Panel 60 / Calvin 20, everyday 40 / 12, lowest 10 / 2.
  async function removeEveryday() {
    await toSummary();
    await find(wrapper, "remove-reading-1").trigger("click");
    await flushPromises();
  }

  it("refuses a typed level above the highest or below the lowest", async () => {
    await removeEveryday();
    await find(wrapper, "reading-input").setValue("70");
    expect(find(wrapper, "level-too-high").text()).toContain(
      "can't be higher than the highest, 60"
    );
    expect(primary(wrapper).attributes("disabled")).toBeDefined();
    await find(wrapper, "reading-input").setValue("5");
    expect(find(wrapper, "level-too-high").text()).toContain("can't be lower than the lowest, 10");
    expect(primary(wrapper).attributes("disabled")).toBeDefined();
  });

  it("does not let a read above the highest or below the lowest go on to Save", async () => {
    await removeEveryday();
    await readLevel(40, 25); // Calvin 25 is above the highest's 20
    expect(find(wrapper, "level-behind").exists()).toBe(true);
    expect(primary(wrapper).text()).toBe("Read it again");
    await clickPrimary(wrapper);
    await readLevel(40, 1); // Calvin 1 is below the lowest's 2
    expect(find(wrapper, "level-behind").exists()).toBe(true);
    expect(primary(wrapper).text()).toBe("Read it again");
    expect(find(wrapper, "check-save").exists()).toBe(false);
  });

  it("goes back to the summary when the retaken level sits between its neighbours", async () => {
    await removeEveryday();
    await readLevel(35, 10);
    expect(find(wrapper, "level-behind").exists()).toBe(false);
    await clickPrimary(wrapper);
    expect(find(wrapper, "check-summary").text()).toContain("Panel 35 · Calvin 10");
  });

  it("checks a retaken highest against the everyday level", async () => {
    await toSummary();
    await find(wrapper, "remove-reading-0").trigger("click");
    await flushPromises();
    await find(wrapper, "reading-input").setValue("30");
    expect(find(wrapper, "level-too-high").text()).toContain(
      "can't be lower than the everyday, 40"
    );
    await find(wrapper, "reading-input").setValue("60");
    await clickPrimary(wrapper);
    agentStep("read", { level: 8 }); // below the everyday's 12
    await settle();
    expect(find(wrapper, "level-behind").exists()).toBe(true);
  });
});

describe("Remove and Back leave nothing stale behind", () => {
  it("a drop reported while the summary shows does not come back on a later step after Remove", async () => {
    await toSummary();
    agent({ fault: FAULT });
    await settle();
    await find(wrapper, "remove-reading-1").trigger("click");
    await flushPromises();
    expect(wrapper.text()).not.toContain("The power dropped");
    await find(wrapper, "reading-input").setValue("35");
    await clickPrimary(wrapper);
    agentStep("read", { level: 10 });
    await settle();
    expect(wrapper.text()).not.toContain("The power dropped");
    await clickPrimary(wrapper);
    expect(find(wrapper, "check-summary").text()).toContain("Panel 35 · Calvin 10");
  });

  it("Back forgets the 'behind' tries so the own-levels offer starts again", async () => {
    await toStep3();
    await readLevel(40, 20); // equal Calvin value, lower typed: behind
    await clickPrimary(wrapper); // Read it again
    await readLevel(40, 20);
    expect(find(wrapper, "use-own-levels").exists()).toBe(true);
    await find(wrapper, "check-back").trigger("click");
    await flushPromises();
    await readLevel(60, 20);
    await clickPrimary(wrapper);
    await readLevel(40, 20);
    expect(find(wrapper, "level-behind").exists()).toBe(true);
    expect(find(wrapper, "use-own-levels").exists()).toBe(false);
  });
});

describe("the fallback: the panel doesn't report its own buttons", () => {
  async function toFallback(reads) {
    await toStep2();
    await readLevel(60, reads[0][0], reads[0][1]);
    await clickPrimary(wrapper);
    await readLevel(40, reads[1][0], reads[1][1]);
    await clickPrimary(wrapper);
    await readLevel(10, reads[2][0], reads[2][1]);
    await clickPrimary(wrapper);
  }

  // A panel that ignores the buttons: reads stay at 30. The second equal read is
  // "behind"; after one more read it offers Calvin's own levels.
  async function toOwnLevels() {
    await toStep2();
    await readLevel(60, 30);
    await clickPrimary(wrapper);
    await readLevel(40, 30);
    await clickPrimary(wrapper); // Read it again
    await readLevel(40, 30);
    await click(wrapper, "use-own-levels");
  }
  // Both low levels, answered; the lowest menu number is still to come.
  async function answerLows(first = 28, second = 10) {
    await clickPrimary(wrapper);
    agentStep("conversion", { value: lastStep().value, level: lastStep().value });
    await settle();
    await find(wrapper, "reading-input").setValue(String(first));
    await clickPrimary(wrapper);
    agentStep("conversion", { value: lastStep().value, level: lastStep().value });
    await settle();
    await find(wrapper, "reading-input").setValue(String(second));
    await clickPrimary(wrapper);
  }

  it("counts a read equal to the one before as behind when the typed number went down (100/60/10 reads 100/100/60)", async () => {
    await toStep2();
    await readLevel(100, 100);
    await clickPrimary(wrapper);
    await readLevel(60, 100);
    expect(find(wrapper, "level-behind").exists()).toBe(true);
    expect(primary(wrapper).text()).toBe("Read it again");
    expect(find(wrapper, "use-own-levels").exists()).toBe(false);
  });

  it("offers Calvin's own levels once Read it again is still out of order", async () => {
    await toStep2();
    await readLevel(100, 100);
    await clickPrimary(wrapper);
    await readLevel(60, 100);
    await clickPrimary(wrapper); // Read it again
    await readLevel(60, 100);
    expect(find(wrapper, "use-own-levels").text()).toBe("Use Calvin's own levels instead");
    await click(wrapper, "use-own-levels");
    expect(status(wrapper)).toContain("This panel doesn't report its own buttons");
  });

  it("treats an unusable read as behind", async () => {
    await toStep3();
    await find(wrapper, "reading-input").setValue("40");
    await clickPrimary(wrapper);
    agentStep("read", { level: null });
    await settle();
    expect(find(wrapper, "level-behind").text()).toContain("doesn't look right");
  });

  it("is triggered when the reads stay equal and the person chooses Calvin's own levels", async () => {
    await toOwnLevels();
    expect(status(wrapper)).toContain("This panel doesn't report its own buttons");
    expect(find(wrapper, "check-summary").exists()).toBe(false);
  });

  it("uses the level the agent reports writing, not the one asked for", async () => {
    await toOwnLevels();
    await clickPrimary(wrapper);
    agentStep("conversion", { value: 5, level: 4 });
    await settle();
    await find(wrapper, "reading-input").setValue("28");
    await clickPrimary(wrapper);
    agentStep("conversion", { value: 1, level: 1 });
    await settle();
    await find(wrapper, "reading-input").setValue("10");
    await clickPrimary(wrapper);
    // The lowest level's menu number is asked for last.
    await find(wrapper, "reading-input").setValue("10");
    await clickPrimary(wrapper);
    await clickPrimary(wrapper);
    expect(patches()[0][0].brightnessConversion).toEqual([
      { ddc: 1, menu: 10 },
      { ddc: 4, menu: 28 },
    ]);
  });

  it("skips the two-level fallback with a plain message when the cap is 1 or less", async () => {
    await toStep2();
    backend.run = { ...backend.run, ceiling: 1 };
    await readLevel(60, 30);
    await clickPrimary(wrapper);
    await readLevel(40, 30);
    await clickPrimary(wrapper);
    await readLevel(40, 30);
    await click(wrapper, "use-own-levels");
    expect(find(wrapper, "check-end").text()).toContain("already at its lowest safe level");
    expect(posts("step").filter(([, b]) => b.step === "conversion")).toHaveLength(0);
  });

  it("does not start the read steps on an agent that reports no seq", async () => {
    wrapper = mountDialog();
    await flushPromises();
    agent({ preflight: CLEAN, start: { level: 19, known: true, source: "read" } });
    agentStep("detect", { ...DETECT, seq: null });
    await settle();
    expect(find(wrapper, "check-end").text()).toContain(
      "Update this screen first: Settings > update"
    );
    expect(primary(wrapper).text()).toBe("Done");
    expect(find(wrapper, "check-retry").exists()).toBe(false);
    expect(find(wrapper, "reading-input").exists()).toBe(false);
    expect(backend.stopCalls).toBeGreaterThan(0);
  });

  it("is triggered when a read equals the last write while the typed number differs", async () => {
    await toFallback([
      [20, null],
      [12, null],
      [5, 5],
    ]);
    expect(status(wrapper)).toContain("This panel doesn't report its own buttons");
  });

  it("Remove on a fallback summary resets the whole fallback and never revives the rejected reads", async () => {
    await toOwnLevels();
    await clickPrimary(wrapper);
    agentStep("conversion", { value: 5, level: 5 });
    await settle();
    await find(wrapper, "reading-input").setValue("28");
    await clickPrimary(wrapper);
    agentStep("conversion", { value: 1, level: 1 });
    await settle();
    await find(wrapper, "reading-input").setValue("10");
    await clickPrimary(wrapper);
    await find(wrapper, "reading-input").setValue("10");
    await clickPrimary(wrapper);
    expect(find(wrapper, "check-summary").text()).toContain("approximate");
    await find(wrapper, "remove-reading-1").trigger("click");
    await flushPromises();
    // Back to a normal read of the everyday step: no fallback, no old rejected read.
    expect(status(wrapper)).toContain("Step 3 of 4");
    expect(wrapper.text()).not.toContain("This panel doesn't report its own buttons");
    await readLevel(40, 12);
    await clickPrimary(wrapper);
    await readLevel(10, 2);
    await clickPrimary(wrapper);
    const text = find(wrapper, "check-summary").text();
    expect(text).not.toContain("approximate");
    expect(text).toContain("Panel 40 · Calvin 12");
  });

  it("Remove Highest on a fallback summary drops the rejected Everyday read too", async () => {
    await toOwnLevels();
    await clickPrimary(wrapper);
    agentStep("conversion", { value: 5, level: 5 });
    await settle();
    await find(wrapper, "reading-input").setValue("28");
    await clickPrimary(wrapper);
    agentStep("conversion", { value: 1, level: 1 });
    await settle();
    await find(wrapper, "reading-input").setValue("10");
    await clickPrimary(wrapper);
    await find(wrapper, "reading-input").setValue("10");
    await clickPrimary(wrapper);
    expect(find(wrapper, "check-summary").text()).toContain("approximate");
    await find(wrapper, "remove-reading-0").trigger("click");
    await flushPromises();
    expect(status(wrapper)).toContain("Step 2 of 4");
    await readLevel(70, 35);
    await clickPrimary(wrapper);
    // The rejected Everyday 30 is gone: Everyday is asked again.
    expect(status(wrapper)).toContain("Step 3 of 4");
  });

  it("writes only low levels, 5 then 1, asking the menu each time", async () => {
    await toOwnLevels();
    await clickPrimary(wrapper);
    expect(lastStep()).toEqual({ step: "conversion", value: 5 });
    agentStep("conversion", { value: 5, level: 5 });
    await settle();
    expect(status(wrapper)).toContain("Low level 1 of 2");
    await find(wrapper, "reading-input").setValue("16");
    await clickPrimary(wrapper);
    expect(lastStep()).toEqual({ step: "conversion", value: 1 });
    agentStep("conversion", { value: 1, level: 1 });
    await settle();
    expect(status(wrapper)).toContain("Low level 2 of 2");
  });

  it("fits the line, labels it approximate and rounds the highest level down", async () => {
    await toOwnLevels();
    // Calvin 5 -> menu 28, Calvin 1 -> menu 10: menu = 5.5 + 4.5 x ddc.
    await answerLows(28, 10);
    // The lowest level's menu number was not read yet: it is asked last.
    await find(wrapper, "reading-input").setValue("10");
    await clickPrimary(wrapper);
    const text = find(wrapper, "check-summary").text();
    expect(text).toContain("approximate");
    // menu 60 -> 12.1 -> rounded down to 12; menu 40 -> 7.7 -> 8; menu 10 -> 1.
    expect(text).toContain("Panel 60 · Calvin 12");
    expect(text).toContain("Panel 40 · Calvin 8");
    expect(text).toContain("Panel 10 · Calvin 1");
    await clickPrimary(wrapper);
    expect(patches()[0][0]).toMatchObject({
      brightnessLimit: 12,
      brightness: 8,
      brightnessFloor: 1,
      brightnessConversion: [
        { ddc: 1, menu: 10 },
        { ddc: 5, menu: 28 },
      ],
    });
  });
});

// A power drop on the highest step (calvin-tzzx): the dialog shows only the
// post-drop text; the next reading is the highest reading.
const FAULT = { step: "read", level: 5, kind: "under-voltage", lastGood: 20, alsoAt: [] };
async function dropAtHighest({ ends = true, typed = 74 } = {}) {
  await toStep2();
  await find(wrapper, "reading-input").setValue(String(typed));
  await clickPrimary(wrapper);
  if (ends) agent({ status: "error", reason: "power_trouble", fault: FAULT });
  else agent({ fault: FAULT });
  await settle();
}

describe("power trouble in a step", () => {
  for (const ends of [true, false]) {
    it(`shows only the post-drop text when the agent ${ends ? "ends" : "keeps"} the run`, async () => {
      await dropAtHighest({ ends });
      const body = find(wrapper, "check-step-body").text();
      expect(body).toContain("The power dropped. Calvin dimmed the screen to keep it safe.");
      expect(body).toContain(
        "Use the panel's buttons to set Brightness one step below where it cut out. Then type the number its menu shows now."
      );
      // Not the normal step text, not a banner naming Calvin's dim level, no "ended".
      expect(body).not.toContain("Use the panel's own buttons to set Brightness to the highest");
      expect(body).not.toContain("Calvin starts the screen at the minimum");
      expect(body).not.toContain("Power trouble at");
      expect(body).not.toContain("ended the check");
      expect(find(wrapper, "check-fault").exists()).toBe(false);
      expect(find(wrapper, "reading-input").exists()).toBe(true);
      expect(primary(wrapper).text()).toBe("Read it");
      expect(find(wrapper, "check-back").text()).toBe("Back");
      expect(patches()).toHaveLength(0);
    });
  }

  it("after Remove Highest, a drop then a stale read below Everyday does not advance to the summary", async () => {
    await toSummary();
    await find(wrapper, "remove-reading-0").trigger("click");
    await flushPromises();
    await find(wrapper, "reading-input").setValue("74");
    await clickPrimary(wrapper);
    agent({ fault: FAULT });
    await settle();
    await find(wrapper, "reading-input").setValue("70");
    await clickPrimary(wrapper);
    agentStep("read", { level: 5, lastWrite: null });
    await settle();
    expect(find(wrapper, "check-summary").exists()).toBe(false);
    expect(find(wrapper, "level-behind").exists()).toBe(true);
  });

  it("takes the next reading as the highest, with the typed panel number, and goes to Everyday", async () => {
    await dropAtHighest({ typed: 74 });
    await find(wrapper, "reading-input").setValue("60");
    await clickPrimary(wrapper);
    expect(posts("start").at(-1)[1]).toEqual({ step: "read" });
    agentStep("read", { level: 18, lastWrite: null });
    await settle();
    expect(status(wrapper)).toContain("Step 3 of 4");
    expect(find(wrapper, "check-fault").exists()).toBe(false);
    await readLevel(40, 12);
    await clickPrimary(wrapper);
    await readLevel(10, 2);
    await clickPrimary(wrapper);
    expect(find(wrapper, "check-summary").text()).toContain("Panel 60 · Calvin 18");
    expect(find(wrapper, "check-summary").text()).not.toContain("74");
    await clickPrimary(wrapper);
    expect(patches().at(-1)[0]).toMatchObject({
      brightnessLimit: 18,
      brightnessConversion: [
        { ddc: 2, menu: 10 },
        { ddc: 12, menu: 40 },
        { ddc: 18, menu: 60 },
      ],
    });
  });

  it("works with a run the agent kept open: Read it moves that run to a read", async () => {
    await dropAtHighest({ ends: false });
    await find(wrapper, "reading-input").setValue("60");
    await clickPrimary(wrapper);
    expect(lastStep()).toEqual({ step: "read" });
    expect(find(wrapper, "check-fault").exists()).toBe(false);
    expect(status(wrapper)).toContain("Reading");
  });

  it("at a later level shows the same post-drop text and reads that level", async () => {
    await toStep3();
    await find(wrapper, "reading-input").setValue("30");
    await clickPrimary(wrapper);
    agent({ status: "error", reason: "power_trouble", fault: FAULT });
    await settle();
    expect(wrapper.text()).toContain(
      "The power dropped. Calvin dimmed the screen to keep it safe."
    );
    await find(wrapper, "reading-input").setValue("25");
    await clickPrimary(wrapper);
    expect(posts("start").at(-1)[1]).toEqual({ step: "read" });
  });
});

describe("Back and Remove", () => {
  it("Back from the post-drop state returns to the first step", async () => {
    await dropAtHighest();
    await find(wrapper, "check-back").trigger("click");
    await flushPromises();
    expect(status(wrapper)).toContain("Step 1 of 4");
    expect(find(wrapper, "check-fault").exists()).toBe(false);
  });

  it("Back from an unread step retakes the previous reading and discards it", async () => {
    await toStep3();
    expect(status(wrapper)).toContain("Step 3 of 4");
    await find(wrapper, "check-back").trigger("click");
    await flushPromises();
    expect(status(wrapper)).toContain("Step 2 of 4");
    expect(find(wrapper, "level-pair").exists()).toBe(false);
    expect(find(wrapper, "reading-input").element.value).toBe("60");
  });

  it("Back from a finished reading goes to the step before and keeps nothing for both", async () => {
    await toStep3();
    await readLevel(40, 12);
    await find(wrapper, "check-back").trigger("click");
    await flushPromises();
    expect(status(wrapper)).toContain("Step 2 of 4");
    expect(find(wrapper, "level-pair").exists()).toBe(false);
  });

  it("the summary lists a Remove per reading; removing one retakes just that step", async () => {
    await toSummary();
    for (const i of [0, 1, 2]) expect(find(wrapper, `remove-reading-${i}`).exists()).toBe(true);
    await find(wrapper, "remove-reading-1").trigger("click");
    await flushPromises();
    expect(status(wrapper)).toContain("Step 3 of 4");
    await readLevel(35, 10);
    await clickPrimary(wrapper);
    // The other readings are kept: straight back to the summary.
    expect(find(wrapper, "check-summary").text()).toContain("Panel 35 · Calvin 10");
    expect(find(wrapper, "check-summary").text()).toContain("Panel 60 · Calvin 20");
    expect(patches()).toHaveLength(0);
  });

  it("offers no Remove once saved", async () => {
    await toSummary();
    await clickPrimary(wrapper);
    expect(find(wrapper, "remove-reading-0").exists()).toBe(false);
  });
});

describe("telling the agent the Save landed", () => {
  const stopBody = () => posts("stop").at(-1)?.[1];

  it("Done after a successful Save stops with saved: true", async () => {
    await toSummary({ savePatch: vi.fn().mockResolvedValue(true) });
    await clickPrimary(wrapper); // Save
    await clickPrimary(wrapper); // Done
    expect(posts("stop")).toHaveLength(1);
    expect(stopBody()).toEqual({ saved: true });
  });

  it("closing (X) after a successful Save stops with saved: true", async () => {
    await toSummary({ savePatch: vi.fn().mockResolvedValue(true) });
    await clickPrimary(wrapper);
    await wrapper.setProps({ modelValue: false });
    await flushPromises();
    expect(stopBody()).toEqual({ saved: true });
  });

  it("Done or close without a Save, or after a failed one, never says saved", async () => {
    await toSummary({ savePatch: vi.fn().mockResolvedValue(false) });
    await clickPrimary(wrapper); // Save fails
    await wrapper.setProps({ modelValue: false });
    await flushPromises();
    expect(posts("stop")).toHaveLength(1);
    expect(stopBody()).toBeUndefined();
  });
});

describe("Try again during a live run", () => {
  it("waits, saying Stopping, until the old run ends, then starts once", async () => {
    await toStep3();
    const starts = posts("start").length;
    backend.stopKeepsActive = true;
    const pending = wrapper.vm.retry();
    await flushPromises();
    expect(posts("stop")).toHaveLength(1);
    expect(posts("start")).toHaveLength(starts); // not while the agent is still stopping
    expect(status(wrapper)).toContain("Stopping, bringing brightness down");
    agent({ status: "stopped" });
    await settle();
    await pending;
    await flushPromises();
    expect(posts("start")).toHaveLength(starts + 1);
  });

  it("gives up after a bounded wait and says so when the old run never reports", async () => {
    await toStep3();
    const starts = posts("start").length;
    backend.stopKeepsActive = true;
    const pending = wrapper.vm.retry();
    await settle(21000);
    await pending;
    expect(posts("start")).toHaveLength(starts);
    expect(wrapper.text()).toContain("still stopping");
  });
});

describe("Stop", () => {
  it("shows the pressed state on pointerdown, before anything comes back", async () => {
    await toStep2();
    backend.stopKeepsActive = true;
    const stop = find(wrapper, "check-stop");
    await stop.trigger("pointerdown");
    expect(stop.attributes("aria-pressed")).toBe("true");
    expect(stop.classes()).toContain("dcheck__stop--pressed");
  });

  it.each([
    ["step 1", async () => toFound()],
    ["step 2", async () => toStep2()],
    ["step 3", async () => toStep3()],
    ["step 4", async () => toStep4()],
    ["the summary", async () => toSummary()],
  ])("says Stopping, bringing brightness down in %s until the agent finishes", async (_n, go) => {
    await go();
    backend.stopKeepsActive = true;
    await find(wrapper, "check-stop").trigger("pointerdown");
    await flushPromises();
    expect(status(wrapper)).toContain("Stopping, bringing brightness down");
    expect(primary(wrapper).exists()).toBe(false);
    await settle();
    expect(status(wrapper)).toContain("Stopping, bringing brightness down");
    agent({ status: "stopped" });
    await settle();
    expect(status(wrapper)).not.toContain("Stopping, bringing brightness down");
  });

  it("is safe to tap again and again", async () => {
    await toStep2();
    backend.stopKeepsActive = true;
    const stop = find(wrapper, "check-stop");
    await stop.trigger("pointerdown");
    await stop.trigger("pointerdown");
    await stop.trigger("click");
    await flushPromises();
    expect(backend.stopCalls).toBeGreaterThanOrEqual(2);
    expect(wrapper.find("[role='alert']").exists()).toBe(false);
    expect(status(wrapper)).toContain("Stopping, bringing brightness down");
  });
});

describe("an unfinished run", () => {
  it("says exactly what was kept, with Done primary and Try again secondary", async () => {
    await toStep3({
      overrides: { brightnessConversion: [{ ddc: 5, menu: 28 }], brightnessLimit: 26 },
    });
    await find(wrapper, "check-stop").trigger("click");
    await flushPromises();
    await settle();
    expect(status(wrapper)).toContain("Check stopped");
    expect(wrapper.text()).toContain(
      "Nothing changed; the previous calibration is still in place."
    );
    expect(primary(wrapper).text()).toBe("Done");
    expect(find(wrapper, "check-retry").text()).toBe("Try again");
    expect(patches()).toHaveLength(0);
  });

  it("says no calibration is saved yet when there was none", async () => {
    await toStep3({ overrides: { brightness: 19 } });
    await find(wrapper, "check-stop").trigger("click");
    await flushPromises();
    await settle();
    expect(wrapper.text()).toContain("Nothing changed; no calibration is saved yet.");
  });

  it("Stop from the summary saves nothing", async () => {
    await toSummary();
    await find(wrapper, "check-stop").trigger("click");
    await flushPromises();
    await settle();
    expect(wrapper.text()).toContain("Nothing changed");
    expect(patches()).toHaveLength(0);
  });

  it("Try again restarts at the highest level with nothing carried over", async () => {
    await toStep3();
    await find(wrapper, "check-stop").trigger("click");
    await flushPromises();
    await settle();
    await click(wrapper, "check-retry");
    agent({ preflight: CLEAN });
    agentStep("detect", DETECT);
    await settle();
    await clickPrimary(wrapper);
    expect(status(wrapper)).toContain("Step 2 of 4 · Highest level");
    expect(find(wrapper, "level-pair").exists()).toBe(false);
  });
});

describe("other dialog states", () => {
  it("shows the asleep state with Turn on now", async () => {
    wrapper = mountDialog({ asleep: true });
    await flushPromises();
    expect(status(wrapper)).toContain("Kitchen is asleep");
    expect(primary(wrapper).text()).toBe("Turn on now");
  });

  it("opens read-only when another device owns the run", async () => {
    backend.run = {
      id: "other",
      step: "read",
      status: "running",
      active: true,
      steps: {},
      log: [],
      updatedAt: new Date().toISOString(),
    };
    wrapper = mountDialog();
    await flushPromises();
    expect(find(wrapper, "check-readonly").exists()).toBe(true);
    expect(find(wrapper, "check-stop").exists()).toBe(true);
  });
});

describe("review fixes: reads, Save, copy, watching, fallback, Stop", () => {
  it("matches each read to the seq it sent: three identical reads in a row each resolve", async () => {
    await toStep2();
    const same = { level: 20, finishedAt: "2027-01-01T00:00:00Z" };
    await find(wrapper, "reading-input").setValue("60");
    await clickPrimary(wrapper);
    agentStep("read", same);
    await settle();
    expect(find(wrapper, "level-pair").text()).toBe("Panel 60 · Calvin 20");
    await clickPrimary(wrapper);
    await find(wrapper, "reading-input").setValue("40");
    await clickPrimary(wrapper);
    // The step 2 result is still stored with the old seq: it must not answer this read.
    await settle();
    expect(status(wrapper)).toContain("Reading…");
    agentStep("read", same);
    await settle();
    expect(find(wrapper, "level-pair").text()).toBe("Panel 40 · Calvin 20");
    await clickPrimary(wrapper);
    await find(wrapper, "reading-input").setValue("10");
    await clickPrimary(wrapper);
    await settle();
    expect(status(wrapper)).toContain("Reading…");
    agentStep("read", same);
    await settle();
    expect(find(wrapper, "level-pair").text()).toBe("Panel 10 · Calvin 20");
  });

  it("falls back to matching by step when an old agent reports no seq", async () => {
    await toStep2();
    await find(wrapper, "reading-input").setValue("60");
    await clickPrimary(wrapper);
    agentStep("read", { level: 20, seq: null });
    await settle();
    expect(find(wrapper, "level-pair").text()).toBe("Panel 60 · Calvin 20");
  });

  it("waits for the save to land: Not saved yet until it succeeds, then Saved", async () => {
    let finish;
    const savePatch = vi.fn(() => new Promise(resolve => (finish = resolve)));
    await toSummary({ savePatch });
    expect(find(wrapper, "check-summary").text()).toContain("Not saved yet");
    await clickPrimary(wrapper);
    expect(savePatch).toHaveBeenCalledTimes(1);
    expect(status(wrapper)).not.toContain("Saved");
    expect(find(wrapper, "check-summary").text()).toContain("Not saved yet");
    finish(true);
    await flushPromises();
    expect(status(wrapper)).toContain("Saved");
    expect(primary(wrapper).text()).toBe("Done");
  });

  it("shows a failed save in the dialog, keeps the readings and saves again on retry", async () => {
    const savePatch = vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    await toSummary({ savePatch });
    await clickPrimary(wrapper);
    expect(wrapper.text()).toContain("Couldn't save to the server");
    expect(status(wrapper)).not.toBe("Saved");
    expect(find(wrapper, "check-summary").text()).toContain("Panel 60 · Calvin 20");
    expect(primary(wrapper).text()).toBe("Save");
    await clickPrimary(wrapper);
    expect(savePatch).toHaveBeenCalledTimes(2);
    expect(savePatch.mock.calls[1][0]).toEqual(savePatch.mock.calls[0][0]);
    expect(status(wrapper)).toContain("Saved");
    expect(wrapper.text()).not.toContain("Couldn't save to the server");
  });

  it("says a reading looks behind when a lower level reads higher, and offers Read it again", async () => {
    await toStep3();
    await find(wrapper, "reading-input").setValue("40");
    await clickPrimary(wrapper);
    agentStep("read", { level: 25 });
    await settle();
    expect(find(wrapper, "level-behind").text()).toContain("looks behind");
    expect(primary(wrapper).text()).toBe("Read it again");
    await clickPrimary(wrapper);
    expect(find(wrapper, "level-pair").exists()).toBe(false);
    expect(find(wrapper, "reading-input").element.value).toBe("40");
  });

  it("leaves read-only and shows an ended state when the watched run ends", async () => {
    backend.run = {
      id: "other",
      step: "read",
      status: "running",
      active: true,
      steps: {},
      log: [],
      updatedAt: new Date().toISOString(),
    };
    wrapper = mountDialog();
    await flushPromises();
    expect(find(wrapper, "check-readonly").exists()).toBe(true);
    backend.run = { ...backend.run, status: "done", active: false };
    await settle();
    expect(find(wrapper, "check-readonly").exists()).toBe(false);
    expect(find(wrapper, "check-end").text()).toContain("other device");
    expect(primary(wrapper).text()).toBe("Done");
  });

  it("leaves read-only when the watched run comes back empty or expired", async () => {
    backend.run = {
      id: "other",
      step: "read",
      status: "running",
      active: true,
      steps: {},
      log: [],
      updatedAt: new Date().toISOString(),
    };
    wrapper = mountDialog();
    await flushPromises();
    expect(find(wrapper, "check-readonly").exists()).toBe(true);
    backend.run = null;
    await settle();
    expect(find(wrapper, "check-readonly").exists()).toBe(false);
    expect(find(wrapper, "check-end").text()).toContain("other device");
  });

  it("recognises its own run after a reload and moves it instead of opening read-only", async () => {
    backend.run = {
      id: "mine",
      step: "read",
      status: "running",
      active: true,
      steps: {},
      seq: 4,
      log: [],
      updatedAt: new Date().toISOString(),
    };
    window.sessionStorage.setItem("calvin_display_check_own_runs", JSON.stringify(["mine"]));
    wrapper = mountDialog();
    await flushPromises();
    expect(find(wrapper, "check-readonly").exists()).toBe(false);
    expect(posts("step").at(-1)?.[1]).toEqual({ step: "detect" });
  });

  it("keeps the fallback's low writes under the run ceiling and the start level", async () => {
    await toStep2();
    backend.run = { ...backend.run, ceiling: 3, start: { level: 2, known: true } };
    await readLevel(60, 30);
    await clickPrimary(wrapper);
    await readLevel(40, 30);
    await clickPrimary(wrapper);
    await readLevel(40, 30);
    await click(wrapper, "use-own-levels");
    await clickPrimary(wrapper);
    expect(lastStep()).toEqual({ step: "conversion", value: 2 });
    backend.run = { ...backend.run, ceiling: 0 };
    agentStep("conversion", { value: 2, level: 2 });
    await settle();
    await find(wrapper, "reading-input").setValue("12");
    await clickPrimary(wrapper);
    expect(lastStep()).toEqual({ step: "conversion", value: 1 });
  });

  it("keeps saying Stopping when Stop is pressed while a step is being sent", async () => {
    await toStep2();
    backend.stopKeepsActive = true;
    await find(wrapper, "reading-input").setValue("60");
    primary(wrapper).trigger("click");
    await find(wrapper, "check-stop").trigger("pointerdown");
    await flushPromises();
    expect(status(wrapper)).toContain("Stopping, bringing brightness down");
    expect(find(wrapper, "check-stop").text()).toBe("Stopping…");
  });
});
