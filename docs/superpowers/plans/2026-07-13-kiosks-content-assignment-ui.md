# Kiosks Content-Assignment Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a per-kiosk **Content** editor to the existing Kiosks settings view so an operator can choose which dashboard screens a kiosk may show and which one it boots into.

**Architecture:** Extend `frontend/src/components/settings/categories/KiosksSettings.vue` with a third `SettingsSection` (below Orientation). Reuse the existing effective-value + Reset editing model, the `ChipMultiSelect` and `SelectPill` input components, and the kiosks store's raw-override save path (`saveOverrides`, which replaces the whole layer, so every save is read-modify-write). Screen catalog comes from the config store's `dashboardScreens`. No store or backend changes.

**Tech Stack:** Vue 3 Composition API (`<script setup>`), Pinia, Vitest + @vue/test-utils.

## Global Constraints

- Wire keys are camelCase, per-kiosk overrides only: `availableScreens` (`string[]`), `defaultScreenId` (`string`). Absent key = inherited.
- `PUT /api/kiosks/{id}/overrides` **replaces** the whole override layer → every save must send the full merged object so unrelated keys (the orientation keys `orientation`/`orientationFlipped`/`applyDisplayRotation`, and each other) survive. Save via `store.saveOverrides(selectedId.value, next)`.
- Strict UI guardrails (approved): **never empty** — reject an empty screen selection with a hint, do not save; **select-all == inherited** — if every catalog screen is selected, remove the `availableScreens` key; **auto-drop default** — when a screen-selection change leaves a *stored* `defaultScreenId` outside the available set, delete `defaultScreenId` in the same save.
- **Reset content to global** removes only `CONTENT_KEYS = ["availableScreens", "defaultScreenId"]`; the button is disabled when neither key is overridden. It is separate from the orientation "Reset to global".
- **Degenerate state:** if the catalog has fewer than 2 screens, render a hint instead of the controls.
- **Honest async copy** (content is server-side, applied at next config fetch): online → `"Saved. This kiosk picks up content changes at its next check-in (~30s)."`; offline → `"Saved. Changes apply when this kiosk reconnects."`; failure → `"Couldn't save to the server. Check the connection and try again."`. The Content section has its **own** status line (`contentMsg` ref, `role="status"` `aria-live="polite"`), distinct from the orientation editor's `savedMsg`. `select(id)` clears `contentMsg`.
- Reuse `SettingsSection` / `SettingRow` / `ChipMultiSelect` / `SelectPill`; no new palette, no new store surface.
- Inherited/set tag copy is verbatim `‹inherited from global›` / `‹set for this kiosk›` (single-guillemet chevrons), passed as `SettingRow`'s `description` prop — matching the orientation editor.
- Every commit must be clean under `npm run lint` (eslint) AND `npx prettier --check` on the changed files (CI Pre-commit fails on prettier).

---

## File Structure

- **Modify:** `frontend/src/components/settings/categories/KiosksSettings.vue` — add the Content `SettingsSection` and its script logic (catalog computeds, effective values, guardrailed setters, `persistContent`, reset).
- **Modify:** `frontend/tests/unit/components/KiosksSettings.spec.js` — add a `KiosksSettings — content editor` describe block.

No other files change. The kiosks store (`fetchOverrides`/`saveOverrides`) already carries arbitrary keys; the config store already exposes `dashboardScreens`.

### Component interfaces this plan relies on (verified in develop)

- `ChipMultiSelect` — props `{ modelValue: Array, options: [{value,label}], ariaLabel }`; emits `update:modelValue` with the selected values **in option order** (deterministic).
- `SelectPill` — props `{ modelValue: String|Number, options: [{value,label}], ariaLabel }`; emits `update:modelValue` with the chosen value.
- `SettingRow` — props `{ label (required), description, stacked }`; control goes in the default slot.
- `SettingsSection` — props `{ id (required), title (required) }`.
- Config store: `config.dashboardScreens` is a ref holding `{ version, activeScreenId, screens: [{ id, name, layout, … }] }` or `null`.
- Kiosks store: `store.saveOverrides(id, overridesObject)` (PUTs `{overrides}`, replaces layer), `store.fetchOverrides(id)` (returns the raw layer or `{}`).

