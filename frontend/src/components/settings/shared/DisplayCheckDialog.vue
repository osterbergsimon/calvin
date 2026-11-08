<template>
  <Dialog
    :model-value="modelValue"
    :title="`Check the ${screenName} display`"
    :size="phone ? 'full' : 'md'"
    :bleed="phone"
    wide
    close-label="Close the display check"
    @update:model-value="onDialogModel"
  >
    <template #subtitle>
      Look at {{ screenName }} while you answer. You can do this from your phone.
    </template>

    <div class="dcheck__sheet" :class="{ 'dcheck__sheet--full': phone }">
      <ol v-if="!readOnlyView" class="dcheck__strip" aria-label="Steps">
        <li
          v-for="item in STEPS"
          :key="item.n"
          class="dcheck__strip-item"
          :class="{
            'dcheck__strip-item--done': stepNumber > item.n || pastReads,
            'dcheck__strip-item--now': stepNumber === item.n && !pastReads,
          }"
          :aria-current="stepNumber === item.n && !pastReads ? 'step' : undefined"
        >
          <span class="dcheck__strip-long">{{ item.n }} · {{ item.label }}</span>
          <span class="dcheck__strip-short" aria-hidden="true">{{ item.n }} {{ item.short }}</span>
        </li>
      </ol>

      <div class="dcheck__body" data-test="check-step-body">
        <!-- Read-only: another device owns the run -->
        <template v-if="view === 'readonly'">
          <p class="dcheck__lead" data-test="check-readonly">
            A check is running from another device
          </p>
          <p class="dcheck__sub">
            Step: {{ stepLabel(check.run.value?.step)
            }}<template v-if="check.run.value?.level != null">
              · level {{ check.run.value.level }}
            </template>
          </p>
          <ul v-if="logLines.length" class="dcheck__log">
            <li v-for="(line, i) in logLines" :key="i">{{ line }}</li>
          </ul>
        </template>

        <!-- The screen is asleep -->
        <template v-else-if="view === 'asleep'">
          <InlineNote tone="warn" data-test="check-asleep">
            {{ screenName }} is asleep. Turn it on now to check it.
          </InlineNote>
        </template>

        <!-- The power was already bad before anything changed -->
        <template v-else-if="view === 'idle'">
          <p class="dcheck__lead">{{ screenName }} has power trouble already</p>
          <p class="dcheck__sub">
            Its power supply reported under-voltage while the screen was idle, before Calvin changed
            anything. A brightness test would only make it worse, so Calvin didn't start.
          </p>
          <p class="dcheck__sub">{{ FIX_LINE }}</p>
        </template>

        <!-- An end state: says exactly what was kept -->
        <template v-else-if="view === 'end'">
          <InlineNote :tone="ending.tone" data-test="check-end">{{ ending.text }}</InlineNote>
          <p v-if="ending.hint" class="dcheck__sub">{{ ending.hint }}</p>
          <p v-if="ending.kept" class="dcheck__sub" data-test="check-kept">{{ keptLine }}</p>
        </template>

        <!-- Summary -->
        <template v-else-if="view === 'summary'">
          <div data-test="check-summary">
            <p class="dcheck__lead">{{ saved ? "Saved" : "Not saved yet" }}</p>
            <ul class="dcheck__summary">
              <li v-for="(row, index) in summaryRows" :key="row.label" class="dcheck__summary-row">
                <span class="dcheck__summary-label">{{ row.label }}</span>
                <span class="dcheck__pair">Panel {{ row.typed }} · Calvin {{ row.ddc }}</span>
                <Button
                  v-if="!saved"
                  variant="link"
                  :data-test="`remove-reading-${index}`"
                  :aria-label="`Remove the ${row.label.toLowerCase()} reading and take it again`"
                  @click="removeReading(index)"
                >
                  Remove
                </Button>
              </li>
            </ul>
            <p v-if="!saved" class="dcheck__sub">
              Saving sets the limit to Calvin {{ summaryRows[0].ddc }}, the everyday brightness to
              {{ summaryRows[1].ddc }} and the lowest to {{ summaryRows[2].ddc }}, and replaces the
              earlier readings.
            </p>
            <p v-else class="dcheck__sub">
              Brightness can go from Panel {{ summaryRows[2].typed }} to Panel
              {{ summaryRows[0].typed }}.
            </p>
            <InlineNote v-if="saveError" tone="err" role="alert" data-test="save-error">
              {{ saveError }}
            </InlineNote>
            <p v-if="usedFallback" class="dcheck__sub">
              The Calvin values are <strong>approximate</strong>: they come from a line through two
              low readings, and the highest is rounded down.
            </p>
            <p v-else-if="sameScale" class="dcheck__sub">
              Calvin and the panel use the same scale.
            </p>
            <p class="dcheck__sub" data-test="never-above">
              Calvin never goes above {{ summaryRows[0].ddc }}.
            </p>
            <label v-if="!saved" class="dcheck__wake">
              <input v-model="useOnWake" type="checkbox" data-test="use-on-wake" />
              Use these levels when the screen wakes and starts
            </label>
            <p v-else class="dcheck__sub" data-test="bringing-back">
              Calvin is bringing the screen back to your everyday level.
            </p>
            <p class="dcheck__sub">{{ STARTUP_LINE }}</p>
          </div>
        </template>

        <!-- Fallback: the panel doesn't report its own buttons -->
        <template v-else-if="view === 'fallback'">
          <p class="dcheck__lead">This panel doesn't report its own buttons</p>
          <p v-if="fbPhase === 'explain'" class="dcheck__sub">
            Its brightness reading didn't change when you changed it with the buttons. Calvin can
            still match the panel's menu: it will set the brightness low, twice, and ask what the
            menu shows each time. It won't go above {{ fbLevels[0] }}.
          </p>
          <p v-else-if="fbPhase === 'setting'" class="dcheck__sub">
            Watch the panel. Calvin is setting it to Calvin {{ fbLevels[fbIndex] }}.
          </p>
          <p v-else-if="fbPhase === 'level'" class="dcheck__sub">
            Type the Brightness the panel's own menu showed at the {{ LEVELS[fbLevelIndex].short }}
            level.
          </p>
          <p v-else class="dcheck__sub">Type the Brightness the panel's own menu shows now.</p>
        </template>

        <!-- Step 1 -->
        <template v-else-if="step === 1">
          <p class="dcheck__lead">Find the display</p>
          <p v-if="state === 'preflight'" class="dcheck__sub">
            Calvin watches the power supply for {{ PREFLIGHT_S }} s while the screen stays as it is.
          </p>
          <template v-else-if="detected">
            <InlineNote tone="ok" data-test="check-found">Found {{ foundText }}.</InlineNote>
            <p class="dcheck__sub">
              Next you'll set the panel's brightness with its own buttons, three times, and Calvin
              will read what it reports. Calvin won't change the brightness.
            </p>
          </template>
        </template>

        <!-- A power drop in a level: only what to do now (calvin-tzzx) -->
        <template v-else-if="state === 'fault'">
          <p class="dcheck__lead" data-test="drop-lead">
            The power dropped. Calvin dimmed the screen to keep it safe.
          </p>
          <p class="dcheck__sub" data-test="drop-sub">
            Use the panel's buttons to set Brightness one step below where it cut out. Then type the
            number its menu shows now.
          </p>
          <p v-if="tooHigh" class="dcheck__sub dcheck__sub--warn" data-test="level-too-high">
            {{ tooHigh }}
          </p>
        </template>

        <!-- Steps 2-4: the panel's own buttons, Calvin reads -->
        <template v-else>
          <p class="dcheck__lead">{{ LEVELS[step - 2].heading }}</p>
          <p class="dcheck__sub">{{ LEVELS[step - 2].body }}</p>
          <p v-if="step === 2" class="dcheck__sub" data-test="startup-line">{{ STARTUP_LINE }}</p>
          <template v-if="state === 'read-done'">
            <p class="dcheck__pair dcheck__pair--big" data-test="level-pair">
              Panel {{ thisLevel.typed }} · Calvin {{ thisLevel.ddc }}
            </p>
            <InlineNote v-if="behindNote" tone="warn" data-test="level-behind">
              {{ behindNote }}
            </InlineNote>
          </template>
          <template v-else-if="state === 'ask'">
            <p class="dcheck__sub">Type the Brightness the panel's own menu shows.</p>
            <p v-if="tooHigh" class="dcheck__sub dcheck__sub--warn" data-test="level-too-high">
              {{ tooHigh }}
            </p>
          </template>
        </template>

        <InlineNote
          v-if="inFlight && view !== 'readonly' && check.silence.value === 'waiting'"
          data-test="check-silence"
        >
          Waiting for {{ screenName }}…
        </InlineNote>
        <InlineNote
          v-else-if="inFlight && check.silence.value === 'silent'"
          tone="warn"
          data-test="check-silence"
        >
          {{ screenName }} isn't answering. Is it on and online?
          <template #action>
            <Button variant="link" data-test="check-silence-retry" @click="retry">Try again</Button>
          </template>
        </InlineNote>
        <InlineNote v-if="check.error.value" tone="err" role="alert">
          {{ check.error.value }}
        </InlineNote>
      </div>

      <!-- The status line and the one primary action, always together -->
      <div class="dcheck__bar" data-test="check-bar">
        <p class="dcheck__status" data-test="check-status" role="status">
          <span v-if="ui.busy" class="dcheck__spinner" aria-hidden="true" />
          {{ ui.status }}
        </p>
        <div
          v-if="ui.field || ui.primary"
          class="dcheck__primary-row"
          :class="{ 'dcheck__primary-row--field': ui.field }"
        >
          <input
            v-if="ui.field"
            ref="readingInput"
            v-model="readingText"
            class="dcheck__input dcheck__input--reading"
            data-test="reading-input"
            type="text"
            inputmode="numeric"
            pattern="[0-9]*"
            aria-label="Brightness shown in the panel's own menu"
            @keyup.enter="ui.primary?.run()"
          />
          <a
            v-if="ui.primary?.href"
            class="dcheck__fix dcheck__fix--primary"
            data-primary="true"
            :data-test="ui.primary.test || 'check-primary'"
            :href="ui.primary.href"
            target="_blank"
            rel="noopener"
          >
            {{ ui.primary.label }}
          </a>
          <Button
            v-else-if="ui.primary"
            variant="primary"
            data-primary="true"
            :data-test="ui.primary.test || 'check-primary'"
            :disabled="ui.primary.disabled"
            :loading="ui.primary.loading"
            @click="ui.primary.run"
          >
            {{ ui.primary.label }}
          </Button>
        </div>
        <div v-if="ui.secondary?.length" class="dcheck__secondary">
          <template v-for="item in ui.secondary" :key="item.test">
            <a
              v-if="item.href"
              class="dcheck__fix"
              :data-test="item.test"
              :href="item.href"
              target="_blank"
              rel="noopener"
            >
              {{ item.label }}
            </a>
            <Button
              v-else
              :variant="item.plain ? 'secondary' : 'link'"
              :data-test="item.test"
              @click="item.run"
            >
              {{ item.label }}
            </Button>
          </template>
        </div>
      </div>
    </div>

    <template #actions>
      <div class="dcheck__actions" :class="{ 'dcheck__actions--full': phone }">
        <span v-if="check.isActive.value" class="dcheck__footer-note" role="status">
          {{ screenName }} is checking every 2 s while this is open.
        </span>
        <Button
          v-if="check.isActive.value"
          class="dcheck__stop"
          :class="{ 'dcheck__stop--pressed': stopRequested }"
          :aria-pressed="stopRequested ? 'true' : 'false'"
          data-test="check-stop"
          @pointerdown="requestStop"
          @click="onStopClick"
        >
          {{ stopRequested ? "Stopping…" : "Stop the check" }}
        </Button>
      </div>
    </template>
  </Dialog>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, ref, toRef, watch } from "vue";
