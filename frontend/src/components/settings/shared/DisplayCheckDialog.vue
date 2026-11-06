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
            'dcheck__strip-item--done': stepNumber > item.n || view === 'finish',
            'dcheck__strip-item--now': stepNumber === item.n && view !== 'finish',
          }"
          :aria-current="stepNumber === item.n && view !== 'finish' ? 'step' : undefined"
        >
          {{ item.n }} · {{ item.label }}<template v-if="item.optional"> (optional)</template>
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
          <div class="dcheck__buttons">
            <Button
              v-if="asleep"
              variant="primary"
              data-test="check-turn-on"
              @click="emit('turn-on')"
            >
              Turn on now
            </Button>
            <Button v-else data-test="check-retry" @click="retry">Try again</Button>
          </div>
        </template>

        <!-- An end state -->
        <template v-else-if="view === 'end'">
          <InlineNote :tone="ending.tone" data-test="check-end">{{ ending.text }}</InlineNote>
          <p v-if="ending.hint" class="dcheck__sub">{{ ending.hint }}</p>
          <Button data-test="check-retry" @click="retry">Try again</Button>
        </template>

        <!-- Finish -->
        <template v-else-if="view === 'finish'">
          <div data-test="check-finish">
            <p class="dcheck__lead">What Calvin found</p>
            <ul class="dcheck__found">
              <li v-if="foundText">✓ Found {{ foundText }}</li>
              <li v-if="writesVerdict === true">✓ Brightness commands change the screen</li>
              <li v-if="readings.length >= 2">
                ✓ Menu match from {{ readings.length }} readings ({{ fitText }})
              </li>
              <li v-else>⚠ No menu match, so the slider stays on Calvin's scale</li>
              <li v-if="limitFound != null">✓ Limit found: {{ limitFound }}</li>
              <li v-else>⚠ No limit found, so Calvin has no ceiling for this screen</li>
            </ul>
            <p v-if="readings.length >= 2" class="dcheck__sub">
              The Brightness slider now shows the screen's menu numbers.
            </p>
            <p v-if="limitFound != null && limitSaved" class="dcheck__sub" data-test="limit-saved">
              Saved. Brightness can go up to {{ maxAfter }}.
            </p>
            <template v-else-if="limitFound != null">
              <p class="dcheck__sub">{{ screenName }} is going back to {{ backTo }}.</p>
              <Button
                variant="primary"
                data-test="limit-save"
                :loading="savingLimit"
                @click="saveLimit"
              >
                Save {{ limitFound }} as {{ screenName }}'s limit
              </Button>
              <p class="dcheck__sub" data-test="limit-pending-note">
                A found limit only applies once you save it. The old limit stays until you save.
              </p>
            </template>
          </div>
        </template>

        <!-- Step 1 -->
        <template v-else-if="step === 1">
          <p class="dcheck__lead">Find the display</p>
          <p class="dcheck__sub">Asking {{ screenName }}'s screen…</p>
        </template>

        <!-- Step 2 -->
        <template v-else-if="step === 2">
          <InlineNote v-if="foundText" tone="ok" data-test="check-found">
            Found {{ foundText }}.
            <template v-if="placeholderReads">
              The screen always reports brightness 0, so Calvin needs your eyes for the next step.
            </template>
          </InlineNote>
          <template v-if="!answerReady">
            <p class="dcheck__lead">Changing the brightness…</p>
            <p class="dcheck__sub" role="status">
              Calvin is stepping {{ screenName }} down and back.
            </p>
          </template>
          <template v-else>
            <p class="dcheck__lead">
              Did {{ screenName }} get dimmer for a moment, then brighter again?
            </p>
            <p class="dcheck__sub">
              Calvin stepped it from {{ writeFrom }} down to {{ writeTo }} and back,
              {{ stepSize }} at a time. That took about {{ writeSeconds }} s.
            </p>
            <div class="dcheck__buttons">
              <Button variant="primary" data-test="writes-yes" @click="answerWrites(true)">
                Yes, it changed
              </Button>
              <Button data-test="writes-no" @click="answerWrites(false)">
                No, it looked the same
              </Button>
              <Button data-test="writes-again" @click="again">Show me again</Button>
            </div>
          </template>
        </template>

        <!-- Step 3 -->
        <template v-else-if="step === 3">
          <p class="dcheck__lead">Match the screen's menu</p>
          <template v-if="readyForReading">
            <p class="dcheck__sub">
              Calvin set {{ screenName }} to {{ pointShown }}. Open the screen's own menu (the
              buttons on the screen) and type the Brightness it shows.
            </p>
            <div class="dcheck__reading">
              <input
                v-model="readingText"
                class="dcheck__input"
                data-test="reading-input"
                type="text"
                inputmode="numeric"
                pattern="[0-9]*"
                aria-label="Brightness shown in the screen's menu"
                @keyup.enter="saveReading"
              />
              <Button
                variant="primary"
                data-test="reading-save"
                :disabled="!readingValid"
                @click="saveReading"
              >
                Save reading
              </Button>
            </div>
          </template>
          <p v-else class="dcheck__sub" role="status">
            Setting {{ screenName }} to {{ pendingPoint ?? "…" }}…
          </p>

          <table v-if="readings.length" class="dcheck__table">
            <thead>
              <tr>
                <th>Calvin value</th>
                <th>Screen's menu</th>
                <th><span class="dcheck__sr">Remove</span></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(point, i) in readings" :key="point.ddc">
                <td>{{ point.ddc }}</td>
                <td>{{ point.menu }}</td>
                <td>
                  <Button
                    variant="link"
                    :data-test="`reading-remove-${i}`"
                    @click="removeReading(i)"
                  >
                    Remove
                  </Button>
                </td>
              </tr>
            </tbody>
          </table>
          <InlineNote v-if="fitText" :tone="outlier ? 'warn' : 'neutral'" data-test="check-fit">
            <template v-if="outlier">These readings don't line up. Check the last one. </template>
            With {{ readings.length }} readings: {{ fitText }}.
            <template v-if="readings.length < 3">Add a third reading to check it.</template>
          </InlineNote>
          <div class="dcheck__buttons">
            <Button
              data-test="check-add"
              :disabled="!readyForReading || nextPoint == null"
              @click="startConversion"
            >
              Add a reading
            </Button>
            <Button
              variant="primary"
              data-test="check-next"
              :disabled="readings.length < 2"
              @click="goStep4"
            >
              Next
            </Button>
            <Button variant="link" data-test="check-skip" @click="goStep4">Skip this step</Button>
          </div>
        </template>

        <!-- Step 4 -->
        <template v-else-if="step === 4">
          <template v-if="!limitRunning">
            <p class="dcheck__lead">Find the safe limit</p>
            <p class="dcheck__sub">
              Calvin raises the brightness until the power supply shows trouble. Then it steps back
              down and offers that level as {{ screenName }}'s limit. Once you save it, Calvin never
              goes above it.
            </p>
            <InlineNote tone="warn">
              While it runs, the screen may flicker, its touch may stop for a few seconds, and in
              the worst case it may restart.
            </InlineNote>
            <InlineNote v-if="onPanel" tone="err" data-test="limit-on-panel">
              You're on {{ screenName }} itself. Run this step from your phone or computer, because
              the touch screen can stop responding mid-test.
            </InlineNote>
            <div class="dcheck__buttons">
              <Button v-if="!onPanel" variant="primary" data-test="limit-start" @click="startLimit">
                Start the test
              </Button>
              <Button data-test="limit-skip" @click="goFinish">Skip, finish</Button>
            </div>
          </template>
          <template v-else>
            <div class="dcheck__level" data-test="limit-level" aria-live="off">
              <strong>{{ check.run.value?.level ?? 0 }}</strong>
              <span class="dcheck__bar" aria-hidden="true">
                <span class="dcheck__bar-fill" :style="{ width: `${barPercent}%` }" />
                <span
                  v-if="check.run.value?.limit != null"
                  class="dcheck__bar-limit"
                  data-test="limit-marker"
                  :style="{ left: `${check.run.value.limit}%` }"
                />
              </span>
            </div>
            <p class="dcheck__sub" role="status">
              Raising {{ stepSize }} every {{ stepSeconds }} s and watching for power trouble
            </p>
            <ul class="dcheck__log" data-test="limit-log" aria-label="Test log">
              <li v-for="(line, i) in logLines" :key="i">{{ line }}</li>
            </ul>
            <InlineNote v-if="check.run.value?.limit != null" tone="warn">
              Limit found: {{ check.run.value.limit }}. {{ screenName }} is going back to
              {{ backTo }}. If this page closes, {{ screenName }} finishes safely on its own.
            </InlineNote>
            <Button
              class="dcheck__stop"
              variant="danger"
              data-test="limit-stop"
              @click="check.stop()"
            >
              Stop now
            </Button>
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

        <p class="dcheck__fine">
          "Turn off now" or a schedule off while a check is running waits until the check ends (up
          to 10 min).
        </p>
      </div>
    </div>

    <ConfirmModal
      :show="confirmLeave"
      title="Leave without saving?"
      :message="`Leave without saving limit ${limitFound}?`"
      confirm-text="Save"
      alternative-text="Leave"
      @confirm="leaveSaving"
      @alternative="leaveWithout"
      @cancel="confirmLeave = false"
    />

    <template #actions>
      <div class="dcheck__actions" :class="{ 'dcheck__actions--full': phone }">
        <span v-if="check.isActive.value" class="dcheck__footer-note" role="status">
          {{ screenName }} is checking every 2 s while this is open.
        </span>
        <Button v-if="check.isActive.value" data-test="check-stop" @click="check.stop()">
          Stop the check
        </Button>
        <Button v-if="view === 'finish'" variant="primary" data-test="check-done" @click="close">
          Done
        </Button>
      </div>
    </template>
  </Dialog>