### Existing script anchors in `KiosksSettings.vue` (do not remove)

`overrides` (ref), `selectedId` (ref), `selectedKiosk()`, `isOnline(k)`, `savedMsg` (orientation status), `persist(next)` (orientation save), `select(id)` (loads overrides; currently sets `savedMsg.value = ""`), and the imports block at lines 78–84.

---

### Task 1: Content section + "Screens shown" allowlist (with guardrails + degenerate state)

**Files:**
- Modify: `frontend/src/components/settings/categories/KiosksSettings.vue`
- Test: `frontend/tests/unit/components/KiosksSettings.spec.js`

**Interfaces:**
- Consumes: `overrides` ref, `selectedId` ref, `selectedKiosk()`, `isOnline()`, `select()` (existing); `config.dashboardScreens`; `store.saveOverrides`.
- Produces (later tasks rely on these exact names): `screenCatalog` (computed → array of `{id,name}`), `screenOptions` (computed → `[{value,label}]`), `hasEnoughScreens` (computed → bool), `availableOverridden` (computed → bool), `effAvailable` (computed → `string[]`), `contentMsg` (ref), `persistContent(next)` (async), `setAvailable(ids)`. The Content `SettingsSection` (`id="kiosks-content"`) exists in the template with the "Screens shown" `SettingRow` and the `contentMsg` status line.

- [ ] **Step 1: Write the failing tests**

Add this describe block to the end of `frontend/tests/unit/components/KiosksSettings.spec.js` (before the final closing of the file). Also add `ChipMultiSelect` to the imports at the top of the file:

```javascript
import ChipMultiSelect from "@/components/ui/ChipMultiSelect.vue";
```

```javascript
describe("KiosksSettings — content editor", () => {
  beforeEach(() => vi.clearAllMocks());

  const one = [
    { id: "k1", hostname: "pi", lastSeen: new Date().toISOString(), lastAppliedVersion: null },
  ];

  const twoScreens = {
    version: 2,
    activeScreenId: "a",
    screens: [
      { id: "a", name: "Home" },
      { id: "b", name: "Agenda" },
    ],
  };

  // Mounts the view, seeds a screen catalog, selects the first kiosk with the given overrides.
  async function selectContent(list, overrides = {}, screens = twoScreens) {
    setActivePinia(createPinia());
    const store = useKiosksStore();
    store.loadKiosks = vi.fn(async () => {
      store.kiosks = list;
    });
    store.fetchOverrides = vi.fn(async () => overrides);
    store.saveOverrides = vi.fn(async () => {});
    const cfg = useConfigStore();
    cfg.orientation = "landscape";
    cfg.orientationFlipped = false;
    cfg.dashboardScreens = screens;
    const w = mount(KiosksSettings);
    await flushPromises();
    await w.find("[data-test='kiosk-card']").trigger("click");
    await flushPromises();
    return { w, store, cfg };
  }

  it("shows all screens selected and tagged inherited when there is no override", async () => {
    const { w } = await selectContent(one, {});
    const chips = w.findComponent(ChipMultiSelect);
    expect(chips.props("modelValue")).toEqual(["a", "b"]);
    expect(w.text().toLowerCase()).toContain("inherited from global");
  });

  it("selecting a subset saves availableScreens merged, preserving unrelated keys", async () => {
    const { w, store } = await selectContent(one, { orientation: "portrait" });
    w.findComponent(ChipMultiSelect).vm.$emit("update:modelValue", ["a"]);
    await flushPromises();
    expect(store.saveOverrides).toHaveBeenCalledWith("k1", {
      orientation: "portrait",
      availableScreens: ["a"],
    });
    expect(w.text().toLowerCase()).toContain("set for this kiosk");
  });

  it("selecting all screens normalizes to inherited (removes availableScreens)", async () => {
    const { w, store } = await selectContent(one, { availableScreens: ["a"] });
    w.findComponent(ChipMultiSelect).vm.$emit("update:modelValue", ["a", "b"]);
    await flushPromises();
    expect(store.saveOverrides).toHaveBeenCalledWith("k1", {});
  });

  it("rejecting an empty selection shows a hint and does not save", async () => {
    const { w, store } = await selectContent(one, { availableScreens: ["a"] });
    w.findComponent(ChipMultiSelect).vm.$emit("update:modelValue", []);
    await flushPromises();
    expect(store.saveOverrides).not.toHaveBeenCalled();
    expect(w.text()).toContain("Pick at least one screen");
  });

  it("dropping the default's screen from the set clears defaultScreenId", async () => {
    const { w, store } = await selectContent(one, {
      availableScreens: ["a", "b"],
      defaultScreenId: "b",
    });
    w.findComponent(ChipMultiSelect).vm.$emit("update:modelValue", ["a"]);
    await flushPromises();
    expect(store.saveOverrides).toHaveBeenCalledWith("k1", { availableScreens: ["a"] });
  });

  it("renders a hint and no chips when the catalog has fewer than two screens", async () => {
    const oneScreen = { version: 2, activeScreenId: "a", screens: [{ id: "a", name: "Home" }] };
    const { w } = await selectContent(one, {}, oneScreen);
    expect(w.findComponent(ChipMultiSelect).exists()).toBe(false);
    expect(w.text()).toContain("Add more screens in Display");
  });

  it("shows offline content copy after saving to an offline kiosk", async () => {
    const stale = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const offline = [{ id: "k1", hostname: "pi", lastSeen: stale, lastAppliedVersion: null }];
    const { w } = await selectContent(offline, {});
    w.findComponent(ChipMultiSelect).vm.$emit("update:modelValue", ["a"]);
    await flushPromises();
    expect(w.text()).toContain("Saved. Changes apply when this kiosk reconnects.");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd frontend && npx vitest run tests/unit/components/KiosksSettings.spec.js`
