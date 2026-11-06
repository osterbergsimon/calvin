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
            'dcheck__strip-item--optional': item.optional,
          }"
          :aria-current="stepNumber === item.n && view !== 'finish' ? 'step' : undefined"
        >
          <span class="dcheck__strip-long">
            {{ item.n }} · {{ item.label }}<template v-if="item.optional"> (optional)</template>
          </span>
          <span class="dcheck__strip-short" aria-hidden="true">{{ item.n }} {{ item.short }}</span>
        </li>
      </ol>

      <div class="dcheck__body" data-test="check-step-body">
        <!-- A power fault seen in any step: one banner for the whole incident -->
        <div v-if="fault" class="dcheck__fault" role="alert" data-test="check-fault">
          <strong>Power trouble at Calvin {{ fault.level }} · {{ fault.kind }}</strong>
          <span v-if="view !== 'power-ended'">{{ faultAction }}</span>
          <span v-for="at in fault.alsoAt || []" :key="at">also at {{ at }} while settling</span>
        </div>

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

        <!-- Calibration ended by power trouble -->
        <template v-else-if="view === 'power-ended'">
          <div data-test="check-power-ended">
            <p class="dcheck__lead">{{ screenName }}'s power supply is too weak</p>
            <p v-if="!limitSaved" class="dcheck__sub">
              {{ screenName }} showed power trouble at Calvin {{ fault?.level }}, even at this low
              brightness. Calvin dimmed it to {{ CHECK_FLOOR }} and stopped. It won't try again on
              its own.
            </p>
            <p class="dcheck__sub">{{ readingsLine }}</p>
            <p v-if="limitSaved" class="dcheck__sub">
              Saved. The ramp and the slider stay under {{ pendingLimit }} until you fix the power
              and check again.
            </p>
            <p v-else-if="pendingLimit != null" class="dcheck__sub">
              Calvin can keep {{ screenName }} at <strong>{{ pendingLimit }}</strong> or below (one
              step under where the trouble showed).
            </p>
            <p class="dcheck__sub">{{ FIX_LINE }}</p>
          </div>
        </template>

        <!-- An end state -->
        <template v-else-if="view === 'end'">
          <InlineNote :tone="ending.tone" data-test="check-end">{{ ending.text }}</InlineNote>
          <p v-if="ending.hint" class="dcheck__sub">{{ ending.hint }}</p>
        </template>

        <!-- Finish -->
        <template v-else-if="view === 'finish'">
          <div data-test="check-finish">
            <p class="dcheck__lead">What Calvin found</p>
            <ul class="dcheck__found">
              <li v-if="foundText">✓ Found {{ foundText }}</li>
              <li v-if="writesVerdict === true">✓ Brightness commands change the screen</li>
              <li v-if="readings.length >= 2">
                ✓ Menu match from {{ readings.length }} readings ({{ fitText
                }}<template v-if="readings.length === 2">, approximate</template>)
              </li>
              <li v-else>⚠ No menu match, so the slider stays on Calvin's scale</li>
              <li v-if="limitFound != null">✓ Limit found: {{ limitFound }}</li>
              <li v-else>⚠ No limit found, so Calvin has no ceiling for this screen</li>
              <li v-if="fault">⚠ Power trouble at Calvin {{ fault.level }} · {{ fault.kind }}</li>
            </ul>
            <p v-if="readings.length >= 2" class="dcheck__sub">
              The Brightness slider now shows the screen's menu numbers.
            </p>
            <p v-if="limitFound != null && limitSaved" class="dcheck__sub" data-test="limit-saved">
              Saved. Brightness can go up to {{ maxAfter }}.
            </p>
            <template v-else-if="limitFound != null">
              <p class="dcheck__sub">{{ screenName }} is going back to {{ backTo }}.</p>
              <p class="dcheck__sub" data-test="limit-pending-note">
                A found limit only applies once you save it. The old limit stays until you save.
              </p>
            </template>
          </div>
        </template>

        <!-- Step 1 -->
        <template v-else-if="step === 1">
          <template v-if="state === 'preflight'">
            <p class="dcheck__sub">
              Calvin watches the power supply for {{ PREFLIGHT_S }} s while the screen stays as it
              is.
            </p>
          </template>
          <template v-else-if="detected">
            <p class="dcheck__lead">Find the display</p>
            <InlineNote tone="ok" data-test="check-found">Found {{ foundText }}.</InlineNote>
            <p v-if="startKnown" class="dcheck__sub">
              The check stays at Calvin {{ startLevel }} or below. It only dims.
            </p>
            <template v-else>
              <p class="dcheck__sub">
                {{ screenName }} always reports brightness 0, so Calvin can't tell how bright it is
                now. To stay safe, Calvin dims it to {{ CHECK_FLOOR }} first.
              </p>
              <label class="dcheck__menu-start">
                <span>
                  <strong>Before Calvin changes anything:</strong> what Brightness does
                  {{ screenName }}'s own menu show now?
                </span>
                <input
                  v-model="menuStartText"
                  class="dcheck__input"
                  data-test="menu-start-input"
                  type="text"
                  inputmode="numeric"
                  pattern="[0-9]*"
                  aria-label="Brightness shown in the screen's menu now"
                />
              </label>
            </template>
          </template>
          <p v-else class="dcheck__lead">Find the display</p>
        </template>

        <!-- Step 2 -->
        <template v-else-if="step === 2">
          <p class="dcheck__lead">Does it change?</p>
          <template v-if="state === 'question'">
            <p class="dcheck__sub dcheck__sub--lead">
              Did {{ screenName }} get dimmer for a moment, then come back?
            </p>
            <p class="dcheck__sub">
              Calvin stepped it from {{ writeFrom }} down to {{ writeTo }} and back,
              {{ stepSize }} at a time.
            </p>
          </template>
          <p v-else class="dcheck__sub">Watch {{ screenName }}'s screen.</p>
          <p v-if="state === 'testing'" class="dcheck__sub">
            It should get dimmer, then come back.
          </p>
        </template>

        <!-- Step 3 -->
        <template v-else-if="step === 3">
          <p class="dcheck__lead">Match the screen's menu</p>
          <template v-if="state === 'reading'">
            <p class="dcheck__sub">
              <template v-if="readings.length === 0">
                Open {{ screenName }}'s own menu (the buttons on the screen) and type the Brightness
                it shows now. Calvin hasn't changed it.
              </template>
              <template v-else>Type the Brightness {{ screenName }}'s menu shows now.</template>
            </p>
          </template>
          <template v-else-if="state === 'matched'">
            <InlineNote tone="neutral" data-test="check-fit">
              {{ fitCapital }}.
              <template v-if="readings.length === 2">
                <strong>This is approximate:</strong> both readings are low, so near the top it can
                be off by about 4 on the menu.
              </template>
              <template v-if="menuAtStartLine"> {{ menuAtStartLine }}</template>
            </InlineNote>
          </template>
          <template v-else-if="state === 'off-line'">
            <InlineNote tone="warn" data-test="check-fit">
              These readings don't line up: Calvin {{ lastReading?.ddc }} should be about
              {{ predictedMenu }} on the menu, you typed {{ lastReading?.menu }}. Check the menu and
              type it again.
            </InlineNote>
          </template>
          <template v-else-if="state === 'noroom'">
            <p class="dcheck__sub">
              {{ screenName }} started at Calvin {{ readings[0]?.ddc }}, so there's no room to dim
              for a second reading. A menu match needs two, so the slider stays on Calvin's scale.
            </p>
          </template>
          <template v-else-if="menuAtStartLine">
            <p class="dcheck__sub">{{ menuAtStartLine }}</p>
          </template>

          <ul v-if="readings.length" class="dcheck__readings" data-test="readings-list">
            <li v-for="(point, i) in readings" :key="point.ddc" class="dcheck__readings-row">
              <span>Calvin {{ point.ddc }} · menu {{ point.menu }}</span>
              <Button variant="link" :data-test="`reading-remove-${i}`" @click="removeReading(i)">
                Remove
              </Button>
            </li>
          </ul>
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
          </template>
          <template v-else>
            <div class="dcheck__level" data-test="limit-level" aria-live="off">
              <strong>{{ check.run.value?.level ?? 0 }}</strong>
              <span class="dcheck__bar-track" aria-hidden="true">
                <span class="dcheck__bar-fill" :style="{ width: `${barPercent}%` }" />
                <span
                  v-if="check.run.value?.limit != null"
                  class="dcheck__bar-limit"
                  data-test="limit-marker"
                  :style="{ left: `${check.run.value.limit}%` }"
                />
              </span>
            </div>
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

      <!-- The status line and the one primary action, always together -->
      <div class="dcheck__bar" data-test="check-bar">
        <p class="dcheck__status" data-test="check-status" role="status">
          <span v-if="ui.busy" class="dcheck__spinner" aria-hidden="true" />
          {{ ui.status }}
        </p>
        <div v-if="ui.answers" class="dcheck__answers">
          <Button
            v-for="answer in ui.answers"
            :key="answer.test"
            :data-test="answer.test"
            @click="answer.run"
          >
            {{ answer.label }}
          </Button>
        </div>
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
            aria-label="Brightness shown in the screen's menu"
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

    <ConfirmModal
      :show="confirmLeave"
      title="Leave without saving?"
      :message="`Leave without saving limit ${pendingLimit}?`"
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
      </div>
    </template>
  </Dialog>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, ref, toRef, watch } from "vue";