</template>

<script setup>
import { computed, onBeforeUnmount, ref, toRef, watch } from "vue";
import Button from "@/components/ui/Button.vue";
import ConfirmModal from "@/components/ui/ConfirmModal.vue";
import Dialog from "@/components/ui/Dialog.vue";
import InlineNote from "@/components/ui/InlineNote.vue";
import { useDisplayCheck } from "@/composables/useDisplayCheck";
import {
  firstBrightness,
  fitSentence,
  maxPickable,
  nextReadingPoint,
  readingsOutlier,
  ddcToMenu,
  dimSeconds,
} from "@/utils/brightness";

// The display check dialog (calvin-29ws, docs/design/2026-11-04-brightness-
// ramp-ui.md §3). Every step is its own run on the backend; the agent owns the
// run and always finishes it safely, so closing only has to ask it to stop.
const props = defineProps({
  modelValue: { type: Boolean, default: false },
  kioskId: { type: String, required: true },
  screenName: { type: String, default: "this screen" },
  asleep: { type: Boolean, default: false },
  // This browser is the screen being checked (the touch panel itself).
  onPanel: { type: Boolean, default: false },
  overrides: { type: Object, default: () => ({}) },
  // 1 detect (default), 3 conversion, 4 limit.
  startStep: { type: String, default: "detect" },
});
const emit = defineEmits(["update:modelValue", "patch", "writes-ok", "saved-limit", "turn-on"]);