Expected: FAIL — the `content editor` tests error (no `ChipMultiSelect` rendered / `contentMsg` copy absent). The existing `list` and `orientation editor` tests still pass.

- [ ] **Step 3: Add the script logic**

In `frontend/src/components/settings/categories/KiosksSettings.vue`, add `ChipMultiSelect` to the imports:

```javascript
import ChipMultiSelect from "@/components/ui/ChipMultiSelect.vue";
```

Add a `contentMsg` ref next to `savedMsg` (after line 91 `const savedMsg = ref("");`):

```javascript
const contentMsg = ref("");
```

Add these computeds and functions in the `<script setup>` (place them after the orientation block, before `function isOnline`):

```javascript
const CONTENT_KEYS = ["availableScreens", "defaultScreenId"];

const screenCatalog = computed(() => config.dashboardScreens?.screens ?? []);
const screenOptions = computed(() => screenCatalog.value.map(s => ({ value: s.id, label: s.name })));
const hasEnoughScreens = computed(() => screenCatalog.value.length >= 2);

const availableOverridden = computed(() => "availableScreens" in overrides.value);
const effAvailable = computed(() =>
  availableOverridden.value
    ? overrides.value.availableScreens
    : screenCatalog.value.map(s => s.id)
);

async function persistContent(next) {
  overrides.value = next;
  try {
    await store.saveOverrides(selectedId.value, next);
    const online = selectedKiosk() ? isOnline(selectedKiosk()) : false;
    contentMsg.value = online
      ? "Saved. This kiosk picks up content changes at its next check-in (~30s)."
      : "Saved. Changes apply when this kiosk reconnects.";
  } catch {
    contentMsg.value = "Couldn't save to the server. Check the connection and try again.";
  }
}

function setAvailable(ids) {
  if (ids.length === 0) {
    contentMsg.value = "Pick at least one screen, or Reset to show all.";
    return;
  }
  const next = { ...overrides.value };
  const allIds = screenCatalog.value.map(s => s.id);
  if (ids.length === allIds.length) {
    delete next.availableScreens;
  } else {
    next.availableScreens = ids;
  }
  const effIds = "availableScreens" in next ? next.availableScreens : allIds;
  if ("defaultScreenId" in next && !effIds.includes(next.defaultScreenId)) {
    delete next.defaultScreenId;
  }
  persistContent(next);
}
```