import Button from "@/components/ui/Button.vue";
import Dialog from "@/components/ui/Dialog.vue";
import InlineNote from "@/components/ui/InlineNote.vue";
import { useDisplayCheck } from "@/composables/useDisplayCheck";
import { fitConversion, menuToDdc, menuToDdcDown } from "@/utils/brightness";

// The display check dialog (calvin-29ws; calibration v3, calvin-idts, calvin-qkm8,
// calvin-mvtv: docs/design/2026-11-04-brightness-ramp-ui.md §3). The person sets
// the panel with its own buttons and Calvin reads what it reports, three times:
// the highest level, an everyday level and the lowest. Nothing is saved until
// Save, and Calvin never brightens the panel during the check.
const props = defineProps({
  modelValue: { type: Boolean, default: false },
  kioskId: { type: String, required: true },
  screenName: { type: String, default: "this screen" },
  asleep: { type: Boolean, default: false },
  // This browser is the screen being checked (the touch panel itself).
  onPanel: { type: Boolean, default: false },
  overrides: { type: Object, default: () => ({}) },
  // Saves the calibration and says whether it landed: async (patch) => boolean.
  // Without it the dialog emits "patch" and trusts the parent.
  savePatch: { type: Function, default: null },
});
const emit = defineEmits(["update:modelValue", "patch", "writes-ok", "turn-on"]);

