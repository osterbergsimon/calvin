# IconButton Primitive Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a shared `ui/IconButton.vue` primitive so the app's scattered icon buttons have one composable, token-styled component to adopt.

**Architecture:** A single stateless `<button type="button">` presentational component. Props drive BEM-style modifier classes; all styling comes from the existing sizing/color token vocabulary in `theme.css`. Because it renders one root element, `@click` and every `aria-*` attribute fall through natively — no event/attr plumbing. No call sites are migrated in this plan (opportunistic adoption via `calvin-0wr` and follow-ups).

**Tech Stack:** Vue 3 `<script setup>`, Vite, Vitest + `@vue/test-utils`.

## Global Constraints

- Vue 3 `<script setup>` SFC; single root `<button type="button">`.
- Style ONLY via existing tokens: `--bg-2`, `--line`, `--ink`, `--ink-2`, `--focus`, `--focus-ink`, `--focus-edge`, `--err`, `--radius-sm`, `--touch-target`, `--control-height`, `--fs-xl`, `--font-ui`. No new tokens, no hardcoded colors.
- Sizes token-based (so it inherits the Settings-UI-size zoom). Borders `1px`, focus ring `2px` stay literal.
- Tests mirror `frontend/tests/unit/components/ui/*.spec.js` (vitest + `@vue/test-utils` `mount`, `@/` alias).
- Migrate ZERO call sites. Deliverable is the primitive + its tests only.
- Spec: `docs/design/2026-07-04-iconbutton-primitive.md`.

---

### Task 1: Build and unit-test `ui/IconButton.vue`

**Files:**
- Create: `frontend/src/components/ui/IconButton.vue`
- Test: `frontend/tests/unit/components/ui/IconButton.spec.js`

**Interfaces:**
- Consumes: nothing (leaf primitive).
- Produces: `IconButton` component with props `label: String (required)`, `variant: 'default'|'primary'|'ghost'|'danger' = 'default'`, `size: 'sm'|'md'|'lg' = 'sm'`, `shape: 'square'|'circle' = 'square'`, `active: Boolean = false`, `disabled: Boolean = false`; default slot for the glyph. Root classes: `icon-btn`, `icon-btn--{variant}`, `icon-btn--{size}`, `icon-btn--{shape}`, and `icon-btn--active` when `active`.

- [ ] **Step 1: Write the failing test**

Create `frontend/tests/unit/components/ui/IconButton.spec.js`:

```js
import { describe, it, expect, vi } from "vitest";
import { mount } from "@vue/test-utils";
import IconButton from "@/components/ui/IconButton.vue";

describe("IconButton", () => {
  it("renders a <button type=button> with the label as aria-label", () => {
    const w = mount(IconButton, { props: { label: "Close" } });
    expect(w.element.tagName).toBe("BUTTON");
    expect(w.attributes("type")).toBe("button");
    expect(w.attributes("aria-label")).toBe("Close");
  });

  it("applies default variant/size/shape classes", () => {
    const w = mount(IconButton, { props: { label: "x" } });
    expect(w.classes()).toEqual(
      expect.arrayContaining(["icon-btn", "icon-btn--default", "icon-btn--sm", "icon-btn--square"])
    );
    expect(w.classes()).not.toContain("icon-btn--active");
  });

  it("applies requested variant/size/shape and the active modifier", () => {
    const w = mount(IconButton, {
      props: { label: "Fullscreen", variant: "primary", size: "lg", shape: "circle", active: true },
    });
    expect(w.classes()).toEqual(
      expect.arrayContaining(["icon-btn--primary", "icon-btn--lg", "icon-btn--circle", "icon-btn--active"])
    );
  });

  it("forwards native click", async () => {
    const onClick = vi.fn();
    const w = mount(IconButton, { props: { label: "x" }, attrs: { onClick } });
    await w.trigger("click");
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("reflects disabled on the native button", () => {
    const w = mount(IconButton, { props: { label: "x", disabled: true } });
    expect(w.attributes("disabled")).toBeDefined();
  });

  it("renders default-slot content", () => {
    const w = mount(IconButton, {
      props: { label: "Close" },
      slots: { default: "<svg data-test='glyph'></svg>" },
    });
    expect(w.find("[data-test='glyph']").exists()).toBe(true);
  });

  it("passes aria-* through to the button", () => {
    const w = mount(IconButton, {
      props: { label: "More" },
      attrs: { "aria-expanded": "true", "aria-haspopup": "menu" },
    });
    expect(w.attributes("aria-expanded")).toBe("true");
    expect(w.attributes("aria-haspopup")).toBe("menu");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run tests/unit/components/ui/IconButton.spec.js`
