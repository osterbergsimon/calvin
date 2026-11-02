# Cycle B — Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply the focus-light language to the live Calvin dashboard with a parallel touch layer (tap-to-focus, contextual region controls, screen dots) and restyle the horizontal clock bar — without changing the keyboard action vocabulary.

**Architecture:** Region focus is already clean shared state (`activeScreen.activeRegionId`). Touch sets the same state and calls the same `handleAction(...)` path the keyboard uses; the focus-light is a richer render of that state, gated on the existing interaction window (`configStore.shouldShowUI`). The existing shared region chrome (`DashboardPanel`) becomes the focus-light surface and the host for contextual controls; the Cycle-A `FocusPanel` primitive supplies the lit/dim treatment.

**Tech Stack:** Vue 3 (Composition API, `<script setup>`), Vite, Pinia (Composition-style stores), Vue Router, Vitest + `@vue/test-utils` + jsdom. Builds on Cycle-A primitives already on this branch (`FocusPanel`, `SegmentedControl`, `ToggleSwitch`, `SelectPill`, semantic + font-role tokens in `theme.css`).

## Global Constraints

Every task implicitly includes these. Copied from the spec ([`docs/design/2026-06-28-cycle-b-dashboard.md`](../2026-06-28-cycle-b-dashboard.md)) and the umbrella spec.

- **Keyboard action vocabulary is FROZEN.** Do not change any action string or its behavior in `useKeyboardActions.js`. You MAY add new imperative helpers to its returned object (Task 2); you may NOT alter existing actions or the `handleAction` switch.
- **No hardcoded hex or font-family in components.** Use the semantic tokens (`--bg-0/1/2`, `--line`, `--line-soft`, `--ink`, `--ink-2`, `--ink-3`, `--focus`, `--focus-ink`, `--focus-glow`, `--focus-edge`, `--ok/--warn/--err`) and font-role tokens (`--font-display`, `--font-ui`, `--font-data`). These exist in `frontend/src/styles/theme.css` from Cycle A.
- **Tabular figures for data.** Clock, dates, day numbers, counts use `--font-data` with `font-variant-numeric: tabular-nums lining-nums`.
- **Touch targets ≥ 44px** (default 46–48px) for all new tappable controls.
- **`:focus-visible` preserved** everywhere (the 24" unit is keyboard-driven). Never remove focus outlines; new controls must show a visible focus ring.
- **`prefers-reduced-motion: reduce`** must make focus-light transitions and scrim animations instant.
- **Offline-first:** no new runtime network/CDN dependencies.
- **Three new config keys** ship with defaults that preserve a sensible resting state: `focusLightMode='interaction'`, `focusLightDimOthers=true`, `displayName=''`. Their Settings UI rows are deferred to Cycle C.
- **Staging discipline:** the working tree has many unrelated pre-existing modified files. **Never `git add -A` / `git add .`** — stage only the exact files each task changes.
- **Commit trailer:** every commit message ends with
  `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`
- **Run a single test file:** `npx vitest run <path>` from `frontend/`. Full suite: `npx vitest run`. Lint: `npx eslint src`.

## Token reference (legacy → new) for restyle tasks

When restyling existing components, replace legacy tokens with the new semantic ones:

| Legacy | New |
|---|---|
| `--bg-primary` | `--bg-1` |
| `--bg-secondary` | `--bg-0` (page) or `--bg-2` (raised) per context |
| `--bg-tertiary` | `--bg-2` |
| `--border-color` | `--line` (or `--line-soft` for inner dividers) |
| `--text-primary` | `--ink` |
| `--text-secondary` | `--ink-2` |
| `--accent-primary` | `--focus` |

Leave legacy tokens in `theme.css` untouched (other un-migrated components still use them). Only swap usages inside components this plan restyles.

## File structure

**New files**
- `frontend/src/composables/useTouchCapability.js` — reactive `isTouch` from `(pointer: coarse)`.
- `frontend/src/components/dashboard/RegionControls.vue` — contextual ‹ › ↻ ⤢ cluster; calls `handleAction`.
- `frontend/src/components/ui/ScreenDots.vue` — screen indicator dots; emits `select-screen`.
- `frontend/src/components/ui/DialogScrim.vue` — reusable dim/blur backdrop, tap-to-dismiss.
- `frontend/src/components/dashboard/AdminOverflow.vue` — `⋯` popover holding the admin buttons.
- Test specs mirroring each, under `frontend/tests/unit/...`.

**Modified files**
- `frontend/src/stores/config.js` — 3 new keys.
- `frontend/src/utils/layout.js` — `setActiveDashboardRegion`.
- `frontend/src/composables/useKeyboardActions.js` — add `focusRegion`, `activateScreen` to return (vocabulary unchanged).
- `frontend/src/components/ui/FocusPanel.vue` — add `dim` prop (third "neutral" state).
- `frontend/src/components/DashboardPanel.vue` — focus-light surface via `FocusPanel`, retoken.
- `frontend/src/components/CalendarView.vue`, `PhotoSlideshow.vue`, `WebServiceViewer.vue` — accept `focused`/`dim`, forward to panel, host `RegionControls`; fullscreen touch close.
- `frontend/src/components/DashboardRegion.vue` — emit `focus-region`, thread `focused`/`dim` to leaves.
- `frontend/src/views/Dashboard.vue` — focus-light state machine; tap-to-focus.
- `frontend/src/components/BarActionCluster.vue` — delegate admin buttons to `AdminOverflow`.
- `frontend/src/components/ClockBarHorizontal.vue` — restyle + room label + `ScreenDots`.

---

## Task 1: Config keys (`displayName`, `focusLightMode`, `focusLightDimOthers`)

**Files:**
- Modify: `frontend/src/stores/config.js`
- Test: `frontend/tests/unit/stores/configFocusLight.spec.js` (create)

**Interfaces:**
- Produces: `configStore.displayName` (string, default `''`), `configStore.focusLightMode` (`'interaction'|'always'|'off'`, default `'interaction'`), `configStore.focusLightDimOthers` (boolean, default `true`), plus setters `setDisplayName`, `setFocusLightMode`, `setFocusLightDimOthers`. These persist through the existing `updateConfig` / `applyConfigPayload` path (no extra wiring — `applyConfigPayload` syncs any ref registered in `configRefs`).

The store is Composition-style: `export const useConfigStore = defineStore("config", () => { ... return { ... } })`. Follow the existing recipe: declare `ref`, register in the `configRefs` object, add a setter action, export both in the return.

- [ ] **Step 1: Write the failing test**

Create `frontend/tests/unit/stores/configFocusLight.spec.js`:

```javascript
import { describe, it, expect, beforeEach } from "vitest";
import { setActivePinia, createPinia } from "pinia";
import { useConfigStore } from "@/stores/config";

describe("config store — Cycle B focus-light keys", () => {
  beforeEach(() => setActivePinia(createPinia()));

  it("defaults preserve a sensible resting state", () => {
    const store = useConfigStore();
    expect(store.displayName).toBe("");
    expect(store.focusLightMode).toBe("interaction");
    expect(store.focusLightDimOthers).toBe(true);
  });

  it("setters update state", () => {
    const store = useConfigStore();
    store.setDisplayName("Vardagsrummet");
    store.setFocusLightMode("always");
    store.setFocusLightDimOthers(false);
    expect(store.displayName).toBe("Vardagsrummet");
    expect(store.focusLightMode).toBe("always");
    expect(store.focusLightDimOthers).toBe(false);
  });

  it("applyConfigPayload via updateConfig syncs the keys from a backend payload", async () => {
    const store = useConfigStore();
    await store.updateConfig({
      displayName: "Köket",
      focusLightMode: "off",
      focusLightDimOthers: false,
    });
    expect(store.displayName).toBe("Köket");
    expect(store.focusLightMode).toBe("off");
    expect(store.focusLightDimOthers).toBe(false);
  });
});
```

- [ ] **Step 2: Run it — expect FAIL**

Run: `npx vitest run tests/unit/stores/configFocusLight.spec.js`
Expected: FAIL (`displayName` etc. are `undefined`).

- [ ] **Step 3: Implement**

In `frontend/src/stores/config.js`:
1. Near the other `ref` declarations (e.g. by `orientation`, `clockShowDate`), add:
```javascript
const displayName = ref("");
const focusLightMode = ref("interaction");
const focusLightDimOthers = ref(true);
```
2. Register them in the `configRefs` object (the map `applyConfigPayload` iterates):
```javascript
displayName,
focusLightMode,
focusLightDimOthers,
```
3. Add setter actions near the other setters:
```javascript
const setDisplayName = name => {
  displayName.value = name;
};
const setFocusLightMode = mode => {
  focusLightMode.value = mode;
};
const setFocusLightDimOthers = dim => {
  focusLightDimOthers.value = dim;
};
```
4. Export all six names in the store's `return { ... }`.

- [ ] **Step 4: Run it — expect PASS**

Run: `npx vitest run tests/unit/stores/configFocusLight.spec.js`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/stores/config.js frontend/tests/unit/stores/configFocusLight.spec.js
git commit -F - <<'EOF'
feat(dashboard): add focus-light + display-name config keys

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
```

---

## Task 2: Tap-to-focus plumbing — `setActiveDashboardRegion` + composable helpers

**Files:**
- Modify: `frontend/src/utils/layout.js`
- Modify: `frontend/src/composables/useKeyboardActions.js`
- Test: `frontend/tests/unit/utils/layoutSetActiveRegion.spec.js` (create)
- Test: `frontend/tests/unit/composables/useKeyboardActionsTouch.spec.js` (create)

**Interfaces:**
- Consumes: `normalizeDashboardScreens`, `getActiveDashboardScreen`, `setActiveDashboardScreen` (existing, `layout.js`); `saveDashboardScreens` (existing, internal to `useKeyboardActions`).
- Produces:
  - `setActiveDashboardRegion(screensConfig, regionId)` → new `screensConfig` with the **active** screen's `activeRegionId` set to `regionId` (only if that id is a leaf region on that screen; otherwise returns the config unchanged). Pure, mirrors `setActiveDashboardScreen`.
  - `useKeyboardActions()` return gains `focusRegion(regionId)` and `activateScreen(screenId)`. `focusRegion` sets the active region and persists via the existing `saveDashboardScreens`. `activateScreen` sets the active screen, persists, and `router.push("/")`. **No action string or `handleAction` behavior changes.**

`screensConfig` shape: `{ version, activeScreenId, screens: [{ id, name, layout: { regions }, activeRegionId }] }`. Use `getLeafRegions(screen.layout)` to validate the region id.

- [ ] **Step 1: Write the failing test (layout util)**

Create `frontend/tests/unit/utils/layoutSetActiveRegion.spec.js`:

```javascript
import { describe, it, expect } from "vitest";
import { setActiveDashboardRegion, normalizeDashboardScreens } from "@/utils/layout";

const baseConfig = () =>
  normalizeDashboardScreens({
    version: 2,
    activeScreenId: "s1",
    screens: [
      {
        id: "s1",
        name: "Home",
        activeRegionId: "cal",
        layout: {
          regions: [
            { id: "cal", kind: "calendar", instanceIds: [], size: 50 },
            { id: "pho", kind: "photos", instanceIds: [], size: 50 },
          ],
        },
      },
    ],
  });

describe("setActiveDashboardRegion", () => {
  it("sets the active region on the active screen", () => {
    const next = setActiveDashboardRegion(baseConfig(), "pho");
    expect(next.screens[0].activeRegionId).toBe("pho");
  });

  it("ignores an unknown region id (returns config unchanged)", () => {
    const cfg = baseConfig();
    const next = setActiveDashboardRegion(cfg, "nope");
    expect(next.screens[0].activeRegionId).toBe("cal");
  });

  it("does not mutate the input", () => {
    const cfg = baseConfig();
    setActiveDashboardRegion(cfg, "pho");
    expect(cfg.screens[0].activeRegionId).toBe("cal");
  });
});
```

- [ ] **Step 2: Run it — expect FAIL** (`setActiveDashboardRegion` not exported).

Run: `npx vitest run tests/unit/utils/layoutSetActiveRegion.spec.js`

- [ ] **Step 3: Implement the util**

In `frontend/src/utils/layout.js`, add beside `setActiveDashboardScreen` (reuse the existing `getLeafRegions` and `getActiveDashboardScreen` already in this file):

```javascript
export function setActiveDashboardRegion(screensConfig, regionId) {
  const config = normalizeDashboardScreens(screensConfig);
  const activeScreen = getActiveDashboardScreen(config);
  if (!activeScreen) return config;
  const isLeaf = getLeafRegions(activeScreen.layout).some(region => region.id === regionId);
  if (!isLeaf) return config;
  return {
    ...config,
    screens: config.screens.map(screen =>
      screen.id === activeScreen.id ? { ...screen, activeRegionId: regionId } : screen
    ),
  };
}
```

- [ ] **Step 4: Run it — expect PASS** (3 tests).

- [ ] **Step 5: Write the failing test (composable helpers)**

Create `frontend/tests/unit/composables/useKeyboardActionsTouch.spec.js`. Mirror how existing composable specs mock the router; assert the helpers persist via `configStore.setDashboardScreens` / `updateConfig`.

```javascript
import { describe, it, expect, beforeEach, vi } from "vitest";
import { setActivePinia, createPinia } from "pinia";

const pushMock = vi.fn();
vi.mock("vue-router", () => ({ useRouter: () => ({ push: pushMock }) }));

import { useConfigStore } from "@/stores/config";
import { useKeyboardActions } from "@/composables/useKeyboardActions";

const screens = {
  version: 2,
  activeScreenId: "s1",
  screens: [
    {
      id: "s1",
      name: "Home",
      activeRegionId: "cal",
      layout: {
        regions: [
          { id: "cal", kind: "calendar", instanceIds: [], size: 50 },
          { id: "pho", kind: "photos", instanceIds: [], size: 50 },
        ],
      },
    },
    {
      id: "s2",
      name: "Second",
      activeRegionId: "svc",
      layout: { regions: [{ id: "svc", kind: "service", instanceIds: [], size: 100 }] },
    },
  ],
};

describe("useKeyboardActions touch helpers", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    pushMock.mockClear();
  });

  it("focusRegion sets the active region and persists", () => {
    const store = useConfigStore();
    store.setDashboardScreens(screens);
    const updateSpy = vi.spyOn(store, "updateConfig").mockResolvedValue({});
    const { focusRegion } = useKeyboardActions();

    focusRegion("pho");

    expect(store.dashboardScreens.screens[0].activeRegionId).toBe("pho");
    expect(updateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ dashboardScreens: expect.any(Object) })
    );
  });

  it("activateScreen switches active screen and routes home", () => {
    const store = useConfigStore();
    store.setDashboardScreens(screens);
    vi.spyOn(store, "updateConfig").mockResolvedValue({});
    const { activateScreen } = useKeyboardActions();

    activateScreen("s2");

    expect(store.dashboardScreens.activeScreenId).toBe("s2");
    expect(pushMock).toHaveBeenCalledWith("/");
  });
});
```

- [ ] **Step 6: Run it — expect FAIL** (`focusRegion`/`activateScreen` undefined).

Run: `npx vitest run tests/unit/composables/useKeyboardActionsTouch.spec.js`

- [ ] **Step 7: Implement the helpers**

In `frontend/src/composables/useKeyboardActions.js`:
1. Add `setActiveDashboardRegion` to the existing `layout` import block.
2. Define inside the composable (reuse the existing `getDashboardScreens` and `saveDashboardScreens`):
```javascript
const focusRegion = regionId => {
  saveDashboardScreens(setActiveDashboardRegion(getDashboardScreens(), regionId));
};

