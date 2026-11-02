# Kiosk-safe Plugin Links Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A tapped plugin link never navigates the wall directly — it opens a dismissable overlay (QR handoff by default, optional in-app iframe, or off), with the choice set live per-region via a tune popover.

**Architecture:** Mode-independent. The effective action for a link resolves `region.view.linkAction` (per-region override) → `item.link_action` (plugin hint) → `"handoff"` (default). A `useLinkOpen()` composable owns resolution + overlay state; `CardGrid`/`ItemList` consume it and render `HandoffOverlay`/`EmbedOverlay`. The override is a service-region view option stored in the existing `dashboardScreens` layout tree (`region.view`), set through a new `ServiceRegionViewOptions.vue` that composes the existing `RegionViewOptions` tune shell. No backend change; no plugin-contract change.

**Tech Stack:** Vue 3 Composition API (`<script setup>`), Pinia, Vite, Vitest + `@vue/test-utils` + `@testing-library/*`, `qrcode` (new dep).

## Global Constraints

- **Resolution precedence (verbatim):** `region.view.linkAction ?? item.link_action ?? "handoff"`. Region override ∈ `{"handoff","embed","off"}`; item hint ∈ `{"handoff","embed"}` (a plugin never ships `"off"`). Anything else = treat as unset.
- **Casing is intentional and must not be "unified":** display-schema key is snake_case `link_action`; layout/view key is camelCase `linkAction`.
- **No backend changes. No plugin-contract changes.** `item.link_action` is an optional renderer key that passes through `_validate_schema_kind` untouched (verified in the spec).
- **Item-spec location differs per renderer:** card-grid reads `schema.card.item`; item-list reads `schema.item`.
- **Tests live in `frontend/tests/unit/**/*.spec.js`.** Run a single file from the `frontend/` directory with `npx vitest run <path>` (non-watch, deterministic). Setup file `tests/setup.js` mocks axios globally and auto-cleans mounts.
- **Styling:** reuse existing CSS custom properties (`--ink`, `--ink-2`, `--ink-3`, `--bg-1`, `--bg-2`, `--line`, `--focus`, `--focus-ink`, `--focus-edge`, `--shadow`) and the established `.cvo-*` / `.region-view-options__*` vocabulary.
- **Commit after every task.** Conventional-commit messages; end with the `Co-Authored-By` trailer used in this repo.
- **Spec:** `docs/superpowers/specs/2026-07-03-kiosk-safe-plugin-links-design.md`. **Beads:** closes `calvin-1nl`; first consumer of `calvin-39g`.

---

### Task 1: Service-region view override in layout utils

Add a `clampServiceView` (validate-or-omit `linkAction`), attach a `view` block to `service` regions during normalization, and let `setRegionView` accept patches for service regions. Pure functions — fully unit-testable, no UI.

**Files:**
- Modify: `frontend/src/utils/layout.js` (around `clampCalendarView`/`calendarViewFor` at 171-193 and `setRegionView` at 200-223; call sites at 578 and 685)
- Test: `frontend/tests/unit/utils/layout.spec.js` (existing; append)

**Interfaces:**
- Produces: `clampServiceView(view = {}) -> { linkAction?: "handoff"|"embed"|"off" }` (exported). `setRegionView(screens, regionId, patch)` now also merges `{ linkAction }` into a `service` region's `view`. `service` regions gain `region.view = { linkAction? }` after normalization.
- Consumes: existing `clampCalendarView`, `DEFAULT_CALENDAR_VIEW`.

- [ ] **Step 1: Write the failing tests**

Append to `frontend/tests/unit/utils/layout.spec.js` (it already imports `clampCalendarView` and `setRegionView`; add `clampServiceView` to that import and `normalizeDashboardLayout` if not present):

```javascript
describe("clampServiceView", () => {
  it("keeps a valid linkAction override", () => {
    expect(clampServiceView({ linkAction: "embed" })).toEqual({ linkAction: "embed" });
    expect(clampServiceView({ linkAction: "handoff" })).toEqual({ linkAction: "handoff" });
    expect(clampServiceView({ linkAction: "off" })).toEqual({ linkAction: "off" });
  });

  it("omits an invalid or absent linkAction (inherit)", () => {
    expect(clampServiceView({})).toEqual({});
    expect(clampServiceView({ linkAction: "nope" })).toEqual({});
    expect("linkAction" in clampServiceView({ linkAction: undefined })).toBe(false);
  });
});

describe("setRegionView on a service region", () => {
  const screens = {
    activeScreenId: "s1",
    screens: [
      { id: "s1", layout: { regions: [{ id: "svc-1", kind: "service", instanceIds: ["mealie-1"] }] } },
    ],
  };

  it("applies a linkAction patch to a service region", () => {
    const next = setRegionView(screens, "svc-1", { linkAction: "embed" });
    expect(next.screens[0].layout.regions[0].view).toEqual({ linkAction: "embed" });
  });

  it("clears the override when linkAction is undefined", () => {
    const withOverride = setRegionView(screens, "svc-1", { linkAction: "embed" });
    const cleared = setRegionView(withOverride, "svc-1", { linkAction: undefined });
    expect(cleared.screens[0].layout.regions[0].view).toEqual({});
  });

  it("does not mutate the input", () => {
    setRegionView(screens, "svc-1", { linkAction: "off" });
    expect(screens.screens[0].layout.regions[0].view).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/unit/utils/layout.spec.js`
Expected: FAIL — `clampServiceView is not a function` / service region `view` is `undefined`.

- [ ] **Step 3: Implement in `frontend/src/utils/layout.js`**

Add after `clampCalendarView` (after line 187):

```javascript
const SERVICE_LINK_ACTIONS = ["handoff", "embed", "off"];

/**
 * Coerce a service region's `view` block. Only `linkAction` is recognised, and
 * only when it is one of handoff/embed/off — anything else (or absent) is
 * omitted so the region inherits the plugin's own hint. Absent = inherit.
 */
export function clampServiceView(view = {}) {
  const out = {};
  if (SERVICE_LINK_ACTIONS.includes(view.linkAction)) out.linkAction = view.linkAction;
  return out;
}
```

