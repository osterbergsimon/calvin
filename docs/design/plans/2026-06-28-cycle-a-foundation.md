# Cycle A — Design Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the reusable visual/interaction foundation (tokens, themeable fonts, the focus-light primitive, and the touch-control component kit) that the dashboard (cycle B) and Settings (cycle C) rebuilds will both consume.

**Architecture:** Pure frontend, no surface rewired and no backend changes. Extend the existing CSS-variable theming (`theme.css` + `useTheme.js`) with semantic color tokens and font-role tokens; self-host the type-theme fonts; ship four new reusable Vue components and one composable. Existing components keep working because new color tokens alias the old ones.

**Tech Stack:** Vue 3 (Composition API, `<script setup>`), Vite, Pinia, Vitest + `@vue/test-utils` (jsdom), CSS custom properties.

## Global Constraints

- **Do not change keyboard behavior** — no edits to `useKeyboardActions.js` or the action vocabulary. (Cycle A touches no input handling at all.)
- **Themeable identity** — color and type are both theme-controlled via CSS custom properties on `document.documentElement`; never hardcode a hex or a font family in a component.
- **Nordic coverage** — every shipped font face must cover Latin Extended-A (å ä ö æ ø).
- **Tabular data** — the `--font-data` face must have tabular figures.
- **Offline-first** — fonts are self-hosted woff2; no runtime CDN dependency.
- **Touch targets** — interactive controls are ≥ 44px (default 46–48px).
- **Quality floor** — preserve `:focus-visible` outlines (the 24" unit is keyboard-driven) and respect `prefers-reduced-motion`.
- **Test runner** — `npx vitest run <file>` for a single spec; tests live in `tests/unit/components/`.
- **Commit trailer** — end every commit message with:
  `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`

---

## File Structure

- `frontend/src/styles/theme.css` — **modify**: add semantic color + focus + font-role tokens; alias to existing tokens.
- `frontend/src/styles/base.css` — **create**: global `:focus-visible` + `prefers-reduced-motion` baseline.
- `frontend/src/styles/fonts.js` — **create**: imports the needed `@fontsource` weight CSS (self-hosted woff2).
- `frontend/src/assets/fonts/LICENSES/*.LICENSE` — **create**: vendored OFL-1.1 license texts.
- `frontend/package.json` — **modify**: add `@fontsource/*` font dependencies.
- `frontend/src/styles/typeThemes.js` — **create**: type-theme registry (id → font-role stacks).
- `frontend/src/composables/useTypeTheme.js` — **create**: apply/persist the selected type theme.
- `frontend/src/components/ui/FocusPanel.vue` — **create**: the focus-light primitive.
- `frontend/src/components/ui/SegmentedControl.vue` — **create**: 2–3 option touch/keyboard control.
- `frontend/src/components/ui/ToggleSwitch.vue` — **create**: boolean switch.
- `frontend/src/components/ui/SelectPill.vue` — **create**: listbox selector.
- `frontend/tests/unit/components/ui/*.spec.js` — **create**: specs for the above.
- `frontend/src/main.js` — **modify**: import `base.css` and `fonts.css`.

---

## Task 1: Semantic color + focus + font-role tokens

**Files:**
- Modify: `frontend/src/styles/theme.css`

**Interfaces:**
- Produces: CSS custom properties available app-wide — `--bg-0 --bg-1 --bg-2 --line --line-soft --ink --ink-2 --ink-3 --focus --focus-ink --focus-glow --focus-edge --ok --warn --err` and `--font-display --font-ui --font-data`. Components in later tasks consume these.

This task is CSS-only (design tokens aren't unit-testable in jsdom); verification is lint + build + the existing suite staying green.

- [ ] **Step 1: Add the new token block to `:root` (light) in `theme.css`**

Insert after the existing `:root { ... }` accent block (keep all existing tokens):

```css
:root {
  /* --- Redesign semantic tokens (light / "Paper") --- */
  --bg-0: #eef1f4;
  --bg-1: #ffffff;
  --bg-2: #ffffff;
  --line: #dde3e8;
  --line-soft: #e8edf1;
  --ink: #1b242b;
  --ink-2: #5d6b75;
  --ink-3: #93a0a9;
  --focus: #e08a1e;
  --focus-ink: #ffffff;
  --focus-glow: rgba(224, 138, 30, 0.16);
  --focus-edge: rgba(224, 138, 30, 0.5);
  --ok: #2e9e6b;
  --warn: #c8860a;
  --err: #c0392b;

  /* font roles — default = Instrument; overridden by useTypeTheme */
  --font-display: "IBM Plex Sans Condensed", system-ui, sans-serif;
  --font-ui: "IBM Plex Sans", system-ui, sans-serif;
  --font-data: "IBM Plex Mono", ui-monospace, monospace;

  /* aliases so existing components keep working */
  --bg-primary: var(--bg-1);
  --bg-secondary: var(--bg-0);
  --accent-primary: var(--focus);
}
```

- [ ] **Step 2: Add the dark ("Backlit") overrides to `.dark` in `theme.css`**

Insert inside the existing `.dark { ... }` block:

```css
.dark {
  /* --- Redesign semantic tokens (dark / "Backlit") --- */
  --bg-0: #0e1316;
  --bg-1: #151c21;
  --bg-2: #1d262d;
  --line: #27313a;
  --line-soft: #1e272e;
  --ink: #eaf0f3;
  --ink-2: #9aa7b0;
  --ink-3: #62707a;
  --focus: #f3b052;
  --focus-ink: #1a130a;
  --focus-glow: rgba(243, 176, 82, 0.2);
  --focus-edge: rgba(243, 176, 82, 0.55);
  --ok: #5bd0a0;
  --warn: #f3b052;
  --err: #ef6b5e;
}
```

- [ ] **Step 3: Verify lint + build + existing tests**

Run: `cd frontend && npx eslint src/styles/theme.css; npm run build; npx vitest run`
Expected: lint clean, build succeeds, existing suite passes (no token rename broke anything — aliases cover legacy names).

- [ ] **Step 4: Commit**

```bash
git add frontend/src/styles/theme.css
git commit -m "feat(design): add semantic color, focus, and font-role tokens

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Self-host type-theme fonts (via `@fontsource`, OFL-1.1)

**Files:**
- Modify: `frontend/package.json` (+ `package-lock.json`) — add `@fontsource/*` deps
- Create: `frontend/src/styles/fonts.js` — imports the needed weight CSS
- Create: `frontend/src/assets/fonts/LICENSES/*.LICENSE` — vendored OFL texts
- Modify: `frontend/src/main.js`

**Interfaces:**
- Produces: the font families `IBM Plex Sans`, `IBM Plex Sans Condensed`, `IBM Plex Mono`, `Space Grotesk`, `Inter`, `JetBrains Mono`, `Schibsted Grotesk` available **offline** (self-hosted, no CDN), so the `--font-*` tokens resolve to real faces.

**License note:** all seven packages are **SIL OFL-1.1**, which is GPLv3-compatible (OFL governs only the font files). `@fontsource` ships unmodified upstream builds *with* their `LICENSE`, and as npm deps they're covered by the existing frontend `license-checker` workflow. Compliance is recorded in `LICENSE_COMPATIBILITY.md` (already updated). Fonts aren't unit-testable; verification is "build succeeds + license files vendored".

- [ ] **Step 1: Install the `@fontsource` packages**

Run:

```bash
cd frontend && npm install \
  @fontsource/ibm-plex-sans @fontsource/ibm-plex-sans-condensed @fontsource/ibm-plex-mono \
  @fontsource/space-grotesk @fontsource/inter \
  @fontsource/jetbrains-mono @fontsource/schibsted-grotesk
```

Expected: packages added to `dependencies`; each present under `node_modules/@fontsource/` with a `LICENSE` file (`grep -il "Open Font License" node_modules/@fontsource/*/LICENSE` lists all seven).

- [ ] **Step 2: Confirm licenses are OFL (compliance gate)**

Run: `cd frontend && for p in ibm-plex-sans ibm-plex-sans-condensed ibm-plex-mono space-grotesk inter jetbrains-mono schibsted-grotesk; do echo -n "$p: "; node -e "console.log(require('@fontsource/'+process.argv[1]+'/package.json').license)" "$p"; done`
Expected: every line prints `OFL-1.1`. If any prints something else, **stop** and reconsider that face before proceeding.

- [ ] **Step 3: Create the font-import module**

Create `frontend/src/styles/fonts.js`. Each `@fontsource/<pkg>/<weight>.css` import pulls that weight's `@font-face` rules for **all subsets including `latin-ext`** (Nordic), with the woff2 referenced so Vite bundles them:

```js
// Self-hosted type-theme fonts (all OFL-1.1). Weights match docs/design spec §4.3.
// Instrument (default)
import "@fontsource/ibm-plex-sans/400.css";
import "@fontsource/ibm-plex-sans/500.css";
import "@fontsource/ibm-plex-sans/600.css";
import "@fontsource/ibm-plex-sans/700.css";
import "@fontsource/ibm-plex-sans-condensed/600.css";
import "@fontsource/ibm-plex-sans-condensed/700.css";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/500.css";
import "@fontsource/ibm-plex-mono/600.css";
// Marquee
import "@fontsource/space-grotesk/400.css";
import "@fontsource/space-grotesk/500.css";
import "@fontsource/space-grotesk/700.css";
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/inter/700.css";
import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/500.css";
// Station
import "@fontsource/schibsted-grotesk/400.css";
import "@fontsource/schibsted-grotesk/600.css";
import "@fontsource/schibsted-grotesk/700.css";
import "@fontsource/schibsted-grotesk/800.css";
```

- [ ] **Step 4: Vendor the OFL license texts into the distribution**

Run:

```bash
cd frontend && mkdir -p src/assets/fonts/LICENSES && \
for p in ibm-plex-sans ibm-plex-sans-condensed ibm-plex-mono space-grotesk inter jetbrains-mono schibsted-grotesk; do \
  cp "node_modules/@fontsource/$p/LICENSE" "src/assets/fonts/LICENSES/$p.LICENSE"; done && \
ls src/assets/fonts/LICENSES/
```

Expected: seven `*.LICENSE` files. (These ship with the source tree so the OFL notices travel with the fonts, satisfying OFL §; the built woff2 in `dist/` are the embedded copies.)

- [ ] **Step 5: Import the font module in `main.js`**

Add to `frontend/src/main.js`, after the existing global CSS imports:

```js
import "./styles/fonts.js";
```

- [ ] **Step 6: Verify build**

Run: `cd frontend && npm run build`
Expected: build succeeds; `dist/assets/` contains hashed `.woff2` files (Vite bundles the referenced font assets).

- [ ] **Step 7: Commit**

```bash
git add frontend/package.json frontend/package-lock.json frontend/src/styles/fonts.js frontend/src/assets/fonts/LICENSES frontend/src/main.js LICENSE_COMPATIBILITY.md
git commit -m "feat(design): self-host type-theme fonts via @fontsource (OFL-1.1)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Type-theme registry + `useTypeTheme` composable

**Files:**
- Create: `frontend/src/styles/typeThemes.js`
- Create: `frontend/src/composables/useTypeTheme.js`
- Test: `frontend/tests/unit/composables/useTypeTheme.spec.js`

**Interfaces:**
- Consumes: nothing from earlier tasks (font stacks are self-contained strings).
- Produces:
  - `typeThemes.js`: `TYPE_THEMES` (object keyed by `'instrument'|'marquee'|'station'`, each `{ display, ui, data }` CSS font-family strings), `DEFAULT_TYPE_THEME = 'instrument'`, `isTypeTheme(id) → boolean`.
  - `useTypeTheme()` → `{ current (Ref<string>), applyTypeTheme(id) → void, loadTypeTheme() → void }`. `applyTypeTheme` sets `--font-display/--font-ui/--font-data` on `document.documentElement`, updates `current`, and persists to `localStorage['calvin-type-theme']`; an unknown id falls back to `DEFAULT_TYPE_THEME`.

- [ ] **Step 1: Write the registry**

Create `frontend/src/styles/typeThemes.js`:

```js
export const TYPE_THEMES = {
  instrument: {
    display: '"IBM Plex Sans Condensed", system-ui, sans-serif',
    ui: '"IBM Plex Sans", system-ui, sans-serif',
    data: '"IBM Plex Mono", ui-monospace, monospace',
  },
  marquee: {
    display: '"Space Grotesk", system-ui, sans-serif',
    ui: '"Inter", system-ui, sans-serif',
    data: '"JetBrains Mono", ui-monospace, monospace',
  },
  station: {
    display: '"Schibsted Grotesk", system-ui, sans-serif',
    ui: '"Schibsted Grotesk", system-ui, sans-serif',
    data: '"JetBrains Mono", ui-monospace, monospace',
  },
};

export const DEFAULT_TYPE_THEME = "instrument";

export const isTypeTheme = id => Object.prototype.hasOwnProperty.call(TYPE_THEMES, id);
```

- [ ] **Step 2: Write the failing test**

Create `frontend/tests/unit/composables/useTypeTheme.spec.js`:

```js
import { describe, it, expect, beforeEach } from "vitest";
import { useTypeTheme } from "@/composables/useTypeTheme";

describe("useTypeTheme", () => {
  beforeEach(() => {
    document.documentElement.removeAttribute("style");
    localStorage.clear();
  });

  it("applies the requested theme's font roles to :root", () => {
    const { applyTypeTheme, current } = useTypeTheme();
    applyTypeTheme("marquee");
    const root = document.documentElement;
    expect(root.style.getPropertyValue("--font-display")).toContain("Space Grotesk");
    expect(root.style.getPropertyValue("--font-ui")).toContain("Inter");
    expect(root.style.getPropertyValue("--font-data")).toContain("JetBrains Mono");
    expect(current.value).toBe("marquee");
    expect(localStorage.getItem("calvin-type-theme")).toBe("marquee");
  });

  it("falls back to instrument for an unknown id", () => {
    const { applyTypeTheme, current } = useTypeTheme();
    applyTypeTheme("nonsense");
    expect(current.value).toBe("instrument");
    expect(document.documentElement.style.getPropertyValue("--font-display")).toContain("Plex Sans Condensed");
  });

  it("loadTypeTheme restores the persisted choice", () => {
    localStorage.setItem("calvin-type-theme", "station");
    const { loadTypeTheme, current } = useTypeTheme();
    loadTypeTheme();
    expect(current.value).toBe("station");
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd frontend && npx vitest run tests/unit/composables/useTypeTheme.spec.js`
Expected: FAIL — cannot resolve `@/composables/useTypeTheme`.

- [ ] **Step 4: Write the composable**

Create `frontend/src/composables/useTypeTheme.js`:

```js
import { ref } from "vue";
import { TYPE_THEMES, DEFAULT_TYPE_THEME, isTypeTheme } from "@/styles/typeThemes";

const STORAGE_KEY = "calvin-type-theme";

export function useTypeTheme() {
  const current = ref(DEFAULT_TYPE_THEME);

  const applyTypeTheme = id => {
    const themeId = isTypeTheme(id) ? id : DEFAULT_TYPE_THEME;
    const { display, ui, data } = TYPE_THEMES[themeId];
    const root = document.documentElement;
    root.style.setProperty("--font-display", display);
    root.style.setProperty("--font-ui", ui);
    root.style.setProperty("--font-data", data);
    current.value = themeId;
    try {
      localStorage.setItem(STORAGE_KEY, themeId);
    } catch {
      /* storage unavailable — non-fatal */
    }
  };

  const loadTypeTheme = () => {
    let id = DEFAULT_TYPE_THEME;
    try {
      id = localStorage.getItem(STORAGE_KEY) || DEFAULT_TYPE_THEME;
    } catch {
      /* storage unavailable */
    }
    applyTypeTheme(id);
  };

  return { current, applyTypeTheme, loadTypeTheme };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd frontend && npx vitest run tests/unit/composables/useTypeTheme.spec.js`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add frontend/src/styles/typeThemes.js frontend/src/composables/useTypeTheme.js frontend/tests/unit/composables/useTypeTheme.spec.js
git commit -m "feat(design): add type-theme registry and useTypeTheme composable

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: `FocusPanel` — the focus-light primitive

**Files:**
- Create: `frontend/src/components/ui/FocusPanel.vue`
- Test: `frontend/tests/unit/components/ui/FocusPanel.spec.js`

**Interfaces:**
- Consumes: color/focus tokens from Task 1.
- Produces: `<FocusPanel :focused="bool" :as="'section'">…</FocusPanel>`. Root element carries class `focus-panel` plus `is-focused` (when `focused`) or `is-dim` (otherwise), and `aria-current="true"` only when focused. `as` chooses the root tag (default `section`).

- [ ] **Step 1: Write the failing test**

Create `frontend/tests/unit/components/ui/FocusPanel.spec.js`:

```js
import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import FocusPanel from "@/components/ui/FocusPanel.vue";

describe("FocusPanel", () => {
  it("is lit when focused", () => {
    const w = mount(FocusPanel, { props: { focused: true }, slots: { default: "x" } });
    expect(w.classes()).toContain("is-focused");
    expect(w.classes()).not.toContain("is-dim");
    expect(w.attributes("aria-current")).toBe("true");
  });

  it("is dimmed when not focused", () => {
    const w = mount(FocusPanel, { props: { focused: false }, slots: { default: "x" } });
    expect(w.classes()).toContain("is-dim");
    expect(w.attributes("aria-current")).toBeUndefined();
  });

  it("renders the requested root tag and slot", () => {
    const w = mount(FocusPanel, { props: { as: "article" }, slots: { default: "<p>hi</p>" } });
    expect(w.element.tagName.toLowerCase()).toBe("article");
    expect(w.html()).toContain("<p>hi</p>");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run tests/unit/components/ui/FocusPanel.spec.js`
Expected: FAIL — cannot resolve `@/components/ui/FocusPanel.vue`.

- [ ] **Step 3: Write the component**

Create `frontend/src/components/ui/FocusPanel.vue`:

```vue
<template>
  <component
    :is="as"
    class="focus-panel"
    :class="focused ? 'is-focused' : 'is-dim'"
    :aria-current="focused ? 'true' : null"
  >
    <slot />
  </component>
</template>

<script setup>
defineProps({
  focused: { type: Boolean, default: false },
  as: { type: String, default: "section" },
});
</script>

<style scoped>
.focus-panel {
  background: var(--bg-1);
  border: 1px solid var(--line);
  border-radius: 18px;
  transition:
    transform 0.35s cubic-bezier(0.2, 0.7, 0.2, 1),
    box-shadow 0.35s,
    opacity 0.35s,
    filter 0.35s;
}
.focus-panel.is-focused {
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--focus) 7%, transparent), transparent 38%),
    var(--bg-2);
  border-color: var(--focus-edge);
  box-shadow:
    0 0 0 1px var(--focus-edge),
    0 18px 60px -12px var(--focus-glow),
    0 0 90px -30px var(--focus-glow);
  transform: translateY(-2px);
}
.focus-panel.is-dim {
  opacity: 0.62;
  filter: saturate(0.65) brightness(0.86);
}
@media (prefers-reduced-motion: reduce) {
  .focus-panel {
    transition: none;
  }
}
</style>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run tests/unit/components/ui/FocusPanel.spec.js`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/ui/FocusPanel.vue frontend/tests/unit/components/ui/FocusPanel.spec.js
git commit -m "feat(design): add FocusPanel focus-light primitive

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: `SegmentedControl`

**Files:**
- Create: `frontend/src/components/ui/SegmentedControl.vue`
- Test: `frontend/tests/unit/components/ui/SegmentedControl.spec.js`

**Interfaces:**
- Consumes: color/focus tokens (Task 1).
- Produces: `<SegmentedControl v-model="value" :options="[{value,label,icon?}]" :aria-label="str" />`. Renders `role="radiogroup"`; each option is a `role="radio"` button with `aria-checked`, the selected one also carrying class `on`. Clicking an option emits `update:modelValue`. Left/Up and Right/Down arrows move and emit. Only the selected button is in the tab order (roving tabindex).

- [ ] **Step 1: Write the failing test**

Create `frontend/tests/unit/components/ui/SegmentedControl.spec.js`:

```js
import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import SegmentedControl from "@/components/ui/SegmentedControl.vue";

const OPTS = [
  { value: "landscape", label: "Landscape" },
  { value: "portrait", label: "Portrait" },
];

describe("SegmentedControl", () => {
  it("marks the selected option with aria-checked and class", () => {
    const w = mount(SegmentedControl, { props: { modelValue: "landscape", options: OPTS } });
    const btns = w.findAll('[role="radio"]');
    expect(btns).toHaveLength(2);
    expect(btns[0].attributes("aria-checked")).toBe("true");
    expect(btns[0].classes()).toContain("on");
    expect(btns[1].attributes("aria-checked")).toBe("false");
  });

  it("emits update:modelValue on click", async () => {
    const w = mount(SegmentedControl, { props: { modelValue: "landscape", options: OPTS } });
    await w.findAll('[role="radio"]')[1].trigger("click");
    expect(w.emitted("update:modelValue")[0]).toEqual(["portrait"]);
  });

  it("moves selection with ArrowRight", async () => {
    const w = mount(SegmentedControl, { props: { modelValue: "landscape", options: OPTS } });
    await w.find('[role="radiogroup"]').trigger("keydown", { key: "ArrowRight" });
    expect(w.emitted("update:modelValue")[0]).toEqual(["portrait"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run tests/unit/components/ui/SegmentedControl.spec.js`
Expected: FAIL — cannot resolve the component.

- [ ] **Step 3: Write the component**

Create `frontend/src/components/ui/SegmentedControl.vue`:

```vue
<template>
  <div class="seg" role="radiogroup" :aria-label="ariaLabel" @keydown="onKey">
    <button
      v-for="(o, i) in options"
      :key="o.value"
      :ref="el => setRef(el, i)"
      type="button"
      role="radio"
      class="seg__btn"
      :class="{ on: o.value === modelValue }"
      :aria-checked="o.value === modelValue ? 'true' : 'false'"
      :tabindex="o.value === modelValue ? 0 : -1"
      @click="select(o.value)"
    >
      <span v-if="o.icon" class="seg__ic" aria-hidden="true">{{ o.icon }}</span>
      {{ o.label }}
    </button>
  </div>
</template>

<script setup>
import { ref } from "vue";

const props = defineProps({
  modelValue: { type: [String, Number], default: null },
  options: { type: Array, required: true },
  ariaLabel: { type: String, default: null },
});
const emit = defineEmits(["update:modelValue"]);

const refs = ref([]);
const setRef = (el, i) => {
  if (el) refs.value[i] = el;
};

const select = v => {
  if (v !== props.modelValue) emit("update:modelValue", v);
};

const onKey = e => {
  const idx = props.options.findIndex(o => o.value === props.modelValue);
  if (idx < 0) return;
  let n = idx;
  if (e.key === "ArrowRight" || e.key === "ArrowDown") n = (idx + 1) % props.options.length;
  else if (e.key === "ArrowLeft" || e.key === "ArrowUp")
    n = (idx - 1 + props.options.length) % props.options.length;
  else return;
  e.preventDefault();
  emit("update:modelValue", props.options[n].value);
  refs.value[n]?.focus();
};
</script>

<style scoped>
.seg {
  display: inline-flex;
  background: var(--bg-0);
  border: 1px solid var(--line);
  border-radius: 11px;
  padding: 4px;
}
.seg__btn {
  font-family: var(--font-ui);
  font-size: 14px;
  font-weight: 500;
  color: var(--ink-2);
  background: transparent;
  border: 0;
  border-radius: 8px;
  padding: 10px 18px;
  min-height: 44px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 7px;
}
.seg__btn.on {
  background: var(--focus);
  color: var(--focus-ink);
}
.seg__btn:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: 2px;
}
</style>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run tests/unit/components/ui/SegmentedControl.spec.js`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/ui/SegmentedControl.vue frontend/tests/unit/components/ui/SegmentedControl.spec.js
git commit -m "feat(design): add SegmentedControl touch/keyboard control

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: `ToggleSwitch`

**Files:**
- Create: `frontend/src/components/ui/ToggleSwitch.vue`
- Test: `frontend/tests/unit/components/ui/ToggleSwitch.spec.js`

**Interfaces:**
- Consumes: color/focus tokens (Task 1).
- Produces: `<ToggleSwitch v-model="bool" :aria-label="str" />`. Renders a `role="switch"` button with `aria-checked` reflecting the value and class `on` when true; click emits `update:modelValue` with the negated value.

- [ ] **Step 1: Write the failing test**

Create `frontend/tests/unit/components/ui/ToggleSwitch.spec.js`:

```js
import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import ToggleSwitch from "@/components/ui/ToggleSwitch.vue";

describe("ToggleSwitch", () => {
  it("reflects modelValue via aria-checked and class", () => {
    const on = mount(ToggleSwitch, { props: { modelValue: true, ariaLabel: "Split" } });
    expect(on.attributes("role")).toBe("switch");
    expect(on.attributes("aria-checked")).toBe("true");
    expect(on.classes()).toContain("on");

    const off = mount(ToggleSwitch, { props: { modelValue: false, ariaLabel: "Split" } });
    expect(off.attributes("aria-checked")).toBe("false");
    expect(off.classes()).not.toContain("on");
  });

  it("emits the negated value on click", async () => {
    const w = mount(ToggleSwitch, { props: { modelValue: false, ariaLabel: "Split" } });
    await w.trigger("click");
    expect(w.emitted("update:modelValue")[0]).toEqual([true]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run tests/unit/components/ui/ToggleSwitch.spec.js`
Expected: FAIL — cannot resolve the component.

- [ ] **Step 3: Write the component**

Create `frontend/src/components/ui/ToggleSwitch.vue`:

```vue
<template>
  <button
    type="button"
    class="tog"
    role="switch"
    :class="{ on: modelValue }"
    :aria-checked="modelValue ? 'true' : 'false'"
    :aria-label="ariaLabel"
    @click="toggle"
  />
</template>

<script setup>
const props = defineProps({
  modelValue: { type: Boolean, default: false },
  ariaLabel: { type: String, default: null },
});
const emit = defineEmits(["update:modelValue"]);
const toggle = () => emit("update:modelValue", !props.modelValue);
</script>

<style scoped>
.tog {
  width: 56px;
  height: 32px;
  border: 0;
  border-radius: 999px;
  background: var(--line);
  position: relative;
  cursor: pointer;
  transition: background 0.2s;
}
.tog::after {
  content: "";
  position: absolute;
  top: 3px;
  left: 3px;
  width: 26px;
  height: 26px;
  border-radius: 50%;
  background: #cdd6dc;
  transition: transform 0.2s;
}
.tog.on {
  background: var(--focus);
}
.tog.on::after {
  transform: translateX(24px);
  background: #fff;
}
.tog:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: 2px;
}
@media (prefers-reduced-motion: reduce) {
  .tog,
  .tog::after {
    transition: none;
  }
}
</style>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run tests/unit/components/ui/ToggleSwitch.spec.js`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/ui/ToggleSwitch.vue frontend/tests/unit/components/ui/ToggleSwitch.spec.js
git commit -m "feat(design): add ToggleSwitch control

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: `SelectPill`

**Files:**
- Create: `frontend/src/components/ui/SelectPill.vue`
- Test: `frontend/tests/unit/components/ui/SelectPill.spec.js`

**Interfaces:**
- Consumes: color/focus tokens (Task 1).
- Produces: `<SelectPill v-model="value" :options="[{value,label}]" :swatch="'--focus'?" />`. Renders a trigger button (`aria-haspopup="listbox"`, `aria-expanded`) showing the current option's label; clicking toggles a `role="listbox"` of `role="option"` items (`aria-selected` on the current). Choosing an option emits `update:modelValue` and closes the list. Optional `swatch` renders a color chip filled with the given CSS variable.

- [ ] **Step 1: Write the failing test**

Create `frontend/tests/unit/components/ui/SelectPill.spec.js`:

```js
import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import SelectPill from "@/components/ui/SelectPill.vue";

const OPTS = [
  { value: "backlit", label: "Backlit" },
  { value: "paper", label: "Paper" },
];

describe("SelectPill", () => {
  it("shows the current label and no open list initially", () => {
    const w = mount(SelectPill, { props: { modelValue: "backlit", options: OPTS } });
    expect(w.find(".pill__label").text()).toBe("Backlit");
    expect(w.find('[role="listbox"]').exists()).toBe(false);
  });

  it("opens the listbox on trigger click", async () => {
    const w = mount(SelectPill, { props: { modelValue: "backlit", options: OPTS } });
    await w.find(".pill").trigger("click");
    expect(w.find('[role="listbox"]').exists()).toBe(true);
    expect(w.findAll('[role="option"]')).toHaveLength(2);
  });

  it("emits selection and closes the listbox", async () => {
    const w = mount(SelectPill, { props: { modelValue: "backlit", options: OPTS } });
    await w.find(".pill").trigger("click");
    await w.findAll('[role="option"]')[1].trigger("click");
    expect(w.emitted("update:modelValue")[0]).toEqual(["paper"]);
    expect(w.find('[role="listbox"]').exists()).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run tests/unit/components/ui/SelectPill.spec.js`
Expected: FAIL — cannot resolve the component.

- [ ] **Step 3: Write the component**

Create `frontend/src/components/ui/SelectPill.vue`:

```vue
<template>
  <div class="pill-wrap">
    <button
      type="button"
      class="pill"
      :aria-expanded="open ? 'true' : 'false'"
      aria-haspopup="listbox"
      @click="open = !open"
    >
      <span v-if="swatch" class="pill__swatch" :style="{ background: `var(${swatch})` }" aria-hidden="true" />
      <span class="pill__label">{{ currentLabel }}</span>
      <span class="pill__cv" aria-hidden="true">▾</span>
    </button>
    <ul v-if="open" class="pill__menu" role="listbox">
      <li
        v-for="o in options"
        :key="o.value"
        role="option"
        class="pill__opt"
        :aria-selected="o.value === modelValue ? 'true' : 'false'"
        @click="choose(o.value)"
      >
        {{ o.label }}
      </li>
    </ul>
  </div>
</template>

<script setup>
import { ref, computed } from "vue";

const props = defineProps({
  modelValue: { type: [String, Number], default: null },
  options: { type: Array, required: true },
  swatch: { type: String, default: null },
});
const emit = defineEmits(["update:modelValue"]);

const open = ref(false);
const currentLabel = computed(
  () => props.options.find(o => o.value === props.modelValue)?.label ?? ""
);
const choose = v => {
  emit("update:modelValue", v);
  open.value = false;
};
</script>

<style scoped>
.pill-wrap {
  position: relative;
}
.pill {
  display: inline-flex;
  align-items: center;
  gap: 12px;
  height: 48px;
  padding: 0 16px;
  background: var(--bg-2);
  border: 1px solid var(--line);
  border-radius: 11px;
  font-family: var(--font-ui);
  font-size: 15px;
  color: var(--ink);
  cursor: pointer;
}
.pill:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: 2px;
}
.pill__swatch {
  width: 16px;
  height: 16px;
  border-radius: 5px;
}
.pill__cv {
  color: var(--ink-3);
  font-size: 12px;
}
.pill__menu {
  position: absolute;
  z-index: 20;
  top: calc(100% + 6px);
  right: 0;
  min-width: 100%;
  list-style: none;
  margin: 0;
  padding: 6px;
  background: var(--bg-1);
  border: 1px solid var(--line);
  border-radius: 12px;
  box-shadow: 0 12px 32px var(--focus-glow);
}
.pill__opt {
  padding: 12px 14px;
  min-height: 44px;
  display: flex;
  align-items: center;
  border-radius: 8px;
  color: var(--ink);
  cursor: pointer;
}
.pill__opt:hover,
.pill__opt[aria-selected="true"] {
  background: var(--bg-2);
}
</style>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run tests/unit/components/ui/SelectPill.spec.js`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/ui/SelectPill.vue frontend/tests/unit/components/ui/SelectPill.spec.js
git commit -m "feat(design): add SelectPill listbox selector

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: Global accessibility baseline

**Files:**
- Create: `frontend/src/styles/base.css`
- Modify: `frontend/src/main.js`

**Interfaces:**
- Produces: a global `:focus-visible` outline (using `--focus`) and a `prefers-reduced-motion` rule that neutralizes transitions/animations app-wide. No JS API.

CSS-only; verification is build + the existing suite staying green.

- [ ] **Step 1: Write the baseline stylesheet**

Create `frontend/src/styles/base.css`:

```css
/* Global accessibility baseline for the redesign. */

:where(button, a, input, select, textarea, [role="radio"], [role="switch"], [role="option"]):focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: 2px;
  border-radius: 4px;
}

@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.001ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.001ms !important;
    scroll-behavior: auto !important;
  }
}
```

- [ ] **Step 2: Import it in `main.js`**

Add to `frontend/src/main.js`, after the existing global CSS imports (so token files load first):

```js
import "./styles/base.css";
```

- [ ] **Step 3: Verify build + existing tests**

Run: `cd frontend && npm run build && npx vitest run`
Expected: build succeeds; full unit suite passes.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/styles/base.css frontend/src/main.js
git commit -m "feat(design): add global focus-visible and reduced-motion baseline

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage** (against `docs/design/2026-06-28-touch-visual-redesign.md` §4 Foundation / §8 cycle A):
- Semantic color + focus tokens → Task 1.
- Font-role tokens + guardrails (Nordic, tabular, self-host) → Tasks 1 (tokens) + 2 (self-hosted woff2, latin-ext subset).
- Three type themes → Tasks 2 + 3.
- Focus-light primitive → Task 4.
- Touch-control language (segmented / toggle / select pill) → Tasks 5–7. (`cbtn`/`barbtn` are simple styled buttons specific to the dashboard; deferred to cycle B where they're used, per spec §4.5.)
- Reduced-motion + focus-visible baseline → Task 8 (and per-component focus styles in 4–7).
- "No surface rewired" → confirmed: no edits to dashboard/settings/keyboard files.

**Placeholder scan:** the only non-code step is "repeat the `@font-face` pattern for every vendored weight" (Task 2 Step 3) — this is mechanical repetition of a fully-shown pattern over the concrete file list produced in Step 2, not a hidden decision. No TBDs.

**Type consistency:** `applyTypeTheme` / `loadTypeTheme` / `current` / `TYPE_THEMES` / `DEFAULT_TYPE_THEME` / `isTypeTheme` are used identically in Task 3's registry, composable, and tests. Component prop/event names (`modelValue`, `update:modelValue`, `focused`, `as`, `options`, `swatch`, `ariaLabel`) are consistent across each component and its spec.

**Deferred to later cycles (intentional):** wiring `useTypeTheme`/theme selection into the Settings UI (cycle C), promoting the live active-region highlight to `FocusPanel` and adding touch gestures/inactivity-fade (cycle B), and persisting the type-theme choice to backend config rather than localStorage (a small follow-up once the config key exists).