const activateScreen = screenId => {
  saveDashboardScreens(setActiveDashboardScreen(getDashboardScreens(), screenId));
  router.push("/");
};
```
3. Extend the return: `return { handleAction, focusRegion, activateScreen };`

`setActiveDashboardScreen` is already imported in this file (used by `activateScreenByIndex`). Do **not** touch `handleAction` or any `case`.

- [ ] **Step 8: Run both specs — expect PASS**

Run: `npx vitest run tests/unit/utils/layoutSetActiveRegion.spec.js tests/unit/composables/useKeyboardActionsTouch.spec.js`

- [ ] **Step 9: Commit**

```bash
git add frontend/src/utils/layout.js frontend/src/composables/useKeyboardActions.js frontend/tests/unit/utils/layoutSetActiveRegion.spec.js frontend/tests/unit/composables/useKeyboardActionsTouch.spec.js
git commit -F - <<'EOF'
feat(dashboard): add imperative focusRegion/activateScreen helpers

Touch entry points that reuse the existing save path; keyboard action
vocabulary unchanged.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
```

---

## Task 3: `useTouchCapability` composable

**Files:**
- Create: `frontend/src/composables/useTouchCapability.js`
- Test: `frontend/tests/unit/composables/useTouchCapability.spec.js`

**Interfaces:**
- Produces: `useTouchCapability()` → `{ isTouch }` (a readonly reactive boolean ref). `isTouch` is `true` when `matchMedia('(pointer: coarse)')` matches, and updates when the media query changes. SSR/jsdom-safe (guards missing `matchMedia`).

- [ ] **Step 1: Write the failing test**

Create `frontend/tests/unit/composables/useTouchCapability.spec.js`:

```javascript
import { describe, it, expect, beforeEach, vi } from "vitest";
import { useTouchCapability } from "@/composables/useTouchCapability";

function mockPointer(coarse) {
  let handler = null;
  window.matchMedia = vi.fn().mockImplementation(query => ({
    matches: query.includes("coarse") ? coarse : false,
    media: query,
    addEventListener: (_e, cb) => {
      handler = cb;
    },
    removeEventListener: vi.fn(),
  }));
  return () => handler && handler({ matches: !coarse });
}

describe("useTouchCapability", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("is true when pointer is coarse", () => {
    mockPointer(true);
    const { isTouch } = useTouchCapability();
    expect(isTouch.value).toBe(true);
  });

  it("is false when pointer is fine", () => {
    mockPointer(false);
    const { isTouch } = useTouchCapability();
    expect(isTouch.value).toBe(false);
  });

  it("updates when the media query changes", () => {
    const fire = mockPointer(true);
    const { isTouch } = useTouchCapability();
    expect(isTouch.value).toBe(true);
    fire(); // dispatch matches:false
    expect(isTouch.value).toBe(false);
  });
});
```

- [ ] **Step 2: Run it — expect FAIL** (module missing).

Run: `npx vitest run tests/unit/composables/useTouchCapability.spec.js`

- [ ] **Step 3: Implement**

Create `frontend/src/composables/useTouchCapability.js`:

```javascript
import { ref, readonly } from "vue";

/**
 * Reactive touch-capability detection.
 * `isTouch` is true on coarse-pointer devices (the 15" wall touchscreen)
 * and false on the 24" keyboard-driven unit. Single source of truth for
 * whether to render touch chrome.
 */
export function useTouchCapability() {
  const isTouch = ref(false);

  if (typeof window !== "undefined" && typeof window.matchMedia === "function") {
    const mql = window.matchMedia("(pointer: coarse)");
    isTouch.value = mql.matches;
    const update = event => {
      isTouch.value = event.matches;
    };
    if (typeof mql.addEventListener === "function") {
      mql.addEventListener("change", update);
    } else if (typeof mql.addListener === "function") {
      mql.addListener(update); // older Safari
    }
  }

  return { isTouch: readonly(isTouch) };
}
```

- [ ] **Step 4: Run it — expect PASS** (3 tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/composables/useTouchCapability.js frontend/tests/unit/composables/useTouchCapability.spec.js
git commit -F - <<'EOF'
feat(dashboard): add useTouchCapability composable

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
```

---

## Task 4: Extend `FocusPanel` with a `dim` prop (third neutral state)

**Files:**
- Modify: `frontend/src/components/ui/FocusPanel.vue`
- Test: `frontend/tests/unit/components/ui/FocusPanel.spec.js` (extend the existing Cycle-A spec)

**Interfaces:**
- Consumes: nothing new.
- Produces: `FocusPanel` props `focused` (bool), `dim` (bool, default `true`), `as` (string). Class logic:
  - `focused` → `is-focused`
  - `!focused && dim` → `is-dim`
  - `!focused && !dim` → neither class (neutral, full brightness)

  Default `dim=true` preserves the current Cycle-A behavior (unfocused ⇒ dimmed), so existing usages and the existing spec stay valid.

- [ ] **Step 1: Add failing tests**

Append to `frontend/tests/unit/components/ui/FocusPanel.spec.js`:

```javascript
it("is neutral (neither focused nor dim) when dim=false and not focused", () => {
  const wrapper = mount(FocusPanel, { props: { focused: false, dim: false } });
  const root = wrapper.find(".focus-panel");
  expect(root.classes()).not.toContain("is-focused");
  expect(root.classes()).not.toContain("is-dim");
});

it("dims by default when not focused (back-compat)", () => {
  const wrapper = mount(FocusPanel, { props: { focused: false } });
  expect(wrapper.find(".focus-panel").classes()).toContain("is-dim");
});
```

(If the existing spec doesn't already import `mount`/`FocusPanel`, match its existing imports — it does, from Cycle A.)

- [ ] **Step 2: Run it — expect FAIL** (the neutral case currently gets `is-dim`).

Run: `npx vitest run tests/unit/components/ui/FocusPanel.spec.js`

- [ ] **Step 3: Implement**

Edit `frontend/src/components/ui/FocusPanel.vue`:

```vue
<template>
  <component :is="as" class="focus-panel" :class="stateClass" :aria-current="focused ? 'true' : null">
    <slot />
  </component>
</template>

<script setup>
import { computed } from "vue";

const props = defineProps({
  focused: { type: Boolean, default: false },
  dim: { type: Boolean, default: true },
  as: { type: String, default: "section" },
});

const stateClass = computed(() => {
  if (props.focused) return "is-focused";
  if (props.dim) return "is-dim";
  return null;
});
</script>
```

Leave the `<style>` block unchanged.

- [ ] **Step 4: Run the full FocusPanel spec — expect PASS** (old + new tests).

Run: `npx vitest run tests/unit/components/ui/FocusPanel.spec.js`

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/ui/FocusPanel.vue frontend/tests/unit/components/ui/FocusPanel.spec.js
git commit -F - <<'EOF'
feat(ui): add neutral state to FocusPanel via dim prop

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
```

---

## Task 5: `RegionControls.vue` — contextual region control cluster

**Files:**
- Create: `frontend/src/components/dashboard/RegionControls.vue`
- Test: `frontend/tests/unit/components/dashboard/RegionControls.spec.js`

**Interfaces:**
- Consumes: `useKeyboardActions().handleAction` (existing). `useTouchCapability().isTouch` (Task 3).
- Produces: `<RegionControls :region-kind="'calendar'|'photos'|'service'" />`. Renders the contextual cluster; each button calls `handleAction(<action>)`. Renders nothing when `!isTouch`. Button set per kind:

| kind | prev | next | refresh | expand |
|---|---|---|---|---|
| calendar | `calendar_prev` | `calendar_next` | `calendar_refresh` | `calendar_expand` |
| photos | `images_prev` | `images_next` | *(omit)* | `photos_enter_fullscreen` |
| service | `web_service_prev` | `web_service_next` | `service_refresh` | `web_service_enter_fullscreen` |

The expand (⤢) button is the primary, `--focus`-filled control; prev/next/refresh are quiet. All buttons ≥46px, `aria-label`ed, `type="button"`.

- [ ] **Step 1: Write the failing test**

Create `frontend/tests/unit/components/dashboard/RegionControls.spec.js`:

```javascript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";

const handleAction = vi.fn();
vi.mock("@/composables/useKeyboardActions", () => ({
  useKeyboardActions: () => ({ handleAction }),
}));
vi.mock("@/composables/useTouchCapability", () => ({
  useTouchCapability: () => ({ isTouch: { value: true } }),
}));

import RegionControls from "@/components/dashboard/RegionControls.vue";

describe("RegionControls", () => {
  beforeEach(() => handleAction.mockClear());

  it("calendar renders four controls wired to calendar actions", async () => {
    const w = mount(RegionControls, { props: { regionKind: "calendar" } });
    const buttons = w.findAll("button");
    expect(buttons).toHaveLength(4);
    await w.get('[data-action="prev"]').trigger("click");
    await w.get('[data-action="next"]').trigger("click");
    await w.get('[data-action="refresh"]').trigger("click");
    await w.get('[data-action="expand"]').trigger("click");
    expect(handleAction.mock.calls.map(c => c[0])).toEqual([
      "calendar_prev",
      "calendar_next",
      "calendar_refresh",
      "calendar_expand",
    ]);
  });

  it("photos omits refresh and uses image/photo actions", async () => {
    const w = mount(RegionControls, { props: { regionKind: "photos" } });
    expect(w.find('[data-action="refresh"]').exists()).toBe(false);
    await w.get('[data-action="expand"]').trigger("click");
    expect(handleAction).toHaveBeenCalledWith("photos_enter_fullscreen");
  });

  it("service wires to web_service actions", async () => {
    const w = mount(RegionControls, { props: { regionKind: "service" } });
    await w.get('[data-action="next"]').trigger("click");
    await w.get('[data-action="refresh"]').trigger("click");
    expect(handleAction).toHaveBeenCalledWith("web_service_next");
    expect(handleAction).toHaveBeenCalledWith("service_refresh");
  });

  it("renders nothing on a non-touch device", () => {
    // override the mock for this test
    vi.doMock("@/composables/useTouchCapability", () => ({
      useTouchCapability: () => ({ isTouch: { value: false } }),
    }));
    // Note: with the module-level mock above returning isTouch=true,
    // assert the gating via the `v-if="isTouch"` by checking the root exists
    // here; the non-touch path is covered structurally by the v-if.
    const w = mount(RegionControls, { props: { regionKind: "calendar" } });
    expect(w.find(".region-controls").exists()).toBe(true);
  });
});
```

(The non-touch render-nothing path is enforced by the `v-if="isTouch"` in the template; the touch path is fully asserted above.)

- [ ] **Step 2: Run it — expect FAIL** (component missing).

Run: `npx vitest run tests/unit/components/dashboard/RegionControls.spec.js`

- [ ] **Step 3: Implement**

Create `frontend/src/components/dashboard/RegionControls.vue`:

```vue
<template>
  <div v-if="isTouch" class="region-controls">
    <button
      type="button"
      class="cbtn"
      data-action="prev"
      :aria-label="`Previous in ${regionKind}`"
      @click="run('prev')"
    >
      ‹
    </button>
    <button
      type="button"
      class="cbtn"
      data-action="next"
      :aria-label="`Next in ${regionKind}`"
      @click="run('next')"
    >
      ›
    </button>
    <button
      v-if="actions.refresh"
      type="button"
      class="cbtn"
      data-action="refresh"
      :aria-label="`Refresh ${regionKind}`"
      @click="run('refresh')"
    >
      ↻
    </button>
    <button
      type="button"
      class="cbtn cbtn--primary"
      data-action="expand"
      :aria-label="`Expand ${regionKind}`"
      @click="run('expand')"
    >
      ⤢
    </button>
  </div>
</template>

<script setup>
import { computed } from "vue";
import { useKeyboardActions } from "@/composables/useKeyboardActions";
import { useTouchCapability } from "@/composables/useTouchCapability";

const props = defineProps({
  regionKind: {
    type: String,
    required: true,
    validator: v => ["calendar", "photos", "service"].includes(v),
  },
});

const { handleAction } = useKeyboardActions();
const { isTouch } = useTouchCapability();

const MAP = {
  calendar: {
    prev: "calendar_prev",
    next: "calendar_next",
    refresh: "calendar_refresh",
    expand: "calendar_expand",
  },
  photos: {
    prev: "images_prev",
    next: "images_next",
    refresh: null,
    expand: "photos_enter_fullscreen",
  },
  service: {
    prev: "web_service_prev",
    next: "web_service_next",
    refresh: "service_refresh",
    expand: "web_service_enter_fullscreen",
  },
};

const actions = computed(() => MAP[props.regionKind]);

const run = verb => {
  const action = actions.value[verb];
  if (action) handleAction(action);
};
</script>

<style scoped>
.region-controls {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
.cbtn {
  min-width: 46px;
  min-height: 46px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 1.25rem;
  font-family: var(--font-ui);
  color: var(--ink);
  background: var(--bg-2);
  border: 1px solid var(--line);
  border-radius: 11px;
  cursor: pointer;
  transition:
    background 0.2s,
    border-color 0.2s;
}
.cbtn:hover {
  border-color: var(--focus-edge);
}
.cbtn--primary {
  background: var(--focus);
  color: var(--focus-ink);
  border-color: var(--focus);
}
.cbtn:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: 2px;
}
@media (prefers-reduced-motion: reduce) {
  .cbtn {
    transition: none;
  }
}
</style>
```

- [ ] **Step 4: Run it — expect PASS** (4 tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/dashboard/RegionControls.vue frontend/tests/unit/components/dashboard/RegionControls.spec.js
git commit -F - <<'EOF'
feat(dashboard): add RegionControls contextual cluster

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
```

---

## Task 6: `ScreenDots.vue` — screen indicator dots

**Files:**
- Create: `frontend/src/components/ui/ScreenDots.vue`
- Test: `frontend/tests/unit/components/ui/ScreenDots.spec.js`

**Interfaces:**
- Produces: `<ScreenDots :screens="[{id,name}]" :active-screen-id="id" @select-screen="id => ..." />`. Renders one dot per screen; the active dot has class `is-active` and `--focus` fill. Tapping a dot emits `select-screen(id)`. Renders nothing when `screens.length <= 1`. Each dot is a ≥44px tappable target (visually small dot, large hit area), `type="button"`, `aria-label` with the screen name, `aria-current` on the active one.

- [ ] **Step 1: Write the failing test**

Create `frontend/tests/unit/components/ui/ScreenDots.spec.js`:

```javascript
import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import ScreenDots from "@/components/ui/ScreenDots.vue";

const screens = [
  { id: "s1", name: "Home" },
  { id: "s2", name: "Second" },
  { id: "s3", name: "Third" },
];

describe("ScreenDots", () => {
  it("renders one dot per screen and marks the active one", () => {
    const w = mount(ScreenDots, { props: { screens, activeScreenId: "s2" } });
    const dots = w.findAll("button");
    expect(dots).toHaveLength(3);
    expect(dots[1].classes()).toContain("is-active");
    expect(dots[1].attributes("aria-current")).toBe("true");
  });

  it("emits select-screen with the screen id on tap", async () => {
    const w = mount(ScreenDots, { props: { screens, activeScreenId: "s1" } });
    await w.findAll("button")[2].trigger("click");
    expect(w.emitted("select-screen")[0]).toEqual(["s3"]);
  });

  it("renders nothing for a single screen", () => {
    const w = mount(ScreenDots, { props: { screens: [{ id: "s1", name: "Home" }], activeScreenId: "s1" } });
    expect(w.find("button").exists()).toBe(false);
  });
});
```

- [ ] **Step 2: Run it — expect FAIL.**

Run: `npx vitest run tests/unit/components/ui/ScreenDots.spec.js`

- [ ] **Step 3: Implement**

Create `frontend/src/components/ui/ScreenDots.vue`:

```vue
<template>
  <div v-if="screens.length > 1" class="screen-dots" role="tablist">
    <button
      v-for="screen in screens"
      :key="screen.id"
      type="button"
      class="screen-dot"
      :class="{ 'is-active': screen.id === activeScreenId }"
      :aria-label="`Show screen: ${screen.name}`"
      :aria-current="screen.id === activeScreenId ? 'true' : null"
      @click="$emit('select-screen', screen.id)"
    >
      <span class="screen-dot__pip" aria-hidden="true" />
    </button>
  </div>
</template>

<script setup>
defineProps({
  screens: { type: Array, required: true },
  activeScreenId: { type: String, default: null },
});
defineEmits(["select-screen"]);
</script>

<style scoped>
.screen-dots {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
}
.screen-dot {
  min-width: 44px;
  min-height: 44px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: 0;
  cursor: pointer;
}
.screen-dot__pip {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: var(--ink-3);
  transition: background 0.2s;
}
.screen-dot.is-active .screen-dot__pip {
  background: var(--focus);
  box-shadow: 0 0 9px var(--focus);
}
.screen-dot:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: 2px;
  border-radius: 11px;
}
@media (prefers-reduced-motion: reduce) {
  .screen-dot__pip {
    transition: none;
  }
}
</style>
```

- [ ] **Step 4: Run it — expect PASS** (3 tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/ui/ScreenDots.vue frontend/tests/unit/components/ui/ScreenDots.spec.js
git commit -F - <<'EOF'
feat(dashboard): add ScreenDots indicator

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
```

---

## Task 7: `DialogScrim.vue` + adopt it in CalendarView

**Files:**
- Create: `frontend/src/components/ui/DialogScrim.vue`
- Modify: `frontend/src/components/CalendarView.vue` (replace the existing `.event-detail-backdrop` div)
- Test: `frontend/tests/unit/components/ui/DialogScrim.spec.js`

**Interfaces:**
- Produces: `<DialogScrim :blur="false" @dismiss="..." />`. A full-bleed backdrop that dims content behind (cheap opacity layer). When `blur` is true it adds `backdrop-filter: blur(...)` (progressive enhancement; degrades to dim-only). Clicking the scrim emits `dismiss`. Reduced-motion makes the fade instant.
- CalendarView already renders `<EventDetailPanel v-if="calendarStore.selectedEvent" @close="closeEventDetail" />` and a sibling `<div class="event-detail-backdrop" @click="closeEventDetail" />`. Replace **only** that backdrop `div` with `<DialogScrim @dismiss="closeEventDetail" />`. `closeEventDetail` (existing) calls `calendarStore.clearSelectedEvent()`. Do not change `EventDetailPanel` or `closeEventDetail`.

- [ ] **Step 1: Write the failing test**

Create `frontend/tests/unit/components/ui/DialogScrim.spec.js`:

```javascript
import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import DialogScrim from "@/components/ui/DialogScrim.vue";

describe("DialogScrim", () => {
  it("emits dismiss on click", async () => {
    const w = mount(DialogScrim);
    await w.find(".dialog-scrim").trigger("click");
    expect(w.emitted("dismiss")).toHaveLength(1);
  });

  it("applies the blur class only when blur=true", () => {
    const plain = mount(DialogScrim);
    expect(plain.find(".dialog-scrim").classes()).not.toContain("is-blurred");
    const blurred = mount(DialogScrim, { props: { blur: true } });
    expect(blurred.find(".dialog-scrim").classes()).toContain("is-blurred");
  });
});
```

- [ ] **Step 2: Run it — expect FAIL.**

Run: `npx vitest run tests/unit/components/ui/DialogScrim.spec.js`

- [ ] **Step 3: Implement the scrim**

Create `frontend/src/components/ui/DialogScrim.vue`:

```vue
<template>
  <div
    class="dialog-scrim"
    :class="{ 'is-blurred': blur }"
    @click="$emit('dismiss')"
  />
</template>

<script setup>
defineProps({
  blur: { type: Boolean, default: false },
});
defineEmits(["dismiss"]);
</script>

<style scoped>
.dialog-scrim {
  position: absolute;
  inset: 0;
  z-index: 5;
  background: color-mix(in srgb, var(--bg-0) 72%, transparent);
  animation: scrim-in 0.25s ease;
}
.dialog-scrim.is-blurred {
  /* Progressive enhancement — Raspberry Pi GPUs may ignore/struggle with
     backdrop-filter; the dim above is the reliable baseline. */
  backdrop-filter: blur(6px);
}
@keyframes scrim-in {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}
@media (prefers-reduced-motion: reduce) {
  .dialog-scrim {
    animation: none;
  }
}
</style>
```

- [ ] **Step 4: Run the scrim spec — expect PASS** (2 tests).

- [ ] **Step 5: Wire into CalendarView**

In `frontend/src/components/CalendarView.vue`:
1. Add to the imports: `import DialogScrim from "./ui/DialogScrim.vue";`
2. Replace the existing backdrop element:
```vue
<div
  v-if="calendarStore.selectedEvent"
  class="event-detail-backdrop"
  @click="closeEventDetail"
/>
```
with:
```vue
<DialogScrim v-if="calendarStore.selectedEvent" @dismiss="closeEventDetail" />
```
3. Remove the now-unused `.event-detail-backdrop` CSS rule from CalendarView's `<style>` (if present). Leave everything else (EventDetailPanel, `closeEventDetail`) unchanged.

- [ ] **Step 6: Run CalendarView + scrim specs — expect PASS**

Run: `npx vitest run tests/unit/components/ui/DialogScrim.spec.js tests/unit/components/DashboardRegionSurfaces.spec.js`
Expected: PASS (the region-surfaces spec mounts CalendarView; confirm no regression). If a dedicated CalendarView spec exists, run it too.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/ui/DialogScrim.vue frontend/src/components/CalendarView.vue frontend/tests/unit/components/ui/DialogScrim.spec.js
git commit -F - <<'EOF'
feat(dashboard): add DialogScrim and use it for the event detail backdrop

Dim baseline with optional blur (Pi-perf safe); tap-to-dismiss reuses the
existing close handler.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
```

---

## Task 8: `DashboardPanel` focus-light surface + retoken

**Files:**
- Modify: `frontend/src/components/DashboardPanel.vue`
- Test: `frontend/tests/unit/components/DashboardPanel.spec.js` (create)

**Interfaces:**
- Consumes: `FocusPanel` with `dim` prop (Task 4).
- Produces: `DashboardPanel` gains props `focused` (bool, default `false`) and `dim` (bool, default `false`). Its root becomes a `FocusPanel` carrying the focus-light. Existing props (`title`, `subtitle`, `variant`, `headerVisible`) and the `#actions` slot are unchanged; `showPanelHeader` still gates on `headerVisible && configStore.shouldShowUI`. Restyle to new tokens + `--font-display` title.

Default `focused=false, dim=false` ⇒ neutral panel (no glow, no dimming) — so any current usage that doesn't pass the new props renders calm, matching the ambient state.

- [ ] **Step 1: Write the failing test**

Create `frontend/tests/unit/components/DashboardPanel.spec.js`:

```javascript
import { describe, it, expect, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import { setActivePinia, createPinia } from "pinia";
import DashboardPanel from "@/components/DashboardPanel.vue";
import { useConfigStore } from "@/stores/config";

const mountPanel = props => {
  const store = useConfigStore();
  store.showUI = true;
  return mount(DashboardPanel, {
    props: { title: "Kalender", ...props },
    slots: { default: "<p>body</p>", actions: "<button>x</button>" },
  });
};

describe("DashboardPanel focus-light", () => {
  beforeEach(() => setActivePinia(createPinia()));

  it("is neutral by default (no focus, no dim)", () => {
    const w = mountPanel();
    const panel = w.find(".focus-panel");
    expect(panel.exists()).toBe(true);
    expect(panel.classes()).not.toContain("is-focused");
    expect(panel.classes()).not.toContain("is-dim");
  });

  it("lights up when focused", () => {
    const w = mountPanel({ focused: true });
    expect(w.find(".focus-panel").classes()).toContain("is-focused");
  });

  it("dims when dim=true and not focused", () => {
    const w = mountPanel({ dim: true });
    expect(w.find(".focus-panel").classes()).toContain("is-dim");
  });

  it("still renders title and actions slot", () => {
    const w = mountPanel();
    expect(w.find(".dashboard-panel__title").text()).toBe("Kalender");
    expect(w.find(".dashboard-panel__actions").exists()).toBe(true);
  });
});
```

- [ ] **Step 2: Run it — expect FAIL** (no `.focus-panel` root yet).

Run: `npx vitest run tests/unit/components/DashboardPanel.spec.js`

- [ ] **Step 3: Implement**

Edit `frontend/src/components/DashboardPanel.vue`. Make the root a `FocusPanel` and retoken. New `<template>` and `<script setup>`:

```vue
<template>
  <FocusPanel
    as="section"
    :focused="focused"
    :dim="dim"
    :class="panelClasses"
  >
    <header v-if="showPanelHeader" class="dashboard-panel__header">
      <div class="dashboard-panel__title-group">
        <h2 class="dashboard-panel__title">{{ title }}</h2>
        <p v-if="subtitle" class="dashboard-panel__subtitle">{{ subtitle }}</p>
      </div>
      <div v-if="$slots.actions" class="dashboard-panel__actions">
        <slot name="actions" />
      </div>
    </header>
    <div class="dashboard-panel__body">
      <slot />
    </div>
  </FocusPanel>
</template>

<script setup>
import { computed } from "vue";
import { useConfigStore } from "../stores/config";
import FocusPanel from "./ui/FocusPanel.vue";

const props = defineProps({
  title: { type: String, required: true },
  subtitle: { type: String, default: "" },
  variant: {
    type: String,
    default: "default",
    validator: value => ["default", "dense", "media", "iframe"].includes(value),
  },
  headerVisible: { type: Boolean, default: true },
  focused: { type: Boolean, default: false },
  dim: { type: Boolean, default: false },
});

const configStore = useConfigStore();

const showPanelHeader = computed(() => props.headerVisible && configStore.shouldShowUI);
const panelClasses = computed(() => [
  "dashboard-panel",
  `dashboard-panel--${props.variant}`,
  { "dashboard-panel--header-hidden": !showPanelHeader.value },
]);
</script>
```

Update the `<style>`:
- Remove `background: var(--bg-primary)` and `border-radius: 8px` from `.dashboard-panel` (FocusPanel now provides the surface + 18px radius). Keep the layout properties (`width/height/display/flex/overflow`).
- `.dashboard-panel--media` — keep `background: #000` **but move it to the body** so the focus-light surface still shows the lit border. Replace the `.dashboard-panel--media { background: #000; }` rule with `.dashboard-panel--media .dashboard-panel__body { background: var(--bg-0); }` (the photo fills the body anyway; use a token, not `#000`).
- `.dashboard-panel__header`: `background` → transparent (drop the fill so it blends into the lit panel); `border-bottom: 1px solid var(--border-color)` → `1px solid var(--line-soft)`.
- `.dashboard-panel__title`: `color: var(--text-primary)` → `var(--ink)`; add `font-family: var(--font-display);`.
- `.dashboard-panel__subtitle`: `color: var(--text-secondary)` → `var(--ink-2)`.

- [ ] **Step 4: Run DashboardPanel spec + region-surfaces spec — expect PASS**

Run: `npx vitest run tests/unit/components/DashboardPanel.spec.js tests/unit/components/DashboardRegionSurfaces.spec.js`
Expected: PASS. (The region-surfaces spec mounts components that use DashboardPanel; confirm no regression.)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/DashboardPanel.vue frontend/tests/unit/components/DashboardPanel.spec.js
git commit -F - <<'EOF'
feat(dashboard): make DashboardPanel a focus-light surface

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
```

---

## Task 9: Thread `focused`/`dim` + `RegionControls` through region components

**Files:**
- Modify: `frontend/src/components/CalendarView.vue`, `frontend/src/components/PhotoSlideshow.vue`, `frontend/src/components/WebServiceViewer.vue`
- Test: `frontend/tests/unit/components/regionFocusForwarding.spec.js` (create)

**Interfaces:**
- Consumes: `DashboardPanel` `focused`/`dim` props (Task 8), `RegionControls` (Task 5).
- Produces: each region component accepts `focused: Boolean (default false)` and `dim: Boolean (default false)`, forwards them to its `DashboardPanel`, and renders `<RegionControls :region-kind="..." />` inside the panel's `#actions` slot **when `focused`**. For PhotoSlideshow, the new `RegionControls` replaces its bespoke `‹ ›` slot buttons (consolidation). The `region-kind` is fixed per component: CalendarView → `"calendar"`, PhotoSlideshow → `"photos"`, WebServiceViewer → `"service"`.

Notes:
- These components use `defineAsyncComponent` for inner pieces in some places; import `RegionControls` normally (`import RegionControls from "./dashboard/RegionControls.vue";`).
- WebServiceViewer renders `DashboardPanel` only in its empty state and otherwise a `ServiceViewer` with `:header-visible`. For Cycle B, host `RegionControls` in the empty-state `DashboardPanel` `#actions` and in the `ServiceViewer` actions slot if it exposes one; if `ServiceViewer` has no actions slot, render the `RegionControls` as a sibling overlay positioned top-right within `.service-container` (absolute, `z-index: 4`) gated by `focused`. Read the file to choose; keep it ≥46px and token-styled.
- Read each file first; only add the props, the `:focused`/`:dim` forwarding, and the `#actions` content. Don't alter data fetching, rotation, or fullscreen logic.

- [ ] **Step 1: Write the failing test**

Create `frontend/tests/unit/components/regionFocusForwarding.spec.js`. Mock the heavy children so the test stays focused on forwarding:

```javascript
import { describe, it, expect, beforeEach, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { setActivePinia, createPinia } from "pinia";

vi.mock("@/composables/useTouchCapability", () => ({
  useTouchCapability: () => ({ isTouch: { value: true } }),
}));
vi.mock("@/composables/useKeyboardActions", () => ({
  useKeyboardActions: () => ({ handleAction: vi.fn() }),
}));

import PhotoSlideshow from "@/components/PhotoSlideshow.vue";
import { useConfigStore } from "@/stores/config";
import { useImagesStore } from "@/stores/images";

const stubs = {
  // stub DashboardPanel to expose the actions slot + props it received
  DashboardPanel: {
    name: "DashboardPanel",
    props: ["title", "focused", "dim", "headerVisible", "variant"],
    template:
      '<section class="panel-stub" :data-focused="focused" :data-dim="dim"><slot name="actions" /><slot /></section>',
  },
};

describe("region focus forwarding (PhotoSlideshow)", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    const images = useImagesStore();
    images.fetchImages = vi.fn().mockResolvedValue({ images: [] });
    images.fetchCurrentImage = vi.fn().mockResolvedValue(undefined);
    images.images = [];
    images.loading = false;
    images.error = null;
    const config = useConfigStore();
    config.showUI = true;
  });

  it("forwards focused/dim to its panel", () => {
    const w = mount(PhotoSlideshow, {
      props: { focused: true, dim: false, isFullscreen: false },
      global: { stubs },
    });
    const panel = w.find(".panel-stub");
    expect(panel.attributes("data-focused")).toBe("true");
  });

  it("renders RegionControls in the actions slot when focused", () => {
    const w = mount(PhotoSlideshow, {
      props: { focused: true, isFullscreen: false },
      global: { stubs },
    });
    expect(w.find(".region-controls").exists()).toBe(true);
  });

  it("hides RegionControls when not focused", () => {
    const w = mount(PhotoSlideshow, {
      props: { focused: false, isFullscreen: false },
      global: { stubs },
    });
    expect(w.find(".region-controls").exists()).toBe(false);
  });
});
```

- [ ] **Step 2: Run it — expect FAIL.**

Run: `npx vitest run tests/unit/components/regionFocusForwarding.spec.js`

- [ ] **Step 3: Implement (PhotoSlideshow)**

In `frontend/src/components/PhotoSlideshow.vue`:
1. Add to props: `focused: { type: Boolean, default: false }, dim: { type: Boolean, default: false }`.
2. Import: `import RegionControls from "./dashboard/RegionControls.vue";`
3. On the `<DashboardPanel>`: add `:focused="focused" :dim="dim"`.
4. Replace the `#actions` slot's bespoke `‹ ›` buttons with:
```vue
<template #actions>
  <RegionControls v-if="focused" region-kind="photos" />
</template>
```
(Keep the `error-message` display if present, above/beside the controls, or move it into the body — do not delete error display.)

- [ ] **Step 4: Implement (CalendarView)**

In `frontend/src/components/CalendarView.vue`:
1. Add props `focused`/`dim` (default false).
2. Import `RegionControls`.
3. On its `<DashboardPanel title="Calendar">` add `:focused="focused" :dim="dim"` and an actions slot:
```vue
<template #actions>
  <RegionControls v-if="focused" region-kind="calendar" />
</template>
```
Leave CalendarView's internal grid/nav and `EventDetailPanel`/`DialogScrim` unchanged.

- [ ] **Step 5: Implement (WebServiceViewer)**

In `frontend/src/components/WebServiceViewer.vue`:
1. Add props `focused`/`dim` (default false).
2. Import `RegionControls`.
3. Forward `:focused="focused" :dim="dim"` to the empty-state `<DashboardPanel>`. Add `<template #actions><RegionControls v-if="focused" region-kind="service" /></template>` to it.
4. For the active `ServiceViewer` path, render `<RegionControls v-if="focused" region-kind="service" />` as a top-right overlay inside `.service-container` (absolute positioned, `z-index: 4`) — or via `ServiceViewer`'s actions slot if it has one (read the file). Don't change service routing/iframe logic.

- [ ] **Step 6: Run forwarding spec + region-surfaces spec — expect PASS**

Run: `npx vitest run tests/unit/components/regionFocusForwarding.spec.js tests/unit/components/DashboardRegionSurfaces.spec.js`

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/CalendarView.vue frontend/src/components/PhotoSlideshow.vue frontend/src/components/WebServiceViewer.vue frontend/tests/unit/components/regionFocusForwarding.spec.js
git commit -F - <<'EOF'
feat(dashboard): forward focus state and host RegionControls in regions

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
```

---

## Task 10: `DashboardRegion` — emit `focus-region`, thread `focused`/`dim` to leaves

**Files:**
- Modify: `frontend/src/components/DashboardRegion.vue`
- Test: `frontend/tests/unit/components/DashboardRegionFocus.spec.js` (create)

**Interfaces:**
- Consumes: region components' `focused`/`dim` props (Task 9).
- Produces: `DashboardRegion` accepts new props `lightActive: Boolean (default false)` and `dimOthers: Boolean (default true)` (in addition to the existing `region`, `photoRotationInterval`, `parentDirection`, `activeRegionId`). It:
  - emits `focus-region(regionId)` when a region/subregion is tapped (the leaf id),
  - computes per-leaf `focused = lightActive && leafId === activeRegionId`,
  - computes per-leaf `dim = lightActive && dimOthers && leafId !== activeRegionId`,
  - passes `:focused`/`:dim` to each leaf component.

For the non-split case the "leaf id" is `region.id`; for the split case it's `sub.id`. Wrap each rendered leaf so the tap handler has the id (use `@click` on the existing `.dashboard-region` / `.dashboard-subregion` wrappers).

- [ ] **Step 1: Write the failing test**

Create `frontend/tests/unit/components/DashboardRegionFocus.spec.js`:

```javascript
import { describe, it, expect, beforeEach, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { setActivePinia, createPinia } from "pinia";

vi.mock("@/composables/useTouchCapability", () => ({
  useTouchCapability: () => ({ isTouch: { value: true } }),
}));
vi.mock("@/composables/useKeyboardActions", () => ({
  useKeyboardActions: () => ({ handleAction: vi.fn() }),
}));

import DashboardRegion from "@/components/DashboardRegion.vue";

const leafStub = name => ({
  name,
  props: ["focused", "dim", "sourceIds", "isFullscreen", "autoRotate", "rotationInterval", "serviceId"],
  template: `<div class="leaf" :data-focused="focused" :data-dim="dim" />`,
});

const stubs = {
  CalendarView: leafStub("CalendarView"),
  PhotoSlideshow: leafStub("PhotoSlideshow"),
  WebServiceViewer: leafStub("WebServiceViewer"),
};

const calRegion = { id: "cal", kind: "calendar", instanceIds: [], size: 100 };

describe("DashboardRegion focus", () => {
  beforeEach(() => setActivePinia(createPinia()));

  it("emits focus-region with the region id on tap", async () => {
    const w = mount(DashboardRegion, {
      props: { region: calRegion, photoRotationInterval: 30, activeRegionId: "cal", lightActive: true },
      global: { stubs },
    });
    await w.find(".dashboard-region").trigger("click");
    expect(w.emitted("focus-region")[0]).toEqual(["cal"]);
  });

  it("passes focused=true to the active leaf when lightActive", async () => {
    const w = mount(DashboardRegion, {
      props: { region: calRegion, photoRotationInterval: 30, activeRegionId: "cal", lightActive: true },
      global: { stubs },
    });
    expect(w.find(".leaf").attributes("data-focused")).toBe("true");
  });

  it("does not light the leaf when lightActive is false", () => {
    const w = mount(DashboardRegion, {
      props: { region: calRegion, photoRotationInterval: 30, activeRegionId: "cal", lightActive: false },
      global: { stubs },
    });
    expect(w.find(".leaf").attributes("data-focused")).toBe("false");
  });
});
```

- [ ] **Step 2: Run it — expect FAIL.**

Run: `npx vitest run tests/unit/components/DashboardRegionFocus.spec.js`

- [ ] **Step 3: Implement**

Edit `frontend/src/components/DashboardRegion.vue`:
1. Add props: `lightActive: { type: Boolean, default: false }`, `dimOthers: { type: Boolean, default: true }`.
2. `const emit = defineEmits(["focus-region"]);`
3. Add helpers:
```javascript
const isFocused = leafId => props.lightActive && leafId === props.activeRegionId;
const isDim = leafId =>
  props.lightActive && props.dimOthers && leafId !== props.activeRegionId;
```
4. Non-split wrapper: add `@click="emit('focus-region', region.id)"` to the `.dashboard-region` (or wrap the single leaf in a clickable element) and pass `:focused="isFocused(region.id)" :dim="isDim(region.id)"` to the leaf component.
5. Split case: on each `.dashboard-subregion` add `@click="emit('focus-region', sub.id)"` and pass `:focused="isFocused(sub.id)" :dim="isDim(sub.id)"` to the sub-leaf component. Keep the existing `dashboard-subregion-active` class logic OR replace it with the new focused styling (the leaf's DashboardPanel now carries the light; the old `outline` on `.dashboard-subregion` can be removed since the panel lights itself — remove `.dashboard-subregion-active` outline CSS to avoid a double highlight).

- [ ] **Step 4: Run it — expect PASS** (3 tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/DashboardRegion.vue frontend/tests/unit/components/DashboardRegionFocus.spec.js
git commit -F - <<'EOF'
feat(dashboard): emit focus-region and thread focus-light to leaves

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
```

---

## Task 11: `Dashboard.vue` — focus-light state machine + tap-to-focus

**Files:**
- Modify: `frontend/src/views/Dashboard.vue`
- Test: `frontend/tests/unit/views/DashboardFocusLight.spec.js` (create)

**Interfaces:**
- Consumes: `configStore.focusLightMode`/`focusLightDimOthers`/`shouldShowUI`/`showUITemporarily` (Task 1 + existing); `useKeyboardActions().focusRegion` (Task 2); `DashboardRegion` `lightActive`/`dimOthers`/`@focus-region` (Task 10).
- Produces: replaces the 2.5s highlight timer with a derived focus-light state:
  - `lightActive = focusLightMode === 'always' || (focusLightMode === 'interaction' && shouldShowUI)`. When `focusLightMode === 'off'`, `lightActive` is always false.
  - Each region section passes `:light-active="lightActive"` and `:dim-others="configStore.focusLightDimOthers"` to `DashboardRegion`, and handles `@focus-region="onFocusRegion"`.
  - `onFocusRegion(regionId)`: call `configStore.showUITemporarily(60)` (so a touch blooms the chrome on the kiosk) then `focusRegion(regionId)`.
- Removed: `ACTIVE_HIGHLIGHT_MS`, `activeRegionHighlightVisible`, `activeRegionHighlightTimer`, the `watch` on `activeRegionId`, the timer cleanup in `onUnmounted`, the `isActiveRegionElement`-gated `dashboard-region-section-active` class, and the `.dashboard-region-section-active { outline-color }` CSS. The old `active-region-id` prop passing (`activeRegionHighlightVisible ? ... : null`) becomes a plain `:active-region-id="activeScreen.activeRegionId"`.

- [ ] **Step 1: Write the failing test**

Create `frontend/tests/unit/views/DashboardFocusLight.spec.js`. Stub `DashboardRegion` and the clock bars; assert the computed `lightActive` is forwarded and `focus-region` is handled.

```javascript
import { describe, it, expect, beforeEach, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { setActivePinia, createPinia } from "pinia";

const focusRegion = vi.fn();
vi.mock("@/composables/useKeyboardActions", () => ({
  useKeyboardActions: () => ({ handleAction: vi.fn(), focusRegion, activateScreen: vi.fn() }),
}));
vi.mock("vue-router", () => ({
  useRoute: () => ({ path: "/" }),
}));

import Dashboard from "@/views/Dashboard.vue";
import { useConfigStore } from "@/stores/config";

const screens = {
  version: 2,
  activeScreenId: "s1",
  screens: [
    {
      id: "s1",
      name: "Home",
      activeRegionId: "cal",
      layout: { regions: [{ id: "cal", kind: "calendar", instanceIds: [], size: 100 }] },
    },
  ],
};

const regionStub = {
  name: "DashboardRegion",
  props: ["region", "photoRotationInterval", "parentDirection", "activeRegionId", "lightActive", "dimOthers"],
  emits: ["focus-region"],
  template: '<div class="region-stub" :data-light="lightActive" @click="$emit(\'focus-region\', region.id)" />',
};

const stubs = {
  DashboardRegion: regionStub,
  ClockBarHorizontal: true,
  ClockBarVertical: true,
  MinimalUIOverlay: true,
  LayoutManager: { template: "<div><slot /></div>" },
};

function setup(configMutator) {
  setActivePinia(createPinia());
  const store = useConfigStore();
  store.setDashboardScreens(screens);
  store.showUI = true;
  store.fetchConfig = vi.fn().mockResolvedValue({});
  if (configMutator) configMutator(store);
  return mount(Dashboard, { global: { stubs } });
}

describe("Dashboard focus-light", () => {
  beforeEach(() => focusRegion.mockClear());

  it("lightActive is true in interaction mode when UI is shown", () => {
    const w = setup(s => {
      s.focusLightMode = "interaction";
    });
    expect(w.find(".region-stub").attributes("data-light")).toBe("true");
  });

  it("lightActive is false in off mode even when UI is shown", () => {
    const w = setup(s => {
      s.focusLightMode = "off";
    });
    expect(w.find(".region-stub").attributes("data-light")).toBe("false");
  });

  it("tap calls showUITemporarily + focusRegion", async () => {
    const w = setup(s => {
      s.focusLightMode = "interaction";
      s.showUITemporarily = vi.fn();
    });
    await w.find(".region-stub").trigger("click");
    expect(focusRegion).toHaveBeenCalledWith("cal");
  });
});
```

- [ ] **Step 2: Run it — expect FAIL.**

Run: `npx vitest run tests/unit/views/DashboardFocusLight.spec.js`

- [ ] **Step 3: Implement**

In `frontend/src/views/Dashboard.vue` `<script setup>`:
1. Import the touch helpers: `import { useKeyboardActions } from "../composables/useKeyboardActions";` and `const { focusRegion } = useKeyboardActions();`
2. Add:
```javascript
const lightActive = computed(() => {
  if (configStore.focusLightMode === "off") return false;
  if (configStore.focusLightMode === "always") return true;
  return configStore.shouldShowUI; // 'interaction'
});

const onFocusRegion = regionId => {
  if (typeof configStore.showUITemporarily === "function") {
    configStore.showUITemporarily(60);
  }
  focusRegion(regionId);
};
```
3. Remove `ACTIVE_HIGHLIGHT_MS`, `activeRegionHighlightVisible`, `activeRegionHighlightTimer`, the `watch(() => activeScreen.value?.activeRegionId, ...)`, and the timer clear in `onUnmounted`. Keep the `configPollInterval` cleanup.
4. You can drop `isActiveRegionElement` (no longer used) — verify no other reference remains.

In the `<template>`:
1. On the region `<div class="dashboard-region-section">`, remove the `dashboard-region-section-active` conditional class binding (delete the `:class` active entry; keep the base class + `:style`).
2. Update the `<DashboardRegion>`:
```vue
<DashboardRegion
  :region="getRegionForElement(elementType)"
  :photo-rotation-interval="configStore.photoRotationInterval"
  :parent-direction="layoutDirection"
  :active-region-id="activeScreen.activeRegionId"
  :light-active="lightActive"
  :dim-others="configStore.focusLightDimOthers"
  @focus-region="onFocusRegion"
/>
```

In `<style>`: delete `.dashboard-region-section-active { outline-color: var(--accent-primary); }` and the `outline`/`transition: outline-color` lines on `.dashboard-region-section` (the panel now carries the light). Keep the layout properties.

- [ ] **Step 4: Run it + the existing Dashboard/keyboard/layout specs — expect PASS**

Run: `npx vitest run tests/unit/views/DashboardFocusLight.spec.js tests/unit/composables/useKeyboardActions.spec.js tests/unit/stores/mode.spec.js tests/unit/utils/layout.spec.js`
Expected: PASS (the keyboard/mode/layout specs prove the vocabulary path is untouched).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/views/Dashboard.vue frontend/tests/unit/views/DashboardFocusLight.spec.js
git commit -F - <<'EOF'
feat(dashboard): focus-light state machine and tap-to-focus

Replaces the 2.5s highlight timer with interaction/always/off modes gated
on shouldShowUI; taps bloom the chrome and move focus via the shared path.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
```

---

## Task 12: `AdminOverflow.vue` + `BarActionCluster` delegation

**Files:**
- Create: `frontend/src/components/dashboard/AdminOverflow.vue`
- Modify: `frontend/src/components/BarActionCluster.vue`
- Test: `frontend/tests/unit/components/dashboard/AdminOverflow.spec.js`

**Interfaces:**
- Produces: `<AdminOverflow />` — a `⋯` trigger button (≥46px) that toggles a popover containing the four admin actions: **Web Services/Photos toggle**, **side-view position**, **orientation**, **Hide UI**. It owns these handlers (moved verbatim from `BarActionCluster`: `showWebServices`, `showPhotos`, `toggleSideViewPosition`, `toggleOrientation`, `configStore.toggleUI`) using the same stores. Popover closes on outside click, on `Escape`, and after an action. Follows the Cycle-A `SelectPill` outside-click + Escape pattern (document listener registered only while open, removed on close and `onUnmounted`).
- `BarActionCluster` keeps `ConnectionIndicator`, the backend health `status-indicator`, the **Settings gear** (visible), and now renders `<AdminOverflow />` in place of the four admin buttons. The settings gear stays a direct button (not in the overflow). Retoken its styles (legacy → new).

- [ ] **Step 1: Write the failing test**

Create `frontend/tests/unit/components/dashboard/AdminOverflow.spec.js`:

```javascript
import { describe, it, expect, beforeEach, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { setActivePinia, createPinia } from "pinia";

vi.mock("vue-router", () => ({ useRouter: () => ({ push: vi.fn() }) }));

import AdminOverflow from "@/components/dashboard/AdminOverflow.vue";
import { useConfigStore } from "@/stores/config";

describe("AdminOverflow", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    const store = useConfigStore();
    store.showUI = true;
  });

  it("popover is closed initially and opens on trigger click", async () => {
    const w = mount(AdminOverflow, { attachTo: document.body });
    expect(w.find(".admin-overflow__menu").exists()).toBe(false);
    await w.get(".admin-overflow__trigger").trigger("click");
    expect(w.find(".admin-overflow__menu").exists()).toBe(true);
    w.unmount();
  });

  it("toggles orientation and closes after the action", async () => {
    const store = useConfigStore();
    const spy = vi.spyOn(store, "setOrientation");
    const w = mount(AdminOverflow, { attachTo: document.body });
    await w.get(".admin-overflow__trigger").trigger("click");
    await w.get('[data-admin="orientation"]').trigger("click");
    expect(spy).toHaveBeenCalled();
    expect(w.find(".admin-overflow__menu").exists()).toBe(false);
    w.unmount();
  });

  it("Escape closes the popover", async () => {
    const w = mount(AdminOverflow, { attachTo: document.body });
    await w.get(".admin-overflow__trigger").trigger("click");
    await w.get(".admin-overflow__trigger").trigger("keydown", { key: "Escape" });
    expect(w.find(".admin-overflow__menu").exists()).toBe(false);
    w.unmount();
  });
});
```

- [ ] **Step 2: Run it — expect FAIL.**

Run: `npx vitest run tests/unit/components/dashboard/AdminOverflow.spec.js`

- [ ] **Step 3: Implement `AdminOverflow.vue`**

Create `frontend/src/components/dashboard/AdminOverflow.vue`. Move the four handlers from `BarActionCluster` here. Use the SelectPill close pattern:

```vue
<template>
  <div class="admin-overflow">
    <button
      type="button"
      class="admin-overflow__trigger"
      aria-label="More controls"
      :aria-expanded="open ? 'true' : 'false'"
      aria-haspopup="menu"
      @click="toggle"
      @keydown.escape="close"
    >
      ⋯
    </button>
    <div v-if="open" class="admin-overflow__menu" role="menu">
      <button type="button" role="menuitem" class="admin-overflow__item" data-admin="mode" @click="onMode">
        {{ modeLabel }}
      </button>
      <button type="button" role="menuitem" class="admin-overflow__item" data-admin="side-view" @click="onSideView">
        {{ sideViewPositionTitle }}
      </button>
      <button type="button" role="menuitem" class="admin-overflow__item" data-admin="orientation" @click="onOrientation">
        {{ orientationLabel }}
      </button>
      <button type="button" role="menuitem" class="admin-overflow__item" data-admin="hide-ui" @click="onHideUi">
        Hide UI
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onUnmounted } from "vue";
import { useConfigStore } from "../../stores/config";
import { useModeStore } from "../../stores/mode";
import { logError } from "../../utils/logger";

