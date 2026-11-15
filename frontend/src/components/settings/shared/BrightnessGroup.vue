<template>
  <div class="brightness-group" data-test="brightness-group" role="group" aria-label="Brightness">
    <h3 class="brightness-group__title">Brightness</h3>

    <SettingRow :label="rampDescriptor.label" :id="rowAnchorId('brightnessRampEnabled')">
      <template #description>
        <template v-if="avail.state !== 'ok'">
          <InlineNote data-test="availability-text">{{ avail.text }}</InlineNote>
          <InlineNote v-if="avail.hint" data-test="availability-hint">{{ avail.hint }}</InlineNote>
        </template>
        <InlineNote v-else-if="showRampOffAsleep" data-test="ramp-off-asleep-note">
          {{ screenName }} is asleep at its lowest brightness. At its next wake it brightens to
          {{ restoredLabel }} once, carefully, then Calvin stops changing its brightness.
        </InlineNote>
        <template v-else>{{ rampDescriptor.description }}</template>
      </template>
      <Button
        v-if="avail.action === 'check' && avail.state !== 'never'"
        data-test="availability-action"
        @click="emit('open-check', { step: 'detect' })"
      >
        Check again
      </Button>
      <span data-test="ramp-toggle">
        <ToggleSwitch
          :model-value="rampOn"
          :disabled="avail.disabled"
          :aria-label="rampDescriptor.label"
          @update:model-value="setRamp"
        />
      </span>
    </SettingRow>

    <SettingRow
      v-if="showSleepMode"
      :label="sleepDescriptor.label"
      :description="sleepDescriptor.description"
      :id="rowAnchorId('sleepMode')"
      data-test="sleep-mode"
    >
      <SegmentedControl
        :model-value="sleepMode"
        :options="sleepDescriptor.control.options"
        aria-label="At sleep"
        @update:model-value="value => patch({ sleepMode: value })"
      />
    </SettingRow>

    <SettingRow
      v-if="rampOn && avail.state !== 'not-cog'"
      label="Brightness"
      stacked
      :id="rowAnchorId('brightness')"
    >
      <template #description>
        <span class="brightness-group__hint"
          >Set after the screen starts and every time it wakes.</span
        >
      </template>
      <div class="brightness-slider">
        <div class="brightness-slider__value" data-test="brightness-value" aria-live="polite">
          <strong class="brightness-slider__big">{{ shownValue }}</strong>
          {{ " " }}
          <span class="brightness-slider__scale">{{ scaleLabel }}</span>
          <Button
            v-if="!fit"
            variant="link"
            data-test="match-link"
            @click="emit('open-check', { step: 'detect' })"
          >
            Match it to the panel's own menu
          </Button>
        </div>
        <div class="brightness-slider__track">
          <input
            class="brightness-slider__input"
            data-test="brightness-slider"
            type="range"
            :min="sliderMin"
            :max="sliderMax"
            step="1"
            :value="draft ?? sliderValue"
            :style="{ flexGrow: Math.max(1, sliderMax - sliderMin) }"
            aria-label="Brightness"
            :aria-valuetext="valueText"
            @input="onInput"
            @change="commit"
            @keyup="onKeyup"
          />
          <span
            v-if="limit !== null"
            class="brightness-slider__hatch"
            data-test="limit-hatch"
            :style="{ flexGrow: hatchGrow }"
            aria-hidden="true"
          >
            <span class="brightness-slider__limit">highest {{ unit(limit) }}</span>
          </span>
        </div>
        <p class="brightness-group__note" data-test="limit-note">
          <template v-if="limit !== null"> Calvin never goes above your highest level. </template>
          <template v-else>
            No limit found yet.
            <Button
              variant="link"
              data-test="limit-link"
              @click="emit('open-check', { step: 'detect' })"
            >
              Run the display check to set one
            </Button>
          </template>
          <Button
            v-if="hasCalibration"
            variant="link"
            data-test="calibration-clear"
            @click="
              patch({ brightnessConversion: null, brightnessLimit: null, brightnessFloor: null })
            "
          >
            Clear calibration
          </Button>
        </p>
        <p
          v-if="brightnessNote"
          class="brightness-group__note"
          data-test="brightness-note"
          role="status"
          aria-live="polite"
        >
          {{ brightnessNote }}
        </p>
      </div>
    </SettingRow>

    <SettingRow
      v-if="showLevels"
      label="Highest and lowest"
      :id="rowAnchorId('brightnessFloor')"
      data-test="levels-row"
    >
      <template #description>
        <InlineNote data-test="levels-summary">
          Highest {{ unit(limit) }} · Lowest {{ unit(floor ?? 0) }} ·
          {{ fit ? "panel's own menu" : "Calvin's scale" }}
        </InlineNote>
      </template>
      <Button
        variant="link"
        data-test="levels-change"
        :aria-expanded="levelsOpen ? 'true' : 'false'"
        @click="toggleLevels"
      >
        Change
      </Button>
    </SettingRow>
    <div v-if="showLevels && levelsOpen" class="brightness-group__speed" data-test="levels-editor">
      <div class="brightness-group__speed-field">
        <span>Highest</span>
        <span class="brightness-group__level">
          <span v-if="fit" class="brightness-group__calvin" data-test="highest-calvin"
            >Calvin {{ highestDdc }}</span
          >
          <NumberStepper
            data-test="highest-stepper"
            :model-value="highestShown"
            :min="unit(0)"
            :max="unit(100)"
            :step="1"
            aria-label="Highest"
            @update:model-value="setHighest"
          />
        </span>
      </div>
      <div v-if="raising" class="brightness-group__raise" data-test="raise-warning">
        <InlineNote v-if="raiseTrouble" tone="err" data-test="raise-trouble">
          {{ raiseTrouble }}. At this level the Pi can crash and may not start again until the
          panel's USB is unplugged. Only the display check proves a level works.
        </InlineNote>
        <InlineNote v-else tone="warn">
          Above your highest level ({{ unit(limit) }}). Too bright can cut the power, sometimes only
          under load or at start-up. Only the display check proves a level works.
        </InlineNote>
        <div class="brightness-group__actions">
          <Button data-test="raise-cancel" @click="highestDraft = null">
            Keep {{ unit(limit) }}
          </Button>
          <Button data-test="raise-check" @click="emit('open-check', { step: 'detect' })">
            Run the display check
          </Button>
          <Button
            :variant="raiseTrouble ? 'danger' : 'ghost'"
            data-test="raise-confirm"
            @click="confirmRaise"
          >
            Raise to {{ highestShown }}
          </Button>
        </div>
      </div>
      <div class="brightness-group__speed-field">
        <span>Lowest</span>
        <span class="brightness-group__level">
          <span v-if="fit" class="brightness-group__calvin" data-test="lowest-calvin"
            >Calvin {{ floor ?? 0 }}</span
          >
          <NumberStepper
            data-test="lowest-stepper"
            :model-value="lowestShown"
            :min="unit(0)"
            :max="unit(lowestCap)"
            :step="1"
            aria-label="Lowest"
            @update:model-value="setLowest"
          />
        </span>
      </div>
      <InlineNote>
        Lowering applies at once. Lowest stays at or below your everyday level, and a lower Highest
        brings everyday down with it.
      </InlineNote>
    </div>

    <SettingRow label="Display check" :id="rowAnchorId('brightnessLimit')">
      <template #description>
        <InlineNote data-test="check-summary">{{ summary }}</InlineNote>
        <InlineNote v-if="troubleText" tone="warn" data-test="power-trouble">
          {{ troubleText }} ·
          <ExternalLink
            class="brightness-group__fix"
            data-test="power-fix-link"
            :href="POWER_HELP_URL"
          >
            How to fix the power
          </ExternalLink>
        </InlineNote>
      </template>
      <Button data-test="check-open" @click="emit('open-check', { step: 'detect' })">
        Check this display…
      </Button>
    </SettingRow>

    <SettingRow v-if="rampOn" label="Ramp speed" data-test="ramp-speed-row">
      <template #description>
        <InlineNote data-test="ramp-speed">
          {{ step }} every {{ stepSeconds }} s · {{ paceNote }}
        </InlineNote>
      </template>
      <Button
        variant="link"
        data-test="ramp-speed-change"
        :aria-expanded="speedOpen ? 'true' : 'false'"
        @click="speedOpen = !speedOpen"
      >
        Change
      </Button>
    </SettingRow>
    <div v-if="rampOn && speedOpen" class="brightness-group__speed" data-test="ramp-speed-editor">
      <label class="brightness-group__speed-field">
        <span>Step size</span>
        <NumberStepper
          :model-value="step"
          :min="1"
          :max="5"
          :step="1"
          aria-label="Step size"
          @update:model-value="value => patch({ brightnessStep: value })"
        />
      </label>
      <label class="brightness-group__speed-field">
        <span>Interval</span>
        <NumberStepper
          :model-value="stepSeconds"
          :min="0.5"
          :max="10"
          :step="0.5"
          unit=" s"
          aria-label="Interval"
          @update:model-value="value => patch({ brightnessStepSeconds: value })"
        />
      </label>
      <InlineNote tone="warn">
        Bigger steps are what reset the touch screen. Keep the default unless the check says
        otherwise.
      </InlineNote>
    </div>
  </div>