Replace `calendarViewFor` (lines 189-193) with a kind dispatcher:

```javascript
// Calendar and service regions carry a `view`; other kinds get no such key.
const viewForKind = (region, kind) => {
  if (kind === "calendar") {
    return { view: clampCalendarView({ ...DEFAULT_CALENDAR_VIEW, ...(region?.view || {}) }) };
  }
  if (kind === "service") {
    return { view: clampServiceView(region?.view || {}) };
  }
  return {};
};
```

Update the two call sites: line 578 `...calendarViewFor(region, kind)` → `...viewForKind(region, kind)`; line 685 `...calendarViewFor(sub, kind)` → `...viewForKind(sub, kind)`.

In `setRegionView`, replace the calendar-only match block (lines 209-215) with:

```javascript
      if (region.id === regionId && region.kind === "calendar") {
        region.view = clampCalendarView({
          ...DEFAULT_CALENDAR_VIEW,
          ...(region.view || {}),
          ...patch,
        });
        return true;
      }
      if (region.id === regionId && region.kind === "service") {
        region.view = clampServiceView({ ...(region.view || {}), ...patch });
        return true;
      }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/unit/utils/layout.spec.js`
Expected: PASS (all existing calendar tests still green — `viewForKind` preserves calendar behavior).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/utils/layout.js frontend/tests/unit/utils/layout.spec.js
git commit -m "feat(layout): per-region service link override (clampServiceView) — calvin-39g

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: `useLinkOpen` composable

Pure action-resolution + overlay-state machine. No component imports, so it is unit-testable in isolation.

**Files:**
- Create: `frontend/src/composables/useLinkOpen.js`
- Test: `frontend/tests/unit/composables/useLinkOpen.spec.js`

**Interfaces:**
- Produces:
  - `resolveLinkAction(regionAction, itemAction) -> "handoff"|"embed"|"off"` (exported pure fn).
  - `useLinkOpen(getRegionAction: () => string|null)` returns `{ overlay, isClickable, openLink, closeOverlay, fallbackToHandoff }` where `overlay` is a `ref(null | { kind: "handoff"|"embed", url: string })`, `isClickable(url, itemAction) -> boolean`, `openLink(url, itemAction) -> void`, `closeOverlay() -> void`, `fallbackToHandoff() -> void`.
- Consumes: `vue` `ref`.

- [ ] **Step 1: Write the failing test**

`frontend/tests/unit/composables/useLinkOpen.spec.js`:

```javascript
import { describe, it, expect } from "vitest";
import { resolveLinkAction, useLinkOpen } from "@/composables/useLinkOpen";

describe("resolveLinkAction", () => {
  it("region override beats item hint beats default", () => {
    expect(resolveLinkAction("embed", "handoff")).toBe("embed");
    expect(resolveLinkAction(null, "embed")).toBe("embed");
    expect(resolveLinkAction(null, null)).toBe("handoff");
  });
  it("region 'off' wins; invalid values fall through", () => {
    expect(resolveLinkAction("off", "embed")).toBe("off");
    expect(resolveLinkAction("bogus", "embed")).toBe("embed");
    expect(resolveLinkAction(null, "off")).toBe("handoff"); // item hint never 'off'
  });
});

describe("useLinkOpen", () => {
  it("opens a handoff overlay by default", () => {
    const { overlay, openLink } = useLinkOpen(() => null);
    openLink("https://x/r/1", undefined);
    expect(overlay.value).toEqual({ kind: "handoff", url: "https://x/r/1" });
  });
  it("region embed override opens an embed overlay", () => {
    const { overlay, openLink } = useLinkOpen(() => "embed");
    openLink("https://x/r/1", "handoff");
    expect(overlay.value.kind).toBe("embed");
  });
  it("'off' is inert and not clickable", () => {
    const { overlay, openLink, isClickable } = useLinkOpen(() => "off");
    openLink("https://x/r/1", undefined);
    expect(overlay.value).toBe(null);
    expect(isClickable("https://x/r/1", undefined)).toBe(false);
  });
  it("no url is never clickable and never opens", () => {
    const { overlay, openLink, isClickable } = useLinkOpen(() => null);
    openLink("", undefined);
    expect(overlay.value).toBe(null);
    expect(isClickable("", "handoff")).toBe(false);
  });
  it("fallbackToHandoff switches an embed overlay to handoff", () => {
    const { overlay, openLink, fallbackToHandoff } = useLinkOpen(() => "embed");
    openLink("https://x", undefined);
    fallbackToHandoff();
    expect(overlay.value).toEqual({ kind: "handoff", url: "https://x" });
  });
  it("closeOverlay clears state", () => {
    const { overlay, openLink, closeOverlay } = useLinkOpen(() => null);
    openLink("https://x", undefined);
    closeOverlay();
    expect(overlay.value).toBe(null);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/unit/composables/useLinkOpen.spec.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `frontend/src/composables/useLinkOpen.js`**

```javascript
import { ref } from "vue";

// Region overrides may disable a link; a plugin hint never does.
const REGION_ACTIONS = ["handoff", "embed", "off"];
const ITEM_ACTIONS = ["handoff", "embed"];

/**
 * Effective link action: region override > item hint > "handoff".
 * Invalid/absent values fall through to the next source.
 */
export function resolveLinkAction(regionAction, itemAction) {
  const region = REGION_ACTIONS.includes(regionAction) ? regionAction : null;
  const item = ITEM_ACTIONS.includes(itemAction) ? itemAction : null;
  return region || item || "handoff";
}

/**
 * Owns overlay state for a link-emitting renderer. `getRegionAction` is a
 * getter so the per-region override stays reactive to the renderer's prop.
 * overlay: null | { kind: "handoff" | "embed", url }.
 */