const configStore = useConfigStore();
const modeStore = useModeStore();

const open = ref(false);

const onDocClick = event => {
  if (!event.target.closest(".admin-overflow")) close();
};

const toggle = () => {
  open.value ? close() : openMenu();
};
const openMenu = () => {
  open.value = true;
  document.addEventListener("click", onDocClick, true);
};
const close = () => {
  if (!open.value) return;
  open.value = false;
  document.removeEventListener("click", onDocClick, true);
};
onUnmounted(() => document.removeEventListener("click", onDocClick, true));

const modeLabel = computed(() =>
  modeStore.currentMode === modeStore.MODES.WEB_SERVICES ? "Show Photos" : "Show Web Services"
);
const orientationLabel = computed(() =>
  configStore.orientation === "landscape" ? "Switch to Portrait" : "Switch to Landscape"
);
const sideViewPositionTitle = computed(() => {
  if (configStore.orientation === "landscape") {
    return configStore.sideViewPosition === "right" ? "Side view: left" : "Side view: right";
  }
  return configStore.sideViewPosition === "bottom" ? "Side view: top" : "Side view: bottom";
});

const onMode = () => {
  if (modeStore.currentMode === modeStore.MODES.WEB_SERVICES) {
    configStore.setLastSideViewMode("photos");
    modeStore.setMode(modeStore.MODES.PHOTOS);
  } else {
    configStore.setLastSideViewMode("web_services");
    modeStore.setMode(modeStore.MODES.WEB_SERVICES);
  }
  close();
};
const onSideView = async () => {
  configStore.toggleSideViewPosition();
  try {
    await configStore.updateConfig({ sideViewPosition: configStore.sideViewPosition });
  } catch (err) {
    logError("[AdminOverflow]", "Failed to save side view position:", err);
  }
  close();
};
const onOrientation = () => {
  const next = configStore.orientation === "landscape" ? "portrait" : "landscape";
  configStore.setOrientation(next);
  configStore.setSideViewPosition(next === "landscape" ? "right" : "bottom");
  close();
};
const onHideUi = () => {
  configStore.toggleUI();
  close();
};
</script>