Expected: FAIL — cannot resolve `@/components/ui/IconButton.vue` (file does not exist yet).

- [ ] **Step 3: Write the component**

Create `frontend/src/components/ui/IconButton.vue`:

```vue
<template>
  <button
    type="button"
    class="icon-btn"
    :class="[
      `icon-btn--${variant}`,
      `icon-btn--${size}`,
      `icon-btn--${shape}`,
      { 'icon-btn--active': active },
    ]"
    :disabled="disabled"
    :aria-label="label"
  >
    <slot />
  </button>
</template>

<script setup>
defineProps({
  label: { type: String, required: true },
  variant: {
    type: String,
    default: "default",
    validator: v => ["default", "primary", "ghost", "danger"].includes(v),
  },
  size: {
    type: String,
    default: "sm",
    validator: v => ["sm", "md", "lg"].includes(v),
  },
  shape: {
    type: String,
    default: "square",
    validator: v => ["square", "circle"].includes(v),
  },
  active: { type: Boolean, default: false },
  disabled: { type: Boolean, default: false },
});
</script>

<style scoped>
.icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-family: var(--font-ui);
  border: 1px solid transparent;
  cursor: pointer;
  transition:
    background 0.2s,
    border-color 0.2s,
    color 0.2s;
}
.icon-btn:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: 2px;
}
.icon-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  pointer-events: none;
}

/* sizes */
.icon-btn--sm {
  min-width: 1.75rem;
  height: 1.75rem;
  font-size: 1.05rem;
}
.icon-btn--md {
  min-width: var(--touch-target);
  height: var(--touch-target);
  font-size: var(--fs-xl);
}
.icon-btn--lg {
  min-width: var(--control-height);
  height: var(--control-height);
  font-size: 1.5rem;
}

/* shapes */
.icon-btn--square {
  border-radius: var(--radius-sm);
}
.icon-btn--circle {
  border-radius: 50%;
}

/* variants */
.icon-btn--default {
  background: var(--bg-2);
  border-color: var(--line);
  color: var(--ink);
}
.icon-btn--default:hover {
  border-color: var(--focus-edge);
}
.icon-btn--primary {
  background: var(--focus);
  border-color: var(--focus);
  color: var(--focus-ink);
}
.icon-btn--primary:hover {
  filter: brightness(1.08);
}
.icon-btn--ghost {
  background: transparent;
  border-color: transparent;
  color: var(--ink-2);
}
.icon-btn--ghost:hover {
  background: var(--bg-2);
  color: var(--ink);
}
.icon-btn--danger {
  background: var(--bg-2);
  border-color: var(--line);
  color: var(--err);
}
.icon-btn--danger:hover {
  border-color: var(--err);
}

/* lit/toggled modifier — intended for default & ghost toggles */
.icon-btn--active {
  color: var(--focus);
  border-color: var(--focus-edge);
}

@media (prefers-reduced-motion: reduce) {
  .icon-btn {
    transition: none;
  }
}
</style>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run tests/unit/components/ui/IconButton.spec.js`
Expected: PASS — 7 tests.

- [ ] **Step 5: Lint and build**

Run: `cd frontend && npx eslint src/components/ui/IconButton.vue tests/unit/components/ui/IconButton.spec.js && npx vite build`
Expected: lint clean (no output), build ends `✓ built in …`.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/ui/IconButton.vue frontend/tests/unit/components/ui/IconButton.spec.js
git commit -m "feat(ui): add shared IconButton primitive (calvin-b97)"
```

---

## Self-Review

**1. Spec coverage:**
- Props (label/variant/size/shape/active/disabled) → Task 1 component + class tests. ✓
- Single `<button>` root, `aria-*`/`@click` fall through → Task 1 tests 4 & 7. ✓
- Variant/size/shape/active/disabled token styling → Task 1 `<style>`. ✓
- `:focus-visible`, disabled, reduced-motion behavior → Task 1 `<style>`. ✓
- Tests mirror `ui/*.spec.js` → Task 1 uses `mount` + `@/` alias like `ToggleSwitch.spec.js`. ✓
- No call-site migration → plan touches only the two new files. ✓
- Deferred `touchControlSize` escape-hatch → intentionally NOT in this plan (spec marks it out of scope). ✓

**2. Placeholder scan:** none — full component + test code inline.

**3. Type/name consistency:** class names (`icon-btn`, `icon-btn--{variant|size|shape}`, `icon-btn--active`), prop names, and enum values match between the component, the tests, and the Interfaces block. ✓