const STEPS = [
  { n: 1, label: "Find the display" },
  { n: 2, label: "Does it change?" },
  { n: 3, label: "Match the screen's menu" },
  { n: 4, label: "Find the safe limit", optional: true },
];

const check = useDisplayCheck(toRef(props, "kioskId"));

const step = ref(1);
const view = ref("step");
const ending = ref(null);
const foundText = ref("");
const placeholderReads = ref(false);
const answerReady = ref(false);
const writeFrom = ref(0);
const writeTo = ref(0);
const writesVerdict = ref(null);
const readyForReading = ref(false);
const pendingPoint = ref(null);
const readingText = ref("");
const limitRunning = ref(false);
const limitFound = ref(null);
const limitSaved = ref(false);
const savingLimit = ref(false);
const phone = ref(false);
const handled = new Set();
let currentRunId = null;
let opened = false;

const stepNumber = computed(() => step.value);
const readOnlyView = computed(() => view.value === "readonly");
const settings = computed(() => props.overrides || {});
const stepSize = computed(() => settings.value.brightnessStep ?? 2);
const stepSeconds = computed(() => settings.value.brightnessStepSeconds ?? 1.5);
const limit = computed(() => settings.value.brightnessLimit ?? null);
const readings = computed(() => settings.value.brightnessConversion ?? []);
const fitText = computed(() => fitSentence(readings.value));
const outlier = computed(() => readingsOutlier(readings.value));
const backTo = computed(
  () => settings.value.brightness ?? firstBrightness(limit.value, stepSize.value)
);
const writeSeconds = computed(
  () => dimSeconds(writeFrom.value - writeTo.value, stepSize.value, stepSeconds.value) * 2
);
const nextPoint = computed(() => nextReadingPoint(readings.value, limit.value, stepSize.value));
const pointShown = computed(() => pendingPoint.value);
const readingValid = computed(() => {
  const n = Number(readingText.value);
  return readingText.value.trim() !== "" && Number.isFinite(n) && n >= 0 && n <= 100;
});
const barPercent = computed(() => Math.max(0, Math.min(100, check.run.value?.level ?? 0)));
const maxAfter = computed(() => {
  const ddc = maxPickable(limit.value ?? limitFound.value, stepSize.value);
  return readings.value.length >= 2 ? ddcToMenu(ddc, readings.value) : ddc;
});
const logLines = computed(() =>
  (check.run.value?.log ?? []).map(entry => `${entry.level ?? ""} · ${entry.note ?? ""}`.trim())
);