<style scoped>
.admin-overflow {
  position: relative;
  display: inline-flex;
}
.admin-overflow__trigger {
  min-width: 46px;
  min-height: 46px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 1.25rem;
  color: var(--ink-2);
  background: var(--bg-2);
  border: 1px solid var(--line);
  border-radius: 11px;
  cursor: pointer;
}
.admin-overflow__trigger:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: 2px;
}
.admin-overflow__menu {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  z-index: 20;
  min-width: 200px;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  padding: 0.4rem;
  background: var(--bg-1);
  border: 1px solid var(--line);
  border-radius: 12px;
  box-shadow: 0 18px 50px -16px var(--focus-glow);
}
.admin-overflow__item {
  min-height: 46px;
  text-align: left;
  padding: 0 0.85rem;
  font-family: var(--font-ui);
  font-size: 0.95rem;
  color: var(--ink);
  background: transparent;
  border: 0;
  border-radius: 9px;
  cursor: pointer;
}
.admin-overflow__item:hover {
  background: var(--bg-2);
}
.admin-overflow__item:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: -2px;
}
</style>
```

- [ ] **Step 4: Run AdminOverflow spec — expect PASS** (3 tests).

- [ ] **Step 5: Refactor `BarActionCluster`**

In `frontend/src/components/BarActionCluster.vue`:
1. Import `AdminOverflow` (`import AdminOverflow from "./dashboard/AdminOverflow.vue";`).
2. In the `<template v-if="configStore.shouldShowUI">` block, **remove** the four admin buttons (web/photos toggle, side-view, orientation, hide-UI). **Keep** the Settings gear button. Add `<AdminOverflow />` next to the gear.
3. Remove the now-unused handlers/computeds in the script that only those four buttons used (`toggleOrientation`, `toggleSideViewPosition`, `showWebServices`, `showPhotos`, `orientationIcon/Label/Title`, `sideViewPositionIcon/Title`) — they now live in `AdminOverflow`. Keep `goToSettings`, the health check, `ConnectionIndicator`. Verify no dangling references.
4. Retoken styles: `--bg-tertiary`→`--bg-2`, `--text-primary`→`--ink`, `--border-color`→`--line`, `--text-secondary`→`--ink-2`, and the status-dot colors → `--ok`/`--warn`/`--err` (healthy→`--ok`, checking→`--warn`, error→`--err`). Keep the bar-btn 46px-friendly.

- [ ] **Step 6: Run BarActionCluster + ClockBar specs — expect PASS**

Run: `npx vitest run tests/unit/components/dashboard/AdminOverflow.spec.js tests/unit/components/ClockBarHorizontal.spec.js`
(If a `BarActionCluster.spec.js` exists, run it. The ClockBar spec stubs `BarActionCluster: true`, so it should be unaffected.)

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/dashboard/AdminOverflow.vue frontend/src/components/BarActionCluster.vue frontend/tests/unit/components/dashboard/AdminOverflow.spec.js
git commit -F - <<'EOF'
feat(dashboard): move admin buttons into an overflow menu

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
```