import Button from "@/components/ui/Button.vue";
import ConfirmModal from "@/components/ui/ConfirmModal.vue";
import Dialog from "@/components/ui/Dialog.vue";
import InlineNote from "@/components/ui/InlineNote.vue";
import { useDisplayCheck } from "@/composables/useDisplayCheck";
import {
  CHECK_FLOOR,
  calibrationPoints,
  dimSeconds,
  ddcToMenu,
  faultLimit,
  firstBrightness,
  fitSentence,
  maxPickable,
  menuToDdc,
  readingsOutlier,
  thirdReadingPoint,
  writeTargets,
} from "@/utils/brightness";

// The display check dialog (calvin-29ws; calibration v2, calvin-c805 and
// calvin-u8yn: docs/design/2026-11-04-brightness-ramp-ui.md §3). Every state has
// one status line and at most one primary action. Calibration (steps 1-3) never
// brightens; the agent owns the run and always finishes it safely, so closing
// only has to ask it to stop.
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

const HELP_URL = "https://github.com/osterbergsimon/calvin/blob/main/docs/setup/KIOSK_POWER.md";
const PREFLIGHT_S = 10;
const FIX_LINE =
  "The usual fix is to keep the screen's USB data link from also powering it (a USB power blocker on the data leg), or to use a stronger power supply.";

