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
          <p v-if="limitFound != null" class="dcheck__sub">
            <template v-if="limitSaved">Brightness can go up to {{ maxAfter }}.</template>
            <template v-else>
              {{ screenName }} is going back to {{ backTo }}. Save the limit so Calvin never goes
              above it.
            </template>
          </p>
          <Button
            v-if="limitFound != null && !limitSaved"
            variant="primary"
            data-test="limit-save"
            :loading="savingLimit"
            @click="saveLimit"
          >
            Save limit {{ limitFound }}
          </Button>
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
            Calvin stepped it from {{ writeFrom }} down to {{ writeTo }} and back, {{ stepSize }} at
            a time. That took about {{ writeSeconds }} s.
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
            Calvin set {{ screenName }} to {{ pointShown }}. Open the screen's own menu (the buttons
            on the screen) and type the Brightness it shows.
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
                <Button variant="link" :data-test="`reading-remove-${i}`" @click="removeReading(i)">
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
            down and remembers that level as {{ screenName }}'s limit. Calvin never goes above it.
          </p>
          <InlineNote tone="warn">
            While it runs, the screen may flicker, its touch may stop for a few seconds, and in the
            worst case it may restart.
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
        v-if="view !== 'readonly' && check.silence.value === 'waiting'"
        data-test="check-silence"
      >
        Waiting for {{ screenName }}…
      </InlineNote>
      <InlineNote
        v-else-if="check.silence.value === 'silent'"
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
        "Turn off now" or a schedule off while a check is running waits until the check ends (up to
        10 min).
      </p>
    </div>

    <template #actions>
      <span v-if="check.isActive.value" class="dcheck__footer-note" role="status">
        {{ screenName }} is checking every 2 s while this is open.
      </span>
      <Button v-if="check.isActive.value" data-test="check-stop" @click="check.stop()">
        Stop the check
      </Button>
      <Button v-if="view === 'finish'" variant="primary" data-test="check-done" @click="close">
        Done
      </Button>
    </template>
  </Dialog>
</template>

<script setup>
import { computed, onBeforeUnmount, ref, toRef, watch } from "vue";
import Button from "@/components/ui/Button.vue";
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
const emit = defineEmits(["update:modelValue", "patch", "writes-ok", "saved-limit"]);

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
const pointShown = computed(
  () => check.run.value?.level ?? check.run.value?.value ?? pendingPoint.value
);
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

// --- starting steps ---------------------------------------------------------

async function startRun(name, extra) {
  const run = await check.start(name, extra);
  if (run) currentRunId = run.id;
  else if (check.readOnly.value) view.value = "readonly";
  return run;
}

async function startDetect() {
  step.value = 1;
  view.value = "step";
  await startRun("detect");
}
async function startWrite() {
  step.value = 2;
  answerReady.value = false;
  const base = settings.value.brightness ?? firstBrightness(limit.value, stepSize.value);
  writeFrom.value = base;
  writeTo.value = Math.max(0, base - 10);
  await startRun("write", { brightness: base });
}
async function startConversion() {
  step.value = 3;
  readyForReading.value = false;
  readingText.value = "";
  const point = nextPoint.value ?? 5;
  pendingPoint.value = point;
  await startRun("conversion", { value: point });
}
async function startLimit() {
  limitRunning.value = true;
  await startRun("limit");
}
function goStep4() {
  step.value = 4;
  limitRunning.value = false;
}
function goFinish() {
  view.value = "finish";
}

function again() {
  startWrite();
}
function retry() {
  ending.value = null;
  view.value = "step";
  if (step.value === 3) startConversion();
  else if (step.value === 4) {
    limitRunning.value = false;
  } else if (step.value === 2) startWrite();
  else startDetect();
}

async function answerWrites(changed) {
  writesVerdict.value = changed;
  await check.recordVerdict(changed);
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

async function saveLimit() {
  savingLimit.value = true;
  const saved = await check.saveLimit();
  savingLimit.value = false;
  if (saved) {
    limitSaved.value = true;
    emit("saved-limit", saved.brightnessLimit);
  }
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
  };
  ending.value = texts[kind] || texts.error;
  view.value = "end";
}

// --- reacting to the agent --------------------------------------------------

function onRun(run) {
  if (!run || run.active || run.id !== currentRunId || handled.has(run.id)) return;
  handled.add(run.id);
  if (run.status === "asleep") {
    view.value = "asleep";
    return;
  }
  if (run.status === "timeout") return end("timeout");
  if (run.status === "interrupted") return end("interrupted");
  const failed = run.status === "error";
  switch (run.step) {
    case "detect":
      if (failed) return end("no-ddc");
      foundText.value = run.detail || "a display";
      placeholderReads.value = Boolean(run.info?.placeholderReads);
      return startWrite();
    case "write":
      if (failed) return end("no-writes");
      answerReady.value = true;
      return;
    case "conversion":
      if (failed) return end("error", run.detail);
      readyForReading.value = true;
      return;
    case "limit":
      limitRunning.value = true;
      limitFound.value = run.limit ?? null;
      if (failed) return end("error", run.detail);
      view.value = "finish";
      return;
    default:
  }
}

watch(
  () =>
    check.run.value && `${check.run.value.id}:${check.run.value.status}:${check.run.value.active}`,
  () => onRun(check.run.value)
);

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
  view.value = "step";
  await check.load();
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

function onDialogModel(value) {
  emit("update:modelValue", value);
}
function close() {
  emit("update:modelValue", false);
}
</script>

<style scoped>
.dcheck__strip {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(7rem, 1fr));
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
  flex: 1;
  height: 0.75rem;
  overflow: hidden;
  background: var(--bg-2);
  border-radius: var(--radius-round);
}
.dcheck__bar-fill {
  display: block;
  height: 100%;
  background: var(--focus);
  transition: width var(--dur-fast) linear;
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