export function useLinkOpen(getRegionAction) {
  const overlay = ref(null);

  const isClickable = (url, itemAction) =>
    Boolean(url) && resolveLinkAction(getRegionAction(), itemAction) !== "off";

  const openLink = (url, itemAction) => {
    if (!url) return;
    const action = resolveLinkAction(getRegionAction(), itemAction);
    if (action === "off") return;
    overlay.value = { kind: action, url };
  };

  const closeOverlay = () => {
    overlay.value = null;
  };

  const fallbackToHandoff = () => {
    if (overlay.value?.kind === "embed") {
      overlay.value = { kind: "handoff", url: overlay.value.url };
    }
  };

  return { overlay, isClickable, openLink, closeOverlay, fallbackToHandoff };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run tests/unit/composables/useLinkOpen.spec.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/composables/useLinkOpen.js frontend/tests/unit/composables/useLinkOpen.spec.js
git commit -m "feat(plugins): useLinkOpen composable — resolve link action + overlay state

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: `HandoffOverlay.vue` + `qrcode` dependency

A dismissable modal showing destination title/host, a client-side QR code, and an "Open ↗" button.

**Files:**
- Modify: `frontend/package.json` (add `qrcode`)
- Create: `frontend/src/components/plugins/overlays/HandoffOverlay.vue`
- Test: `frontend/tests/unit/components/plugins/HandoffOverlay.spec.js`

**Interfaces:**
- Produces: `<HandoffOverlay :url="String" />`, emits `close`. Renders `.link-overlay` (backdrop) + `.link-overlay__panel`. Has `[data-test="open"]` button that calls `window.open(url, "_blank", "noopener")`. Emits `close` on backdrop click, close button, Escape, and a 45s idle timer.
- Consumes: `qrcode` (`QRCode.toDataURL`).

- [ ] **Step 1: Add the dependency**

Run (from `frontend/`): `npm install qrcode@^1.5.4`
Confirm it lands in `dependencies` of `frontend/package.json`.

- [ ] **Step 2: Write the failing test**

`frontend/tests/unit/components/plugins/HandoffOverlay.spec.js`:

```javascript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import HandoffOverlay from "@/components/plugins/overlays/HandoffOverlay.vue";

vi.mock("qrcode", () => ({
  default: { toDataURL: vi.fn().mockResolvedValue("data:image/png;base64,ZZ") },
}));

describe("HandoffOverlay", () => {
  beforeEach(() => vi.restoreAllMocks());

  const mountIt = (url = "https://mealie.home/g/home/r/soup") =>
    mount(HandoffOverlay, { props: { url }, attachTo: document.body });

  it("shows the destination host and a QR image", async () => {
    const w = mountIt();
    await new Promise(r => setTimeout(r, 0)); // let toDataURL resolve
    expect(w.text()).toContain("mealie.home");
    expect(w.find("img.link-overlay__qr").attributes("src")).toBe("data:image/png;base64,ZZ");
    w.unmount();
  });

  it("Open button calls window.open with the url", async () => {
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    const w = mountIt("https://x/r/1");
    await w.find('[data-test="open"]').trigger("click");
    expect(open).toHaveBeenCalledWith("https://x/r/1", "_blank", "noopener");
    w.unmount();
  });

  it("emits close on backdrop click and on close button", async () => {
    const w = mountIt();
    await w.find(".link-overlay").trigger("click"); // backdrop (self)
    await w.find('[data-test="close"]').trigger("click");
    expect(w.emitted("close")?.length).toBeGreaterThanOrEqual(1);
    w.unmount();
  });
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `npx vitest run tests/unit/components/plugins/HandoffOverlay.spec.js`
Expected: FAIL — component not found.

- [ ] **Step 4: Implement `frontend/src/components/plugins/overlays/HandoffOverlay.vue`**

```vue
<template>
  <teleport to="body">
    <div class="link-overlay" role="dialog" aria-modal="true" @click.self="emitClose">
      <div class="link-overlay__panel calvin-plugin-surface">
        <button type="button" class="link-overlay__close" data-test="close" aria-label="Close" @click="emitClose">
          ×
        </button>
        <p class="link-overlay__host">{{ host }}</p>
        <img v-if="qr" class="link-overlay__qr" :src="qr" alt="QR code for this link" />
        <p class="link-overlay__hint">Scan to open on your phone</p>
        <button type="button" class="link-overlay__open" data-test="open" @click="openNow">
          Open ↗
        </button>
      </div>
    </div>
  </teleport>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import QRCode from "qrcode";

const props = defineProps({
  url: { type: String, required: true },
});
const emit = defineEmits(["close"]);

const qr = ref("");
const host = computed(() => {
  try {
    return new URL(props.url).host;
  } catch {
    return props.url;
  }
});

const renderQr = async url => {
  try {
    qr.value = await QRCode.toDataURL(url, { margin: 1, width: 220 });
  } catch {
    qr.value = "";
  }
};
watch(() => props.url, renderQr, { immediate: true });

const emitClose = () => emit("close");
const openNow = () => {
  window.open(props.url, "_blank", "noopener");
  emitClose();
};

// Dismissal: Escape + a 45s idle auto-close so a wall display can never be left
// sitting on an overlay indefinitely.
const onKeydown = e => {
  if (e.key === "Escape") emitClose();
};
let idleTimer = null;
onMounted(() => {
  document.addEventListener("keydown", onKeydown, true);
  idleTimer = setTimeout(emitClose, 45000);
});
onBeforeUnmount(() => {
  document.removeEventListener("keydown", onKeydown, true);
  if (idleTimer) clearTimeout(idleTimer);
});
</script>

<style scoped>
.link-overlay {
  position: fixed;
  inset: 0;
  z-index: 1200;
  display: flex;
  align-items: center;
  justify-content: center;
  background: color-mix(in srgb, var(--bg-1) 78%, transparent);
}
.link-overlay__panel {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.6rem;
  padding: 1.5rem 1.75rem;
  min-width: 240px;
  background: var(--bg-2);
  border: 1px solid var(--line);
  border-radius: 14px;
  box-shadow: 0 12px 40px var(--shadow);
}
.link-overlay__close {
  position: absolute;
  top: 0.4rem;
  right: 0.55rem;
  border: 0;
  background: transparent;
  color: var(--ink-2);
  font-size: 1.4rem;
  line-height: 1;
  cursor: pointer;
}
.link-overlay__host {
  margin: 0;
  font-family: var(--font-data);
  font-size: 0.8rem;
  color: var(--ink-2);
  word-break: break-all;
  text-align: center;
}
.link-overlay__qr {
  width: 200px;
  height: 200px;
  image-rendering: pixelated;
  background: #fff;
  border-radius: 8px;
}
.link-overlay__hint {
  margin: 0;
  font-size: 0.75rem;
  color: var(--ink-3);
}
.link-overlay__open {
  margin-top: 0.25rem;
  padding: 0.45rem 1.1rem;
  border: 1px solid var(--focus-edge);
  border-radius: 8px;
  background: var(--focus);
  color: var(--focus-ink);
  font-size: 0.9rem;
  cursor: pointer;
}
.link-overlay__open:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: 2px;
}
</style>
```

- [ ] **Step 5: Run to verify it passes**

Run: `npx vitest run tests/unit/components/plugins/HandoffOverlay.spec.js`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/package.json frontend/package-lock.json frontend/src/components/plugins/overlays/HandoffOverlay.vue frontend/tests/unit/components/plugins/HandoffOverlay.spec.js
git commit -m "feat(plugins): HandoffOverlay — QR + Open button, dismissable

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: `EmbedOverlay.vue` + `IframeViewer` error emit

An iframe modal reusing `IframeViewer`; on iframe load failure it emits `fallback` (the composable swaps to handoff).

**Files:**
- Modify: `frontend/src/components/service/IframeViewer.vue` (add an `error` emit when it flips to its error state)
- Create: `frontend/src/components/plugins/overlays/EmbedOverlay.vue`
- Test: `frontend/tests/unit/components/plugins/EmbedOverlay.spec.js`

**Interfaces:**
- `IframeViewer` now `emit("error")` at the point it sets `iframeError = true` (both the `onerror` handler and the 5s timeout path). No behavior change for existing use (it's currently imported nowhere).
- Produces: `<EmbedOverlay :url="String" />`, emits `close` and `fallback`. Renders `.link-overlay` backdrop + panel + close button + `<IframeViewer :url @error="$emit('fallback')" />`.

- [ ] **Step 1: Write the failing test**

`frontend/tests/unit/components/plugins/EmbedOverlay.spec.js`:

```javascript
import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import EmbedOverlay from "@/components/plugins/overlays/EmbedOverlay.vue";
import IframeViewer from "@/components/service/IframeViewer.vue";