const STEPS = [
  { n: 1, label: "Find the display", short: "Display" },
  { n: 2, label: "Does it change?", short: "Change" },
  { n: 3, label: "Match the screen's menu", short: "Menu" },
  { n: 4, label: "Find the safe limit", short: "Limit", optional: true },
];

const check = useDisplayCheck(toRef(props, "kioskId"));

const step = ref(1);
const view = ref("step");
const ending = ref(null);
const foundText = ref("");
const placeholderReads = ref(false);
const detected = ref(false);
const startLevel = ref(null);
const startKnown = ref(true);
const menuStartText = ref("");
const answerReady = ref(false);
const writeFrom = ref(0);
const writeTo = ref(0);
const writesVerdict = ref(null);
const pointReady = ref(null);
const pendingPoint = ref(null);
const readingText = ref("");
const readingInput = ref(null);
const limitRunning = ref(false);
const limitFound = ref(null);
const limitSaved = ref(false);
const savingLimit = ref(false);
const thirdFromFinish = ref(false);
const phone = ref(false);
const nowMs = ref(Date.now());
const runStartedMs = ref(Date.now());
const handled = new Set();
let currentRunId = null;
let opened = false;
let clock = null;

const stepNumber = computed(() => step.value);
const readOnlyView = computed(() => view.value === "readonly");
const settings = computed(() => props.overrides || {});
const stepSize = computed(() => settings.value.brightnessStep ?? 2);
const stepSeconds = computed(() => settings.value.brightnessStepSeconds ?? 1.5);
const limit = computed(() => settings.value.brightnessLimit ?? null);
const readings = computed(() => settings.value.brightnessConversion ?? []);
const fitText = computed(() => fitSentence(readings.value));
const fitCapital = computed(() => fitText.value.replace(/^./, c => c.toUpperCase()));
const outlier = computed(() => readingsOutlier(readings.value));
const lastReading = computed(() => readings.value[readings.value.length - 1] ?? null);
const predictedMenu = computed(() =>
  lastReading.value ? ddcToMenu(lastReading.value.ddc, readings.value.slice(0, -1)) : null
);
const backTo = computed(
  () => settings.value.brightness ?? firstBrightness(limit.value, stepSize.value)
);
const run = computed(() => check.run.value);
const preflightClean = computed(() => run.value?.preflight?.status === "clean");
const fault = computed(() => {
  const f = run.value?.fault;
  if (!f) return null;
  return currentRunId && run.value.id !== currentRunId ? null : f;
});
const faultLim = computed(() => faultLimit(fault.value, stepSize.value));
const pendingLimit = computed(() =>
  view.value === "power-ended" ? faultLim.value : limitFound.value
);