const HELP_URL = "https://github.com/osterbergsimon/calvin/blob/main/docs/setup/KIOSK_POWER.md";
const PREFLIGHT_S = 10;
const FIX_LINE =
  "The usual fix is to keep the screen's USB data link from also powering it (a USB power blocker on the data leg), or to use a stronger power supply.";
const STARTUP_LINE =
  "Calvin starts the screen at the minimum and brings it up to this after it turns on.";
// The fallback only writes low levels: 5, then 1, held under the run's ceiling
// and start level so it can never be refused as "above the ceiling".
const FALLBACK_BASE = [5, 1];

const STEPS = [
  { n: 1, label: "Find the display", short: "Display" },
  { n: 2, label: "Highest level", short: "Highest" },
  { n: 3, label: "Everyday level", short: "Everyday" },
  { n: 4, label: "Lowest level", short: "Lowest" },
];
const LEVELS = [
  {
    heading: "Highest level",
    short: "highest",
    body: "Use the panel's own buttons to set Brightness to the highest level that works: its max, or the highest without flicker or the screen cutting out.",
  },
  {
    heading: "Everyday level",
    short: "everyday",
    body: "Now set Brightness to a comfortable level for everyday use. It can be the same as the highest.",
  },
  {
    heading: "Lowest level",
    short: "lowest",
    body: "Now set Brightness to the lowest level you'd use, the lowest that is still readable.",
  },
];

const check = useDisplayCheck(toRef(props, "kioskId"));

const step = ref(1);
const view = ref("step");
const ending = ref(null);
const foundText = ref("");
const detected = ref(false);
// One entry per level read: { typed, ddc, lastWrite }.
const levels = ref([null, null, null]);
const readingText = ref("");
const readingInput = ref(null);
const pendingTyped = ref(null);
const faulted = ref(false);
const stopRequested = ref(false);
const saved = ref(false);
const usedFallback = ref(false);
const fbPhase = ref("explain");
const fbIndex = ref(0);
const fbReadings = ref([]);
const fbResult = ref(null);
// The menu numbers the fallback converts, and the levels the agent said it wrote.
const fbTyped = ref([null, null, null]);
const fbWritten = ref([null, null]);
const fbLevelIndex = ref(0);
const behindTries = ref([0, 0, 0]);
const phone = ref(false);
const nowMs = ref(Date.now());
// When this browser first saw the agent report for the current run. The 10 s
// power watch starts here, not at Start: the agent only picks the job up on its
// next config poll (calvin-elko). Arrival time, so a skewed screen clock can't matter.
const firstReportMs = ref(null);
const handled = new Set();
let currentRunId = null;
let opened = false;
let clock = null;

const fbLevels = computed(() => {
  const caps = [run.value?.ceiling, run.value?.start?.level].filter(n => Number.isFinite(n));
  return FALLBACK_BASE.map(base => Math.max(1, Math.min(base, ...caps)));
});
const saving = ref(false);
const saveError = ref("");
const stepNumber = computed(() => step.value);
const pastReads = computed(() => ["summary", "fallback"].includes(view.value));
const readOnlyView = computed(() => view.value === "readonly");
const settings = computed(() => props.overrides || {});
const run = computed(() => check.run.value);
const preflightClean = computed(() => run.value?.preflight?.status === "clean");
// The incident the person has dealt with by pressing Read it: the run keeps its
// fault object, so the dialog must not show the same drop again.
const ackedFault = ref(null);
const faultKey = r => `${r.id}|${r.fault?.at ?? ""}|${r.fault?.level ?? ""}`;
const fault = computed(() => {
  const f = run.value?.fault;
  if (!f || (run.value.id !== undefined && faultKey(run.value) === ackedFault.value)) return null;
  return currentRunId && run.value.id !== currentRunId ? null : f;
});
const hasCalibration = computed(
  () =>
    (settings.value.brightnessConversion ?? []).length > 0 ||
    settings.value.brightnessLimit != null ||
    settings.value.brightnessFloor != null
);
const keptLine = computed(() =>
  hasCalibration.value
    ? "Nothing changed; the previous calibration is still in place."
    : "Nothing changed; no calibration is saved yet."
);
const logLines = computed(() =>
  (run.value?.log ?? []).map(entry => `${entry.level ?? ""} · ${entry.note ?? ""}`.trim())
);
const stepLabel = name =>
  ({
    detect: "Find the display",
    read: "Reading the panel",
    conversion: "Low level",
  })[name] || "Display check";

// --- the level being read ------------------------------------------------------
const levelIndex = computed(() => step.value - 2);
const thisLevel = computed(() => levels.value[levelIndex.value] ?? null);
const typedNumber = computed(() => {
  const text = readingText.value.trim();
  if (!/^\d{1,3}$/.test(text)) return null;
  const n = Number(text);
  return n <= 100 ? n : null;
});
// A level can't be higher than the one before it, nor lower than the one after
// it (a retaken level sits between its neighbours).
const LEVEL_NAMES = ["highest", "everyday", "lowest"];
const previousLevel = computed(() =>
  levelIndex.value > 0 ? levels.value[levelIndex.value - 1] : null
);
const nextLevelRead = computed(() => levels.value[levelIndex.value + 1] ?? null);
const tooHigh = computed(() => {
  if (typedNumber.value === null) return "";
  const before = previousLevel.value;
  if (before && typedNumber.value > before.typed) {
    return `The ${LEVELS[levelIndex.value].short} level can't be higher than the ${LEVEL_NAMES[levelIndex.value - 1]}, ${before.typed}.`;
  }
  const after = nextLevelRead.value;
  if (after && typedNumber.value < after.typed) {
    return `The ${LEVELS[levelIndex.value].short} level can't be lower than the ${LEVEL_NAMES[levelIndex.value + 1]}, ${after.typed}.`;
  }
  return "";
});
// Reads can lag the panel's menu by a step: a lower level must not read higher,
// nor a higher level lower, than its neighbours.
const behindNote = computed(() => {
  const now = thisLevel.value;
  if (!now) return "";
  const before = previousLevel.value;
  const after = nextLevelRead.value;
  if (!before && !after) return "";
  if (!Number.isFinite(now.ddc)) {
    return "That reading doesn't look right: the panel gave no usable number.";
  }
  if (before && Number.isFinite(before.ddc)) {
    // Higher than the level before, or the same while the menu number went down.
    const behind = now.ddc > before.ddc || (now.ddc === before.ddc && now.typed < before.typed);
    if (behind) {
      return `That reading looks behind: the panel reported Calvin ${now.ddc}, not below the ${LEVEL_NAMES[levelIndex.value - 1]} level's ${before.ddc}. It may not have caught up with the menu yet.`;
    }
  }
  if (after && Number.isFinite(after.ddc)) {
    const ahead = now.ddc < after.ddc || (now.ddc === after.ddc && now.typed > after.typed);
    if (ahead) {
      return `That reading looks out of order: the panel reported Calvin ${now.ddc}, not above the ${LEVEL_NAMES[levelIndex.value + 1]} level's ${after.ddc}. It may not have caught up with the menu yet.`;
    }
  }
  return "";
});
// Still out of order after one more read: offer Calvin's own low levels instead.
const offerOwnLevels = computed(
  () => Boolean(behindNote.value) && behindTries.value[levelIndex.value] >= 1
);
const moreToRead = computed(() => levels.value.some((l, i) => i > levelIndex.value && !l));
const readingValid = computed(() => typedNumber.value !== null && !tooHigh.value);
const fbValid = computed(() => typedNumber.value !== null);