</template>

<script setup>
import ExternalLink from "@/components/ui/ExternalLink.vue";
import { computed, onBeforeUnmount, ref, watch } from "vue";
import Button from "@/components/ui/Button.vue";
import InlineNote from "@/components/ui/InlineNote.vue";
import NumberStepper from "@/components/ui/NumberStepper.vue";
import SegmentedControl from "@/components/ui/SegmentedControl.vue";
import ToggleSwitch from "@/components/ui/ToggleSwitch.vue";
import SettingRow from "@/components/settings/shell/SettingRow.vue";
import { descriptorFor, rowAnchorId } from "@/utils/screenOverrides";
import {
  availability,
  checkSummary,
  checkedDate,
  ddcToMenu,
  firstBrightness,
  fitConversion,
  maxPickable,
  menuToDdc,
  menuToDdcDown,
} from "@/utils/brightness";

// The Brightness group of Screens › {screen} › Power (calvin-29ws, docs/design/
// 2026-11-04-brightness-ramp-ui.md §2). Presentational: it reads the screen's
// overrides and the kiosk's saved display-check findings, and says what to
// change through `patch` (a key set to null is cleared). The parent saves.
const props = defineProps({
  kiosk: { type: Object, default: null },
  overrides: { type: Object, default: () => ({}) },
  screenName: { type: String, default: "This screen" },
  asleep: { type: Boolean, default: false },
  online: { type: Boolean, default: true },
});
const emit = defineEmits(["patch", "open-check"]);