// Where calibration starts: the known start level, or the floor when the screen
// can't say how bright it is. A direct entry (no detect) uses the saved level.
const effectiveStart = computed(() => {
  if (detected.value) return startKnown.value ? (startLevel.value ?? CHECK_FLOOR) : CHECK_FLOOR;
  return settings.value.brightness ?? CHECK_FLOOR;
});
const writeSeconds = computed(() =>
  dimSeconds(writeFrom.value - writeTo.value, stepSize.value, stepSeconds.value)
);
const readingValid = computed(() => {
  const n = Number(readingText.value);
  return readingText.value.trim() !== "" && Number.isFinite(n) && n >= 0 && n <= 100;
});
const menuStartValid = computed(() => {
  const n = Number(menuStartText.value);
  return menuStartText.value.trim() !== "" && Number.isFinite(n) && n >= 0 && n <= 100;
});
const barPercent = computed(() => Math.max(0, Math.min(100, run.value?.level ?? 0)));
const knownLimit = computed(() => limit.value ?? (limitSaved.value ? limitFound.value : null));
const maxAfter = computed(() => {
  const ddc = maxPickable(limit.value ?? limitFound.value, stepSize.value);
  return readings.value.length >= 2 ? ddcToMenu(ddc, readings.value) : ddc;
});
const thirdPoint = computed(() => {
  const point = thirdReadingPoint(knownLimit.value, stepSize.value);
  if (point === null || readings.value.length < 2 || readings.value.length > 2) return null;
  const top = Math.max(...readings.value.map(r => Number(r.ddc)));
  return point > top ? point : null;
});
const menuAtStartLine = computed(() => {
  const menu = run.value?.menuAtStart;
  if (menu == null) return "";
  const ddc = menuToDdc(menu, readings.value);
  const about = ddc == null ? "" : ` (about Calvin ${ddc})`;
  return `${props.screenName} was at menu ${menu} when you started${about}. Calvin stays at or below that.`;
});
const readingsLine = computed(() => {
  const n = readings.value.length;
  if (n >= 2) return `Your ${n} readings are saved, so the menu match is kept.`;
  if (n === 1) {
    return "Your 1 reading is saved. A menu match needs 2, so the slider stays on Calvin's scale.";
  }
  return "No readings were saved, so the slider stays on Calvin's scale.";
});
const logLines = computed(() =>
  (run.value?.log ?? []).map(entry => `${entry.level ?? ""} · ${entry.note ?? ""}`.trim())
);
const faultAction = computed(() => {
  const name = props.screenName;
  if (view.value === "power-ended") return `Calvin dimmed ${name} to ${CHECK_FLOOR} and stopped.`;
  if (step.value < 4) {
    return `Calvin is dimming ${name} to ${CHECK_FLOOR} and waiting for the power to settle.`;
  }
  return `Calvin is stepping ${name} back down.`;
});

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
// The step that has been asked for and not answered yet.
const inFlightStep = ref(null);
const inFlight = computed(() => inFlightStep.value !== null);

function expectResult(name, value) {
  awaiting = {
    step: name,
    value: value ?? null,
    baseline: stepStamp(run.value?.steps?.[name]),
  };
  inFlightStep.value = name;
}
function clearAwaiting() {
  awaiting = null;
  inFlightStep.value = null;
}

// Ask the agent for a step: start the session, or move the running one.
async function go(name, value) {
  const current = run.value;
  if (current?.active && check.ownsRun.value) {
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
    runStartedMs.value = Date.now();
  }
  expectResult(name, value);
  return true;
}

