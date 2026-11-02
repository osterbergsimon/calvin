# Consolidate Region Controls + Pointer-Gated Controls Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Delete the legacy `RegionControls` floating cluster and make the region header rail the single control set, gated on a new "pointer present (mouse or touch)" capability instead of touch-only.

**Architecture:** Add `hasPointer` to `useTouchCapability` (mouse-or-touch, honoring the `touchControls` override). Gate region click-controls on `hasPointer` (calendar/photos additionally on `focused`); calendar keeps only its month/year label always-visible. Move manual refresh into the per-region tune dropdowns. Remove `RegionControls.vue`.

**Tech Stack:** Vue 3 Composition API, Vitest + @vue/test-utils, Vite.

## Global Constraints

- Frontend dir: all paths under `frontend/`. Run tests from `frontend/`.
- Single-run tests: `npx vitest run <path>` (bare `vitest` is watch mode).
- Buttons use `IconButton size="custom"` so they inherit `--icon-size` / `--icon-font` (Dashboard-size scaling). Never introduce a bespoke size class.
- Keep `isTouch` behavior and export unchanged — it still gates touch-only chrome (screen dots, fullscreen-close). Only *add* `hasPointer`.
- Refresh store methods are global: `calendarStore.refreshEvents()`, `webServicesStore.refreshCurrentService()`.
- Do not change keyboard bindings or `useKeyboardActions` wiring.

---

### Task 1: Add `hasPointer` capability

**Files:**
- Modify: `frontend/src/composables/useTouchCapability.js`
- Test: `frontend/tests/unit/composables/useTouchCapability.spec.js`
- Modify (test infra): `frontend/tests/setup.js`
- Modify (stale mocks): `frontend/tests/unit/components/DashboardRegionFocus.spec.js:5-7`, `frontend/tests/unit/components/fullscreenClose.spec.js:9-11`

**Interfaces:**
- Produces: `useTouchCapability()` now returns `{ isTouch, hasPointer }`, both readonly refs. `hasPointer` = true when `touchControls:'on'`, false when `'off'`, else `(any-pointer: fine)` matches OR the existing coarse/touch signal.

- [ ] **Step 1: Extend the composable test's pointer helper and add failing `hasPointer` tests**

In `frontend/tests/unit/composables/useTouchCapability.spec.js`, replace the `mockPointer` helper (lines 6-17) so it can also drive the fine query:

```javascript
function mockPointer({ coarse = false, fine = false } = {}) {
  let coarseHandler = null;
  window.matchMedia = vi.fn().mockImplementation(query => {
    const isCoarse = query.includes("coarse");
    const isFine = query.includes("fine");
    return {
      matches: isCoarse ? coarse : isFine ? fine : false,
      media: query,
      addEventListener: (_e, cb) => {
        if (isCoarse) coarseHandler = cb;
      },
      removeEventListener: vi.fn(),
    };
  });
  return () => coarseHandler && coarseHandler({ matches: !coarse });
}
```

Update the existing `isTouch` tests that call `mockPointer(true)` / `mockPointer(false)` to the object form: `mockPointer({ coarse: true })` / `mockPointer({ coarse: false })` (lines 33, 39, 45, 55, 62, 72, 79, 86 — every `mockPointer(...)` call site).

Then append a new describe block:

```javascript
describe("useTouchCapability hasPointer", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    setMaxTouchPoints(0);
    setActivePinia(createPinia());
  });

  it("is true when a fine (mouse) pointer is present, even without touch", () => {
    mockPointer({ fine: true, coarse: false });
    const { hasPointer, isTouch } = useTouchCapability();
    expect(hasPointer.value).toBe(true);
    expect(isTouch.value).toBe(false); // mouse is not touch
  });

  it("is true when a coarse (touch) pointer is present", () => {
    mockPointer({ coarse: true });
    const { hasPointer } = useTouchCapability();
    expect(hasPointer.value).toBe(true);
  });

  it("is false when neither fine nor coarse pointer is present (keyboard-only)", () => {
    mockPointer({ fine: false, coarse: false });
    const { hasPointer } = useTouchCapability();
    expect(hasPointer.value).toBe(false);
  });

  it("'off' forces false even with a fine pointer", () => {
    mockPointer({ fine: true });
    useConfigStore().touchControls = "off";
    const { hasPointer } = useTouchCapability();
    expect(hasPointer.value).toBe(false);
  });

  it("'on' forces true with no pointer at all", () => {
    mockPointer({ fine: false, coarse: false });
    useConfigStore().touchControls = "on";
    const { hasPointer } = useTouchCapability();
    expect(hasPointer.value).toBe(true);
  });
});
```

- [ ] **Step 2: Run the new tests to verify they fail**

Run: `cd frontend && npx vitest run tests/unit/composables/useTouchCapability.spec.js`
Expected: FAIL — `hasPointer` is `undefined` (`Cannot read properties of undefined (reading 'value')`).

- [ ] **Step 3: Implement `hasPointer` in the composable**

In `frontend/src/composables/useTouchCapability.js`, add a `fine` ref alongside `coarse`, wire a second media-query listener, and add the `hasPointer` computed. Replace the body from the `coarse` ref through the `return`:

```javascript
export function useTouchCapability() {
  const configStore = useConfigStore();
  const coarse = ref(false);
  const fine = ref(false);

  const hasTouchPoints = () => typeof navigator !== "undefined" && navigator.maxTouchPoints > 0;

  if (typeof window !== "undefined" && typeof window.matchMedia === "function") {
    const coarseMql = window.matchMedia("(any-pointer: coarse)");
    coarse.value = coarseMql.matches || hasTouchPoints();
    const updateCoarse = event => {
      coarse.value = event.matches || hasTouchPoints();
    };
    const fineMql = window.matchMedia("(any-pointer: fine)");
    fine.value = fineMql.matches;
    const updateFine = event => {
      fine.value = event.matches;
    };
    if (typeof coarseMql.addEventListener === "function") {
      coarseMql.addEventListener("change", updateCoarse);
      fineMql.addEventListener("change", updateFine);
      onScopeDispose(() => {
        coarseMql.removeEventListener("change", updateCoarse);
        fineMql.removeEventListener("change", updateFine);
      });
    } else if (typeof coarseMql.addListener === "function") {
      coarseMql.addListener(updateCoarse); // older Safari
      fineMql.addListener(updateFine);
      onScopeDispose(() => {
        coarseMql.removeListener(updateCoarse);
        fineMql.removeListener(updateFine);
      });
    }
  } else {
    coarse.value = hasTouchPoints();
  }

  const isTouch = computed(() => {
    const mode = configStore.touchControls;
    if (mode === "on") return true;
    if (mode === "off") return false;
    return coarse.value; // 'auto'
  });

  // hasPointer: a mouse OR touch is present. Drives clickable region controls —
  // a keyboard-only kiosk (no fine, no coarse) shows none. Same on/off override
  // as isTouch so an operator can force controls on or off.
  const hasPointer = computed(() => {
    const mode = configStore.touchControls;
    if (mode === "on") return true;
    if (mode === "off") return false;
    return fine.value || coarse.value; // 'auto'
  });

  return { isTouch: readonly(isTouch), hasPointer: readonly(hasPointer) };
}
```

Update the doc comment block above the function to mention `hasPointer` (add a line: `` * `hasPointer` additionally counts a fine (mouse) pointer, so mouse desktops get clickable controls while keyboard-only kiosks do not. ``).

- [ ] **Step 4: Run the composable tests to verify they pass**

Run: `cd frontend && npx vitest run tests/unit/composables/useTouchCapability.spec.js`
Expected: PASS (all isTouch + hasPointer tests).