const rampDescriptor = descriptorFor("brightnessRampEnabled");
const sleepDescriptor = descriptorFor("sleepMode");

const findings = computed(() => props.kiosk?.displayCheck ?? null);
const avail = computed(() => availability(props.kiosk, findings.value, props.screenName));

const rampOn = computed(() => props.overrides.brightnessRampEnabled === true);
const step = computed(() => props.overrides.brightnessStep ?? 2);
const stepSeconds = computed(() => props.overrides.brightnessStepSeconds ?? 1.5);
const limit = computed(() => props.overrides.brightnessLimit ?? null);
const readings = computed(() => props.overrides.brightnessConversion ?? []);
const fit = computed(() => fitConversion(readings.value));
const sleepMode = computed(() => props.overrides.sleepMode ?? "standby");

const maxDdc = computed(() => maxPickable(limit.value));
const brightness = computed(() =>
  Math.min(maxDdc.value, props.overrides.brightness ?? firstBrightness(limit.value, step.value))
);

// The slider's own unit: the screen's menu number with a match, else Calvin's.
const floor = computed(() => props.overrides.brightnessFloor ?? null);
const hasCalibration = computed(
  () => limit.value !== null || floor.value !== null || readings.value.length > 0
);
const unit = ddc => (fit.value ? ddcToMenu(ddc, readings.value) : ddc);
const sliderMin = computed(() => (fit.value ? unit(0) : 0));
const sliderMax = computed(() => unit(maxDdc.value));
const sliderValue = computed(() => unit(brightness.value));
const hatchGrow = computed(() =>
  limit.value === null ? 0 : Math.max(1, unit(limit.value) - sliderMax.value)
);

