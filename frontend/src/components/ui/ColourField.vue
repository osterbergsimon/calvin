<template>
  <div ref="rootEl" class="colour-field" :class="{ 'colour-field--compact': compact }">
    <template v-if="compact">
      <Popover v-model="open" :label="label" role="dialog" haspopup="dialog" @close="open = false">
        <template #trigger="{ attrs }">
          <button
            type="button"
            class="colour-field__trigger"
            :aria-label="`${label}: ${chosenName}`"
            v-bind="attrs"
          >
            <span class="colour-field__dot" :style="{ background: chosenBackground }" />
            <span class="colour-field__trigger-label">{{ chosenName }}</span>
            <span class="colour-field__chevron" aria-hidden="true">▾</span>
          </button>
        </template>

        <div class="colour-field__picker">
          <div class="colour-field__swatches" role="radiogroup" :aria-label="label">
            <label
              v-for="swatch in resolvedSwatches"
              :key="swatch.token || swatch.hex"
              class="colour-field__swatch"
              :class="{ 'colour-field__swatch--selected': isSelected(swatch) }"
            >
              <input
                class="colour-field__radio"
                type="radio"
                :name="groupName"
                :value="swatch.hex"
                :checked="isSelected(swatch)"
                @change="choose(swatch)"
              />
              <span
                class="colour-field__dot colour-field__dot--choice"
                :style="{ background: swatchBackground(swatch) }"
                aria-hidden="true"
              />
              <span class="colour-field__sr">{{ swatch.name }}</span>
            </label>
          </div>
          <Button size="sm" :aria-expanded="customOpen ? 'true' : 'false'" @click="toggleCustom">
            Custom…
          </Button>
          <div v-if="customOpen" class="colour-field__custom">
            <div
              class="colour-field__swatches colour-field__swatches--grid"
              role="radiogroup"
              aria-label="More colours"
            >
              <label
                v-for="swatch in moreColours"
                :key="swatch.hex"
                class="colour-field__swatch"
                :class="{ 'colour-field__swatch--selected': isSelected(swatch) }"
              >
                <input
                  class="colour-field__radio"
                  type="radio"
                  :name="`${groupName}-more`"
                  :value="swatch.hex"
                  :checked="isSelected(swatch)"
                  @change="choose(swatch)"
                />
                <span
                  class="colour-field__dot colour-field__dot--choice"
                  :style="{ background: swatch.hex }"
                  aria-hidden="true"
                />
                <span class="colour-field__sr">{{ swatch.name }}</span>
              </label>
            </div>
            <TextField
              v-model="code"
              label="Colour code"
              placeholder="#4caf50"
              :maxlength="7"
              :error="codeError"
              @keydown.enter.prevent="applyCode"
              @blur="applyCode"
            />
          </div>
        </div>
      </Popover>
    </template>

    <template v-else>
      <span :id="labelId" class="colour-field__label">{{ label }}</span>
      <div class="colour-field__swatches" role="radiogroup" :aria-labelledby="labelId">
        <label
          v-for="swatch in resolvedSwatches"
          :key="swatch.token || swatch.hex"
          class="colour-field__swatch"
          :class="{ 'colour-field__swatch--selected': isSelected(swatch) }"
        >
          <input
            class="colour-field__radio"
            type="radio"
            :name="groupName"
            :value="swatch.hex"
            :checked="isSelected(swatch)"
            @change="choose(swatch)"
          />
          <span
            class="colour-field__dot colour-field__dot--choice"
            :style="{ background: swatchBackground(swatch) }"
            aria-hidden="true"
          />
          <span class="colour-field__sr">{{ swatch.name }}</span>
        </label>
      </div>
      <div class="colour-field__chosen" aria-live="polite">
        <span
          class="colour-field__dot"
          :style="{ background: chosenBackground }"
          aria-hidden="true"
        />
        <span>{{ chosenName }}</span>
      </div>
      <div>
        <Button size="sm" :aria-expanded="customOpen ? 'true' : 'false'" @click="toggleCustom">
          Custom…
        </Button>
      </div>
      <div v-if="customOpen" class="colour-field__custom">
        <div
          class="colour-field__swatches colour-field__swatches--grid"
          role="radiogroup"
          aria-label="More colours"
        >
          <label
            v-for="swatch in moreColours"
            :key="swatch.hex"
            class="colour-field__swatch"
            :class="{ 'colour-field__swatch--selected': isSelected(swatch) }"
          >
            <input
              class="colour-field__radio"
              type="radio"
              :name="`${groupName}-more`"
              :value="swatch.hex"
              :checked="isSelected(swatch)"
              @change="choose(swatch)"
            />
            <span
              class="colour-field__dot colour-field__dot--choice"
              :style="{ background: swatch.hex }"
              aria-hidden="true"
            />
            <span class="colour-field__sr">{{ swatch.name }}</span>
          </label>
        </div>
        <TextField
          v-model="code"
          label="Colour code"
          placeholder="#4caf50"
          :maxlength="7"
          :error="codeError"
          @keydown.enter.prevent="applyCode"
          @blur="applyCode"
        />
      </div>
    </template>

    <p v-if="hint" class="colour-field__hint">{{ hint }}</p>
  </div>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from "vue";