const stepLabel = name =>
  ({
    detect: "Find the display",
    write: "Does it change?",
    conversion: "Match the screen's menu",
    limit: "Find the safe limit",
  })[name] || "Display check";

// --- the session -------------------------------------------------------------
// One run lasts the whole check. The first step starts it; every later step
// moves the same run with `changeStep`. A step's result arrives in run.steps
// while the run stays active, and Stop or Done is what ends it.

const stepStamp = result =>
  result ? `${result.status}|${result.value ?? ""}|${result.finishedAt ?? ""}` : "";
let awaiting = null;
// A step has been asked for and the agent has not answered yet.
const inFlight = ref(false);

function expectResult(name, value) {
  awaiting = {
    step: name,
    value: value ?? null,
    baseline: stepStamp(check.run.value?.steps?.[name]),
  };
  inFlight.value = true;
}

// Ask the agent for a step: start the session, or move the running one.
async function go(name, value) {
  const run = check.run.value;
  if (run?.active && check.ownsRun.value) {
    const result = await check.changeStep(name, value);
    if (result.gone) {
      end("gone");
      return false;
    }
    if (!result.ok) return false;
  } else {
    const started = await check.start(name, value === undefined ? {} : { value });
    if (!started) {
      if (check.readOnly.value) view.value = "readonly";
      return false;
    }
    currentRunId = started.id;
  }
  expectResult(name, value);
  return true;
}

async function startDetect() {
  step.value = 1;
  view.value = "step";
  await go("detect");
}
let writeAgain = 0;
async function startWrite(again = false) {
  step.value = 2;
  const wasReady = answerReady.value;
  answerReady.value = false;
  const base = settings.value.brightness ?? firstBrightness(limit.value, stepSize.value);
  writeFrom.value = base;
  writeTo.value = Math.max(0, base - 10);
  // The kiosk ignores a repeat of the same step and value, so "Show me again"
  // alternates the value it sends (the write test itself ignores it).
  let value;
  if (again) {
    writeAgain += 1;
    value = writeAgain % 2 === 1 ? (base >= 1 ? base - 1 : 1) : base;
  }
  const ok = await go("write", value);
  if (!ok) answerReady.value = wasReady;
}
async function startConversion() {
  step.value = 3;
  const wasReady = readyForReading.value;
  const previous = pendingPoint.value;
  const point = nextPoint.value ?? 5;
  readyForReading.value = false;
  readingText.value = "";
  pendingPoint.value = point;
  const run = check.run.value;
  if (
    run?.active &&
    check.ownsRun.value &&
    run.step === "conversion" &&
    run.value === point &&
    run.steps?.conversion?.status === "done"
  ) {
    // Already at this point (a reading was removed and asked for again).
    readyForReading.value = true;
    return;
  }
  const ok = await go("conversion", point);
  if (!ok) {
    readyForReading.value = wasReady;
    pendingPoint.value = previous;
  }
}
async function startLimit() {
  limitRunning.value = true;
  const ok = await go("limit");
  if (!ok) limitRunning.value = false;
}
function goStep4() {
  step.value = 4;
  limitRunning.value = false;
}
function goFinish() {
  view.value = "finish";
}