async function startDetect() {
  step.value = 1;
  view.value = "step";
  detected.value = false;
  await go("detect");
}
let writeAgain = 0;
async function startWrite(again = false) {
  step.value = 2;
  const wasReady = answerReady.value;
  answerReady.value = false;
  const start = effectiveStart.value;
  writeFrom.value = start;
  writeTo.value = Math.max(0, start - 10);
  // The kiosk ignores a repeat of the same step and value, so "Show me again"
  // alternates the target it sends.
  let value;
  if (again) {
    const targets = writeTargets(start);
    value = targets[writeAgain % 2];
    writeAgain += 1;
  }
  const ok = await go("write", value);
  if (!ok) answerReady.value = wasReady;
}
async function nextFromFound(saveMenu = true) {
  if (!startKnown.value && saveMenu && menuStartValid.value) {
    const saved = await check.recordMenuAtStart(Number(menuStartText.value));
    if (!saved) return;
  }
  await startWrite();
}
// Asks the screen to sit at a Calvin value so the owner can read its menu.
async function askPoint(point) {
  step.value = 3;
  const previous = pointReady.value;
  pointReady.value = null;
  readingText.value = "";
  pendingPoint.value = point;
  const current = run.value;
  if (
    current?.active &&
    check.ownsRun.value &&
    current.step === "conversion" &&
    current.value === point &&
    current.steps?.conversion?.status === "done"
  ) {
    // Already at this point (a reading was removed and asked for again).
    pointReady.value = point;
    return;
  }
  const ok = await go("conversion", point);
  if (!ok) pointReady.value = previous;
}
function enterStep3() {
  step.value = 3;
  if (readings.value.length === 0) return askPoint(effectiveStart.value);
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
  clearAwaiting();
  if (step.value === 3) enterStep3();
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
  enterStep3();
}

function saveReading(ddc = Number(pendingPoint.value)) {
  if (!readingValid.value) return;
  const menu = Number(readingText.value);
  const others = readings.value.filter(point => Number(point.ddc) !== ddc);
  const next = [...others, { ddc, menu }].sort((a, b) => a.ddc - b.ddc);
  emit("patch", { brightnessConversion: next });
  readingText.value = "";
}
function removeReading(index) {
  emit("patch", { brightnessConversion: readings.value.filter((_, i) => i !== index) });
}
async function typeAgain() {
  if (readingValid.value) return saveReading(Number(lastReading.value.ddc));
  await nextTick();
  readingInput.value?.focus();
}
function skipReading() {
  if (thirdFromFinish.value) {
    thirdFromFinish.value = false;
    pointReady.value = null;
    view.value = "finish";
    return;
  }
  goStep4();
}
async function addThird() {
  const point = thirdPoint.value;
  if (point == null) return;
  thirdFromFinish.value = view.value === "finish";
  view.value = "step";
  await askPoint(point);
}
// A third reading taken from the finish screen goes back there once it fits.
watch(
  () => [readings.value, pointReady.value],
  () => {
    if (!thirdFromFinish.value || pointReady.value == null) return;
    const saved = readings.value.some(r => Number(r.ddc) === pointReady.value);
    if (saved && !outlier.value) {
      thirdFromFinish.value = false;
      pointReady.value = null;
      view.value = "finish";
    }
  }
);