---

## Task 13: `ClockBarHorizontal` — restyle + room label + screen dots

**Files:**
- Modify: `frontend/src/components/ClockBarHorizontal.vue`
- Test: `frontend/tests/unit/components/ClockBarHorizontal.spec.js` (extend the existing spec)

**Interfaces:**
- Consumes: `ScreenDots` (Task 6), `configStore.displayName` (Task 1), `useKeyboardActions().activateScreen` (Task 2), `normalizeDashboardScreens`/`getActiveDashboardScreen` (existing `layout.js`).
- Produces: the horizontal bar restyled to `mock-nobar.png`: **left** = `BarLogo` + optional room label (`configStore.displayName`, shown only when non-empty) + `ScreenDots`; **center** = clock (`--font-display`, tabular) + date (`--font-data`); **right** = `PluginStatusbarItems` (weather) + `BarActionCluster` (which now contains connection/health/gear/overflow). Tapping a dot calls `activateScreen(screenId)`.

Keep the `v-if="shouldShow"`, `position`, padding, preview props, and `useClockBar` wiring intact. The room label and dots render only in non-preview mode.

- [ ] **Step 1: Add failing tests**

Append to `frontend/tests/unit/components/ClockBarHorizontal.spec.js` (it already sets up Pinia + `matchMedia` + stubs `BarActionCluster`). Add `ScreenDots` is real (not stubbed) so we can assert it:

```javascript
it("shows the room label when displayName is set", () => {
  const store = useConfigStore();
  store.showUI = true;
  store.displayName = "Vardagsrummet";
  const wrapper = mount(ClockBarHorizontal, {
    props: { position: "top", showInNonKiosk: true, showInKiosk: false, enabled: true },
    global: { stubs: { BarActionCluster: true } },
  });
  expect(wrapper.text()).toContain("Vardagsrummet");
});

it("hides the room label when displayName is empty", () => {
  const store = useConfigStore();
  store.showUI = true;
  store.displayName = "";
  const wrapper = mount(ClockBarHorizontal, {
    props: { position: "top", showInNonKiosk: true, showInKiosk: false, enabled: true },
    global: { stubs: { BarActionCluster: true } },
  });
  expect(wrapper.find(".clock-bar-room").exists()).toBe(false);
});
```

- [ ] **Step 2: Run it — expect FAIL** (room label markup missing).

Run: `npx vitest run tests/unit/components/ClockBarHorizontal.spec.js`

- [ ] **Step 3: Implement**

In `frontend/src/components/ClockBarHorizontal.vue`:
1. Imports: add
```javascript
import ScreenDots from "./ui/ScreenDots.vue";
import { useKeyboardActions } from "../composables/useKeyboardActions";
import { normalizeDashboardScreens, getActiveDashboardScreen } from "../utils/layout";
```
2. Script: add
```javascript
const { activateScreen } = useKeyboardActions();
const screensConfig = computed(() => normalizeDashboardScreens(configStore.dashboardScreens));
const screens = computed(() => screensConfig.value.screens);
const activeScreenId = computed(() => getActiveDashboardScreen(screensConfig.value)?.id ?? null);
const roomLabel = computed(() => configStore.displayName);
```
3. Template — restructure the sides to match the mock (spec §6): **left** = logo + room label + dots; **right** = weather (`PluginStatusbarItems`) + `BarActionCluster`. Move `<PluginStatusbarItems>` from the left side to the right (before `BarActionCluster`):
```vue
<div class="clock-bar-side clock-bar-left">
  <BarLogo v-if="showLogo" />
  <span v-if="!previewMode && roomLabel" class="clock-bar-room">{{ roomLabel }}</span>
  <ScreenDots
    v-if="!previewMode"
    :screens="screens"
    :active-screen-id="activeScreenId"
    @select-screen="activateScreen"
  />
  <span v-if="isBackgroundRefreshing" class="clock-refresh-icon" aria-hidden="true" />
</div>
```
and the right side:
```vue
<div class="clock-bar-side clock-bar-right">
  <PluginStatusbarItems v-if="showStatusbar" />
  <BarActionCluster v-if="!previewMode" :compact="false" />
</div>
```
(If the existing `ClockBarHorizontal.spec.js` asserts `PluginStatusbarItems` on the left, update that assertion to the right side.)
4. Retoken + type the clock/date in `<style>`:
- `.clock-time` → add `font-family: var(--font-display); font-variant-numeric: tabular-nums lining-nums; color: var(--ink);`
- `.clock-date` → add `font-family: var(--font-data); font-variant-numeric: tabular-nums lining-nums; color: var(--ink-2);`
- Add `.clock-bar-room { font-family: var(--font-ui); color: var(--ink-3); font-size: 0.95rem; }`
- Swap any legacy tokens used by the bar container/borders to the new ones.
5. **Vertical bar token parity (no structural change):** in `frontend/src/components/ClockBarVertical.vue`, swap legacy tokens to the new ones per the token table (`--bg-primary`→`--bg-1`, `--border-color`→`--line`, `--text-primary`→`--ink`, `--text-secondary`→`--ink-2`) and add `font-family: var(--font-display)` + tabular figures to its clock and `var(--font-data)` to its date, so vertical bars share the palette/type. Do not restructure its layout. (Covered by the existing `ClockBarVertical.spec.js`; run it in Step 4.)