Update `select(id)` to also clear the content status (change the existing body):

```javascript
async function select(id) {
  selectedId.value = id;
  savedMsg.value = "";
  contentMsg.value = "";
  overrides.value = await store.fetchOverrides(id);
}
```

- [ ] **Step 4: Add the Content section to the template**

Immediately after the closing `</SettingsSection>` of the orientation editor (after line 73 in the original file), add:

```html
    <SettingsSection v-if="selectedId" id="kiosks-content" :title="`${selectedId} — Content`">
      <p v-if="!hasEnoughScreens" class="kiosks__hint">
        Add more screens in Display → Screens & regions to assign different content per kiosk.
      </p>
      <template v-else>
        <SettingRow
          label="Screens shown"
          :description="availableOverridden ? '‹set for this kiosk›' : '‹inherited from global›'"
        >
          <ChipMultiSelect
            :model-value="effAvailable"
            aria-label="Screens shown"
            :options="screenOptions"
            @update:model-value="setAvailable"
          />
        </SettingRow>
        <p v-if="contentMsg" class="kiosks__saved" role="status" aria-live="polite">
          {{ contentMsg }}
        </p>
      </template>
    </SettingsSection>
```

Add a `.kiosks__hint` style in the `<style scoped>` block (next to `.kiosks__empty`):

```css
.kiosks__hint {
  opacity: 0.7;
  font-size: 0.9em;
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd frontend && npx vitest run tests/unit/components/KiosksSettings.spec.js`
Expected: PASS — all `content editor` tests plus the pre-existing `list` and `orientation editor` tests.

- [ ] **Step 6: Lint, format, commit**

```bash
cd frontend && npm run lint && npx prettier --check src/components/settings/categories/KiosksSettings.vue tests/unit/components/KiosksSettings.spec.js
cd .. && git add frontend/src/components/settings/categories/KiosksSettings.vue frontend/tests/unit/components/KiosksSettings.spec.js
git commit -m "feat(kiosk): content editor — per-kiosk screen allowlist (dd9-content-ui)"
```

---

### Task 2: "Default screen" picker (limited to the available set)

**Files:**
- Modify: `frontend/src/components/settings/categories/KiosksSettings.vue`
- Test: `frontend/tests/unit/components/KiosksSettings.spec.js`

**Interfaces:**
- Consumes: `overrides`, `screenOptions`, `effAvailable`, `persistContent`, `config.dashboardScreens` (from Task 1).
- Produces: `defaultOverridden` (computed → bool), `effDefault` (computed → string|null), `availableOptions` (computed → `[{value,label}]` filtered to the effective available set), `setDefault(id)`. A second `SettingRow` ("Default screen") with a `SelectPill` in the Content section.

- [ ] **Step 1: Write the failing tests**

Add `SelectPill` to the test imports:

```javascript
import SelectPill from "@/components/ui/SelectPill.vue";
```

Add these tests inside the existing `KiosksSettings — content editor` describe block (they reuse its `selectContent`/`one`/`twoScreens`):

```javascript
  it("shows the global active screen as the effective default, tagged inherited", async () => {
    const { w } = await selectContent(one, {});
    const pill = w.findComponent(SelectPill);
    expect(pill.props("modelValue")).toBe("a");
    // both controls are inherited → the inherited tag appears
    expect(w.text().toLowerCase()).toContain("inherited from global");
  });

  it("limits the default-screen options to the available set", async () => {
    const { w } = await selectContent(one, { availableScreens: ["b"] });
    const pill = w.findComponent(SelectPill);
    expect(pill.props("options")).toEqual([{ value: "b", label: "Agenda" }]);
  });

  it("choosing a default saves defaultScreenId merged, preserving unrelated keys", async () => {
    const { w, store } = await selectContent(one, { orientation: "portrait" });
    w.findComponent(SelectPill).vm.$emit("update:modelValue", "b");
    await flushPromises();
    expect(store.saveOverrides).toHaveBeenCalledWith("k1", {
      orientation: "portrait",
      defaultScreenId: "b",
    });
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd frontend && npx vitest run tests/unit/components/KiosksSettings.spec.js`
Expected: FAIL — no `SelectPill` is rendered yet.