// --- the session -------------------------------------------------------------
// One run lasts the whole check. The first step starts it; every later step
// moves the same run with `changeStep`. A step's result arrives in run.steps
// while the run stays active, and Stop or Done is what ends it.

const stepStamp = result =>
  result ? `${result.status}|${result.value ?? ""}|${result.finishedAt ?? ""}` : "";
let awaiting = null;
const inFlightStep = ref(null);
const inFlight = computed(() => inFlightStep.value !== null);

function expectResult(name, value, seq = null) {
  awaiting = {
    step: name,
    value: value ?? null,
    seq: Number.isFinite(seq) ? seq : null,
    baseline: stepStamp(run.value?.steps?.[name]),
  };
  inFlightStep.value = name;
}
function clearAwaiting() {
  awaiting = null;
  inFlightStep.value = null;
}

// Ask the agent for a step: start the session, or move the running one. When the
// agent ended the last session (a fault ends it), this starts a new one.
async function go(name, value) {
  faulted.value = false;
  const current = run.value;
  let sentSeq = null;
  if (current?.active && check.ownsRun.value) {
    const result = await check.changeStep(name, value);
    if (result.gone) {
      end("gone");
      return false;
    }
    if (!result.ok) return false;
    sentSeq = result.run?.seq ?? null;
  } else {
    if (!check.isActive.value) stopRequested.value = false;
    const started = await check.start(name, value === undefined ? {} : { value });
    if (!started) {
      if (check.readOnly.value) view.value = "readonly";
      return false;
    }
    currentRunId = started.id;
    firstReportMs.value = null;
    noteReport();
    sentSeq = started.seq ?? null;
  }
  // Stop stays pressed until the agent reports the run finished.
  expectResult(name, value, sentSeq);
  return true;
}

async function startDetect() {
  step.value = 1;
  view.value = "step";
  detected.value = false;
  await go("detect");
}
function nextFromFound() {
  step.value = 2;
  readingText.value = "";
  nextTick(() => readingInput.value?.focus());
}
// After a drop on the highest step the next reading IS the highest reading, and
// the check goes straight on to the Everyday level.
let afterDrop = false;
async function readIt() {
  if (!readingValid.value) return;
  const fromDrop = state.value === "fault";
  pendingTyped.value = typedNumber.value;
  if (fromDrop) {
    if (run.value?.fault) ackedFault.value = faultKey(run.value);
    faulted.value = false;
    afterDrop = step.value === 2;
  }
  const ok = await go("read");
  if (!ok) afterDrop = false;
}
// Back leaves this step and retakes the one before it; both readings are dropped.
// A drop the person has moved past must not come back on another step.
function dismissFault() {
  faulted.value = false;
  if (run.value?.fault) ackedFault.value = faultKey(run.value);
}
function back() {
  afterDrop = false;
  dismissFault();
  behindTries.value = [0, 0, 0];
  const index = step.value - 2;
  levels.value[index] = null;
  if (index === 0) {
    step.value = 1;
    readingText.value = "";
    return;
  }
  const previous = levels.value[index - 1];
  levels.value[index - 1] = null;
  step.value -= 1;
  readingText.value = previous?.typed == null ? "" : String(previous.typed);
  nextTick(() => readingInput.value?.focus());
}
// Leaving a fallback summary starts over: its readings are dropped, and so are
// the reads that were rejected as out of order and sent the check there.
function resetFallback() {
  usedFallback.value = false;
  fbResult.value = null;
  fbReadings.value = [];
  fbTyped.value = [null, null, null];
  fbWritten.value = [null, null];
  fbPhase.value = "explain";
  fbIndex.value = 0;
  behindTries.value = [0, 0, 0];
  for (const i of [1, 2]) {
    const here = levels.value[i];
    const above = levels.value[i - 1];
    if (!here) continue;
    const bad =
      !Number.isFinite(here.ddc) ||
      (above && (here.ddc > above.ddc || (here.ddc === above.ddc && here.typed < above.typed)));
    if (bad) levels.value[i] = null;
  }
}
// Remove on the summary: take that one step again, keep the other readings.
function removeReading(index) {
  if (saved.value) return;
  afterDrop = false;
  dismissFault();
  // Reset first: it drops rejected reads by comparing neighbours, which the
  // removed level must still be part of.
  if (usedFallback.value) resetFallback();
  levels.value[index] = null;
  behindTries.value[index] = 0;
  step.value = levels.value.findIndex(l => !l) + 2;
  view.value = "step";
  readingText.value = "";
  nextTick(() => readingInput.value?.focus());
}
async function sameAsHighest() {
  readingText.value = String(levels.value[0].typed);
  await readIt();
}
function readAgain() {
  const typed = thisLevel.value?.typed;
  if (behindNote.value) behindTries.value[levelIndex.value] += 1;
  levels.value[levelIndex.value] = null;
  readingText.value = typed == null ? "" : String(typed);
}
function nextLevel() {
  readingText.value = "";
  // The next level not yet read; none left means all three are in.
  const next = levels.value.findIndex((l, i) => i > levelIndex.value && !l);
  if (next !== -1) {
    step.value = next + 2;
    nextTick(() => readingInput.value?.focus());
    return;
  }
  finishReads();
}