const draft = ref(null);
const shownValue = computed(() => draft.value ?? sliderValue.value);
const shownDdc = computed(() =>
  draft.value === null || !fit.value
    ? (draft.value ?? brightness.value)
    : menuToDdc(draft.value, readings.value)
);
const scaleLabel = computed(() =>
  fit.value
    ? `on the panel's own menu · Calvin value ${shownDdc.value} · estimated`
    : "(Calvin's scale)"
);
const valueText = computed(() =>
  fit.value
    ? `${shownValue.value} on the panel's own menu, Calvin value ${shownDdc.value}`
    : `${shownValue.value} on Calvin's scale`
);
const POWER_HELP_URL = "https://osterbergsimon.github.io/calvin/setup/KIOSK_POWER/";
// Power trouble a check saw (calvin-c805): kept until a later clean check clears it.
const troubleText = computed(() => {
  const trouble = findings.value?.powerTrouble;
  if (!trouble) return "";
  const when = checkedDate(trouble.at);
  let where = trouble.level == null ? "at idle" : `at Calvin ${trouble.level}`;
  if ((trouble.step === "read" || trouble.step === "detect") && trouble.level == null) {
    // The panel was set with its own buttons; Calvin's level is not where it happened.
    where =
      trouble.panelLevel == null
        ? "while set with the panel's buttons"
        : `while set with the panel's buttons (panel ${trouble.panelLevel})`;
  }
  return `Power trouble ${where}${when ? ` (${when})` : ""}`;
});
const summary = computed(() => checkSummary(findings.value, readings.value, limit.value));

const showSleepMode = computed(() => !avail.value.disabled || sleepMode.value !== "standby");
const paceNote = computed(() =>
  step.value === 2 && stepSeconds.value === 1.5
    ? "the pace that worked on this screen"
    : "your pace"
);
const speedOpen = ref(false);

function patch(change) {
  emit("patch", change);
}

function setRamp(value) {
  if (value && avail.value.state === "never") {
    emit("open-check", { step: "detect", enableAfter: true });
    return;
  }
  if (avail.value.disabled) return;
  if (value) {
    const next = { brightnessRampEnabled: true };
    if (props.overrides.brightness === undefined || props.overrides.brightness === null) {
      next.brightness = firstBrightness(limit.value, step.value);
    }
    patch(next);
    return;
  }
  if (props.asleep) turnedOffAsleep.value = true;
  patch({ brightnessRampEnabled: false });
}

// "Ramp turned off while the screen sleeps": the one last careful step-up.
const turnedOffAsleep = ref(false);
const showRampOffAsleep = computed(() => turnedOffAsleep.value && props.asleep && !rampOn.value);
const restoredLabel = computed(() => unit(brightness.value));
watch(
  () => props.asleep,
  asleep => {
    if (!asleep) turnedOffAsleep.value = false;
  }
);