- [ ] **Step 3: Add the default-screen script logic**

In `KiosksSettings.vue`, add `SelectPill` to the imports:

```javascript
import SelectPill from "@/components/ui/SelectPill.vue";
```

Add these after the `setAvailable` function:

```javascript
const defaultOverridden = computed(() => "defaultScreenId" in overrides.value);
const effDefault = computed(() =>
  defaultOverridden.value
    ? overrides.value.defaultScreenId
    : (config.dashboardScreens?.activeScreenId ?? null)
);
const availableOptions = computed(() =>
  screenOptions.value.filter(o => effAvailable.value.includes(o.value))
);

function setDefault(id) {
  persistContent({ ...overrides.value, defaultScreenId: id });
}
```

- [ ] **Step 4: Add the "Default screen" row to the template**

Inside the `<template v-else>` of the Content section, between the "Screens shown" `SettingRow` and the `contentMsg` paragraph, add:

```html
        <SettingRow
          label="Default screen"
          :description="defaultOverridden ? '‹set for this kiosk›' : '‹inherited from global›'"
        >
          <SelectPill
            :model-value="effDefault"
            aria-label="Default screen"
            :options="availableOptions"
            @update:model-value="setDefault"
          />
        </SettingRow>
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd frontend && npx vitest run tests/unit/components/KiosksSettings.spec.js`
Expected: PASS — all content-editor tests including the three new default-screen tests.

- [ ] **Step 6: Lint, format, commit**

```bash
cd frontend && npm run lint && npx prettier --check src/components/settings/categories/KiosksSettings.vue tests/unit/components/KiosksSettings.spec.js
cd .. && git add frontend/src/components/settings/categories/KiosksSettings.vue frontend/tests/unit/components/KiosksSettings.spec.js
git commit -m "feat(kiosk): content editor — default-screen picker limited to available set (dd9-content-ui)"
```

---

### Task 3: "Reset content to global"

**Files:**
- Modify: `frontend/src/components/settings/categories/KiosksSettings.vue`
- Test: `frontend/tests/unit/components/KiosksSettings.spec.js`

**Interfaces:**
- Consumes: `overrides`, `availableOverridden`, `defaultOverridden`, `persistContent`, `CONTENT_KEYS` (from Tasks 1–2).
- Produces: `contentOverridden` (computed → bool), `resetContent()`. A `data-test="reset-content"` button in the Content section.

- [ ] **Step 1: Write the failing tests**

Add these tests inside the `KiosksSettings — content editor` describe block:

```javascript
  it("Reset content to global removes only the content keys", async () => {
    const { w, store } = await selectContent(one, {
      orientation: "portrait",
      availableScreens: ["a"],
      defaultScreenId: "a",
    });
    await w.find("[data-test='reset-content']").trigger("click");
    await flushPromises();
    expect(store.saveOverrides).toHaveBeenCalledWith("k1", { orientation: "portrait" });
  });

  it("Reset content button is disabled when there is no content override", async () => {
    const { w } = await selectContent(one, { orientation: "portrait" });
    const btn = w.find("[data-test='reset-content']");
    expect(btn.attributes("disabled")).toBeDefined();
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd frontend && npx vitest run tests/unit/components/KiosksSettings.spec.js`
Expected: FAIL — `[data-test='reset-content']` not found.

- [ ] **Step 3: Add the reset logic**

In `KiosksSettings.vue`, add after `setDefault`:

```javascript
const contentOverridden = computed(() => availableOverridden.value || defaultOverridden.value);

function resetContent() {
  const next = { ...overrides.value };
  for (const k of CONTENT_KEYS) delete next[k];
  persistContent(next);
}
```

- [ ] **Step 4: Add the reset button to the template**