// The DDC value didn't follow the buttons: every read is equal, or a read equals
// the agent's last write while the typed number differs from it.
function panelIgnoresButtons() {
  const done = levels.value;
  const typedDiffer = new Set(done.map(l => l.typed)).size > 1;
  const allEqual = new Set(done.map(l => l.ddc)).size === 1;
  if (allEqual && typedDiffer) return true;
  return done.some(l => l.lastWrite != null && l.ddc === l.lastWrite && l.typed !== l.ddc);
}
function startFallback() {
  // Too low to test two levels safely: say so plainly and change nothing.
  if (Math.min(...fbLevels.value) <= 1 && fbLevels.value[0] <= fbLevels.value[1]) {
    end("no-fallback");
    return;
  }
  view.value = "fallback";
  fbPhase.value = "explain";
  fbIndex.value = 0;
  fbReadings.value = [];
  fbWritten.value = [null, null];
  fbTyped.value = levels.value.map(l => l?.typed ?? null);
  usedFallback.value = true;
}
function finishReads() {
  if (panelIgnoresButtons()) {
    startFallback();
    return;
  }
  usedFallback.value = false;
  view.value = "summary";
}
async function askLow(index) {
  fbIndex.value = index;
  fbPhase.value = "setting";
  readingText.value = "";
  const ok = await go("conversion", fbLevels.value[index]);
  if (!ok) fbPhase.value = index === 0 ? "explain" : "ask";
}
async function saveLow() {
  if (!fbValid.value) return;
  // The pair uses the level the agent said it wrote, not the one asked for.
  const wrote = fbWritten.value[fbIndex.value] ?? fbLevels.value[fbIndex.value];
  fbReadings.value = [...fbReadings.value, { ddc: wrote, menu: typedNumber.value }];
  if (fbIndex.value === 0) return askLow(1);
  askMissingLevel();
}
// A fallback started midway has not asked for every level's menu number yet.
function askMissingLevel() {
  const missing = fbTyped.value.findIndex(n => n === null);
  if (missing === -1) return convertFromFallback();
  fbLevelIndex.value = missing;
  fbPhase.value = "level";
  readingText.value = "";
  nextTick(() => readingInput.value?.focus());
}
function saveLevel() {
  if (!fbValid.value) return;
  fbTyped.value = fbTyped.value.map((n, i) => (i === fbLevelIndex.value ? typedNumber.value : n));
  askMissingLevel();
}
function convertFromFallback() {
  const points = fbReadings.value;
  if (!fitConversion(points)) {
    end("same-low");
    return;
  }
  const [high, mid, low] = fbTyped.value;
  const maxDdc = menuToDdcDown(high, points);
  if (maxDdc === null) {
    end("same-low");
    return;
  }
  const clamp = n => Math.max(0, Math.min(100, n));
  const everyday = Math.min(maxDdc, clamp(menuToDdc(mid, points)));
  const lowest = Math.min(everyday, clamp(menuToDdc(low, points)));
  fbResult.value = [
    { typed: high, ddc: maxDdc },
    { typed: mid, ddc: everyday },
    { typed: low, ddc: lowest },
  ];
  view.value = "summary";
}

const summaryRows = computed(() => {
  const rows = usedFallback.value ? fbResult.value : levels.value;
  const names = ["Highest", "Everyday", "Lowest"];
  return (rows ?? [{}, {}, {}]).map((r, i) => ({ label: names[i], typed: r?.typed, ddc: r?.ddc }));
});
const sameScale = computed(
  () =>
    !usedFallback.value &&
    summaryRows.value.every(row => row.typed != null && row.typed === row.ddc)
);
// Save also turns the wake/start ramp on, unless the person unticks it.
const useOnWake = ref(true);
// The pairs Save stores: this run's readings, replacing the old ones.
const savedPairs = computed(() => {
  if (usedFallback.value) {
    return [...fbReadings.value].sort((a, b) => a.ddc - b.ddc);
  }
  const byDdc = new Map();
  for (const row of summaryRows.value) if (!byDdc.has(row.ddc)) byDdc.set(row.ddc, row.typed);
  return [...byDdc.entries()].map(([ddc, menu]) => ({ ddc, menu })).sort((a, b) => a.ddc - b.ddc);
});

// One PATCH: nothing from an unfinished run is ever saved.
async function saveAll() {
  if (saving.value) return;
  const [highest, everyday, lowest] = summaryRows.value;
  const patch = {
    brightnessConversion: savedPairs.value,
    brightnessLimit: highest.ddc,
    brightness: everyday.ddc,
    brightnessFloor: lowest.ddc,
  };
  if (useOnWake.value) patch.brightnessRampEnabled = true;
  saving.value = true;
  saveError.value = "";
  let landed = true;
  try {
    if (props.savePatch) landed = (await props.savePatch(patch)) !== false;
    else emit("patch", patch);
  } catch {
    landed = false;
  } finally {
    saving.value = false;
  }
  if (!landed) {
    saveError.value = "Couldn't save to the server. Check the connection and try again.";
    return;
  }
  emit("writes-ok", { rampEnabled: useOnWake.value });
  saved.value = true;
}

// --- stop --------------------------------------------------------------------
// Stop answers at once (pressed on pointerdown) and keeps saying so until the
// agent reports the run finished. Taps repeat safely.
function requestStop() {
  stopRequested.value = true;
  return check.stop({ saved: saved.value });
}
function onStopClick(event) {
  // A pointer press already asked; a keyboard click (detail 0) asks here.
  if (!event || event.detail === 0) requestStop();
}

watch(
  () => check.isActive.value,
  active => {
    if (!active) stopRequested.value = false;
  }
);

// --- end states -------------------------------------------------------------

function end(kind, detail = "") {
  const name = props.screenName;
  const texts = {
    "no-ddc": {
      tone: "err",
      status: "Check ended · no brightness control",
      closeFirst: true,
      text: `Not available: ${name}'s screen doesn't answer brightness commands (DDC/CI).`,
      hint: "Often the adapter or cable doesn't carry DDC, or DDC/CI is off in the panel's own menu.",
    },
    "same-low": {
      tone: "warn",
      status: "Check ended · the panel showed the same Brightness",
      kept: true,
      text: "The panel showed the same Brightness at both low levels, so Calvin can't match its menu.",
    },
    "no-fallback": {
      tone: "warn",
      status: "Check ended · too low to test",
      kept: true,
      text: "This screen is already at its lowest safe level, so Calvin can't test two low levels to match the panel's menu.",
    },
    "old-agent": {
      tone: "warn",
      status: "Check not started · update this screen first",
      noRetry: true,
      text: "Update this screen first: Settings > update.",
      hint: `${name} is running an older version of the display agent that can't do this check.`,
    },
    timeout: {
      tone: "warn",
      status: "Check ended · timed out",
      kept: true,
      text: "The check timed out.",
    },
    interrupted: {
      tone: "warn",
      status: `Check ended · ${name} restarted`,
      kept: true,
      text: `${name} restarted. That's the limit at work. If it comes back, check its Display check line for the result.`,
    },
    error: {
      tone: "err",
      status: "Check ended",
      kept: true,
      text: detail || "The check couldn't finish.",
    },
    stopped: {
      tone: "warn",
      status: "Check stopped",
      kept: true,
      text: `The check was stopped and ${name} is going back to its brightness.`,
    },
    watched: {
      tone: "warn",
      status: "Check ended",
      text: "The check on the other device ended.",
    },
    gone: {
      tone: "warn",
      status: "Check ended",
      kept: true,
      text: "The check ended before this step could start.",
    },
  };
  ending.value = texts[kind] || texts.error;
  view.value = "end";
}