function onInput(event) {
  const value = Number(event.target.value);
  if (Number.isFinite(value)) draft.value = value;
}
function onKeyup(event) {
  // Arrow keys fire `input` per press and `change` on some engines only when
  // the key is released: commit on key-up so a keyboard user still saves once.
  if (event.key.startsWith("Arrow") || event.key === "Home" || event.key === "End") commit();
}

// "Changing…" lasts as long as the agent needs: its config poll (60 s) plus
// the ramp itself. The agent does not report the live level back yet.
const pending = ref(null);
let pendingTimer = null;
function commit() {
  if (draft.value === null) return;
  const ddc = fit.value ? menuToDdc(draft.value, readings.value) : draft.value;
  const next = Math.max(0, Math.min(maxDdc.value, ddc));
  const from = brightness.value;
  draft.value = null;
  if (next === from) return;
  showChanging(from, next);
  patch({ brightness: next });
}
function showChanging(from, to) {
  if (props.asleep) return;
  pending.value = { from, to };
  clearTimeout(pendingTimer);
  const ramp = Math.ceil(Math.abs(to - from) / step.value) * stepSeconds.value * 1000;
  pendingTimer = setTimeout(() => (pending.value = null), 60000 + ramp);
}
onBeforeUnmount(() => clearTimeout(pendingTimer));

// Highest and Lowest (calvin-hts5): edited here without a new display check, in
// the panel's menu numbers when a match exists. Lowering saves at once; raising
// waits for a confirm, because a level that looks fine can still cut the power
// (calvin-qyb3). Editing never makes Calvin write a level above the current one.
const showLevels = computed(() => limit.value !== null);
const levelsOpen = ref(false);
// The typed (stepped) number, kept while the editor is open so a panel number
// that rounds to the same Calvin value doesn't snap back.
const highestDraft = ref(null);
const lowestDraft = ref(null);
function toggleLevels() {
  levelsOpen.value = !levelsOpen.value;
  highestDraft.value = null;
  lowestDraft.value = null;
}
const clampDdc = n => Math.max(0, Math.min(100, n));
// Highest is rounded down: it must never come out above what was asked for.
const highestToDdc = value =>
  fit.value ? (menuToDdcDown(value, readings.value) ?? limit.value) : clampDdc(value);
const highestShown = computed(() => highestDraft.value ?? unit(limit.value));
const highestDdc = computed(() =>
  highestDraft.value === null ? limit.value : highestToDdc(highestDraft.value)
);
const raising = computed(() => highestDdc.value > limit.value);
// Lowest never sits above the everyday level: the agent ramps to at least the
// floor, so a floor above it would brighten the screen.
const lowestCap = computed(() =>
  Math.min(limit.value, Math.max(brightness.value, floor.value ?? 0))
);
const lowestShown = computed(() => lowestDraft.value ?? unit(floor.value ?? 0));

function setHighest(value) {
  highestDraft.value = value;
  const next = highestToDdc(value);
  if (next >= limit.value) return; // the same level, or a raise waiting for a confirm
  const change = { brightnessLimit: next };
  if (brightness.value > next) {
    change.brightness = next;
    showChanging(brightness.value, next);
  }
  if (floor.value !== null && floor.value > next) change.brightnessFloor = next;
  patch(change);
}
function confirmRaise() {
  const change = { brightnessLimit: highestDdc.value };
  // An unset everyday level would follow the agent's default up to the new limit.
  if (props.overrides.brightness === undefined || props.overrides.brightness === null) {
    change.brightness = brightness.value;
  }
  highestDraft.value = null;
  patch(change);
}
function setLowest(value) {
  const ddc = fit.value ? (menuToDdc(value, readings.value) ?? 0) : value;
  const next = Math.max(0, Math.min(lowestCap.value, ddc));
  lowestDraft.value = next === ddc ? value : unit(next);
  if (next !== (floor.value ?? 0)) patch({ brightnessFloor: next });
}
// A level changed elsewhere (a new check, Clear calibration) drops the drafts.
watch(limit, value => {
  if (highestDraft.value !== null && highestToDdc(highestDraft.value) !== value) {
    highestDraft.value = null;
  }
});
watch(floor, value => {
  if (lowestDraft.value === null) return;
  const ddc = fit.value ? menuToDdc(lowestDraft.value, readings.value) : lowestDraft.value;
  if (ddc !== value) lowestDraft.value = null;
});

