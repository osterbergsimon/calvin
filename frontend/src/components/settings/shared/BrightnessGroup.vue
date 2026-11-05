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
        v-if="avail.action === 'check'"
        data-test="availability-action"
        @click="emit('open-check', { step: 'detect' })"
      >
        {{ avail.state === "never" ? "Check this display…" : "Check again" }}
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
            @click="emit('open-check', { step: 'conversion' })"
          >
            Match it to your screen's menu
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
            <span class="brightness-slider__limit">limit {{ unit(limit) }}</span>
          </span>
        </div>
        <p class="brightness-group__note" data-test="limit-note">
          <template v-if="limit !== null">
            You can go up to {{ unit(maxDdc) }}
            {{ fit ? `on the screen's menu (Calvin ${maxDdc})` : "(Calvin's scale)" }}. Above that
            is too close to the limit the display check found{{
              limitDate ? ` on ${limitDate}` : ""
            }}.
          </template>
          <template v-else>
            No limit found yet.
            <Button
              variant="link"
              data-test="limit-link"
              @click="emit('open-check', { step: 'limit' })"
            >
              Run the safe-limit step to find one
            </Button>
          </template>
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

    <SettingRow label="Display check" :id="rowAnchorId('brightnessLimit')">
      <template #description>
        <InlineNote data-test="check-summary">{{ summary }}</InlineNote>
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
          :min="1"
          :max="5"
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

const maxDdc = computed(() => maxPickable(limit.value, step.value));
const brightness = computed(() =>
  Math.min(maxDdc.value, props.overrides.brightness ?? firstBrightness(limit.value, step.value))
);

// The slider's own unit: the screen's menu number with a match, else Calvin's.
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
    ? `on the screen's menu · Calvin value ${shownDdc.value} · estimated`
    : "(Calvin's scale)"
);
const valueText = computed(() =>
  fit.value
    ? `${shownValue.value} on the screen's menu, Calvin value ${shownDdc.value}`
    : `${shownValue.value} on Calvin's scale`
);
const limitDate = computed(() => checkedDate(findings.value?.checkedAt));
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
  if (!props.asleep) {
    pending.value = { from, to: next };
    clearTimeout(pendingTimer);
    const ramp = Math.ceil(Math.abs(next - from) / step.value) * stepSeconds.value * 1000;
    pendingTimer = setTimeout(() => (pending.value = null), 60000 + ramp);
  }
  patch({ brightness: next });
}
onBeforeUnmount(() => clearTimeout(pendingTimer));

const brightnessNote = computed(() => {
  if (!props.online) return `Applies when ${props.screenName} is back`;
  if (props.asleep) return `Applies when ${props.screenName} wakes`;
  if (pending.value) {
    const { from, to } = pending.value;
    const where = fit.value ? " on the screen's menu" : "";
    return `Changing… ${unit(from)} → ${unit(to)}${where}, ${step.value} at a time`;
  }
  return "";
});
</script>

<style scoped>
.brightness-group {
  display: flex;
  flex-direction: column;
}
.brightness-group__title {
  margin: var(--gap-3) 0 var(--gap-1);
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
.brightness-group__speed-field {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--gap-3);
}
</style>