// --- reacting to the agent --------------------------------------------------

function onStepResult(name, result, asked) {
  const failed = result.status === "error";
  switch (name) {
    case "detect":
      if (failed) return end("no-ddc");
      // An agent older than the seq fix would answer repeated reads wrongly.
      if (result.seq == null) {
        check.stop();
        return end("old-agent");
      }
      foundText.value = result.detail || result.info?.model || "a display";
      detected.value = true;
      step.value = 1;
      return;
    case "read":
      if (failed) return end("error", result.detail);
      levels.value[levelIndex.value] = {
        typed: pendingTyped.value,
        ddc: result.level == null ? Number.NaN : Number(result.level),
        lastWrite: result.lastWrite ?? null,
      };
      if (afterDrop) {
        afterDrop = false;
        // A stale read must go through the same out-of-order check as any other.
        if (!behindNote.value) nextLevel();
      }
      return;
    case "conversion":
      if (failed) return end("error", result.detail);
      if (Number.isFinite(Number(result.level))) {
        fbWritten.value = fbWritten.value.map((n, i) =>
          i === fbIndex.value ? Number(result.level) : n
        );
      }
      fbPhase.value = "ask";
      readingText.value = "";
      nextTick(() => readingInput.value?.focus());
      return;
    default:
      void asked;
  }
}

// The run ended: the agent refused (asleep), gave up, restarted, or was stopped.
function onRunEnded(current) {
  if (handled.has(current.id)) return;
  handled.add(current.id);
  clearAwaiting();
  if (current.status === "asleep") {
    view.value = "asleep";
    return;
  }
  if (saved.value) return;
  if (current.reason === "power_at_idle") {
    view.value = "idle";
    return;
  }
  if (current.status === "error" && current.reason === "power_trouble") {
    if (view.value === "fallback") {
      end("error", "The power dropped while Calvin set a low level.");
      return;
    }
    faulted.value = true;
    return;
  }
  if (current.status === "timeout") return end("timeout");
  if (current.status === "interrupted") return end("interrupted");
  if (current.status === "error") {
    return current.step === "detect" ? end("no-ddc") : end("error", current.detail);
  }
  if (current.status === "stopped" && ["step", "summary", "fallback"].includes(view.value)) {
    end("stopped");
  }
}

function onRun(current) {
  if (!current || current.id !== currentRunId) return;
  if (current.preflight?.status === "fault" && view.value === "step") {
    clearAwaiting();
    view.value = "idle";
    handled.add(current.id);
    return;
  }
  // A drop in a level: the read in flight will never be answered. The person
  // is asked to set the panel again, whether or not the agent ended the run.
  if (current.fault && step.value >= 2 && faultKey(current) !== ackedFault.value) {
    clearAwaiting();
  }
  if (!current.active) return onRunEnded(current);
  if (!awaiting) return;
  const result = current.steps?.[awaiting.step];
  if (!result) return;
  // A report that carries a seq answers only the request with that seq: the same
  // step asked twice must not be satisfied by the first answer. An old agent
  // reports no seq, so those match by step and a changed result, as before.
  if (awaiting.seq !== null && result.seq != null) {
    if (result.seq !== awaiting.seq) return;
  } else if (stepStamp(result) === awaiting.baseline) return;
  if (
    awaiting.step === "conversion" &&
    awaiting.value !== null &&
    result.value !== awaiting.value
  ) {
    return;
  }
  const done = awaiting;
  clearAwaiting();
  onStepResult(done.step, result, done.value);
}

watch(() => check.run.value, onRun);

// A run another device started is only watched: when it ends, say so.
watch(
  () => check.run.value,
  current => {
    if (view.value !== "readonly" || current?.active) return;
    end("watched");
  }
);

function resetRun() {
  ending.value = null;
  foundText.value = "";
  detected.value = false;
  levels.value = [null, null, null];
  readingText.value = "";
  pendingTyped.value = null;
  faulted.value = false;
  stopRequested.value = false;
  saved.value = false;
  useOnWake.value = true;
  saving.value = false;
  saveError.value = "";
  usedFallback.value = false;
  fbPhase.value = "explain";
  fbIndex.value = 0;
  fbReadings.value = [];
  fbResult.value = null;
  fbTyped.value = [null, null, null];
  fbWritten.value = [null, null];
  behindTries.value = [0, 0, 0];
  step.value = 1;
  view.value = "step";
  clearAwaiting();
}

// How long Try again waits for the old run's agent to report it ended.
const RETRY_WAIT_MS = 20000;

function whenRunEnds() {
  return new Promise(resolve => {
    if (!check.isActive.value) return resolve();
    let timer = null;
    const finish = () => {
      clearTimeout(timer);
      stopWatch();
      resolve();
    };
    const stopWatch = watch(
      () => check.isActive.value,
      active => {
        if (!active) finish();
      }
    );
    timer = setTimeout(finish, RETRY_WAIT_MS);
  });
}

async function retry() {
  // Try again while a run is still live: end it first and wait (bounded, showing
  // the Stopping state) until the agent reports it over, or the start is refused.
  if (check.isActive.value) {
    stopRequested.value = true;
    await check.stop();
    await whenRunEnds();
    if (check.isActive.value) {
      // Still not over: starting now would be refused (or move the stopping run).
      check.error.value = "The last check is still stopping. Try again in a moment.";
      return;
    }
    stopRequested.value = false;
  }
  resetRun();
  await startDetect();
}

// --- what the dialog shows --------------------------------------------------

function noteReport() {
  const r = run.value;
  if (firstReportMs.value !== null || !r?.updatedAt) return;
  if (r.id !== currentRunId && !check.ownsRun.value) return;
  firstReportMs.value = Date.now();
}
watch(() => [run.value?.id, run.value?.updatedAt], noteReport);

const preflightLeft = computed(() =>
  Math.max(0, PREFLIGHT_S - Math.floor((nowMs.value - (firstReportMs.value ?? nowMs.value)) / 1000))
);

const state = computed(() => {
  if (stopRequested.value && check.isActive.value) return "stopping";
  if (["readonly", "asleep", "idle", "end", "summary"].includes(view.value)) return view.value;
  if (view.value === "fallback") {
    return fbPhase.value === "explain" ? "fb-explain" : `fb-${fbPhase.value}`;
  }
  if (step.value === 1) {
    if (!detected.value) {
      if (preflightClean.value) return "asking";
      return firstReportMs.value === null ? "pickup" : "preflight";
    }
    return "found";
  }
  if (inFlightStep.value === "read") return "reading";
  if (thisLevel.value) return "read-done";
  return faulted.value || fault.value ? "fault" : "ask";
});