- [ ] **Step 5: Make the shared test env report a fine pointer by default**

Component specs that use the real composable must default to "has a mouse" so existing control assertions keep passing. In `frontend/tests/setup.js`, change the `matchMedia` mock's `matches` (line 65) from `matches: false,` to:

```javascript
        matches: /\(any-pointer:\s*fine\)/.test(query),
```

- [ ] **Step 6: Add `hasPointer` to the two inline component mocks**

In `frontend/tests/unit/components/DashboardRegionFocus.spec.js` (lines 5-7) and `frontend/tests/unit/components/fullscreenClose.spec.js` (lines 9-11), update the mock to:

```javascript
vi.mock("@/composables/useTouchCapability", () => ({
  useTouchCapability: () => ({ isTouch: { value: true }, hasPointer: { value: true } }),
}));
```

- [ ] **Step 7: Run the touched suites to confirm no regressions**

Run: `cd frontend && npx vitest run tests/unit/composables/useTouchCapability.spec.js tests/unit/components/DashboardRegionFocus.spec.js tests/unit/components/fullscreenClose.spec.js`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
cd frontend && git add src/composables/useTouchCapability.js tests/unit/composables/useTouchCapability.spec.js tests/setup.js tests/unit/components/DashboardRegionFocus.spec.js tests/unit/components/fullscreenClose.spec.js
git commit -m "feat(touch): add hasPointer (mouse-or-touch) capability (calvin-ohq)"
```

---

### Task 2: Calendar — label-always, controls gated, cluster removed

**Files:**
- Modify: `frontend/src/components/CalendarView.vue` (template lines 31-33, 39; script import line 177; add capability import)
- Test: `frontend/tests/unit/components/CalendarView.touchControls.spec.js` (create)

**Interfaces:**
- Consumes: `useTouchCapability().hasPointer` (Task 1).
- Produces: calendar renders `.calendar-header__label` always; `.calendar-header__controls` only when `focused && hasPointer`; no `RegionControls` / `.region-controls`.

- [ ] **Step 1: Write the failing test**

Create `frontend/tests/unit/components/CalendarView.touchControls.spec.js`:

```javascript
import { describe, it, expect, beforeEach, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { setActivePinia, createPinia } from "pinia";

vi.mock("@/composables/useKeyboardActions", () => ({
  useKeyboardActions: () => ({ handleAction: vi.fn() }),
}));
const touch = { isTouch: { value: false }, hasPointer: { value: true } };
vi.mock("@/composables/useTouchCapability", () => ({
  useTouchCapability: () => touch,
}));

import CalendarView from "@/components/CalendarView.vue";
import { useCalendarStore } from "@/stores/calendar";

const stubs = {
  DashboardPanel: {
    name: "DashboardPanel",
    props: ["title", "focused", "dim", "headerVisible", "showTitle"],
    template: '<section><slot name="actions" /><slot /></section>',
  },
  EventDetailPanel: true,
  DialogScrim: true,
  CalendarEventItem: true,
  CalendarViewOptions: { name: "CalendarViewOptions", template: "<div class='cvo-stub' />" },
};

function mountCal(props) {
  setActivePinia(createPinia());
  const cal = useCalendarStore();
  cal.fetchSources = vi.fn().mockResolvedValue();
  cal.fetchEvents = vi.fn().mockResolvedValue();
  return mount(CalendarView, {
    props: { view: { mode: "month" }, regionId: "r1", ...props },
    global: { stubs },
  });
}

describe("CalendarView touch controls", () => {
  beforeEach(() => {
    touch.hasPointer.value = true;
  });

  it("never renders the legacy RegionControls cluster", () => {
    const w = mountCal({ focused: true });
    expect(w.find(".region-controls").exists()).toBe(false);
  });

  it("shows the month/year label even when not focused", () => {
    const w = mountCal({ focused: false });
    expect(w.find(".calendar-header__label").exists()).toBe(true);
  });

  it("hides the control row when not focused", () => {
    const w = mountCal({ focused: false });
    expect(w.find(".calendar-header__controls").exists()).toBe(false);
  });

  it("shows the control row when focused and a pointer is present", () => {
    const w = mountCal({ focused: true });
    expect(w.find(".calendar-header__controls").exists()).toBe(true);
  });

  it("hides the control row on a keyboard-only kiosk even when focused", () => {
    touch.hasPointer.value = false;
    const w = mountCal({ focused: true });
    expect(w.find(".calendar-header__controls").exists()).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd frontend && npx vitest run tests/unit/components/CalendarView.touchControls.spec.js`
Expected: FAIL — `.calendar-header__controls` exists regardless of focus, and (if not yet removed) `.region-controls` may render.

- [ ] **Step 3: Edit `CalendarView.vue`**

Remove the actions slot block (lines 31-33):

```
      <template #actions>
        <RegionControls v-if="focused" region-kind="calendar" />
      </template>
```

Gate the controls row — change line 39 from `<div class="calendar-header__controls">` to:

```html
          <div v-if="focused && hasPointer" class="calendar-header__controls">
```

Remove the import at line 177 (`import RegionControls from "./dashboard/RegionControls.vue";`).

Add the capability import near the other imports and destructure it in `<script setup>` (after the existing store setup, e.g. below `const configStore = useConfigStore();`):

```javascript
import { useTouchCapability } from "@/composables/useTouchCapability";
```
```javascript
const { hasPointer } = useTouchCapability();
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd frontend && npx vitest run tests/unit/components/CalendarView.touchControls.spec.js`
Expected: PASS.

- [ ] **Step 5: Run the other CalendarView specs for regressions**

Run: `cd frontend && npx vitest run tests/unit/components/CalendarViewMonth.spec.js tests/unit/components/CalendarViewRolling.spec.js tests/unit/components/CalendarViewDisplayOverrides.spec.js tests/unit/components/DashboardRegionFocus.spec.js`
Expected: PASS. (These mount unfocused or with the real/mocked composable; the label stays visible and controls are focus-gated. If any asserts a control that is now focus-gated, add `focused: true` to that mount.)

- [ ] **Step 6: Commit**

```bash
cd frontend && git add src/components/CalendarView.vue tests/unit/components/CalendarView.touchControls.spec.js
git commit -m "feat(calendar): label-always, pointer-gated control row, drop RegionControls (calvin-ohq)"
```

---

### Task 3: Calendar — "Refresh now" in the tune dropdown

**Files:**
- Modify: `frontend/src/components/dashboard/CalendarViewOptions.vue`
- Test: `frontend/tests/unit/components/CalendarViewOptions.spec.js`

**Interfaces:**
- Consumes: `useCalendarStore().refreshEvents()`.
- Produces: a `[data-action="refresh-now"]` button inside the calendar tune popover that calls `refreshEvents()`.

- [ ] **Step 1: Write the failing test**

Append to `frontend/tests/unit/components/CalendarViewOptions.spec.js` (inside the top-level `describe`):

```javascript
  it("Refresh now calls calendarStore.refreshEvents", async () => {
    const { useCalendarStore } = await import("@/stores/calendar");
    const cal = useCalendarStore();
    cal.refreshEvents = vi.fn().mockResolvedValue();
    const { w } = mountOptions({ mode: "month", rolling: false, weeks: 4, days: 7 });
    await openPopover(w);
    await w.find('[data-action="refresh-now"]').trigger("click");
    expect(cal.refreshEvents).toHaveBeenCalled();
    w.unmount();
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd frontend && npx vitest run tests/unit/components/CalendarViewOptions.spec.js -t "Refresh now"`
Expected: FAIL — no `[data-action="refresh-now"]` element.

- [ ] **Step 3: Edit `CalendarViewOptions.vue`**

Add a refresh row as the last child inside `<RegionViewOptions>` (after the `Events/day` row, before `</RegionViewOptions>`):

```html
    <div class="cvo-row">
      <span class="cvo-label">Refresh</span>
      <button
        type="button"
        class="cvo-default-chip"
        data-action="refresh-now"
        aria-label="Refresh calendar now"
        @click="refreshNow"
      >
        Refresh now
      </button>
    </div>
```

In `<script setup>`, import and use the calendar store:

```javascript
import { useCalendarStore } from "@/stores/calendar";
```
```javascript
const calendarStore = useCalendarStore();
const refreshNow = () => {
  calendarStore.refreshEvents().catch(err => {
    console.error("Failed to refresh calendar:", err);
  });
};
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd frontend && npx vitest run tests/unit/components/CalendarViewOptions.spec.js`
Expected: PASS (all tests in the file).

- [ ] **Step 5: Commit**

```bash
cd frontend && git add src/components/dashboard/CalendarViewOptions.vue tests/unit/components/CalendarViewOptions.spec.js
git commit -m "feat(calendar): add Refresh now to tune dropdown (calvin-ohq)"
```

---

### Task 4: Service — pointer-gated nav/fullscreen, cluster removed

**Files:**
- Modify: `frontend/src/components/WebServiceViewer.vue` (template lines 29, 49, 56, 64, 74; script import line 96, capability line 128)
- Test: `frontend/tests/unit/components/WebServiceViewer.spec.js`

**Interfaces:**
- Consumes: `useTouchCapability().hasPointer`.
- Produces: service `‹ › ⤢` render on `hasPointer` (+ existing conditions); no `RegionControls`.

- [ ] **Step 1: Write the failing test**

Append a new describe to `frontend/tests/unit/components/WebServiceViewer.spec.js` (it reuses the file's real composable; `tests/setup.js` now defaults `hasPointer` true). Add at the end of the file:

```javascript
describe("WebServiceViewer control consolidation", () => {
  beforeEach(() => setActivePinia(createPinia()));

  const mount2 = props => {
    const cfg = useConfigStore();
    cfg.showUI = true;
    const store = useWebServicesStore();
    store.services = [
      { id: "a", name: "A", enabled: true, display_schema: { kind: "status-tile" } },
      { id: "b", name: "B", enabled: true, display_schema: { kind: "status-tile" } },
    ];
    store.currentServiceIndex = 0;
    vi.spyOn(store, "fetchServices").mockResolvedValue({ services: store.services });
    return mount(WebServiceViewer, {
      props,
      global: {
        stubs: {
          ServiceViewer: { template: '<div class="svs"><slot name="actions" /></div>' },
        },
      },
    });
  };

  it("does not render the legacy RegionControls cluster", () => {
    const w = mount2({ isFullscreen: true, focused: true });
    expect(w.find(".region-controls").exists()).toBe(false);
  });

  it("still shows the Enter Fullscreen control with a pointer present", () => {
    const w = mount2({ isFullscreen: false, serviceId: "b" });
    expect(w.find('[title="Enter Fullscreen"]').exists()).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd frontend && npx vitest run tests/unit/components/WebServiceViewer.spec.js -t "control consolidation"`
Expected: FAIL — `.region-controls` still renders (RegionControls present).

- [ ] **Step 3: Edit `WebServiceViewer.vue`**

Delete both `<RegionControls v-if="focused" region-kind="service" />` lines (29 and 49) and the import (line 96, `import RegionControls from "./dashboard/RegionControls.vue";`).

Re-gate the three buttons (lines 56, 64, 74) — replace `!isTouch` with `hasPointer`:

```html
            <IconButton
              v-if="hasPointer && canNavigateServices && services.length > 1"
              size="custom"
              label="Previous Service"
              title="Previous Service"
              @click="previousService"
            >
              ‹
            </IconButton>
            <IconButton
              v-if="hasPointer && canNavigateServices && services.length > 1"
              size="custom"
              label="Next Service"
              title="Next Service"
              @click="nextService"
            >
              ›
            </IconButton>
            <IconButton
              v-if="hasPointer && !isFullscreen"
              size="custom"
              label="Enter Fullscreen"
              title="Enter Fullscreen"
              @click.stop="handleToggleFullscreen"
            >
              ⤢
            </IconButton>
```

Change the capability destructure (line 128) from `const { isTouch } = useTouchCapability();` to:

```javascript
const { hasPointer } = useTouchCapability();
```

- [ ] **Step 4: Run the full WebServiceViewer spec to verify it passes**

Run: `cd frontend && npx vitest run tests/unit/components/WebServiceViewer.spec.js`
Expected: PASS (new tests + the pre-existing fullscreen/nav tests, which rely on the default-true `hasPointer`).

- [ ] **Step 5: Commit**

```bash
cd frontend && git add src/components/WebServiceViewer.vue tests/unit/components/WebServiceViewer.spec.js
git commit -m "feat(service): pointer-gate nav/fullscreen, drop RegionControls (calvin-ohq)"
```

---

### Task 5: Service — "Refresh now" in the tune dropdown

**Files:**
- Modify: `frontend/src/components/dashboard/ServiceRegionViewOptions.vue`
- Test: `frontend/tests/unit/components/ServiceRegionViewOptions.spec.js`

**Interfaces:**
- Consumes: `useWebServicesStore().refreshCurrentService()`.
- Produces: a `[data-action="refresh-now"]` button in the service tune popover that calls `refreshCurrentService()`.

- [ ] **Step 1: Write the failing test**

Append to `frontend/tests/unit/components/ServiceRegionViewOptions.spec.js` (match the file's existing mount/open helpers; if it lacks them, mirror the CalendarViewOptions spec pattern — mount with `props: { regionId: "r1", view: {} }`, open via `.region-view-options__trigger`):

```javascript
  it("Refresh now calls webServicesStore.refreshCurrentService", async () => {
    const { useWebServicesStore } = await import("@/stores/webServices");
    const store = useWebServicesStore();
    store.refreshCurrentService = vi.fn().mockResolvedValue();
    const w = mount(ServiceRegionViewOptions, {
      attachTo: document.body,
      props: { regionId: "r1", view: {} },
    });
    await w.find(".region-view-options__trigger").trigger("click");
    await w.find('[data-action="refresh-now"]').trigger("click");
    expect(store.refreshCurrentService).toHaveBeenCalled();
    w.unmount();
  });
```

Ensure the file imports `mount`, `ServiceRegionViewOptions`, and has an active Pinia in `beforeEach` (add `setActivePinia(createPinia())` if not already present).

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd frontend && npx vitest run tests/unit/components/ServiceRegionViewOptions.spec.js -t "Refresh now"`
Expected: FAIL — no `[data-action="refresh-now"]` element.

- [ ] **Step 3: Edit `ServiceRegionViewOptions.vue`**

Add a refresh row as the last child inside `<RegionViewOptions>` (after the `Card size` row):

```html
    <div class="svo-row">
      <span class="svo-label">Refresh</span>
      <button
        type="button"
        class="svo-seg-btn"
        data-action="refresh-now"
        aria-label="Refresh service now"
        @click="refreshNow"
      >
        Refresh now
      </button>
    </div>
```

In `<script setup>`, import and use the store:

```javascript
import { useWebServicesStore } from "@/stores/webServices";
```
```javascript
const webServicesStore = useWebServicesStore();
const refreshNow = () => {
  webServicesStore.refreshCurrentService().catch(err => {
    console.error("Failed to refresh service:", err);
  });
};
```

Add a small style for `.svo-seg-btn` in the `<style scoped>` block (mirrors `.svo-seg button` chrome so the button matches the popover):

```css
.svo-seg-btn {
  font-family: var(--font-ui);
  font-size: 0.72rem;
  color: var(--ink-2);
  background: var(--bg-1);
  border: 1px solid var(--line);
  border-radius: 8px;
  padding: 0.2rem 0.5rem;
  min-height: 22px;
  cursor: pointer;
}
.svo-seg-btn:hover {
  border-color: var(--focus-edge);
  color: var(--ink);
}
.svo-seg-btn:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: 1px;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd frontend && npx vitest run tests/unit/components/ServiceRegionViewOptions.spec.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd frontend && git add src/components/dashboard/ServiceRegionViewOptions.vue tests/unit/components/ServiceRegionViewOptions.spec.js
git commit -m "feat(service): add Refresh now to tune dropdown (calvin-ohq)"
```

---

### Task 6: Photos — pointer-gated nav rail, cluster removed

**Files:**
- Modify: `frontend/src/components/PhotoSlideshow.vue` (template lines 22-27; script import line 60, capability line 66)
- Test: `frontend/tests/unit/components/regionFocusForwarding.spec.js` (rewrite the cluster assertions)

**Interfaces:**
- Consumes: `useTouchCapability().hasPointer`, `useKeyboardActions().handleAction`.
- Produces: photos `#actions` renders `[data-action="prev"|"next"|"expand"]` `IconButton`s when `focused && hasPointer`; no `RegionControls`.

- [ ] **Step 1: Rewrite the failing test**

In `frontend/tests/unit/components/regionFocusForwarding.spec.js`, update the touch mock (lines 5-7) to include `hasPointer`:

```javascript
vi.mock("@/composables/useTouchCapability", () => ({
  useTouchCapability: () => ({ isTouch: { value: true }, hasPointer: { value: true } }),
}));
```

Replace the two `RegionControls` tests (lines 48-62) with:

```javascript
  it("renders touch nav in the actions slot when focused", () => {
    const w = mount(PhotoSlideshow, {
      props: { focused: true, isFullscreen: false },
      global: { stubs },
    });
    expect(w.find('[data-action="next"]').exists()).toBe(true);
    expect(w.find('[data-action="expand"]').exists()).toBe(true);
  });

  it("hides touch nav when not focused", () => {
    const w = mount(PhotoSlideshow, {
      props: { focused: false, isFullscreen: false },
      global: { stubs },
    });
    expect(w.find('[data-action="next"]').exists()).toBe(false);
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd frontend && npx vitest run tests/unit/components/regionFocusForwarding.spec.js`
Expected: FAIL — `[data-action="next"]` does not exist (still the old cluster).

- [ ] **Step 3: Edit `PhotoSlideshow.vue`**

Replace the actions slot content (lines 22-27):

```html
      <template #actions>
        <div v-if="imagesStore.error" class="error-message">
          {{ imagesStore.error }}
        </div>
        <template v-if="focused && hasPointer">
          <IconButton
            size="custom"
            data-action="prev"
            label="Previous photo"
            title="Previous"
            @click="handleAction('images_prev')"
          >
            ‹
          </IconButton>
          <IconButton
            size="custom"
            data-action="next"
            label="Next photo"
            title="Next"
            @click="handleAction('images_next')"
          >
            ›
          </IconButton>
          <IconButton
            size="custom"
            variant="primary"
            data-action="expand"
            label="Fullscreen photos"
            title="Fullscreen"
            @click="handleAction('photos_enter_fullscreen')"
          >
            ⤢
          </IconButton>
        </template>
      </template>
```

Remove the import at line 60 (`import RegionControls from "./dashboard/RegionControls.vue";`).

Update the capability destructure (line 66) from `const { isTouch } = useTouchCapability();` to:

```javascript
const { isTouch, hasPointer } = useTouchCapability();
```

(`isTouch` stays — it still gates the fullscreen `fs-close` button at line 4.)

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd frontend && npx vitest run tests/unit/components/regionFocusForwarding.spec.js`
Expected: PASS.

- [ ] **Step 5: Run the other PhotoSlideshow specs for regressions**

Run: `cd frontend && npx vitest run tests/unit/components/PhotoSlideshow.spec.js tests/unit/components/fullscreenClose.spec.js tests/unit/components/DashboardRegionSurfaces.spec.js`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
cd frontend && git add src/components/PhotoSlideshow.vue tests/unit/components/regionFocusForwarding.spec.js
git commit -m "feat(photos): pointer-gated nav rail, drop RegionControls (calvin-ohq)"
```

---

### Task 7: Delete `RegionControls`

**Files:**
- Delete: `frontend/src/components/dashboard/RegionControls.vue`
- Delete: `frontend/tests/unit/components/dashboard/RegionControls.spec.js`

**Interfaces:** none (all consumers removed in Tasks 2, 4, 6).

- [ ] **Step 1: Confirm there are no remaining references**

Run: `cd frontend && grep -rn "RegionControls" src/ tests/`
Expected: no output.

- [ ] **Step 2: Delete the component and its spec**

```bash
cd frontend && git rm src/components/dashboard/RegionControls.vue tests/unit/components/dashboard/RegionControls.spec.js
```

- [ ] **Step 3: Run the full unit suite**

Run: `cd frontend && npx vitest run`
Expected: PASS, no missing-module errors.

- [ ] **Step 4: Commit**

```bash
cd frontend && git commit -m "refactor: remove legacy RegionControls cluster (calvin-ohq)"
```

---

### Task 8: Full gate + live verification

**Files:** none (verification only).

- [ ] **Step 1: Full unit suite**

Run: `cd frontend && npx vitest run`
Expected: PASS.

- [ ] **Step 2: Lint**

Run: `cd frontend && npm run lint`
Expected: no errors. (Fix any unused-import warnings surfaced by the edits — e.g. a now-unused `isTouch` import.)

- [ ] **Step 3: Build**

Run: `cd frontend && npm run build`
Expected: build succeeds.

- [ ] **Step 4: Live-verify on the docker dev stack (Playwright)**

Bring up the dev stack and, via Playwright, confirm across calendar + service + photos:
- **Touch** (`touchControls=on`), region focused: no floating `‹ › ↻ ⤢` cluster; only the header rail. Calendar shows one control row (no duplicate `‹ › ⤢`) + label; Refresh now in the calendar tune. Service shows nav + fullscreen + tune with Refresh now. Photos shows `‹ › ⤢`. Can navigate / fullscreen / scroll (card-grid) by touch.
- **Keyboard-only** (`touchControls=off`): no click-controls anywhere; calendar shows only its month/year label; keyboard actions still navigate / refresh / fullscreen.
- Calendar month/year label visible in all cases (even unfocused).

- [ ] **Step 5: Close the issue**

```bash
bd close calvin-ohq
```

---

## Self-Review Notes

- **Spec coverage:** hasPointer capability (Task 1) · calendar label-always + gated controls + no cluster (Task 2) · calendar refresh-in-tune (Task 3) · service pointer-gate + no cluster (Task 4) · service refresh-in-tune (Task 5) · photos nav + no cluster (Task 6) · delete RegionControls + spec (Task 7) · full verify + live Playwright (Task 8). All spec sections mapped.
- **iframe-service refresh gap:** per spec decision, accepted — refresh lives in the (link-capable-only) tune dropdown. No task adds a standalone service `↻`. If the user reverses this at review, add an `IconButton data-action` in the service rail gated `hasPointer` wired to `handleAction('service_refresh')`.
- **Type consistency:** `hasPointer` is the single new name, consumed identically in Tasks 2/4/6; refresh buttons all use `data-action="refresh-now"`; photos nav uses `data-action` `prev`/`next`/`expand` matching the rewritten spec.