describe("EmbedOverlay", () => {
  const mountIt = () =>
    mount(EmbedOverlay, { props: { url: "https://svc.home/panel" }, attachTo: document.body });

  it("mounts an IframeViewer with the url", () => {
    const w = mountIt();
    expect(w.findComponent(IframeViewer).props("url")).toBe("https://svc.home/panel");
    w.unmount();
  });

  it("emits close on close button and backdrop", async () => {
    const w = mountIt();
    await w.find('[data-test="close"]').trigger("click");
    await w.find(".link-overlay").trigger("click");
    expect(w.emitted("close")?.length).toBeGreaterThanOrEqual(1);
    w.unmount();
  });

  it("re-emits IframeViewer error as fallback", async () => {
    const w = mountIt();
    w.findComponent(IframeViewer).vm.$emit("error");
    expect(w.emitted("fallback")).toBeTruthy();
    w.unmount();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/unit/components/plugins/EmbedOverlay.spec.js`
Expected: FAIL — component not found.

- [ ] **Step 3a: Add the `error` emit to `IframeViewer.vue`**

In `frontend/src/components/service/IframeViewer.vue`, declare the emit and fire it wherever `iframeError` is set to `true`. Add near the props:

```javascript
const emit = defineEmits(["error"]);
```

At each place the component sets `iframeError.value = true` (the `handleError`/`onerror` handler and the load-timeout callback), add immediately after:

```javascript
  emit("error");
```

- [ ] **Step 3b: Implement `frontend/src/components/plugins/overlays/EmbedOverlay.vue`**

```vue
<template>
  <teleport to="body">
    <div class="link-overlay" role="dialog" aria-modal="true" @click.self="$emit('close')">
      <div class="link-overlay__panel link-overlay__panel--frame calvin-plugin-surface">
        <button type="button" class="link-overlay__close" data-test="close" aria-label="Close" @click="$emit('close')">
          ×
        </button>
        <div class="link-overlay__frame">
          <IframeViewer :url="url" @error="$emit('fallback')" />
        </div>
      </div>
    </div>
  </teleport>
</template>

<script setup>
import { onBeforeUnmount, onMounted } from "vue";
import IframeViewer from "@/components/service/IframeViewer.vue";

defineProps({ url: { type: String, required: true } });
const emit = defineEmits(["close", "fallback"]);

const onKeydown = e => {
  if (e.key === "Escape") emit("close");
};
onMounted(() => document.addEventListener("keydown", onKeydown, true));
onBeforeUnmount(() => document.removeEventListener("keydown", onKeydown, true));
</script>

<style scoped>
.link-overlay {
  position: fixed;
  inset: 0;
  z-index: 1200;
  display: flex;
  align-items: center;
  justify-content: center;
  background: color-mix(in srgb, var(--bg-1) 82%, transparent);
}
.link-overlay__panel--frame {
  position: relative;
  width: min(92vw, 900px);
  height: min(88vh, 720px);
  padding: 0;
  background: var(--bg-2);
  border: 1px solid var(--line);
  border-radius: 12px;
  box-shadow: 0 12px 40px var(--shadow);
  overflow: hidden;
}
.link-overlay__frame {
  width: 100%;
  height: 100%;
}
.link-overlay__close {
  position: absolute;
  top: 0.4rem;
  right: 0.55rem;
  z-index: 2;
  width: 2rem;
  height: 2rem;
  border: 1px solid var(--line);
  border-radius: 50%;
  background: var(--bg-2);
  color: var(--ink);
  font-size: 1.2rem;
  line-height: 1;
  cursor: pointer;
}
</style>
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run tests/unit/components/plugins/EmbedOverlay.spec.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/service/IframeViewer.vue frontend/src/components/plugins/overlays/EmbedOverlay.vue frontend/tests/unit/components/plugins/EmbedOverlay.spec.js
git commit -m "feat(plugins): EmbedOverlay reusing IframeViewer with fallback emit

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Wire `CardGrid` and `ItemList` to `useLinkOpen` + overlays

Replace the hard-coded `window.open` with the composable; add a `linkAction` prop; honor `off`; render the overlays.

**Files:**
- Modify: `frontend/src/components/plugins/renderers/CardGrid.vue` (item spec at `schema.card.item`; `open`/`itemUrl` at 89-96; row at 6-18)
- Modify: `frontend/src/components/plugins/renderers/ItemList.vue` (item spec at `schema.item`; `urlFor`/`open` at 54-59; row at 3-19)
- Test: `frontend/tests/unit/components/plugins/Renderers.spec.js` (existing; append) or a new `RendererLinks.spec.js`

**Interfaces:**
- Both renderers gain prop `linkAction: { type: String, default: null }`.
- Consumes: `useLinkOpen`, `HandoffOverlay`, `EmbedOverlay`.

- [ ] **Step 1: Write the failing tests**

Create `frontend/tests/unit/components/plugins/RendererLinks.spec.js`:

```javascript
import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import CardGrid from "@/components/plugins/renderers/CardGrid.vue";
import ItemList from "@/components/plugins/renderers/ItemList.vue";
import HandoffOverlay from "@/components/plugins/overlays/HandoffOverlay.vue";
import EmbedOverlay from "@/components/plugins/overlays/EmbedOverlay.vue";

const cardSchema = {
  kind: "card-grid",
  data_path: "$.days",
  card: { title_path: "$.title", items_path: "$.meals", item: { value_path: "$.name", click_url_path: "$.url" } },
};
const cardData = { days: [{ title: "Mon", meals: [{ name: "Soup", url: "https://m.home/r/soup" }] }] };

describe("CardGrid link behavior", () => {
  it("clicking an item opens a handoff overlay by default", async () => {
    const w = mount(CardGrid, { props: { schema: cardSchema, data: cardData }, attachTo: document.body });
    await w.find(".card-grid__item").trigger("click");
    expect(w.findComponent(HandoffOverlay).exists()).toBe(true);
    w.unmount();
  });

  it("linkAction='embed' opens an embed overlay", async () => {
    const w = mount(CardGrid, { props: { schema: cardSchema, data: cardData, linkAction: "embed" }, attachTo: document.body });
    await w.find(".card-grid__item").trigger("click");
    expect(w.findComponent(EmbedOverlay).exists()).toBe(true);
    w.unmount();
  });

  it("linkAction='off' makes the item non-clickable and opens nothing", async () => {
    const w = mount(CardGrid, { props: { schema: cardSchema, data: cardData, linkAction: "off" }, attachTo: document.body });
    expect(w.find(".card-grid__item").classes()).not.toContain("calvin-plugin-clickable");
    await w.find(".card-grid__item").trigger("click");
    expect(w.findComponent(HandoffOverlay).exists()).toBe(false);
    w.unmount();
  });
});

describe("ItemList link behavior", () => {
  const listSchema = { kind: "item-list", data_path: "$.items", item: { value_path: "$.name", click_url_path: "$.url", link_action: "embed" } };
  const listData = { items: [{ name: "Panel", url: "https://svc.home/p" }] };

  it("uses the item hint (embed) when no region override", async () => {
    const w = mount(ItemList, { props: { schema: listSchema, data: listData }, attachTo: document.body });
    await w.find(".item-list__row").trigger("click");
    expect(w.findComponent(EmbedOverlay).exists()).toBe(true);
    w.unmount();
  });

  it("region override beats the item hint", async () => {
    const w = mount(ItemList, { props: { schema: listSchema, data: listData, linkAction: "handoff" }, attachTo: document.body });
    await w.find(".item-list__row").trigger("click");
    expect(w.findComponent(HandoffOverlay).exists()).toBe(true);
    w.unmount();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/unit/components/plugins/RendererLinks.spec.js`
Expected: FAIL — overlays never mount / `calvin-plugin-clickable` still present for `off`.

- [ ] **Step 3a: Update `CardGrid.vue`**

In `<script setup>`, add the prop, composable, and item hint accessor; replace `open`:

```javascript
import { computed } from "vue";
import { resolvePath } from "../../../utils/jsonPath";
import { applyFormat } from "../../../utils/formatters";
import { useLinkOpen } from "../../../composables/useLinkOpen";
import HandoffOverlay from "../overlays/HandoffOverlay.vue";
import EmbedOverlay from "../overlays/EmbedOverlay.vue";

const props = defineProps({
  schema: { type: Object, required: true },
  data: { type: [Object, Array, null], default: null },
  linkAction: { type: String, default: null },
});

const { overlay, isClickable, openLink, closeOverlay, fallbackToHandoff } = useLinkOpen(
  () => props.linkAction
);

const itemLinkAction = computed(() => itemSpec().link_action);
```

(Keep the existing `itemSpec`, `itemUrl`, etc.) Delete the old `open()` function.

Update the row bindings in the template (lines 10-14):

```vue
          :class="{
            'card-grid__item--clickable': isClickable(itemUrl(item), itemLinkAction),
            'calvin-plugin-clickable': isClickable(itemUrl(item), itemLinkAction),
          }"
          @click="openLink(itemUrl(item), itemLinkAction)"
```

Add the overlays at the end of the template's root `<div class="card-grid ...">` (before its closing `</div>`):

```vue
    <HandoffOverlay v-if="overlay?.kind === 'handoff'" :url="overlay.url" @close="closeOverlay" />
    <EmbedOverlay
      v-else-if="overlay?.kind === 'embed'"
      :url="overlay.url"
      @close="closeOverlay"
      @fallback="fallbackToHandoff"
    />
```

- [ ] **Step 3b: Update `ItemList.vue`**

Mirror the changes. Add prop + imports, replace `open`:

```javascript
import { useLinkOpen } from "../../../composables/useLinkOpen";
import HandoffOverlay from "../overlays/HandoffOverlay.vue";
import EmbedOverlay from "../overlays/EmbedOverlay.vue";

const props = defineProps({
  schema: { type: Object, required: true },
  data: { type: [Object, Array, null], default: null },
  linkAction: { type: String, default: null },
});

const { overlay, isClickable, openLink, closeOverlay, fallbackToHandoff } = useLinkOpen(
  () => props.linkAction
);
const itemLinkAction = computed(() => itemSpec.value.link_action);
```

Row bindings (lines 9-12):

```vue
        'item-list__row--clickable': isClickable(urlFor(item), itemLinkAction),
        'calvin-plugin-clickable': isClickable(urlFor(item), itemLinkAction),
      }"
      @click="openLink(urlFor(item), itemLinkAction)"
```

Add the same two overlay elements inside the root `<ul>`… — since overlays teleport to `body`, place them just before `</ul>` is invalid (only `<li>` allowed); instead wrap the template root. Change ItemList's root from `<ul>` to a fragment: wrap the existing `<ul>...</ul>` and the overlays in a `<template>`-less single root by moving to:

```vue
<template>
  <ul class="item-list calvin-plugin-list calvin-plugin-list--scroll">
    <!-- keep the existing <li v-for="item in items"> rows and empty-state <li> exactly as-is -->
  </ul>
  <HandoffOverlay v-if="overlay?.kind === 'handoff'" :url="overlay.url" @close="closeOverlay" />
  <EmbedOverlay
    v-else-if="overlay?.kind === 'embed'"
    :url="overlay.url"
    @close="closeOverlay"
    @fallback="fallbackToHandoff"
  />
</template>
```

(Vue 3 supports multiple root nodes; the overlays teleport anyway. Do the same for CardGrid if placing inside the grid `<div>` causes layout issues — teleport means DOM position is irrelevant.)

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run tests/unit/components/plugins/RendererLinks.spec.js`
Then the existing renderer suite to check for regressions: `npx vitest run tests/unit/components/plugins/Renderers.spec.js`
Expected: PASS both.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/plugins/renderers/CardGrid.vue frontend/src/components/plugins/renderers/ItemList.vue frontend/tests/unit/components/plugins/RendererLinks.spec.js
git commit -m "feat(plugins): CardGrid/ItemList route links through useLinkOpen + overlays

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Thread `linkAction` through `SchemaRenderer` and `ServiceViewer`

**Files:**
- Modify: `frontend/src/components/plugins/SchemaRenderer.vue` (props 20-27; `<component>` 5-13)
- Modify: `frontend/src/components/service/ServiceViewer.vue` (props 36-53; `<SchemaRenderer>` 14-19)
- Test: `frontend/tests/unit/components/ServiceViewer.spec.js` (existing; append one case)

**Interfaces:**
- `SchemaRenderer` gains prop `linkAction: { type: String, default: null }` and forwards `:link-action="linkAction"` to the rendered component.
- `ServiceViewer` gains prop `linkAction: { type: String, default: null }` and passes it to `SchemaRenderer`.

- [ ] **Step 1: Write the failing test**

Append to `frontend/tests/unit/components/ServiceViewer.spec.js` (follow its existing mount/setup; if it stubs `SchemaRenderer`, assert the forwarded prop):

```javascript
it("forwards linkAction to SchemaRenderer", () => {
  const service = { id: "mealie-1", name: "Mealie", display_schema: { kind: "card-grid" }, config: {} };
  const w = mount(ServiceViewer, {
    props: { service, linkAction: "embed" },
    global: { stubs: { SchemaRenderer: { name: "SchemaRenderer", props: ["linkAction"], template: "<div />" } } },
  });
  expect(w.findComponent({ name: "SchemaRenderer" }).props("linkAction")).toBe("embed");
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/unit/components/ServiceViewer.spec.js`
Expected: FAIL — forwarded prop is `undefined`/absent.

- [ ] **Step 3: Implement**

`SchemaRenderer.vue` — add to `defineProps`:

```javascript
  linkAction: { type: String, default: null },
```

and to the `<component>` bindings (after `:plugin-id="pluginId"`):

```vue
    :link-action="linkAction"
```

`ServiceViewer.vue` — add to `defineProps`:

```javascript
  linkAction: { type: String, default: null },
```

and to `<SchemaRenderer>` (after `:plugin-id="service.id"`):

```vue
        :link-action="linkAction"
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run tests/unit/components/ServiceViewer.spec.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/plugins/SchemaRenderer.vue frontend/src/components/service/ServiceViewer.vue frontend/tests/unit/components/ServiceViewer.spec.js
git commit -m "feat(plugins): thread linkAction through SchemaRenderer + ServiceViewer

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: `ServiceRegionViewOptions.vue` (tune popover control)

The per-region "Link behavior" control, composing `RegionViewOptions`, persisting via `updateRegionView`.

**Files:**
- Create: `frontend/src/components/dashboard/ServiceRegionViewOptions.vue`
- Test: `frontend/tests/unit/components/ServiceRegionViewOptions.spec.js`

**Interfaces:**
- Produces: `<ServiceRegionViewOptions :region-id="String" :view="Object" />`. Reads `view.linkAction`; on change calls `configStore.updateRegionView(regionId, { linkAction })` (value `"default"` → `undefined`). Lights the trigger when an override is set.
- Consumes: `RegionViewOptions`, `useConfigStore`.

- [ ] **Step 1: Write the failing test**

`frontend/tests/unit/components/ServiceRegionViewOptions.spec.js` (mirrors `CalendarViewOptions.spec.js`):

```javascript
import { describe, it, expect, beforeEach, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { setActivePinia, createPinia } from "pinia";
import ServiceRegionViewOptions from "@/components/dashboard/ServiceRegionViewOptions.vue";
import { useConfigStore } from "@/stores/config";

function mountOptions(view) {
  const cfg = useConfigStore();
  cfg.updateRegionView = vi.fn().mockResolvedValue();
  const w = mount(ServiceRegionViewOptions, {
    attachTo: document.body,
    props: { regionId: "svc-1", view },
  });
  return { w, cfg };
}
const open = w => w.find(".region-view-options__trigger").trigger("click");

describe("ServiceRegionViewOptions", () => {
  beforeEach(() => setActivePinia(createPinia()));

  it("shows Default selected when no override", async () => {
    const { w } = mountOptions({});
    await open(w);
    expect(w.find('.svo-seg [aria-checked="true"]').text()).toBe("Default");
    w.unmount();
  });

  it("selecting In-app persists linkAction=embed", async () => {
    const { w, cfg } = mountOptions({});
    await open(w);
    await w.find('.svo-seg [aria-label="Link behavior embed"]').trigger("click");
    expect(cfg.updateRegionView).toHaveBeenCalledWith("svc-1", { linkAction: "embed" });
    w.unmount();
  });

  it("selecting Default clears the override", async () => {
    const { w, cfg } = mountOptions({ linkAction: "embed" });
    await open(w);
    await w.find('.svo-seg [aria-label="Link behavior default"]').trigger("click");
    expect(cfg.updateRegionView).toHaveBeenCalledWith("svc-1", { linkAction: undefined });
    w.unmount();
  });

  it("lights the trigger when an override is set", () => {
    const { w } = mountOptions({ linkAction: "off" });
    expect(w.find(".region-view-options__trigger").classes()).toContain("active");
    w.unmount();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/unit/components/ServiceRegionViewOptions.spec.js`
Expected: FAIL — component not found.

- [ ] **Step 3: Implement `frontend/src/components/dashboard/ServiceRegionViewOptions.vue`**

```vue
<template>
  <RegionViewOptions :active="!!view?.linkAction" label="Service view options">
    <div class="svo-row">
      <span class="svo-label">Link behavior</span>
      <div class="svo-seg" role="radiogroup" aria-label="Link behavior">
        <button
          v-for="opt in linkOptions"
          :key="opt.value"
          type="button"
          role="radio"
          :class="{ on: current === opt.value }"
          :aria-checked="current === opt.value ? 'true' : 'false'"
          :aria-label="`Link behavior ${opt.value}`"
          @click="setLink(opt.value)"
        >
          {{ opt.label }}
        </button>
      </div>
    </div>
  </RegionViewOptions>
</template>

<script setup>
import { computed } from "vue";
import { useConfigStore } from "@/stores/config";
import RegionViewOptions from "./RegionViewOptions.vue";

const props = defineProps({
  regionId: { type: String, default: null },
  view: { type: Object, default: () => ({}) },
});

const configStore = useConfigStore();

// "default" means inherit the plugin hint (persisted as absent).
const linkOptions = [
  { value: "default", label: "Default" },
  { value: "handoff", label: "QR" },
  { value: "embed", label: "In-app" },
  { value: "off", label: "Off" },
];
const current = computed(() => props.view?.linkAction ?? "default");

const setLink = value => {
  if (value === current.value) return;
  const linkAction = value === "default" ? undefined : value;
  configStore.updateRegionView(props.regionId, { linkAction }).catch(err => {
    console.error("Failed to update service view:", err);
  });
};
</script>

<style scoped>
.svo-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
}
.svo-label {
  font-family: var(--font-ui);
  font-size: 0.85rem;
  color: var(--ink);
}
.svo-seg {
  display: inline-flex;
  gap: 2px;
  padding: 2px;
  background: var(--bg-1);
  border: 1px solid var(--line);
  border-radius: 8px;
}
.svo-seg button {
  font-family: var(--font-ui);
  font-size: 0.72rem;
  line-height: 1;
  color: var(--ink-2);
  background: transparent;
  border: 0;
  border-radius: 6px;
  padding: 0.2rem 0.4rem;
  min-height: 22px;
  cursor: pointer;
}
.svo-seg button.on {
  background: var(--focus);
  color: var(--focus-ink);
}
.svo-seg button:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: 1px;
}
</style>
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run tests/unit/components/ServiceRegionViewOptions.spec.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/dashboard/ServiceRegionViewOptions.vue frontend/tests/unit/components/ServiceRegionViewOptions.spec.js
git commit -m "feat(dashboard): ServiceRegionViewOptions — per-region link behavior tune (calvin-39g)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Mount the tune control + thread the override down

Wire `DashboardRegion` → `WebServiceViewer` (view + linkAction) and mount `ServiceRegionViewOptions` for link-capable service regions.

**Files:**
- Modify: `frontend/src/components/DashboardRegion.vue` (service branches at 29-35 and 56-62)
- Modify: `frontend/src/components/WebServiceViewer.vue` (props 94-111; `#actions` slot 44-45; `<ServiceViewer>` 37-43)
- Test: `frontend/tests/unit/components/WebServiceViewer.spec.js` (create if absent) or extend an existing dashboard spec

**Interfaces:**
- `WebServiceViewer` gains props `regionId: { type: String, default: null }` and `view: { type: Object, default: null }`. Derives `linkAction = computed(() => props.view?.linkAction || null)` and passes it to `ServiceViewer`. Renders `<ServiceRegionViewOptions v-if="focused && isLinkCapable" :region-id="regionId" :view="view" />` in `#actions`.
- `isLinkCapable = computed(() => ["card-grid","item-list"].includes(currentService.value?.display_schema?.kind))`.

- [ ] **Step 1: Write the failing test**

`frontend/tests/unit/components/WebServiceViewer.spec.js`:

```javascript
import { describe, it, expect, beforeEach, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { setActivePinia, createPinia } from "pinia";
import WebServiceViewer from "@/components/WebServiceViewer.vue";
import { useWebServicesStore } from "@/stores/webServices";

function setup(kind) {
  setActivePinia(createPinia());
  const store = useWebServicesStore();
  store.fetchServices = vi.fn().mockResolvedValue();
  store.services = [{ id: "mealie-1", name: "Mealie", display_schema: { kind }, config: {} }];
  return store;
}

describe("WebServiceViewer link wiring", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("shows the tune control for a link-capable service region when focused", async () => {
    setup("card-grid");
    const w = mount(WebServiceViewer, {
      props: { serviceId: "mealie-1", regionId: "svc-1", view: { linkAction: "embed" }, focused: true },
      global: { stubs: { ServiceViewer: { template: "<div><slot name='actions' /></div>" } } },
      attachTo: document.body,
    });
    await w.vm.$nextTick();
    expect(w.findComponent({ name: "ServiceRegionViewOptions" }).exists()).toBe(true);
    w.unmount();
  });

  it("hides the tune control for a non-link-capable service (iframe)", async () => {
    setup("iframe");
    const w = mount(WebServiceViewer, {
      props: { serviceId: "mealie-1", regionId: "svc-1", view: {}, focused: true },
      global: { stubs: { ServiceViewer: { template: "<div><slot name='actions' /></div>" } } },
      attachTo: document.body,
    });
    await w.vm.$nextTick();
    expect(w.findComponent({ name: "ServiceRegionViewOptions" }).exists()).toBe(false);
    w.unmount();
  });
});
```

(If `ServiceRegionViewOptions` needs a `name` for `findComponent`, add `defineOptions({ name: "ServiceRegionViewOptions" })` in Task 7's component, or match by CSS. SFCs are name-inferred from filename by default, so `findComponent({ name: "ServiceRegionViewOptions" })` works.)

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/unit/components/WebServiceViewer.spec.js`
Expected: FAIL — control not rendered.

- [ ] **Step 3a: Update `WebServiceViewer.vue`**

Add to `defineProps`:

```javascript
  regionId: { type: String, default: null },
  view: { type: Object, default: null },
```

Add imports + computed in `<script setup>`:

```javascript
import ServiceRegionViewOptions from "./dashboard/ServiceRegionViewOptions.vue";

const linkAction = computed(() => props.view?.linkAction || null);
const isLinkCapable = computed(() =>
  ["card-grid", "item-list"].includes(currentService.value?.display_schema?.kind)
);
```

Pass `linkAction` into `<ServiceViewer>` (after `:focused="focused"`, line 42):

```vue
          :link-action="linkAction"
```

Mount the control in the `<ServiceViewer>` `#actions` slot (right after `<RegionControls ... />` at line 45):

```vue
            <ServiceRegionViewOptions
              v-if="focused && isLinkCapable"
              :region-id="regionId"
              :view="view"
            />
```

- [ ] **Step 3b: Update `DashboardRegion.vue`**

In both service branches, pass the region id and view. Split branch (lines 29-35):

```vue
        <WebServiceViewer
          v-else-if="sub.kind === 'service'"
          :is-fullscreen="false"
          :service-id="sub.instanceIds?.[0] || sub.serviceId"
          :region-id="sub.id"
          :view="sub.view"
          :focused="isFocused(sub.id)"
          :dim="isDim(sub.id)"
        />
```

Non-split branch (lines 56-62):

```vue
      <WebServiceViewer
        v-else-if="region.kind === 'service'"
        :is-fullscreen="false"
        :service-id="region.instanceIds?.[0] || region.serviceId"
        :region-id="region.id"
        :view="region.view"
        :focused="isFocused(region.id)"
        :dim="isDim(region.id)"
      />
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run tests/unit/components/WebServiceViewer.spec.js`
Then the full unit suite to catch regressions: `npx vitest run`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/WebServiceViewer.vue frontend/src/components/DashboardRegion.vue frontend/tests/unit/components/WebServiceViewer.spec.js
git commit -m "feat(dashboard): mount ServiceRegionViewOptions + thread linkAction to renderers

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: Docs, optional mealie hint, and close beads

Document the new `item.link_action` hint + the web-component no-self-navigate rule; optionally annotate mealie; wire the beads.

**Files:**
- Modify: `docs/plugins/PLUGIN_FRONTEND_COMPONENTS.md` (document `item.link_action` for card-grid/item-list; add the web-component contract rule)
- Optional: `../calvin-plugins/mealie/plugin.py` (add `"link_action": "handoff"` to the card item — harmless; documents intent)

- [ ] **Step 1: Document the hint**

In `docs/plugins/PLUGIN_FRONTEND_COMPONENTS.md`, under the card-grid / item-list item spec, add:

```markdown
**`link_action`** (optional, `"handoff"` | `"embed"`) — hints how a clickable
item's link should open on the dashboard. `"handoff"` (default) shows a QR
handoff overlay; `"embed"` opens the destination in an in-app iframe overlay.
A per-region tune override can force `handoff`/`embed`/`off` regardless of the
hint. Plugins never emit `"off"`. The dashboard never navigates the wall away —
that is why raw links are not honored.

**Web-component plugins must not self-navigate** (`window.location` /
`window.open` / target-navigating anchors). Route link intents through the host
so kiosk-safe handling applies; direct navigation can strand a wall display.
```

- [ ] **Step 2: (Optional) annotate mealie**

In `../calvin-plugins/mealie/plugin.py`, add `"link_action": "handoff"` to the `item` dict (alongside `click_url_path`). Behavior is unchanged (handoff is already the default) — this documents intent. If you touch the plugins repo, run its test suite per that repo's README before committing there.

- [ ] **Step 3: Run the full frontend suite once more**

Run (from `frontend/`): `npx vitest run`
Expected: PASS. Also run `npm run lint` and fix any issues.

- [ ] **Step 4: Commit + close beads**

```bash
git add docs/plugins/PLUGIN_FRONTEND_COMPONENTS.md
git commit -m "docs(plugins): document item.link_action + web-component no-self-navigate

Closes calvin-1nl. First consumer of calvin-39g.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
bd close calvin-1nl
bd update calvin-39g --status in_progress   # or close if you consider it fully delivered
# Follow-up: route the IframeRenderer error-fallback anchor through the handoff
# overlay too (deferred from this plan — see spec "Open questions"):
bd create "IframeRenderer error-anchor: route through kiosk-safe handoff overlay" \
  -t task -p 3 \
  -d "The iframe display kind embeds by default; its load-failure 'Open in new window' anchor is a raw target=_blank that can strand a kiosk touchscreen. Route it through useLinkOpen/HandoffOverlay like CardGrid/ItemList. Deferred from the kiosk-safe-links core work."
```

---

## Notes for the implementer

- **`off` is region-only.** The item hint is `handoff`/`embed` only; `resolveLinkAction` already ignores an item `"off"`.
- **Teleported overlays** render at `document.body`, so their placement in a renderer's template is cosmetic — multiple root nodes in `ItemList`/`CardGrid` are fine in Vue 3.
- **No backend or plugin-contract changes** anywhere in this plan. If you find yourself editing `backend/` or a plugin's `plugin.json`, stop — that's out of scope.
- **Casing:** `link_action` (schema, snake) vs `linkAction` (view/layout, camel) — do not "fix" one to match the other.
