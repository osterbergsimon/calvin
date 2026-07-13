# Per-Kiosk Settings UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restructure the per-kiosk settings detail panel into a content-forward, offline-aware layout (Status header → Content → Display schedule → collapsed Display-hardware drawer) and add the missing per-kiosk Display schedule editor.

**Architecture:** Pure frontend change to the Vue 3 Kiosks settings view and its Pinia store. A new presentational `KioskStatusHeader` renders an apply-status strip derived from comparing the device's `lastAppliedVersion` (already on the kiosk list objects) against the desired `deviceConfigVersion` fetched from the existing `GET /api/kiosks/{id}/config` endpoint. No backend changes. The existing `CollapsibleSection` gains a `drawer` variant so the set-once hardware editors fold away.

**Tech Stack:** Vue 3 Composition API (`<script setup>`), Pinia, Vitest + `@vue/test-utils`, axios.

## Global Constraints

- **No backend changes.** All version data comes from existing endpoints (`GET /api/kiosks` → `lastAppliedVersion`; `GET /api/kiosks/{id}/config` → `deviceConfigVersion`).
- **Reuse the existing design system.** No new palette, no new typefaces. Exactly one new presentational component is permitted: `KioskStatusHeader.vue`. Reuse `SettingsSection`, `SettingRow`, `CollapsibleSection`, `ToggleSwitch`, `SegmentedControl`, `ChipMultiSelect`, `SelectPill`, `DisplayScheduleGrid`.
- **Apply-status is scoped honestly to "Hardware config"** — it reflects only `DEVICE_PHYSICAL_KEYS` (hardware + schedule). Content is version-invisible; do not imply content is tracked by the version handshake.
- **Fail-open on unknown desired version.** When `desiredVersion` is null (fetch failed / not yet known) but `appliedVersion` is present, show "Applied" and never show the offline-pending badge. Never raise a false alarm.
- **Preserve every established per-kiosk editor convention** on new/moved editors: effective value = per-kiosk override if present else global default; inherited/set tag via `SettingRow` `description` (`‹inherited from global›` / `‹set for this kiosk›`); read-modify-write save preserving unrelated override keys; own aria-live `role="status"` status line; honest online/offline/failure copy; scoped Reset that removes only that editor's keys and is disabled when none are overridden.
- **Detail-panel order (top to bottom):** `KioskStatusHeader` → Content → Display schedule → Display-hardware `CollapsibleSection` drawer (collapsed by default, contains Orientation).
- **Test command:** from `frontend/`: `npx vitest run <path>`.
- **Existing per-editor copy is the template for new editors:** online → `"Saved. This kiosk applies the schedule at its next check-in (~30s)."`; offline → `"Saved. Changes apply when this kiosk reconnects."`; failure → `"Couldn't save to the server. Check the connection and try again."`

---

### Task 1: Store action `fetchDeviceConfigVersion(id)`

**Files:**
- Modify: `frontend/src/stores/kiosks.js`
- Test: `frontend/tests/unit/stores/kiosks.spec.js`

**Interfaces:**
- Produces: `store.fetchDeviceConfigVersion(id: string): Promise<string | null>` — GETs `/api/kiosks/{id}/config`, returns `deviceConfigVersion` string, or `null` on any failure or missing field. Added to the store's returned object.

- [ ] **Step 1: Write the failing test**

Add to `frontend/tests/unit/stores/kiosks.spec.js` (match the existing axios-mock style already used in that file — if it mocks `axios` via `vi.mock`, reuse that mock; otherwise `vi.spyOn(axios, "get")`):

```js
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import axios from "axios";
import { useKiosksStore } from "@/stores/kiosks";

describe("kiosks store — fetchDeviceConfigVersion", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.restoreAllMocks();
  });

  it("returns deviceConfigVersion from GET /config", async () => {
    vi.spyOn(axios, "get").mockResolvedValue({ data: { deviceConfigVersion: "9f2a" } });
    const store = useKiosksStore();
    const v = await store.fetchDeviceConfigVersion("k1");
    expect(v).toBe("9f2a");
    expect(axios.get).toHaveBeenCalledWith("/api/kiosks/k1/config");
  });

  it("returns null when the request fails", async () => {
    vi.spyOn(axios, "get").mockRejectedValue(new Error("network"));
    const store = useKiosksStore();
    expect(await store.fetchDeviceConfigVersion("k1")).toBeNull();
  });

  it("returns null when the field is missing", async () => {
    vi.spyOn(axios, "get").mockResolvedValue({ data: {} });
    const store = useKiosksStore();
    expect(await store.fetchDeviceConfigVersion("k1")).toBeNull();
  });

  it("url-encodes the id", async () => {
    vi.spyOn(axios, "get").mockResolvedValue({ data: { deviceConfigVersion: "x" } });
    const store = useKiosksStore();
    await store.fetchDeviceConfigVersion("a/b");
    expect(axios.get).toHaveBeenCalledWith("/api/kiosks/a%2Fb/config");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run tests/unit/stores/kiosks.spec.js`