const stepOf = () => `Step ${step.value} of 4 · ${STEPS[step.value - 1].label}`;

const ui = computed(() => {
  const name = props.screenName;
  switch (state.value) {
    case "stopping":
      return { status: "Stopping, bringing brightness down", busy: true };
    case "readonly":
      return {
        status: `A check is running from another device · ${stepLabel(run.value?.step)}`,
        busy: true,
      };
    case "asleep":
      return {
        status: `${name} is asleep`,
        primary: props.asleep
          ? { label: "Turn on now", test: "check-turn-on", run: () => emit("turn-on") }
          : { label: "Try again", test: "check-retry", run: retry },
      };
    case "idle":
      return {
        status: "Check not started · power trouble at idle",
        primary: { label: "How to fix the power", test: "fix-link", href: HELP_URL },
        secondary: [
          { label: "Check again", test: "check-again", run: retry, plain: true },
          { label: "Close", test: "check-close", run: close },
        ],
      };
    case "end": {
      const retryItem = { label: "Try again", test: "check-retry", run: retry, plain: true };
      if (ending.value.noRetry) {
        return {
          status: ending.value.status,
          primary: { label: "Done", test: "check-done", run: close },
        };
      }
      if (ending.value.closeFirst) {
        return {
          status: ending.value.status,
          primary: { label: "Close", test: "check-close", run: close },
          secondary: [retryItem],
        };
      }
      return {
        status: ending.value.status,
        primary: { label: "Done", test: "check-done", run: close },
        secondary: [retryItem],
      };
    }
    case "summary":
      if (saved.value) {
        return {
          status: "Saved",
          primary: { label: "Done", test: "check-done", run: close },
        };
      }
      return {
        status: saving.value ? "Saving…" : "Check finished · not saved yet",
        primary: {
          label: "Save",
          test: "check-save",
          run: saveAll,
          disabled: saving.value,
          loading: saving.value,
        },
        secondary: [{ label: "Try again", test: "check-retry", run: retry }],
      };
    case "fb-explain":
      return {
        status: "This panel doesn't report its own buttons",
        primary: {
          label: `Set ${fbLevels.value[0]} and ask`,
          test: "fallback-start",
          run: () => askLow(0),
        },
      };
    case "fb-setting":
      return {
        status: `Low level ${fbIndex.value + 1} of 2 · Setting Calvin ${fbLevels.value[fbIndex.value]}…`,
        busy: true,
      };
    case "fb-ask":
      return {
        status: `Low level ${fbIndex.value + 1} of 2 · Calvin ${fbLevels.value[fbIndex.value]} · type what the panel's menu shows`,
        field: true,
        primary: {
          label: "Save reading",
          test: "reading-save",
          disabled: !fbValid.value,
          run: saveLow,
        },
      };
    case "fb-level":
      return {
        status: `Type what the panel's menu showed at the ${LEVELS[fbLevelIndex.value].short} level`,
        field: true,
        primary: {
          label: "Save reading",
          test: "reading-save",
          disabled: !fbValid.value,
          run: saveLevel,
        },
      };
    case "pickup":
      return {
        status: "Waiting for the screen to pick up the check. It checks in about once a minute.",
        busy: true,
      };
    case "preflight":
      return {
        status: `Checking the power before changing anything · ${preflightLeft.value} s`,
        busy: true,
      };
    case "asking":
      return { status: `Step 1 of 4 · Asking ${name}'s screen…`, busy: true };
    case "found":
      return {
        status: "Step 1 of 4 · Found the display",
        primary: { label: "Next", test: "check-next", run: nextFromFound },
      };
    case "reading":
      return { status: `${stepOf()} · Reading…`, busy: true };
    case "read-done":
      return {
        status: `${stepOf()} · Panel ${thisLevel.value.typed} · Calvin ${thisLevel.value.ddc}`,
        primary: behindNote.value
          ? { label: "Read it again", test: "read-again", run: readAgain }
          : {
              label: moreToRead.value ? "Next" : "See the summary",
              test: "check-next",
              run: nextLevel,
            },
        secondary: [
          ...(behindNote.value
            ? offerOwnLevels.value
              ? [
                  {
                    label: "Use Calvin's own levels instead",
                    test: "use-own-levels",
                    run: startFallback,
                  },
                ]
              : []
            : [{ label: "Read it again", test: "read-again", run: readAgain }]),
          { label: "Back", test: "check-back", run: back },
        ],
      };
    default: {
      const secondary = [];
      if (step.value === 3 && state.value !== "fault") {
        secondary.push({ label: "Same as highest", test: "same-as-highest", run: sameAsHighest });
      }
      secondary.push({ label: "Back", test: "check-back", run: back });
      return {
        status: `${stepOf()} · type what the panel's menu shows`,
        field: true,
        primary: {
          label: "Read it",
          test: "read-it",
          disabled: !readingValid.value,
          run: readIt,
        },
        secondary,
      };
    }
  }
});

// --- open / close -----------------------------------------------------------

async function onOpen() {
  opened = true;
  phone.value = typeof window !== "undefined" && window.matchMedia?.("(max-width: 640px)").matches;
  resetRun();
  handled.clear();
  currentRunId = null;
  nowMs.value = Date.now();
  firstReportMs.value = null;
  clock = setInterval(() => (nowMs.value = Date.now()), 1000);
  await check.load();
  check.resume();
  if (check.readOnly.value) {
    view.value = "readonly";
    return;
  }
  // A reload left our own run active: carry on with it.
  if (check.isActive.value && check.ownsRun.value) currentRunId = check.run.value.id;
  if (props.asleep) {
    view.value = "asleep";
    return;
  }
  await startDetect();
}

async function onClosed() {
  if (!opened) return;
  opened = false;
  clearInterval(clock);
  clock = null;
  // Closing ends our own run; a run another device started is left alone.
  if (check.isActive.value && check.ownsRun.value) {
    await check.stop({ saved: saved.value });
  }
  check.dispose();
}

watch(
  () => props.modelValue,
  open => (open ? onOpen() : onClosed()),
  { immediate: true }
);
onBeforeUnmount(() => onClosed());

// "Turn on now" from the asleep state: begin as soon as the screen is awake.
watch(
  () => props.asleep,
  asleep => {
    if (!asleep && props.modelValue && view.value === "asleep") retry();
  }
);

// Closing the dialog before Save keeps the previous calibration, so it never
// needs to ask: the stopped view says what was kept.
function onDialogModel(value) {
  emit("update:modelValue", value);
}

// Done ends the session itself; closing the dialog any other way does too.
async function close() {
  if (check.isActive.value && check.ownsRun.value) await check.stop({ saved: saved.value });
  emit("update:modelValue", false);
}
</script>