Inside the `<template v-else>` of the Content section, between the "Default screen" `SettingRow` and the `contentMsg` paragraph, add:

```html
        <button
          type="button"
          class="kiosks__reset"
          data-test="reset-content"
          :disabled="!contentOverridden"
          @click="resetContent"
        >
          Reset content to global
        </button>
```

- [ ] **Step 5: Run the full unit suite**

Run: `cd frontend && npx vitest run tests/unit/components/KiosksSettings.spec.js && npx vitest run tests/unit`
Expected: PASS — the KiosksSettings spec fully green, and no regression across the whole unit suite.

- [ ] **Step 6: Lint, format, commit**

```bash
cd frontend && npm run lint && npx prettier --check src/components/settings/categories/KiosksSettings.vue tests/unit/components/KiosksSettings.spec.js
cd .. && git add frontend/src/components/settings/categories/KiosksSettings.vue frontend/tests/unit/components/KiosksSettings.spec.js
git commit -m "feat(kiosk): content editor — reset content to global (dd9-content-ui)"
```

---

### Task 4: Docs

**Files:**
- Modify: `docs/setup/DEPLOYMENT_TOPOLOGIES.md`

- [ ] **Step 1: Extend the Kiosks-UI note**

In `docs/setup/DEPLOYMENT_TOPOLOGIES.md`, find the "Managing kiosks from the UI" paragraph (added in dd9.11, in the per-kiosk configuration section) and append this sentence to it:

```markdown
Below orientation, **Content** lets you pick which dashboard screens that kiosk may show (a
per-kiosk allowlist) and which screen it boots into; leaving it untouched means the kiosk shows all
global screens. "Reset content to global" clears the per-kiosk selection.
```

- [ ] **Step 2: Commit**

```bash
git add docs/setup/DEPLOYMENT_TOPOLOGIES.md
git commit -m "docs(kiosk): document the per-kiosk content editor (dd9-content-ui)"
```

---

## Self-Review

**Spec coverage:**
- Placement: third `SettingsSection` `id="kiosks-content"` under Orientation → Task 1. ✅
- Catalog from `config.dashboardScreens.screens`; global default = `activeScreenId` → Tasks 1 & 2. ✅
- Screens-shown `ChipMultiSelect`, effective = override ?? all ids, inherited/set tag → Task 1. ✅
- Never-empty guard (reject + hint, no save) → Task 1. ✅
- Select-all → inherited (remove key) → Task 1. ✅
- Auto-drop stored default out of set → Task 1 (`setAvailable`). ✅
- Default `SelectPill`, options limited to available set, effective = override ?? global active, tag → Task 2. ✅
- Read-modify-write preserving unrelated keys → Tasks 1–3 (all saves via `persistContent` spread `overrides.value`). ✅
- Reset content (CONTENT_KEYS only; disabled when none) → Task 3. ✅
- Degenerate <2-screen hint → Task 1. ✅
- Honest online/offline/failure copy; own `contentMsg` aria-live; `select` clears it → Task 1. ✅
- Docs → Task 4. ✅
- Non-goals (per-screen editing, confirmed apply-status, ordering, backend validation) → not in any task. ✅

**Placeholder scan:** Every code step contains complete Vue/test code and exact commands. No TBD/TODO.

**Type consistency:** `screenCatalog`/`screenOptions`/`effAvailable`/`availableOverridden`/`persistContent`/`setAvailable`/`CONTENT_KEYS` (Task 1) are consumed with the same names in Tasks 2–3. `effDefault`/`availableOptions`/`defaultOverridden`/`setDefault` (Task 2) consumed by Task 3's `contentOverridden`. Override keys `availableScreens`/`defaultScreenId` spelled identically (camelCase) across tasks and match the backend wire keys. Tag copy `‹inherited from global›`/`‹set for this kiosk›` identical to the orientation editor.

**Ordering note:** Task 1 establishes the section + shared computeds/helpers; Task 2 adds the default picker using Task 1's `effAvailable`/`screenOptions`/`persistContent`; Task 3 adds reset using both. Build in order.