import Button from "./Button.vue";
import Popover from "./Popover.vue";
import TextField from "./TextField.vue";
import { MORE_COLOURS, cssColourToHex, eventSwatches } from "@/utils/themePalettes";

// The one colour control (docs/design/frontend-doctrine.md §3): the current
// theme's --event-1…8 swatches first as a native radio group, then "Custom…"
// opening Calvin's own panel (more colours + a colour code). It never opens the
// browser's colour dialog: that is browser chrome and can't be styled. It shows the chosen swatch and its name; a raw
// hex box is never the default. `compact` swaps the inline group for a trigger
// that opens the same group in a Popover (a list row has no room for eight).
let colourSeq = 0;

const props = defineProps({
  modelValue: { type: String, default: "" },
  label: { type: String, default: "Colour" },
  // [{ token?, number?, hex, name? }]; defaults to the current theme's palette.
  swatches: { type: Array, default: null },
  hint: { type: String, default: "" },
  compact: { type: Boolean, default: false },
});

const emit = defineEmits(["update:modelValue"]);

const labelId = `colour-field-label-${++colourSeq}`;
const groupName = `colour-field-${colourSeq}`;
const rootEl = ref(null);
const customOpen = ref(false);
const code = ref("");
const codeError = ref("");
const moreColours = MORE_COLOURS;
const open = ref(false);
const revision = ref(0);

const named = (swatch, index) => ({
  token: swatch.token || null,
  number: swatch.number || index + 1,
  hex: cssColourToHex(swatch.hex || swatch) || "",
  name: swatch.name || `Theme colour ${swatch.number || index + 1}`,
});

const resolvedSwatches = computed(() => {
  // Touch the revision so a theme switch recomputes the palette.
  revision.value;
  const source =
    props.swatches ||
    eventSwatches(
      rootEl.value || (typeof document === "undefined" ? null : document.documentElement)
    );
  return source.map(named).filter(swatch => swatch.hex);
});

const normalisedValue = computed(() => cssColourToHex(props.modelValue) || "");
const selectedSwatch = computed(
  () =>
    resolvedSwatches.value.find(
      swatch => normalisedValue.value && swatch.hex === normalisedValue.value
    ) || null
);
const chosenName = computed(
  () =>
    selectedSwatch.value?.name ||
    MORE_COLOURS.find(swatch => swatch.hex === normalisedValue.value)?.name ||
    "Custom colour"
);
const chosenBackground = computed(() =>
  selectedSwatch.value
    ? swatchBackground(selectedSwatch.value)
    : safeColour(props.modelValue) || "var(--bg-2)"
);

const swatchBackground = swatch =>
  swatch.token ? `var(${swatch.token})` : safeColour(swatch.hex) || "var(--bg-2)";