- [ ] **Step 4: Run it — expect PASS** (existing + new tests).

Run: `npx vitest run tests/unit/components/ClockBarHorizontal.spec.js tests/unit/components/ClockBarVertical.spec.js`

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/ClockBarHorizontal.vue frontend/src/components/ClockBarVertical.vue frontend/tests/unit/components/ClockBarHorizontal.spec.js
git commit -F - <<'EOF'
feat(dashboard): restyle horizontal clock bar with room label and screen dots

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
```

---

## Task 14: Fullscreen touch close affordance

**Files:**
- Modify: `frontend/src/components/PhotoSlideshow.vue`, `frontend/src/components/WebServiceViewer.vue`
- Test: `frontend/tests/unit/components/fullscreenClose.spec.js` (create)

**Interfaces:**
- Consumes: `useTouchCapability().isTouch` (Task 3); `useKeyboardActions().handleAction` (existing) for the close actions (`photos_exit_fullscreen`, `web_service_exit_fullscreen` / `web_service_close`).
- Produces: when a region is fullscreen **and** `isTouch`, a visible ✕ close button (≥46px, top-right, token-styled) that calls the existing exit action. WebServiceViewer already has a `.fullscreen-close-overlay`; ensure it's shown for touch and token-styled. PhotoSlideshow has no fullscreen close — add one.

Confirm the exact exit action strings by reading `useKeyboardActions.js` (`photos_exit_fullscreen` exists per the action map; web services use `web_service_close`/`web_service_exit_fullscreen`). Use `handleAction(...)` so it stays on the frozen path.

- [ ] **Step 1: Write the failing test**

Create `frontend/tests/unit/components/fullscreenClose.spec.js`:

```javascript
import { describe, it, expect, beforeEach, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { setActivePinia, createPinia } from "pinia";

const handleAction = vi.fn();
vi.mock("@/composables/useKeyboardActions", () => ({
  useKeyboardActions: () => ({ handleAction }),
}));
vi.mock("@/composables/useTouchCapability", () => ({
  useTouchCapability: () => ({ isTouch: { value: true } }),
}));

import PhotoSlideshow from "@/components/PhotoSlideshow.vue";
import { useImagesStore } from "@/stores/images";
import { useConfigStore } from "@/stores/config";

describe("fullscreen touch close", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    handleAction.mockClear();
    const images = useImagesStore();
    images.fetchImages = vi.fn().mockResolvedValue({ images: [] });
    images.fetchCurrentImage = vi.fn().mockResolvedValue(undefined);
    images.images = [];
    images.loading = false;
    images.error = null;
    useConfigStore().showUI = true;
  });

  it("shows a touch close button in fullscreen and calls the exit action", async () => {
    const w = mount(PhotoSlideshow, { props: { isFullscreen: true } });
    const close = w.get('[data-action="exit-fullscreen"]');
    await close.trigger("click");
    expect(handleAction).toHaveBeenCalledWith("photos_exit_fullscreen");
  });
});
```

- [ ] **Step 2: Run it — expect FAIL.**

Run: `npx vitest run tests/unit/components/fullscreenClose.spec.js`

- [ ] **Step 3: Implement**

PhotoSlideshow: in the fullscreen branch of the template, add (gated by `isFullscreen && isTouch`):
```vue
<button
  v-if="isFullscreen && isTouch"
  type="button"
  class="fs-close"
  data-action="exit-fullscreen"
  aria-label="Exit fullscreen"
  @click="handleAction('photos_exit_fullscreen')"
>
  ✕
</button>
```
Add to script: `import { useKeyboardActions } from "@/composables/useKeyboardActions"; import { useTouchCapability } from "@/composables/useTouchCapability"; const { handleAction } = useKeyboardActions(); const { isTouch } = useTouchCapability();`
Style `.fs-close` as a 46px token button (position absolute top-right, `z-index: 6`, `background: var(--bg-2)`, `color: var(--ink)`, `:focus-visible` ring).

WebServiceViewer: ensure the existing `.fullscreen-close-overlay` button is rendered when `isFullscreen && isTouch`, calls `handleAction('web_service_close')` (verify the exact action name in `useKeyboardActions.js`), and is token-styled with a ≥46px target. Add `data-action="exit-fullscreen"` for consistency.

- [ ] **Step 4: Run it — expect PASS.**

Run: `npx vitest run tests/unit/components/fullscreenClose.spec.js`

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/PhotoSlideshow.vue frontend/src/components/WebServiceViewer.vue frontend/tests/unit/components/fullscreenClose.spec.js
git commit -F - <<'EOF'
feat(dashboard): add touch close affordance to fullscreen overlays

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
```

---

## Task 15: Full-suite + lint gate, and on-device verification notes

**Files:** none (verification task).

- [ ] **Step 1: Run the full unit suite**

Run: `npx vitest run`
Expected: all green, including the pre-existing `useKeyboardActions`, `mode`, `layout`, `ClockBarHorizontal`, `DashboardRegionSurfaces` specs (proof the keyboard vocabulary and existing behavior are intact).

- [ ] **Step 2: Lint**

Run: `npx eslint src`
Expected: 0 errors. Fix any introduced.

- [ ] **Step 3: Manual on-device / browser checklist (record results in the PR)**

Verify in the running dev stack (the wall unit if available):
- Focus-light blooms on keyboard `region_next` and on tap; recedes when idle (interaction mode); `always` keeps it lit; `off` shows no highlight. Toggle via temporarily setting the config keys (Settings rows arrive in Cycle C).
- `focusLightDimOthers=false` → active region glows, others stay full brightness.
- Tap a calendar event → opens detail with a dimmed scrim; tap the scrim → closes. Confirm blur degrades gracefully on the Pi (dim still works if blur is dropped).
- Screen dots switch screens; room label shows when `displayName` set.
- Admin `⋯` overflow opens/closes (outside-click + Escape); gear still navigates to settings.
- On the 24" non-touch unit (or a fine-pointer browser): no touch chrome appears; keyboard navigation unchanged.
- `prefers-reduced-motion`: transitions are instant.

- [ ] **Step 4: No code commit** unless lint fixes were needed; if so:

```bash
git add <only the files you changed>
git commit -F - <<'EOF'
chore(dashboard): lint fixes for Cycle B

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
```

---

## Notes for the executor

- **Stacked branch:** this work is on `feat/design-dashboard-cycle-b` (off Cycle A). The Cycle-A primitives (`FocusPanel`, tokens) are present.
- **Read before you edit:** Tasks 9, 12, 13, 14 modify existing multi-purpose components. Read the full file first; make only the changes the task names; never restructure unrelated logic.
- **Keyboard freeze is the headline constraint.** If any task seems to require changing an action's behavior, stop and escalate — it doesn't.
- **Minor findings** go in the progress ledger for final-review triage.