<style scoped>
.dcheck__strip {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(9rem, 1fr));
  gap: var(--gap-2);
  margin: 0 0 var(--gap-4);
  padding: 0;
  list-style: none;
}
.dcheck__strip-item {
  padding-top: var(--gap-1);
  border-top: 3px solid var(--line);
  font-size: var(--text-meta);
  color: var(--ink-2);
}
.dcheck__strip-item--done {
  border-top-color: var(--ok);
}
.dcheck__strip-item--now {
  border-top-color: var(--focus);
  color: var(--ink);
  font-weight: var(--weight-strong);
}
/* The full-screen phone sheet has no body padding of its own: give the content
   the dialog's own gutter and let it scroll. */
.dcheck__sheet--full {
  display: flex;
  flex-direction: column;
  flex: 1 1 auto;
  min-height: 0;
  overflow: auto;
  padding: var(--gap-3) var(--gap-5);
}
.dcheck__body {
  display: flex;
  flex-direction: column;
  gap: var(--gap-3);
}
.dcheck__lead {
  margin: 0;
  font-size: var(--text-title);
  font-weight: var(--weight-strong);
}
.dcheck__sub,
.dcheck__footer-note {
  margin: 0;
  font-size: var(--text-meta);
  color: var(--ink-2);
}
.dcheck__wake {
  display: flex;
  align-items: center;
  gap: var(--gap-2);
  min-height: 44px;
}
.dcheck__buttons {
  display: flex;
  flex-wrap: wrap;
  gap: var(--gap-2);
}
.dcheck__reading {
  display: flex;
  gap: var(--gap-2);
  align-items: center;
}
.dcheck__input {
  width: 6rem;
  min-height: var(--touch-target);
  padding: 0 var(--gap-3);
  font-size: var(--text-title);
  font-family: var(--font-data);
  color: var(--ink);
  background: var(--bg-1);
  border: 1px solid var(--line);
  border-radius: var(--radius-control);
}
.dcheck__table {
  width: 100%;
  border-collapse: collapse;
  font-size: var(--text-meta);
}
.dcheck__table th,
.dcheck__table td {
  padding: var(--gap-1) var(--gap-2);
  text-align: left;
  border-bottom: 1px solid var(--line);
}
.dcheck__sr {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
}
.dcheck__actions {
  display: flex;
  flex: 1 1 auto;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;
  gap: var(--gap-inline);
}
/* The full-screen phone sheet: the dialog footer already has the body's gutter;
   this clears the home indicator so Done is never clipped. */
.dcheck__actions--full {
  padding-bottom: env(safe-area-inset-bottom);
}
.dcheck__log {
  margin: 0;
  padding: var(--gap-2) var(--gap-3);
  max-height: 12rem;
  overflow: auto;
  list-style: none;
  font-family: var(--font-data);
  font-size: var(--text-meta);
  background: var(--bg-2);
  border-radius: var(--radius-control);
}
.dcheck__stop {
  min-height: 3rem;
  min-width: 8.5rem;
  transition:
    transform var(--dur-fast),
    background-color var(--dur-fast);
}
.dcheck__stop:active,
.dcheck__stop--pressed {
  transform: scale(0.97);
  box-shadow: inset 0 0 0 2px var(--err);
}
.dcheck__summary {
  margin: 0;
  padding: 0;
  list-style: none;
}
.dcheck__summary-row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--gap-3);
  min-height: var(--touch-target);
  border-bottom: 1px solid var(--line);
}
.dcheck__summary-label {
  font-weight: var(--weight-strong);
}
.dcheck__pair {
  font-variant-numeric: tabular-nums;
}
.dcheck__pair--big {
  margin: 0;
  font-size: var(--text-title);
  font-weight: var(--weight-strong);
}
.dcheck__sub--warn {
  color: var(--err-text);
}

.dcheck__strip-short {
  display: none;
}
.dcheck__fault {
  display: flex;
  flex-direction: column;
  gap: var(--gap-1);
  padding: var(--gap-3);
  font-size: var(--text-meta);
  color: var(--err-text);
  background: color-mix(in srgb, var(--err) 10%, var(--bg-1));
  border: 1px solid var(--err);
  border-radius: var(--radius-control);
}
.dcheck__sub--lead {
  font-size: var(--text-body);
  color: var(--ink);
}
.dcheck__bar {
  display: flex;
  flex-direction: column;
  gap: var(--gap-2);
  margin-top: var(--gap-4);
}
.dcheck__status {
  display: flex;
  align-items: center;
  gap: var(--gap-2);
  margin: 0;
  font-size: var(--text-body);
  font-weight: var(--weight-strong);
}
.dcheck__spinner {
  flex: 0 0 auto;
  width: 1rem;
  height: 1rem;
  border: 2px solid var(--line);
  border-top-color: var(--focus);
  border-radius: var(--radius-round);
  animation: dcheck-spin calc(var(--dur) * 4.5) linear infinite;
}
@keyframes dcheck-spin {
  to {
    transform: rotate(360deg);
  }
}
.dcheck__primary-row {
  display: flex;
  gap: var(--gap-2);
  align-items: center;
}
.dcheck__primary-row--field > :last-child {
  flex: 1 1 auto;
}
.dcheck__input--reading {
  width: 6ch;
  min-width: 6ch;
  box-sizing: content-box;
}
.dcheck__secondary {
  display: flex;
  flex-wrap: wrap;
  gap: var(--gap-2) var(--gap-4);
  align-items: center;
}
.dcheck__fix {
  display: inline-flex;
  align-items: center;
  min-height: var(--touch-target);
  color: var(--ink);
  font-size: var(--text-body);
  text-decoration: underline;
}
.dcheck__fix--primary {
  justify-content: center;
  padding: 0 var(--gap-4);
  min-height: var(--control-height);
  font-weight: var(--weight-strong);
  color: var(--focus-ink);
  text-decoration: none;
  background: var(--focus);
  border-radius: var(--radius-control);
}
@media (--bp-phone) {
  .dcheck__strip {
    grid-template-columns: repeat(4, 1fr);
  }
  .dcheck__strip-long {
    display: none;
  }
  .dcheck__strip-short {
    display: inline;
  }
}
/* On the phone the status line and the primary stay in view at the bottom of
   the sheet, clear of the home indicator. */
.dcheck__sheet--full .dcheck__bar {
  position: sticky;
  bottom: 0;
  margin-top: auto;
  padding: var(--gap-3) 0 calc(var(--gap-3) + env(safe-area-inset-bottom));
  background: var(--bg-1);
  border-top: 1px solid var(--line);
}
.dcheck__sheet--full .dcheck__primary-row > :last-child {
  width: 100%;
}
</style>