function again() {
  startWrite(true);
}
async function retry() {
  // Try again while a run is still live: end it first, or the start is refused.
  if (check.isActive.value) await check.stop();
  ending.value = null;
  view.value = "step";
  awaiting = null;
  inFlight.value = false;
  if (step.value === 3) startConversion();
  else if (step.value === 4) {
    limitRunning.value = false;
  } else if (step.value === 2) startWrite();
  else startDetect();
}

async function answerWrites(changed) {
  const saved = await check.recordVerdict(changed);
  // The answer wasn't saved: stay on the question so the owner can answer again.
  if (!saved) return;
  writesVerdict.value = changed;
  if (!changed) {
    end("no-writes");
    return;
  }
  emit("writes-ok");
  startConversion();
}

function saveReading() {
  if (!readingValid.value) return;
  const ddc = Number(pointShown.value);
  const menu = Number(readingText.value);
  const others = readings.value.filter(point => Number(point.ddc) !== ddc);
  const next = [...others, { ddc, menu }].sort((a, b) => a.ddc - b.ddc);
  emit("patch", { brightnessConversion: next });
  readingText.value = "";
}
function removeReading(index) {
  emit("patch", { brightnessConversion: readings.value.filter((_, i) => i !== index) });
}

// A found limit is only a proposal: a report can be forged on the LAN, so it
// takes effect only when the owner saves it. The old limit stays until then.
async function saveLimit() {
  const found = limitFound.value;
  if (found == null) return;
  savingLimit.value = true;
  const saved = await check.saveLimit();
  savingLimit.value = false;
  if (!saved) return;
  limitSaved.value = true;
  emit("saved-limit", saved.brightnessLimit);
}

// --- end states -------------------------------------------------------------

function end(kind, detail = "") {
  const name = props.screenName;
  const texts = {
    "no-ddc": {
      tone: "err",
      text: `Not available: ${name}'s screen doesn't answer brightness commands (DDC/CI).`,
      hint: "Often the adapter or cable doesn't carry DDC, or DDC/CI is off in the screen's menu.",
    },
    "no-writes": {
      tone: "err",
      text: "Not available: brightness commands reach the screen but don't change it.",
    },
    timeout: { tone: "warn", text: "The check timed out. Nothing was left changed." },
    interrupted: {
      tone: "warn",
      text: `${name} restarted. That's the limit at work. If it comes back, check its Display check line for the result.`,
    },
    error: { tone: "err", text: detail || "The check couldn't finish." },
    stopped: {
      tone: "warn",
      text: `The check was stopped. ${name} is going back to its brightness.`,
    },
    gone: { tone: "warn", text: "The check ended before this step could start." },
  };
  ending.value = texts[kind] || texts.error;
  view.value = "end";
}

// --- reacting to the agent --------------------------------------------------

function onStepResult(name, result) {
  const failed = result.status === "error";
  switch (name) {
    case "detect":
      if (failed) return end("no-ddc");
      foundText.value = result.detail || result.info?.model || "a display";
      placeholderReads.value = Boolean(result.info?.placeholderReads);
      step.value = 2;
      return startWrite();
    case "write":
      if (failed) return end("no-writes");
      answerReady.value = true;
      return;
    case "conversion":
      if (failed) return end("error", result.detail);
      readyForReading.value = true;
      return;
    case "limit":
      limitRunning.value = true;
      if (failed) return end("error", result.detail);
      limitFound.value = result.limit ?? null;
      view.value = "finish";
      return;
    default:
  }
}