// A found limit is only a proposal: a report can be forged on the LAN, so it
// takes effect only when the owner saves it. The old limit stays until then.
// A calibration fault offers its own limit the same way.
async function saveLimit() {
  if (pendingLimit.value == null) return;
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
      status: "Check ended · no brightness control",
      closeFirst: true,
      text: `Not available: ${name}'s screen doesn't answer brightness commands (DDC/CI).`,
      hint: "Often the adapter or cable doesn't carry DDC, or DDC/CI is off in the screen's menu.",
    },
    "no-writes": {
      tone: "err",
      status: "Check ended · brightness commands don't take effect",
      closeFirst: true,
      text: "Not available: brightness commands reach the screen but don't change it.",
    },
    timeout: {
      tone: "warn",
      status: "Check ended · timed out",
      text: "The check timed out. Nothing was left changed.",
    },
    interrupted: {
      tone: "warn",
      status: `Check ended · ${name} restarted`,
      text: `${name} restarted. That's the limit at work. If it comes back, check its Display check line for the result.`,
    },
    error: {
      tone: "err",
      status: "Check ended",
      text: detail || "The check couldn't finish.",
    },
    stopped: {
      tone: "warn",
      status: "Check stopped",
      text: startKnown.value
        ? `The check was stopped. ${name} is going back to its brightness.`
        : `The check was stopped. ${name} stays at ${CHECK_FLOOR}. Set its brightness with the slider or its own menu.`,
    },
    gone: {
      tone: "warn",
      status: "Check ended",
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
    case "detect": {
      if (failed) return end("no-ddc");
      foundText.value = result.detail || result.info?.model || "a display";
      placeholderReads.value = Boolean(result.info?.placeholderReads);
      const start = run.value?.start;
      startKnown.value = start ? Boolean(start.known) : !placeholderReads.value;
      startLevel.value = start?.level ?? settings.value.brightness ?? null;
      detected.value = true;
      step.value = 1;
      return;
    }
    case "write":
      if (failed) return end("no-writes");
      answerReady.value = true;
      return;
    case "conversion":
      if (failed) return end("error", result.detail);
      pointReady.value = result.value ?? asked;
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
function onRunEnded(current) {
  if (handled.has(current.id)) return;
  handled.add(current.id);
  clearAwaiting();
  if (current.status === "asleep") {
    view.value = "asleep";
    return;
  }
  if (view.value === "finish") return;
  if (current.reason === "power_at_idle") {
    view.value = "idle";
    return;
  }
  if (current.status === "error" && current.reason === "power_trouble") {
    view.value = "power-ended";
    return;
  }
  if (current.status === "timeout") return end("timeout");
  if (current.status === "interrupted") return end("interrupted");
  if (current.status === "error") {
    return current.step === "detect" ? end("no-ddc") : end("error", current.detail);
  }
  if (current.status === "stopped" && view.value === "step") end("stopped");
}

function onRun(current) {
  if (!current || current.id !== currentRunId) return;
  if (current.preflight?.status === "fault" && view.value === "step") {
    clearAwaiting();
    view.value = "idle";
    handled.add(current.id);
    return;
  }
  if (!current.active) return onRunEnded(current);
  if (!awaiting) return;
  const result = current.steps?.[awaiting.step];
  if (!result || stepStamp(result) === awaiting.baseline) return;
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

// --- what the dialog shows --------------------------------------------------

const stoppingSafely = computed(
  () => fault.value && check.isActive.value && step.value < 4 && view.value === "step"
);
const floorPhase = computed(() => {
  const level = run.value?.level;
  return level == null || level > CHECK_FLOOR;
});
const preflightLeft = computed(() =>
  Math.max(0, PREFLIGHT_S - Math.floor((nowMs.value - runStartedMs.value) / 1000))
);

const state = computed(() => {
  if (["readonly", "asleep", "idle", "power-ended", "end", "finish"].includes(view.value)) {
    return view.value;
  }
  if (stoppingSafely.value) return "stopping";
  if (step.value === 1) {
    if (!detected.value) return preflightClean.value ? "asking" : "preflight";
    return startKnown.value ? "found-known" : "found-unknown";
  }
  if (step.value === 2) {
    if (answerReady.value) return "question";
    return !startKnown.value && floorPhase.value ? "floor" : "testing";
  }
  if (step.value === 3) {
    const n = readings.value.length;
    if (inFlightStep.value === "conversion") return "dimming3";
    if (pointReady.value != null && !readings.value.some(r => Number(r.ddc) === pointReady.value)) {
      return "reading";
    }
    if (n === 0) return "after0";
    if (n === 1) return calibrationPoints(readings.value[0].ddc).room ? "after1" : "noroom";
    return outlier.value ? "off-line" : "matched";
  }
  return limitRunning.value ? "limit-running" : "limit-ready";
});

const skipFirst = () => ({
  label: "Skip the menu match",
  test: "check-skip",
  run: skipReading,
});
const fixLink = () => ({ label: "How to fix the power", test: "fix-link", href: HELP_URL });

const ui = computed(() => {
  const name = props.screenName;
  const n = readings.value.length;
  const point = pointReady.value;
  switch (state.value) {
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
    case "stopping":
      return { status: "Stopping safely · waiting for 5 s of clean power", busy: true };
    case "power-ended":
      if (limitSaved.value) {
        return {
          status: `Calvin stays at or below ${pendingLimit.value} on ${name}`,
          primary: { label: "Done", test: "check-done", run: close },
          secondary: [fixLink()],
        };
      }
      return {
        status: `Calibration stopped · power trouble at Calvin ${fault.value?.level}`,
        primary:
          pendingLimit.value != null
            ? {
                label: `Save ${pendingLimit.value} as ${name}'s limit`,
                test: "limit-save",
                loading: savingLimit.value,
                run: saveLimit,
              }
            : { label: "Done", test: "check-done", run: close },
        secondary:
          pendingLimit.value != null
            ? [fixLink(), { label: "Done", test: "check-done", run: close }]
            : [fixLink()],
      };
    case "end": {
      const retryItem = { label: "Try again", test: "check-retry", run: retry };
      if (ending.value.closeFirst) {
        return {
          status: ending.value.status,
          primary: { label: "Close", test: "check-close", run: close },
          secondary: [{ ...retryItem, plain: true }],
        };
      }
      return { status: ending.value.status, primary: retryItem };
    }
    case "finish": {
      if (limitFound.value != null && !limitSaved.value) {
        return {
          status: `Limit found · ${limitFound.value} is not saved yet`,
          primary: {
            label: `Save ${limitFound.value} as ${name}'s limit`,
            test: "limit-save",
            loading: savingLimit.value,
            run: saveLimit,
          },
          secondary: [{ label: "Done", test: "check-done", run: close }],
        };
      }
      const secondary = [];
      if (thirdPoint.value != null) {
        secondary.push({
          label: `Add a reading near the top (Calvin ${thirdPoint.value}) for a closer match`,
          test: "check-third",
          run: addThird,
        });
      }
      return {
        status: limitSaved.value ? `Saved · ${name} stays under its limit` : "Check finished",
        primary: { label: "Done", test: "check-done", run: close },
        secondary,
      };
    }
    case "preflight":
      return {
        status: `Checking ${name}'s power before changing anything · ${preflightLeft.value} s`,
        busy: true,
      };
    case "asking":
      return { status: `Step 1 of 3 · Asking ${name}'s screen…`, busy: true };
    case "found-known":
      return {
        status: `Step 1 of 3 · Found · ${name} is at Calvin ${startLevel.value}`,
        primary: { label: "Next", test: "check-next", run: () => nextFromFound() },
      };
    case "found-unknown":
      return {
        status: `Step 1 of 3 · Found · ${name} can't report its brightness`,
        primary: {
          label: `Next: dim to ${CHECK_FLOOR}`,
          test: "check-next",
          run: () => nextFromFound(),
        },
        secondary: [
          {
            label: "I can't reach the menu now",
            test: "menu-start-skip",
            run: () => nextFromFound(false),
          },
        ],
      };
    case "floor":
      return { status: `Step 2 of 3 · Dimming ${name} to ${CHECK_FLOOR}…`, busy: true };
    case "testing":
      return {
        status: `Step 2 of 3 · Dimming ${writeFrom.value} → ${writeTo.value} and back · about ${writeSeconds.value} s`,
        busy: true,
      };
    case "question":
      return {
        status: "Step 2 of 3 · Your answer decides whether Calvin can set the brightness",
        answers: [
          { label: "Yes, it changed", test: "writes-yes", run: () => answerWrites(true) },
          { label: "No, it looked the same", test: "writes-no", run: () => answerWrites(false) },
        ],
        secondary: [{ label: "Show me again", test: "writes-again", run: again }],
      };
    case "dimming3":
      return {
        status:
          n === 0
            ? `Reading 1 of 2 · Keeping ${name} at Calvin ${pendingPoint.value}…`
            : n === 1
              ? `1 of 2 readings · Dimming to ${pendingPoint.value}…`
              : `${n} readings · Moving to Calvin ${pendingPoint.value}…`,
        busy: true,
      };
    case "reading": {
      const label =
        n === 0
          ? `Reading 1 of 2 · ${name} is at Calvin ${point}, unchanged`
          : n === 1
            ? `Reading 2 of 2 · ${name} is at Calvin ${point}`
            : `Reading 3 · ${name} is at Calvin ${point}`;
      return {
        status: label,
        field: true,
        primary: {
          label: "Save reading",
          test: "reading-save",
          disabled: !readingValid.value,
          run: () => saveReading(Number(point)),
        },
        secondary: n === 0 ? [skipFirst()] : n >= 2 ? [{ ...skipFirst(), label: "Skip" }] : [],
      };
    }
    case "after0":
      return {
        status: `Reading 1 of 2 · ${name} is at Calvin ${effectiveStart.value}`,
        primary: {
          label: "Take reading 1",
          test: "check-add",
          run: () => askPoint(effectiveStart.value),
        },
        secondary: [skipFirst()],
      };
    case "after1": {
      const second = calibrationPoints(readings.value[0].ddc).second;
      return {
        status: `1 of 2 readings · Next, Calvin dims to ${second}`,
        primary: {
          label: `Dim to ${second} for reading 2`,
          test: "check-add",
          run: () => askPoint(second),
        },
        secondary: [skipFirst()],
      };
    }
    case "noroom":
      return {
        status: `1 reading · ${name} is already at its lowest`,
        primary: { label: "Go on with 1 reading", test: "check-next", run: goStep4 },
      };
    case "matched": {
      const secondary = [];
      if (thirdPoint.value != null && limit.value != null) {
        secondary.push({
          label: `Add a reading near the top (Calvin ${thirdPoint.value}) for a closer match`,
          test: "check-third",
          run: addThird,
        });
      }
      return {
        status:
          n === 2
            ? "2 of 2 readings · enough for a menu match"
            : `${n} readings · enough for a menu match`,
        primary: { label: "Next: safe limit (optional)", test: "check-next", run: goStep4 },
        secondary,
      };
    }
    case "off-line":
      return {
        status: `${n} readings · the last one doesn't line up`,
        field: true,
        primary: { label: "Type it again", test: "check-retype", run: typeAgain },
        secondary: [
          {
            label: "Remove it",
            test: "check-remove-last",
            run: () => removeReading(n - 1),
          },
        ],
      };
    case "limit-ready":
      return {
        status: "Step 4 · optional · raises the brightness until the power shows trouble",
        primary: props.onPanel
          ? { label: "Skip, finish", test: "limit-skip", run: goFinish }
          : { label: "Start the test", test: "limit-start", run: startLimit },
        secondary: props.onPanel
          ? []
          : [{ label: "Skip, finish", test: "limit-skip", run: goFinish, plain: true }],
      };
    default: {
      const level = run.value?.level ?? 0;
      return {
        status: `Raising ${stepSize.value} every ${stepSeconds.value} s · Calvin ${level} · ${
          fault.value ? `trouble at ${fault.value.level}` : "no trouble yet"
        }`,
        busy: true,
      };
    }
  }
});

// --- open / close -----------------------------------------------------------

async function onOpen() {
  opened = true;
  phone.value = typeof window !== "undefined" && window.matchMedia?.("(max-width: 640px)").matches;
  ending.value = null;
  foundText.value = "";
  detected.value = false;
  startLevel.value = null;
  startKnown.value = true;
  menuStartText.value = "";
  answerReady.value = false;
  pointReady.value = null;
  limitRunning.value = false;
  limitFound.value = null;
  limitSaved.value = false;
  writesVerdict.value = null;
  thirdFromFinish.value = false;
  handled.clear();
  currentRunId = null;
  clearAwaiting();
  writeAgain = 0;
  pendingPoint.value = null;
  view.value = "step";
  nowMs.value = Date.now();
  runStartedMs.value = Date.now();
  clock = setInterval(() => (nowMs.value = Date.now()), 1000);
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
  if (props.startStep === "conversion") await enterStep3();
  else if (props.startStep === "limit") goStep4();
  else await startDetect();
}

async function onClosed() {
  if (!opened) return;
  opened = false;
  clearInterval(clock);
  clock = null;
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

// A limit nobody saved yet (found in step 4, or offered after a power fault):
// leaving would lose it, so ask first.
const confirmLeave = ref(false);
const unsavedLimit = computed(
  () =>
    ["finish", "power-ended"].includes(view.value) &&
    pendingLimit.value != null &&
    !limitSaved.value
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
.dcheck__bar-track {
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

.dcheck__strip-short {
  display: none;
}
.dcheck__strip-item--optional {
  border-top-style: dashed;
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
.dcheck__menu-start {
  display: flex;
  flex-direction: column;
  gap: var(--gap-2);
  font-size: var(--text-meta);
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
.dcheck__answers {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(9rem, 1fr));
  gap: var(--gap-2);
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
.dcheck__readings {
  margin: 0;
  padding: 0;
  list-style: none;
  font-size: var(--text-meta);
}
.dcheck__readings-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: var(--touch-target);
  border-bottom: 1px solid var(--line);
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