Expected: FAIL — `store.fetchDeviceConfigVersion is not a function`.

- [ ] **Step 3: Write minimal implementation**

In `frontend/src/stores/kiosks.js`, add the function inside the store setup and export it in the returned object:

```js
  async function fetchDeviceConfigVersion(id) {
    try {
      const response = await axios.get(`/api/kiosks/${encodeURIComponent(id)}/config`);
      return response.data?.deviceConfigVersion ?? null;
    } catch {
      return null; // fail-open — caller degrades to "Not yet reported"
    }
  }
```

Update the return statement to:

```js
  return { kiosks, loadKiosks, fetchOverrides, saveOverrides, fetchDeviceConfigVersion };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run tests/unit/stores/kiosks.spec.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/stores/kiosks.js frontend/tests/unit/stores/kiosks.spec.js
git commit -m "feat(kiosk): store action to fetch a kiosk's desired config version"
```

---

### Task 2: `KioskStatusHeader` presentational component

**Files:**
- Create: `frontend/src/components/settings/shared/KioskStatusHeader.vue`
- Test: `frontend/tests/unit/components/KioskStatusHeader.spec.js`

**Interfaces:**
- Produces: `KioskStatusHeader` with props `kioskId: String (required)`, `online: Boolean (default false)`, `lastSeenLabel: String (default "")`, `appliedVersion: String|null (default null)`, `desiredVersion: String|null (default null)`. Purely presentational — no fetching, no time math (parent passes the preformatted `lastSeenLabel` to avoid duplicating `relativeTime`). Renders `data-test="kiosk-status-header"` with a `data-test="hardware-config-status"` child.

**Hardware-config status derivation (exact):**
- `appliedVersion == null` → `"Hardware config · Not yet reported"`.
- `desiredVersion` present and `appliedVersion === desiredVersion` → `"Hardware config ✓ Applied"`.
- `desiredVersion` present and `appliedVersion !== desiredVersion`, `online` → `"Hardware config · Pending (applies shortly)"`.
- `desiredVersion` present and `appliedVersion !== desiredVersion`, offline → `"Hardware config · Pending — applies when this kiosk reconnects"`.
- `appliedVersion` present, `desiredVersion == null` → `"Hardware config ✓ Applied"` (fail-open).

- [ ] **Step 1: Write the failing test**

Create `frontend/tests/unit/components/KioskStatusHeader.spec.js`:

```js
import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import KioskStatusHeader from "@/components/settings/shared/KioskStatusHeader.vue";

function mountHeader(props) {
  return mount(KioskStatusHeader, {
    props: { kioskId: "k1", online: true, lastSeenLabel: "12s ago", ...props },
  });
}

describe("KioskStatusHeader", () => {
  it("renders the kiosk id and presence", () => {
    const w = mountHeader({ online: true, lastSeenLabel: "12s ago" });
    expect(w.text()).toContain("k1");
    expect(w.text()).toContain("Online");
    expect(w.text()).toContain("12s ago");
  });

  it("shows Applied when applied matches desired", () => {
    const w = mountHeader({ appliedVersion: "9f2a", desiredVersion: "9f2a" });
    expect(w.get("[data-test='hardware-config-status']").text()).toContain("Applied");
  });

  it("shows online Pending copy when versions differ and online", () => {
    const w = mountHeader({ online: true, appliedVersion: "old", desiredVersion: "new" });
    const t = w.get("[data-test='hardware-config-status']").text();
    expect(t).toContain("Pending");
    expect(t).toContain("applies shortly");
  });

  it("shows reconnect Pending copy when versions differ and offline", () => {
    const w = mountHeader({ online: false, appliedVersion: "old", desiredVersion: "new" });
    expect(w.get("[data-test='hardware-config-status']").text()).toContain("reconnects");
  });

  it("shows Not yet reported when appliedVersion is null", () => {
    const w = mountHeader({ appliedVersion: null, desiredVersion: "new" });
    expect(w.get("[data-test='hardware-config-status']").text()).toContain("Not yet reported");
  });

  it("fails open to Applied when desiredVersion is unknown", () => {
    const w = mountHeader({ appliedVersion: "9f2a", desiredVersion: null });
    expect(w.get("[data-test='hardware-config-status']").text()).toContain("Applied");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run tests/unit/components/KioskStatusHeader.spec.js`
Expected: FAIL — cannot resolve `KioskStatusHeader.vue`.

- [ ] **Step 3: Write minimal implementation**

Create `frontend/src/components/settings/shared/KioskStatusHeader.vue`:

```vue
<template>
  <div class="kiosk-status" data-test="kiosk-status-header">
    <span class="kiosk-status__id">{{ kioskId }}</span>
    <span class="kiosk-status__presence" :class="online ? 'is-online' : 'is-offline'">
      {{ online ? "● Online" : "○ Offline" }} · seen {{ lastSeenLabel }}
    </span>
    <span
      class="kiosk-status__config"
      :class="config.cls"
      data-test="hardware-config-status"
    >
      {{ config.label }}
    </span>
  </div>
</template>

<script setup>
import { computed } from "vue";

const props = defineProps({
  kioskId: { type: String, required: true },
  online: { type: Boolean, default: false },
  lastSeenLabel: { type: String, default: "" },
  appliedVersion: { type: String, default: null },
  desiredVersion: { type: String, default: null },
});

const config = computed(() => {
  if (props.appliedVersion == null) {
    return { cls: "is-unknown", label: "Hardware config · Not yet reported" };
  }
  if (props.desiredVersion != null && props.appliedVersion !== props.desiredVersion) {
    return props.online
      ? { cls: "is-pending", label: "Hardware config · Pending (applies shortly)" }
      : {
          cls: "is-pending",
          label: "Hardware config · Pending — applies when this kiosk reconnects",
        };
  }
  return { cls: "is-applied", label: "Hardware config ✓ Applied" };
});
</script>

<style scoped>
.kiosk-status {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 4px 16px;
  padding: 10px 12px;
  margin-bottom: 12px;
  border: 1px solid var(--line);
  border-radius: 16px;
  background: var(--bg-1);
}
.kiosk-status__id {
  font-weight: 600;
}
.kiosk-status__presence {
  font-size: 0.85em;
}
.kiosk-status__presence.is-online {
  color: #4ade80;
}
.kiosk-status__presence.is-offline {
  color: var(--ink-3, rgba(255, 255, 255, 0.45));
}
.kiosk-status__config {
  font-size: 0.85em;
  opacity: 0.85;
}
.kiosk-status__config.is-pending {
  color: #fbbf24;
}
</style>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run tests/unit/components/KioskStatusHeader.spec.js`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/settings/shared/KioskStatusHeader.vue frontend/tests/unit/components/KioskStatusHeader.spec.js
git commit -m "feat(kiosk): KioskStatusHeader apply-status strip"
```

---

### Task 3: `CollapsibleSection` drawer variant

**Files:**
- Modify: `frontend/src/components/settings/shared/CollapsibleSection.vue`
- Test: `frontend/tests/unit/components/CollapsibleSection.spec.js` (create if absent)

**Interfaces:**
- Produces: `CollapsibleSection` gains prop `variant: String (default "default")`. When `variant === "drawer"`, the root `<section>` also carries class `is-drawer` (border-radius aligned to the 16px panel style so it sits flush next to `SettingsSection`). Default rendering is unchanged for existing callers.

- [ ] **Step 1: Write the failing test**

Create/extend `frontend/tests/unit/components/CollapsibleSection.spec.js`:

```js
import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import CollapsibleSection from "@/components/settings/shared/CollapsibleSection.vue";