// Power trouble at or below the level being raised to (calvin-qyb3).
const raiseTrouble = computed(() => {
  const trouble = findings.value?.powerTrouble;
  if (!raising.value || !trouble) return "";
  const when = checkedDate(trouble.at);
  const on = when ? ` (${when})` : "";
  if (trouble.level != null) {
    return highestDdc.value >= trouble.level ? `Power trouble at Calvin ${trouble.level}${on}` : "";
  }
  if (trouble.panelLevel != null && fit.value) {
    return highestShown.value >= trouble.panelLevel
      ? `Power trouble at panel ${trouble.panelLevel}${on}`
      : "";
  }
  return "";
});

const brightnessNote = computed(() => {
  if (!props.online) return `Applies when ${props.screenName} is back`;
  if (props.asleep) return `Applies when ${props.screenName} wakes`;
  if (pending.value) {
    const { from, to } = pending.value;
    const where = fit.value ? " on the panel's own menu" : "";
    return `Changing… ${unit(from)} → ${unit(to)}${where}, ${step.value} at a time`;
  }
  return "";
});
</script>

<style scoped>
.brightness-group__fix {
  color: inherit;
  text-decoration: underline;
}
.brightness-group {
  display: flex;
  flex-direction: column;
}
.brightness-group__title {
  margin: var(--gap-3) 0 var(--gap-1);
  padding: 0 var(--gap-4);
  font-size: var(--text-meta);
  font-weight: var(--weight-strong);
  color: var(--ink-2);
}
.brightness-group__hint,
.brightness-group__note {
  margin: 0;
  font-size: var(--text-meta);
  color: var(--ink-2);
}
.brightness-slider {
  display: flex;
  flex-direction: column;
  gap: var(--gap-2);
  width: 100%;
}
.brightness-slider__value {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: var(--gap-2);
}
.brightness-slider__big {
  font-size: var(--text-display);
  font-family: var(--font-data);
}
.brightness-slider__scale {
  font-size: var(--text-meta);
  color: var(--ink-2);
}
.brightness-slider__track {
  display: flex;
  align-items: center;
  min-height: var(--touch-target);
}
.brightness-slider__input {
  flex-basis: 0;
  min-width: 0;
  height: var(--touch-target);
  margin: 0;
  accent-color: var(--focus);
}
.brightness-slider__hatch {
  position: relative;
  flex-basis: 0;
  min-width: 1.5rem;
  height: 0.375rem;
  border-right: 2px solid var(--err);
  background: repeating-linear-gradient(
    45deg,
    var(--bg-2),
    var(--bg-2) 3px,
    var(--line) 3px,
    var(--line) 6px
  );
}
.brightness-slider__limit {
  position: absolute;
  right: 0;
  top: 0.75rem;
  font-family: var(--font-data);
  font-size: var(--text-meta);
  color: var(--err-text);
  white-space: nowrap;
}
.brightness-group__speed {
  display: flex;
  flex-direction: column;
  gap: var(--gap-2);
  padding: var(--gap-2) var(--gap-4) var(--gap-3);
}
.brightness-group__level {
  display: inline-flex;
  align-items: center;
  gap: var(--gap-inline);
}
.brightness-group__calvin {
  font-family: var(--font-data);
  font-size: var(--text-meta);
  color: var(--ink-2);
}
.brightness-group__raise {
  display: flex;
  flex-direction: column;
  gap: var(--gap-2);
}
.brightness-group__actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--gap-inline);
}
.brightness-group__speed-field {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--gap-3);
}
</style>