// Only surfaces a real colour; never let stored data inject arbitrary CSS.
const safeColour = value => {
  const text = String(value || "").trim();
  return /^(#[0-9a-f]{3,8}|(?:rgb|rgba|hsl|hsla)\([0-9.,%\s/+-]+\))$/i.test(text) ? text : "";
};

const isSelected = swatch => Boolean(normalisedValue.value) && swatch.hex === normalisedValue.value;

function choose(swatch) {
  emit("update:modelValue", swatch.hex);
  if (props.compact) open.value = false;
}

function toggleCustom() {
  customOpen.value = !customOpen.value;
  codeError.value = "";
  code.value = customOpen.value && !selectedSwatch.value ? normalisedValue.value : "";
}

// #rgb or #rrggbb, with or without the #, case-insensitive.
function applyCode() {
  const raw = code.value.trim();
  if (!raw) return;
  const match = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(raw);
  if (!match) {
    codeError.value = "Use a colour code like #4caf50.";
    return;
  }
  const digits = match[1].toLowerCase();
  const hex = `#${digits.length === 3 ? [...digits].map(d => d + d).join("") : digits}`;
  codeError.value = "";
  if (hex === normalisedValue.value) return;
  emit("update:modelValue", hex);
  if (props.compact) nextTick(() => (open.value = false));
}

// A theme switch only changes CSS variables, not this component's props; watch
// the nearest theme root (and :root) so the swatch hexes stay in step.
let observer = null;
onMounted(() => {
  if (typeof MutationObserver !== "function") return;
  observer = new MutationObserver(() => (revision.value += 1));
  const attributes = {
    attributes: true,
    attributeFilter: ["class", "style", "data-theme", "data-mode"],
  };
  observer.observe(document.documentElement, attributes);
  const themeRoot = rootEl.value?.closest("[data-theme]");
  if (themeRoot && themeRoot !== document.documentElement) observer.observe(themeRoot, attributes);
});

onBeforeUnmount(() => observer?.disconnect());
</script>

<style scoped>
.colour-field {
  display: flex;
  flex-direction: column;
  gap: var(--gap-stack);
  min-width: 0;
}

.colour-field--compact {
  flex-direction: row;
  align-items: center;
  gap: var(--gap-inline);
}

.colour-field__label {
  font-family: var(--font-ui);
  font-size: var(--text-label);
  font-weight: var(--weight-strong);
  color: var(--ink);
}

.colour-field__swatches {
  display: flex;
  flex-wrap: wrap;
  gap: var(--gap-inline);
}

.colour-field__swatch {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: var(--touch-target);
  min-height: var(--touch-target);
  cursor: pointer;
}

.colour-field__radio {
  position: absolute;
  width: 1px;
  height: 1px;
  opacity: 0;
  pointer-events: none;
}

.colour-field__dot {
  display: inline-block;
  flex: 0 0 auto;
  width: 1rem;
  height: 1rem;
  border: 1px solid var(--line);
  border-radius: var(--radius-control);
}

.colour-field__dot--choice {
  width: 1.75rem;
  height: 1.75rem;
}

.colour-field__swatch--selected .colour-field__dot--choice {
  outline: 2px solid var(--focus);
  outline-offset: 2px;
}

.colour-field__radio:focus-visible + .colour-field__dot {
  outline: 2px solid var(--focus);
  outline-offset: 2px;
}

.colour-field__chosen {
  display: flex;
  align-items: center;
  gap: var(--gap-inline);
  font-family: var(--font-ui);
  font-size: var(--text-meta);
  color: var(--ink-2);
}

.colour-field__sr {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}

.colour-field__custom {
  display: flex;
  flex-direction: column;
  gap: var(--gap-stack);
}

/* Light, mid and deep rows of the same eight hues: keep the columns aligned
   (four per row on a phone, so each shade takes two rows). */
.colour-field__swatches--grid {
  display: grid;
  grid-template-columns: repeat(8, var(--touch-target));
}

@media (--bp-phone) {
  .colour-field__swatches--grid {
    grid-template-columns: repeat(4, var(--touch-target));
  }
}

.colour-field__trigger {
  display: inline-flex;
  align-items: center;
  gap: var(--gap-tight);
  min-height: var(--touch-target);
  max-width: 100%;
  padding: 0 var(--gap-3);
  font-family: var(--font-ui);
  font-size: var(--text-body);
  font-weight: var(--weight-strong);
  color: var(--ink);
  background: var(--bg-2);
  border: 1px solid var(--line);
  border-radius: var(--radius-control);
  cursor: pointer;
}

.colour-field__trigger:hover {
  border-color: var(--focus-edge);
}

.colour-field__trigger:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: 2px;
}

.colour-field__trigger-label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.colour-field__chevron {
  color: var(--ink-3);
  font-size: var(--text-caption);
}

.colour-field__picker {
  display: flex;
  flex-direction: column;
  gap: var(--gap-stack);
  padding: var(--gap-3);
}

.colour-field__hint {
  margin: 0;
  font-family: var(--font-ui);
  font-size: var(--text-meta);
  line-height: 1.4;
  color: var(--ink-2);
}
</style>