describe("CollapsibleSection — drawer variant", () => {
  it("adds is-drawer class when variant is drawer", () => {
    const w = mount(CollapsibleSection, { props: { title: "Display hardware", variant: "drawer" } });
    expect(w.get("section").classes()).toContain("is-drawer");
  });

  it("does not add is-drawer for the default variant (no regression)", () => {
    const w = mount(CollapsibleSection, { props: { title: "Anything" } });
    expect(w.get("section").classes()).not.toContain("is-drawer");
  });

  it("still toggles expansion", async () => {
    const w = mount(CollapsibleSection, { props: { title: "T", expanded: false } });
    expect(w.get("section").classes()).not.toContain("expanded");
    await w.get("button.section-header").trigger("click");
    expect(w.get("section").classes()).toContain("expanded");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run tests/unit/components/CollapsibleSection.spec.js`
Expected: FAIL — `is-drawer` not present.

- [ ] **Step 3: Write minimal implementation**

In `frontend/src/components/settings/shared/CollapsibleSection.vue`:

Root element — add the variant class:

```vue
  <section class="settings-section collapsible" :class="{ expanded: isExpanded, 'is-drawer': variant === 'drawer' }">
```

Add `variant` to `defineProps`:

```js
const props = defineProps({
  title: {
    type: String,
    required: true,
  },
  icon: {
    type: String,
    default: null,
  },
  expanded: {
    type: Boolean,
    default: false,
  },
  variant: {
    type: String,
    default: "default",
  },
});
```

Append to the `<style scoped>` block:

```css
.settings-section.is-drawer {
  border-radius: 16px;
  margin-bottom: 0;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run tests/unit/components/CollapsibleSection.spec.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/settings/shared/CollapsibleSection.vue frontend/tests/unit/components/CollapsibleSection.spec.js
git commit -m "feat(settings): drawer variant for CollapsibleSection"
```

---

### Task 4: Status-header wiring + desired-version plumbing in KiosksSettings

**Files:**
- Modify: `frontend/src/components/settings/categories/KiosksSettings.vue`
- Test: `frontend/tests/unit/components/KiosksSettings.spec.js`

**Interfaces:**
- Consumes: `store.fetchDeviceConfigVersion` (Task 1), `KioskStatusHeader` (Task 2).
- Produces: a reactive `desiredVersions` map (`{ [id]: string }`) populated for all kiosks on mount and refreshed for the selected kiosk on `select`. Renders `KioskStatusHeader` for the selected kiosk. This map is the data source Task 5's badge consumes.

**Note for implementer:** `mountWithKiosks` and `selectFirst` helpers in the spec file do not stub `fetchDeviceConfigVersion`. Because the store action is now called on mount/select, add `store.fetchDeviceConfigVersion = vi.fn(async () => null);` to BOTH helpers (and any per-test store setup) so existing tests don't hit real axios. Do this as part of Step 3.

- [ ] **Step 1: Write the failing test**

Add to `frontend/tests/unit/components/KiosksSettings.spec.js` a new describe block:

```js
import KioskStatusHeader from "@/components/settings/shared/KioskStatusHeader.vue";

describe("KiosksSettings — status header", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renders KioskStatusHeader for the selected kiosk with applied and desired versions", async () => {
    setActivePinia(createPinia());
    const store = useKiosksStore();
    store.loadKiosks = vi.fn(async () => {
      store.kiosks = [
        { id: "k1", hostname: "pi", lastSeen: new Date().toISOString(), lastAppliedVersion: "old" },
      ];
    });
    store.fetchOverrides = vi.fn(async () => ({}));
    store.saveOverrides = vi.fn(async () => {});
    store.fetchDeviceConfigVersion = vi.fn(async () => "new");
    const w = mount(KiosksSettings);
    await flushPromises();
    // No selection yet → no header.
    expect(w.findComponent(KioskStatusHeader).exists()).toBe(false);
    await w.find("[data-test='kiosk-card']").trigger("click");
    await flushPromises();
    const header = w.findComponent(KioskStatusHeader);
    expect(header.exists()).toBe(true);
    expect(header.props("appliedVersion")).toBe("old");
    expect(header.props("desiredVersion")).toBe("new");
    expect(header.props("kioskId")).toBe("k1");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run tests/unit/components/KiosksSettings.spec.js -t "status header"`
Expected: FAIL — `KioskStatusHeader` not found.

- [ ] **Step 3: Write minimal implementation**

In `frontend/src/components/settings/categories/KiosksSettings.vue`:

Add the import:

```js
import KioskStatusHeader from "@/components/settings/shared/KioskStatusHeader.vue";
```

Add the state (near the other refs):

```js
const desiredVersions = ref({});
```

Render the header immediately after the closing `</SettingsSection>` of the `kiosks-list` section and before the first detail section:

```vue
    <KioskStatusHeader
      v-if="selectedId"
      :kiosk-id="selectedId"
      :online="selectedKiosk() ? isOnline(selectedKiosk()) : false"
      :last-seen-label="relativeTime(selectedKiosk()?.lastSeen)"
      :applied-version="selectedKiosk()?.lastAppliedVersion ?? null"
      :desired-version="desiredVersions[selectedId] ?? null"
    />
```

Update `select` to refresh the selected kiosk's desired version (keep existing lines; append the fetch):

```js
async function select(id) {
  selectedId.value = id;
  savedMsg.value = "";
  contentMsg.value = "";
  overrides.value = await store.fetchOverrides(id);
  const v = await store.fetchDeviceConfigVersion(id);
  if (v) desiredVersions.value = { ...desiredVersions.value, [id]: v };
}
```

Update `onMounted` to prefetch desired versions for all kiosks:

```js
onMounted(async () => {
  await store.loadKiosks();
  await Promise.all(
    kiosks.value.map(async k => {
      const v = await store.fetchDeviceConfigVersion(k.id);
      if (v) desiredVersions.value = { ...desiredVersions.value, [k.id]: v };
    })
  );
});
```

Then update the test helpers `mountWithKiosks` and `selectFirst` (and the save-failure/offline per-test store setups) in `KiosksSettings.spec.js` to stub the new action:

```js
store.fetchDeviceConfigVersion = vi.fn(async () => null);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run tests/unit/components/KiosksSettings.spec.js`
Expected: PASS — the new status-header test passes AND all pre-existing tests still pass.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/settings/categories/KiosksSettings.vue frontend/tests/unit/components/KiosksSettings.spec.js
git commit -m "feat(kiosk): render apply-status header and plumb desired config version"
```

---

### Task 5: Master-list offline-with-pending badge

**Files:**
- Modify: `frontend/src/components/settings/categories/KiosksSettings.vue`
- Test: `frontend/tests/unit/components/KiosksSettings.spec.js`

**Interfaces:**
- Consumes: `desiredVersions` map (Task 4), `isOnline` helper.
- Produces: `isPending(k): boolean` and a `data-test="kiosk-pending-badge"` element on cards where it is true.

- [ ] **Step 1: Write the failing test**

Add to `KiosksSettings.spec.js`:

```js
describe("KiosksSettings — pending badge", () => {
  beforeEach(() => vi.clearAllMocks());

  it("shows the pending badge for an offline kiosk whose applied != desired", async () => {
    setActivePinia(createPinia());
    const store = useKiosksStore();
    const stale = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();
    store.loadKiosks = vi.fn(async () => {
      store.kiosks = [{ id: "off", hostname: "b", lastSeen: stale, lastAppliedVersion: "old" }];
    });
    store.fetchOverrides = vi.fn(async () => ({}));
    store.fetchDeviceConfigVersion = vi.fn(async () => "new");
    const w = mount(KiosksSettings);
    await flushPromises();
    expect(w.find("[data-test='kiosk-pending-badge']").exists()).toBe(true);
  });

  it("hides the badge when online, when versions match, or when desired is unknown", async () => {
    setActivePinia(createPinia());
    const store = useKiosksStore();
    const recent = new Date().toISOString();
    const stale = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();
    store.loadKiosks = vi.fn(async () => {
      store.kiosks = [
        { id: "online-mismatch", hostname: "a", lastSeen: recent, lastAppliedVersion: "old" },
        { id: "offline-match", hostname: "b", lastSeen: stale, lastAppliedVersion: "same" },
        { id: "offline-unknown", hostname: "c", lastSeen: stale, lastAppliedVersion: "old" },
      ];
    });
    store.fetchOverrides = vi.fn(async () => ({}));
    store.fetchDeviceConfigVersion = vi.fn(async id => {
      if (id === "online-mismatch") return "new";
      if (id === "offline-match") return "same";
      return null; // offline-unknown → desired unknown → fail-open, no badge
    });
    const w = mount(KiosksSettings);
    await flushPromises();
    expect(w.findAll("[data-test='kiosk-pending-badge']").length).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run tests/unit/components/KiosksSettings.spec.js -t "pending badge"`
Expected: FAIL — badge element not found.

- [ ] **Step 3: Write minimal implementation**

Add the helper in `KiosksSettings.vue`:

```js
function isPending(k) {
  const desired = desiredVersions.value[k.id];
  return !isOnline(k) && !!desired && k.lastAppliedVersion !== desired;
}
```

In the card template, add the badge (inside the `<button class="kiosk-card">`, after the status span):

```vue
        <span
          v-if="isPending(k)"
          class="kiosk-card__badge"
          data-test="kiosk-pending-badge"
          title="Offline — this kiosk hasn't applied the current hardware config yet"
          >⚠</span
        >
```

Add scoped style:

```css
.kiosk-card__badge {
  justify-self: end;
  font-size: 0.85em;
  color: #fbbf24;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run tests/unit/components/KiosksSettings.spec.js`
Expected: PASS (all).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/settings/categories/KiosksSettings.vue frontend/tests/unit/components/KiosksSettings.spec.js
git commit -m "feat(kiosk): offline-with-pending badge on the kiosk list"
```

---

### Task 6: Per-kiosk Display schedule editor

**Files:**
- Modify: `frontend/src/components/settings/categories/KiosksSettings.vue`
- Test: `frontend/tests/unit/components/KiosksSettings.spec.js`

**Interfaces:**
- Consumes: `config.displayScheduleEnabled`, `config.displaySchedule` (global defaults); `DisplayScheduleGrid` (Array modelValue); established `persist`/`isOnline`/`selectedKiosk` patterns.
- Produces: a `kiosks-schedule` `SettingsSection` with `data-test="reset-schedule"`; keys constant `SCHED_KEYS = ["displayScheduleEnabled", "displaySchedule"]`; `scheduleMsg` status line.

- [ ] **Step 1: Write the failing test**

Add to `KiosksSettings.spec.js`:

```js
import DisplayScheduleGrid from "@/components/settings/shared/DisplayScheduleGrid.vue";

describe("KiosksSettings — schedule editor", () => {
  beforeEach(() => vi.clearAllMocks());

  async function selectFirst(overrides = {}) {
    setActivePinia(createPinia());
    const store = useKiosksStore();
    store.loadKiosks = vi.fn(async () => {
      store.kiosks = [
        { id: "k1", hostname: "pi", lastSeen: new Date().toISOString(), lastAppliedVersion: null },
      ];
    });
    store.fetchOverrides = vi.fn(async () => overrides);
    store.saveOverrides = vi.fn(async () => {});
    store.fetchDeviceConfigVersion = vi.fn(async () => null);
    const cfg = useConfigStore();
    cfg.displayScheduleEnabled = true;
    cfg.displaySchedule = [{ day: 0, enabled: true, onTime: "06:00", offTime: "22:00" }];
    const w = mount(KiosksSettings);
    await flushPromises();
    await w.find("[data-test='kiosk-card']").trigger("click");
    await flushPromises();
    return { w, store };
  }

  it("shows the global schedule as effective and tagged inherited when no override", async () => {
    const { w } = await selectFirst({});
    const section = w.get("#section-kiosks-schedule");
    expect(section.text().toLowerCase()).toContain("inherited from global");
  });

  it("editing the grid saves a merged displaySchedule override, preserving unrelated keys", async () => {
    const { w, store } = await selectFirst({ orientation: "portrait" });
    const next = [{ day: 0, enabled: false, onTime: "07:00", offTime: "23:00" }];
    w.findComponent(DisplayScheduleGrid).vm.$emit("update:modelValue", next);
    await flushPromises();
    expect(store.saveOverrides).toHaveBeenCalledWith("k1", {
      orientation: "portrait",
      displaySchedule: next,
    });
  });

  it("Reset schedule removes only the schedule keys", async () => {
    const { w, store } = await selectFirst({
      orientation: "portrait",
      displayScheduleEnabled: false,
      displaySchedule: [{ day: 0, enabled: false, onTime: "07:00", offTime: "23:00" }],
    });
    await w.find("[data-test='reset-schedule']").trigger("click");
    await flushPromises();
    expect(store.saveOverrides).toHaveBeenCalledWith("k1", { orientation: "portrait" });
  });

  it("Reset schedule is disabled when there is no schedule override", async () => {
    const { w } = await selectFirst({});
    expect(w.find("[data-test='reset-schedule']").attributes("disabled")).toBeDefined();
  });

  it("shows save-failure copy when saveOverrides rejects", async () => {
    setActivePinia(createPinia());
    const store = useKiosksStore();
    store.loadKiosks = vi.fn(async () => {
      store.kiosks = [
        { id: "k1", hostname: "pi", lastSeen: new Date().toISOString(), lastAppliedVersion: null },
      ];
    });
    store.fetchOverrides = vi.fn(async () => ({}));
    store.saveOverrides = vi.fn(async () => {
      throw new Error("boom");
    });
    store.fetchDeviceConfigVersion = vi.fn(async () => null);
    const cfg = useConfigStore();
    cfg.displayScheduleEnabled = true;
    cfg.displaySchedule = [{ day: 0, enabled: true, onTime: "06:00", offTime: "22:00" }];
    const w = mount(KiosksSettings);
    await flushPromises();
    await w.find("[data-test='kiosk-card']").trigger("click");
    await flushPromises();
    w.findComponent(DisplayScheduleGrid).vm.$emit("update:modelValue", [
      { day: 0, enabled: false, onTime: "07:00", offTime: "23:00" },
    ]);
    await flushPromises();
    expect(w.get("#section-kiosks-schedule").text()).toContain("Couldn't save to the server");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run tests/unit/components/KiosksSettings.spec.js -t "schedule editor"`
Expected: FAIL — `#section-kiosks-schedule` not found.

- [ ] **Step 3: Write minimal implementation**

Add the import:

```js
import DisplayScheduleGrid from "@/components/settings/shared/DisplayScheduleGrid.vue";
```

Add script state/logic (mirror the orientation editor exactly):

```js
const SCHED_KEYS = ["displayScheduleEnabled", "displaySchedule"];
const scheduleMsg = ref("");

const scheduleEnabledOverridden = computed(() => "displayScheduleEnabled" in overrides.value);
const scheduleOverridden = computed(() => "displaySchedule" in overrides.value);
const anyScheduleOverridden = computed(
  () => scheduleEnabledOverridden.value || scheduleOverridden.value
);
const effScheduleEnabled = computed(() =>
  scheduleEnabledOverridden.value ? overrides.value.displayScheduleEnabled : config.displayScheduleEnabled
);
const effSchedule = computed(() =>
  scheduleOverridden.value ? overrides.value.displaySchedule : config.displaySchedule
);

async function persistSchedule(next) {
  overrides.value = next;
  try {
    await store.saveOverrides(selectedId.value, next);
    const online = selectedKiosk() ? isOnline(selectedKiosk()) : false;
    scheduleMsg.value = online
      ? "Saved. This kiosk applies the schedule at its next check-in (~30s)."
      : "Saved. Changes apply when this kiosk reconnects.";
  } catch {
    scheduleMsg.value = "Couldn't save to the server. Check the connection and try again.";
  }
}

function setScheduleEnabled(value) {
  persistSchedule({ ...overrides.value, displayScheduleEnabled: value });
}
function setSchedule(value) {
  persistSchedule({ ...overrides.value, displaySchedule: value });
}
function resetSchedule() {
  const next = { ...overrides.value };
  for (const k of SCHED_KEYS) delete next[k];
  persistSchedule(next);
}
```

Also clear `scheduleMsg` in `select` (add alongside the other resets):

```js
  scheduleMsg.value = "";
```

Add the section to the template, positioned after Content and before the hardware drawer (final order is finalized in Task 7; place it after the content section for now):

```vue
    <SettingsSection
      v-if="selectedId"
      id="kiosks-schedule"
      :title="`${selectedId} — Display schedule`"
    >
      <SettingRow
        label="Power schedule"
        :description="scheduleEnabledOverridden ? '‹set for this kiosk›' : '‹inherited from global›'"
      >
        <ToggleSwitch
          :model-value="effScheduleEnabled"
          aria-label="Power schedule"
          @update:model-value="setScheduleEnabled"
        />
      </SettingRow>
      <SettingRow
        v-if="effScheduleEnabled"
        label="Daily schedule"
        :description="scheduleOverridden ? '‹set for this kiosk›' : '‹inherited from global›'"
      >
        <DisplayScheduleGrid :model-value="effSchedule || []" @update:model-value="setSchedule" />
      </SettingRow>
      <button
        type="button"
        class="kiosks__reset"
        data-test="reset-schedule"
        :disabled="!anyScheduleOverridden"
        @click="resetSchedule"
      >
        Reset schedule to global
      </button>
      <p v-if="scheduleMsg" class="kiosks__saved" role="status" aria-live="polite">
        {{ scheduleMsg }}
      </p>
    </SettingsSection>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run tests/unit/components/KiosksSettings.spec.js`
Expected: PASS (all).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/settings/categories/KiosksSettings.vue frontend/tests/unit/components/KiosksSettings.spec.js
git commit -m "feat(kiosk): per-kiosk display schedule editor"
```

---

### Task 7: Reorder detail panel and move Orientation into the Display-hardware drawer

**Files:**
- Modify: `frontend/src/components/settings/categories/KiosksSettings.vue`
- Test: `frontend/tests/unit/components/KiosksSettings.spec.js`

**Interfaces:**
- Consumes: `CollapsibleSection` drawer variant (Task 3); all existing orientation state/handlers.
- Produces: final detail order Status header → Content → Schedule → Display-hardware drawer; `hardwareOpen` ref (collapsed by default, reset to collapsed on `select`). The orientation `data-test` hooks (`reset-orientation`) and `savedMsg` are preserved inside the drawer.

**Note for implementer:** The orientation editor moves from a standalone `SettingsSection` into the `CollapsibleSection` drawer. Its `SettingRow`s, the `reset-orientation` button, and the `savedMsg` line move verbatim — only the wrapping element and position change. Existing orientation tests interact via `findComponent(SegmentedControl)` / `[data-test='reset-orientation']`, which still resolve inside the drawer; the drawer starts collapsed but `v-show` (used by `CollapsibleSection`) keeps children mounted, so those tests keep passing without expanding it. Confirm this by running the full suite.

- [ ] **Step 1: Write the failing test**

Add to `KiosksSettings.spec.js`:

```js
import CollapsibleSection from "@/components/settings/shared/CollapsibleSection.vue";

describe("KiosksSettings — detail order and hardware drawer", () => {
  beforeEach(() => vi.clearAllMocks());

  async function selectFirst() {
    setActivePinia(createPinia());
    const store = useKiosksStore();
    store.loadKiosks = vi.fn(async () => {
      store.kiosks = [
        { id: "k1", hostname: "pi", lastSeen: new Date().toISOString(), lastAppliedVersion: null },
        { id: "k2", hostname: "pi2", lastSeen: new Date().toISOString(), lastAppliedVersion: null },
      ];
    });
    store.fetchOverrides = vi.fn(async () => ({}));
    store.saveOverrides = vi.fn(async () => {});
    store.fetchDeviceConfigVersion = vi.fn(async () => null);
    const cfg = useConfigStore();
    cfg.orientation = "landscape";
    cfg.orientationFlipped = false;
    const w = mount(KiosksSettings);
    await flushPromises();
    await w.find("[data-test='kiosk-card']").trigger("click");
    await flushPromises();
    return { w };
  }

  it("orders detail sections Content, then Schedule, then the hardware drawer", async () => {
    const { w } = await selectFirst();
    const html = w.html();
    const iContent = html.indexOf("section-kiosks-content");
    const iSchedule = html.indexOf("section-kiosks-schedule");
    const iHardware = html.indexOf("Display hardware");
    expect(iContent).toBeGreaterThan(-1);
    expect(iContent).toBeLessThan(iSchedule);
    expect(iSchedule).toBeLessThan(iHardware);
  });

  it("puts the orientation editor inside a collapsed drawer that starts closed", async () => {
    const { w } = await selectFirst();
    const drawer = w.findComponent(CollapsibleSection);
    expect(drawer.exists()).toBe(true);
    expect(drawer.get("section").classes()).not.toContain("expanded");
    // orientation controls are still present (v-show keeps them mounted)
    expect(w.find("[data-test='reset-orientation']").exists()).toBe(true);
  });

  it("re-collapses the drawer when switching kiosks", async () => {
    const { w } = await selectFirst();
    const drawer = w.findComponent(CollapsibleSection);
    await drawer.get("button.section-header").trigger("click"); // expand
    expect(drawer.get("section").classes()).toContain("expanded");
    await w.findAll("[data-test='kiosk-card']")[1].trigger("click"); // switch kiosk
    await flushPromises();
    expect(w.findComponent(CollapsibleSection).get("section").classes()).not.toContain("expanded");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run tests/unit/components/KiosksSettings.spec.js -t "detail order"`
Expected: FAIL — no `CollapsibleSection` / "Display hardware" yet; ordering wrong.

- [ ] **Step 3: Write minimal implementation**

Add the import:

```js
import CollapsibleSection from "@/components/settings/shared/CollapsibleSection.vue";
```

Add state:

```js
const hardwareOpen = ref(false);
```

Reset it in `select` (alongside the other resets):

```js
  hardwareOpen.value = false;
```

Restructure the template detail region so the order is: `KioskStatusHeader` (from Task 4) → Content section → Schedule section (Task 6) → hardware drawer. Move the Content `SettingsSection` (`id="kiosks-content"`) to be first among the detail sections. Replace the standalone orientation `SettingsSection` (`id="kiosks-orientation"`) with a `CollapsibleSection` drawer containing the same rows:

```vue
    <CollapsibleSection
      v-if="selectedId"
      title="Display hardware"
      variant="drawer"
      :expanded="hardwareOpen"
      @update:expanded="hardwareOpen = $event"
    >
      <SettingRow
        label="Orientation"
        :description="orientationOverridden ? '‹set for this kiosk›' : '‹inherited from global›'"
      >
        <SegmentedControl
          :model-value="effOrientation"
          aria-label="Orientation"
          :options="[
            { value: 'landscape', label: 'Landscape' },
            { value: 'portrait', label: 'Portrait' },
          ]"
          @update:model-value="setOrientation"
        />
      </SettingRow>
      <SettingRow
        label="Flip 180°"
        :description="flipOverridden ? '‹set for this kiosk›' : '‹inherited from global›'"
      >
        <ToggleSwitch
          :model-value="effFlipped"
          aria-label="Flip 180 degrees"
          @update:model-value="setFlipped"
        />
      </SettingRow>
      <SettingRow
        label="Apply rotation"
        :description="applyOverridden ? '‹set for this kiosk›' : '‹inherited from global›'"
      >
        <ToggleSwitch
          :model-value="effApply"
          aria-label="Apply rotation"
          @update:model-value="setApply"
        />
      </SettingRow>
      <button
        type="button"
        class="kiosks__reset"
        data-test="reset-orientation"
        :disabled="!orientationOverridden && !flipOverridden && !applyOverridden"
        @click="resetOrientation"
      >
        Reset to global
      </button>
      <p v-if="savedMsg" class="kiosks__saved" role="status" aria-live="polite">{{ savedMsg }}</p>
    </CollapsibleSection>
```

Ensure the final section sequence in the template is: `kiosks-list` `SettingsSection` → `KioskStatusHeader` → `kiosks-content` `SettingsSection` → `kiosks-schedule` `SettingsSection` → Display-hardware `CollapsibleSection`.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run tests/unit/components/KiosksSettings.spec.js`
Expected: PASS — new ordering/drawer tests pass AND all pre-existing orientation/content/schedule/status/badge tests still pass.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/settings/categories/KiosksSettings.vue frontend/tests/unit/components/KiosksSettings.spec.js
git commit -m "feat(kiosk): content-forward detail order with collapsed display-hardware drawer"
```

---

## Self-Review

**Spec coverage:**
- Detail order Status → Content → Schedule → Display-hardware drawer → Tasks 4, 6, 7. ✓
- `KioskStatusHeader`, honest "Hardware config" scoping, version derivation → Task 2. ✓
- No-backend version data flow (`fetchDeviceConfigVersion`) → Task 1. ✓
- `CollapsibleSection` ↔ `SettingsSection` style reconcile (drawer variant) → Task 3. ✓
- Per-kiosk Display schedule editor with established conventions → Task 6. ✓
- Orientation moved into drawer, behavior preserved → Task 7. ✓
- Master-list offline-with-pending badge → Task 5. ✓
- On kiosk switch: drawer collapses, transient status clears → Tasks 4 (status clears), 7 (drawer collapses). ✓
- Fail-open on unknown desired version → Tasks 2, 5 (tested). ✓
- Deferred (brightness, output/resolution, tabbed detail) → not in plan, matches spec. ✓

**Placeholder scan:** No TBD/TODO; every code step shows complete code. ✓

**Type/name consistency:** `fetchDeviceConfigVersion` (Task 1) consumed in Task 4; `desiredVersions` map (Task 4) consumed in Task 5; `variant="drawer"`/`is-drawer` (Task 3) consumed in Task 7; `SCHED_KEYS`, `scheduleMsg`, `anyScheduleOverridden`, `effScheduleEnabled`, `effSchedule` all defined and used within Task 6; `hardwareOpen` defined and used within Task 7; `KioskStatusHeader` props match between Task 2 definition and Task 4 usage (`kioskId`, `online`, `lastSeenLabel`, `appliedVersion`, `desiredVersion`). ✓

**Note:** Tasks 4–7 all modify `KiosksSettings.vue` and its single spec file sequentially; they are ordered by dependency and must be executed in order (not parallelized).