// The run ended: the agent refused (asleep), gave up, restarted, or was stopped.
function onRunEnded(run) {
  if (handled.has(run.id)) return;
  handled.add(run.id);
  awaiting = null;
  inFlight.value = false;
  if (run.status === "asleep") {
    view.value = "asleep";
    return;
  }
  if (view.value === "finish") return;
  if (run.status === "timeout") return end("timeout");
  if (run.status === "interrupted") return end("interrupted");
  if (run.status === "error") {
    return run.step === "detect" ? end("no-ddc") : end("error", run.detail);
  }
  if (run.status === "stopped" && view.value === "step") end("stopped");
}

function onRun(run) {
  if (!run || run.id !== currentRunId) return;
  if (!run.active) return onRunEnded(run);
  if (!awaiting) return;
  const result = run.steps?.[awaiting.step];
  if (!result || stepStamp(result) === awaiting.baseline) return;
  if (
    awaiting.step === "conversion" &&
    awaiting.value !== null &&
    result.value !== awaiting.value
  ) {
    return;
  }
  const done = awaiting;
  awaiting = null;
  inFlight.value = false;
  onStepResult(done.step, result);
}

watch(() => check.run.value, onRun);

// --- open / close -----------------------------------------------------------

async function onOpen() {
  opened = true;
  phone.value = typeof window !== "undefined" && window.matchMedia?.("(max-width: 640px)").matches;
  ending.value = null;
  foundText.value = "";
  answerReady.value = false;
  readyForReading.value = false;
  limitRunning.value = false;
  limitFound.value = null;
  limitSaved.value = false;
  writesVerdict.value = null;
  handled.clear();
  currentRunId = null;
  awaiting = null;
  inFlight.value = false;
  writeAgain = 0;
  pendingPoint.value = null;
  view.value = "step";
  await check.load();
  check.resume();
  if (check.readOnly.value) {
    view.value = "readonly";
    return;
  }
  if (props.asleep) {
    view.value = "asleep";
    return;
  }
  if (props.startStep === "conversion") await startConversion();
  else if (props.startStep === "limit") goStep4();
  else await startDetect();
}

async function onClosed() {
  if (!opened) return;
  opened = false;
  // Closing ends our own run; a run another device started is left alone.
  if (check.isActive.value && check.ownsRun.value) await check.stop();
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

// A found limit nobody saved yet: leaving would lose it, so ask first.
const confirmLeave = ref(false);
const unsavedLimit = computed(
  () => view.value === "finish" && limitFound.value != null && !limitSaved.value
);

function onDialogModel(value) {
  if (value === false && unsavedLimit.value) {
    confirmLeave.value = true;
    return;
  }
  emit("update:modelValue", value);
}

// Done ends the session itself; closing the dialog any other way does too.
async function endAndClose() {
  confirmLeave.value = false;
  if (check.isActive.value && check.ownsRun.value) await check.stop();
  emit("update:modelValue", false);
}
function close() {
  if (unsavedLimit.value) {
    confirmLeave.value = true;
    return;
  }
  return endAndClose();
}
async function leaveSaving() {
  await saveLimit();
  if (limitSaved.value) await endAndClose();
  else confirmLeave.value = false;
}
function leaveWithout() {
  return endAndClose();
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
.dcheck__fine,
.dcheck__footer-note {
  margin: 0;
  font-size: var(--text-meta);
  color: var(--ink-2);
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
.dcheck__level {
  display: flex;
  align-items: center;
  gap: var(--gap-3);
}
.dcheck__level strong {
  font-family: var(--font-data);
  font-size: var(--text-display);
  min-width: 3ch;
}
.dcheck__bar {
  position: relative;
  flex: 1;
  height: 0.75rem;
  overflow: hidden;
  background: var(--bg-2);
  border: 1px solid var(--line);
  border-radius: var(--radius-round);
}
.dcheck__bar-fill {
  display: block;
  height: 100%;
  background: var(--focus);
  transition: width var(--dur-fast) linear;
}
.dcheck__bar-limit {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 2px;
  background: var(--err);
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
  width: 100%;
  min-height: 3rem;
}
.dcheck__found {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: var(--gap-1);
}
</style>
