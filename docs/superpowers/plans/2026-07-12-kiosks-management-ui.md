# Kiosks management UI (list + orientation editor) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Kiosks" settings category that lists known kiosks (with an Online/Offline status) and lets an operator set the selected kiosk's orientation override, applied on the Pi by the display-agent.

**Architecture:** A Pinia `kiosks` store (network-first + cache, mirroring `stores/webServices.js`) exposing the list + per-kiosk override CRUD; a `KiosksSettings.vue` category (master–detail: list + orientation editor) built from existing shell components; registered in `settingsRegistry.js` + `Settings.vue`.

**Tech Stack:** Vue 3 Composition API + Pinia + axios, Vitest. Existing UI: `SettingsSection` (props `id`,`title`; default slot), `SettingRow` (props `label`,`hint?`,`stack?`; control slot), `SegmentedControl` (`modelValue`, `options:[{value,label}]`, `ariaLabel`; emits `update:modelValue`), `ToggleSwitch` (`modelValue:Boolean`, `ariaLabel`; emits `update:modelValue`). Cache: `getCachedData(key, ttl)` / `setCachedData(key, data)` from `@/utils/cache`. Logger: `logError`/`logDebug` from `@/utils/logger`.

## Global Constraints

- **Reuse existing components + design tokens** — no new palette/typography; the view lives in the settings shell.
- **Effective-value + Reset model:** editor shows the kiosk's override if set, else the global default (from the config store); a change **sets** the override; `Reset to global` clears the orientation keys. Show `‹inherited from global›` vs `‹set for this kiosk›` per control.
- **Read-modify-write on save:** `PUT /api/kiosks/{id}/overrides` replaces the whole layer, so always send the full merged override object (preserving unrelated keys).
- **Apply-status v1 = Online/Offline** from `lastSeen` recency only (`● Online` when `< 120000` ms old, else `○ Offline`). Do NOT fabricate an "Applying…/Applied" state (needs the deferred agent POST-back).
- **Honest async copy** after save: online → *"Saved. This kiosk applies orientation at its next check-in (~30s)."*; offline → *"Saved. Changes apply when this kiosk reconnects."* No "Done ✓".
- **`encodeURIComponent(id)`** in all per-kiosk URLs. Network calls via `axios`; loguru-equivalent `logError` on the frontend.
- Frontend tests via Vitest: `cd frontend && npx vitest run <file>`. If `node_modules` is absent in the worktree, symlink `/home/tux/code/calvin/frontend/node_modules` into `frontend/` (do NOT commit it). Run `npm run lint` (eslint) + `npx prettier --check <changed files>` before committing (CI fails on prettier).

---

### Task 1: Kiosks store

**Files:**
- Create: `frontend/src/stores/kiosks.js`
- Test: `frontend/tests/unit/stores/kiosks.spec.js`

**Interfaces:**
- Produces `useKiosksStore()` with: `kiosks` (ref array), `loadKiosks()`, `fetchOverrides(id) -> object`, `saveOverrides(id, overrides) -> void`.

- [ ] **Step 1: Write the failing tests**

Create `frontend/tests/unit/stores/kiosks.spec.js`:

```javascript
import { describe, it, expect, beforeEach, vi } from "vitest";
import { setActivePinia, createPinia } from "pinia";
import axios from "axios";
import { useKiosksStore } from "@/stores/kiosks";

vi.mock("axios");

describe("kiosks store", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
    localStorage.clear();
  });

  it("loadKiosks populates the list", async () => {
    axios.get.mockResolvedValue({ data: { kiosks: [{ id: "k1", hostname: "pi", lastSeen: "2026-07-12T00:00:00Z", lastAppliedVersion: null }] } });
    const store = useKiosksStore();
    await store.loadKiosks();
    expect(store.kiosks.map(k => k.id)).toEqual(["k1"]);
    expect(axios.get).toHaveBeenCalledWith("/api/kiosks");
  });

  it("loadKiosks falls back to cache on network error", async () => {
    axios.get.mockResolvedValueOnce({ data: { kiosks: [{ id: "k1" }] } });
    const store = useKiosksStore();
    await store.loadKiosks();               // seeds cache
    axios.get.mockRejectedValueOnce(new Error("offline"));
    store.kiosks = [];
    await store.loadKiosks();               // falls back
    expect(store.kiosks.map(k => k.id)).toEqual(["k1"]);
  });

  it("fetchOverrides returns the layer, maps 404 to empty", async () => {
    const store = useKiosksStore();
    axios.get.mockResolvedValueOnce({ data: { id: "k1", overrides: { orientation: "portrait" } } });
    expect(await store.fetchOverrides("k1")).toEqual({ orientation: "portrait" });
    axios.get.mockRejectedValueOnce({ response: { status: 404 } });
    expect(await store.fetchOverrides("ghost")).toEqual({});
  });

  it("saveOverrides PUTs the layer with an encoded id", async () => {
    axios.put.mockResolvedValue({ data: {} });
    const store = useKiosksStore();
    await store.saveOverrides("a b", { orientation: "portrait" });
    expect(axios.put).toHaveBeenCalledWith("/api/kiosks/a%20b/overrides", { overrides: { orientation: "portrait" } });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd frontend && npx vitest run tests/unit/stores/kiosks.spec.js`
Expected: FAIL — cannot resolve `@/stores/kiosks`.

- [ ] **Step 3: Implement**

Create `frontend/src/stores/kiosks.js`:

```javascript
import { defineStore } from "pinia";
import { ref } from "vue";
import axios from "axios";
import { getCachedData, setCachedData } from "@/utils/cache";
import { logError } from "@/utils/logger";

const CACHE_KEY = "kiosks_list";
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export const useKiosksStore = defineStore("kiosks", () => {
  const kiosks = ref([]);

  async function loadKiosks() {
    try {
      const response = await axios.get("/api/kiosks");
      kiosks.value = response.data?.kiosks ?? [];
      setCachedData(CACHE_KEY, kiosks.value);
    } catch (err) {
      logError("[kiosks]", "Failed to load kiosks, using cache:", err);
      const cached = getCachedData(CACHE_KEY, CACHE_TTL);
      if (cached) kiosks.value = cached;
    }
  }

  async function fetchOverrides(id) {
    try {
      const response = await axios.get(`/api/kiosks/${encodeURIComponent(id)}/overrides`);
      return response.data?.overrides ?? {};
    } catch (err) {
      if (err?.response?.status === 404) return {}; // known-seen kiosk with no overrides yet
      throw err;
    }
  }

  async function saveOverrides(id, overrides) {
    await axios.put(`/api/kiosks/${encodeURIComponent(id)}/overrides`, { overrides });
  }

  return { kiosks, loadKiosks, fetchOverrides, saveOverrides };
});
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd frontend && npx vitest run tests/unit/stores/kiosks.spec.js`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/stores/kiosks.js frontend/tests/unit/stores/kiosks.spec.js
git commit -m "feat(kiosk): kiosks store (list + overrides CRUD, network-first) (dd9-ui)"
```

---

### Task 2: Kiosks list view + category registration

**Files:**
- Create: `frontend/src/components/settings/categories/KiosksSettings.vue`
- Modify: `frontend/src/components/settings/settingsRegistry.js` (add the category), `frontend/src/views/Settings.vue` (lazy import + render)
- Test: `frontend/tests/unit/components/KiosksSettings.spec.js`

**Interfaces:**
- Consumes `useKiosksStore` (Task 1).
- Produces the `KiosksSettings.vue` component (list + status + selection state; the editor arrives in Task 3).

- [ ] **Step 1: Write the failing tests**

Create `frontend/tests/unit/components/KiosksSettings.spec.js`:

```javascript
import { describe, it, expect, beforeEach, vi } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import KiosksSettings from "@/components/settings/categories/KiosksSettings.vue";
import { useKiosksStore } from "@/stores/kiosks";

function mountWithKiosks(list) {
  setActivePinia(createPinia());
  const store = useKiosksStore();
  store.loadKiosks = vi.fn(async () => { store.kiosks = list; });
  store.fetchOverrides = vi.fn(async () => ({}));
  return mount(KiosksSettings);
}

describe("KiosksSettings — list", () => {
  beforeEach(() => vi.clearAllMocks());

  it("shows the empty state when there are no kiosks", async () => {
    const w = mountWithKiosks([]);
    await flushPromises();
    expect(w.text()).toContain("No kiosks have connected yet");
  });

  it("renders a card per kiosk with id and hostname", async () => {
    const now = new Date().toISOString();
    const w = mountWithKiosks([{ id: "kitchen-1", hostname: "raspberrypi", lastSeen: now, lastAppliedVersion: null }]);
    await flushPromises();
    expect(w.text()).toContain("kitchen-1");
    expect(w.text()).toContain("raspberrypi");
  });

  it("marks a recently-seen kiosk Online and a stale one Offline", async () => {
    const recent = new Date().toISOString();
    const stale = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();
    const w = mountWithKiosks([
      { id: "on", hostname: "a", lastSeen: recent, lastAppliedVersion: null },
      { id: "off", hostname: "b", lastSeen: stale, lastAppliedVersion: null },
    ]);
    await flushPromises();
    const cards = w.findAll("[data-test='kiosk-card']");
    expect(cards[0].text()).toContain("Online");
    expect(cards[1].text()).toContain("Offline");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd frontend && npx vitest run tests/unit/components/KiosksSettings.spec.js`
Expected: FAIL — cannot resolve the component.

- [ ] **Step 3: Implement the view (list only; editor slot added in Task 3)**

Create `frontend/src/components/settings/categories/KiosksSettings.vue`:

```vue
<template>
  <div class="kiosks">
    <SettingsSection id="kiosks-list" title="Kiosks">
      <p v-if="kiosks.length === 0" class="kiosks__empty">
        No kiosks have connected yet. A kiosk registers itself the first time it loads the dashboard.
      </p>
      <button
        v-for="k in kiosks"
        :key="k.id"
        type="button"
        class="kiosk-card"
        :class="{ 'is-selected': k.id === selectedId }"
        data-test="kiosk-card"
        @click="select(k.id)"
      >
        <span class="kiosk-card__id">{{ k.id }}</span>
        <span class="kiosk-card__status" :class="isOnline(k) ? 'is-online' : 'is-offline'">
          {{ isOnline(k) ? "● Online" : "○ Offline" }}
        </span>
        <span class="kiosk-card__meta">{{ k.hostname }} · seen {{ relativeTime(k.lastSeen) }}</span>
      </button>
    </SettingsSection>
    <!-- Task 3 inserts the orientation editor here, guarded by v-if="selectedId" -->
  </div>
</template>

<script setup>
import { ref, onMounted } from "vue";
import { useKiosksStore } from "@/stores/kiosks";
import SettingsSection from "@/components/settings/shell/SettingsSection.vue";

const store = useKiosksStore();
const kiosks = ref([]);
const selectedId = ref(null);

const ONLINE_WINDOW_MS = 120000; // 2 minutes

function isOnline(k) {
  if (!k.lastSeen) return false;
  return Date.now() - Date.parse(k.lastSeen) < ONLINE_WINDOW_MS;
}

function relativeTime(iso) {
  if (!iso) return "never";
  const secs = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 1000));
  if (secs < 60) return `${secs}s ago`;
  if (secs < 3600) return `${Math.round(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.round(secs / 3600)}h ago`;
  return `${Math.round(secs / 86400)}d ago`;
}

function select(id) {
  selectedId.value = id;
}

onMounted(async () => {
  await store.loadKiosks();
  kiosks.value = store.kiosks;
});
</script>

<style scoped>
.kiosks__empty { opacity: 0.7; }
.kiosk-card {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 4px 12px;
  width: 100%;
  text-align: left;
  padding: 10px 12px;
  margin-bottom: 8px;
  border: 1px solid var(--border-color, rgba(255, 255, 255, 0.12));
  border-radius: 10px;
  background: transparent;
  color: inherit;
  cursor: pointer;
}
.kiosk-card.is-selected { border-color: var(--accent-color, #6ea8fe); }
.kiosk-card__id { font-weight: 600; }
.kiosk-card__status { justify-self: end; font-size: 0.85em; }
.kiosk-card__status.is-online { color: #4ade80; }
.kiosk-card__status.is-offline { color: rgba(255, 255, 255, 0.45); }
.kiosk-card__meta { grid-column: 1 / -1; font-size: 0.85em; opacity: 0.7; }
</style>
```

Register the category in `frontend/src/components/settings/settingsRegistry.js` — add to the `settingsCategories` array (after `device`):

```javascript
  { id: "kiosks", label: "Kiosks", icon: "🖳", subtitle: "Per-device settings" },
```

In `frontend/src/views/Settings.vue`: add the lazy import next to the other `defineAsyncComponent` category imports:

```javascript
const KiosksSettings = defineAsyncComponent(
  () => import("@/components/settings/categories/KiosksSettings.vue")
);
```
and render it alongside the other categories (it does not need `localConfig`, but the config store must be available for Task 3's global default — the store is app-wide, so no prop needed):

```html
            <KiosksSettings v-if="activeCategory === 'kiosks'" :key="categoryRenderKey" />
```

- [ ] **Step 4: Run tests + lint**

Run: `cd frontend && npx vitest run tests/unit/components/KiosksSettings.spec.js` — Expected: PASS (3 tests).
Then `npx vitest run tests/unit` (no regressions), `npm run lint`, and `npx prettier --check src/components/settings/categories/KiosksSettings.vue src/components/settings/settingsRegistry.js src/views/Settings.vue tests/unit/components/KiosksSettings.spec.js` (prettier-write if flagged).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/settings/categories/KiosksSettings.vue frontend/src/components/settings/settingsRegistry.js frontend/src/views/Settings.vue frontend/tests/unit/components/KiosksSettings.spec.js
git commit -m "feat(kiosk): Kiosks settings category with list + online status (dd9-ui)"
```

---

### Task 3: Orientation editor

**Files:**
- Modify: `frontend/src/components/settings/categories/KiosksSettings.vue`
- Test: `frontend/tests/unit/components/KiosksSettings.spec.js` (append)

**Interfaces:**
- Consumes `useKiosksStore().fetchOverrides`/`saveOverrides` (Task 1), `useConfigStore()` global orientation defaults (`orientation`, `orientationFlipped`, `applyDisplayRotation`).
- Produces the selected-kiosk orientation editor (effective value + Reset).

- [ ] **Step 1: Write the failing tests**

Append to `frontend/tests/unit/components/KiosksSettings.spec.js` (add the imports at the top of the file):

```javascript
import { useConfigStore } from "@/stores/config";
import SegmentedControl from "@/components/ui/SegmentedControl.vue";

describe("KiosksSettings — orientation editor", () => {
  beforeEach(() => vi.clearAllMocks());

  async function selectFirst(list, overrides = {}) {
    setActivePinia(createPinia());
    const store = useKiosksStore();
    store.loadKiosks = vi.fn(async () => { store.kiosks = list; });
    store.fetchOverrides = vi.fn(async () => overrides);
    store.saveOverrides = vi.fn(async () => {});
    const cfg = useConfigStore();
    cfg.orientation = "landscape";
    cfg.orientationFlipped = false;
    const w = mount(KiosksSettings);
    await flushPromises();
    await w.find("[data-test='kiosk-card']").trigger("click");
    await flushPromises();
    return { w, store, cfg };
  }

  const one = [{ id: "k1", hostname: "pi", lastSeen: new Date().toISOString(), lastAppliedVersion: null }];

  it("shows the global default as effective when no override, tagged inherited", async () => {
    const { w } = await selectFirst(one, {});
    expect(w.text().toLowerCase()).toContain("inherited from global");
  });

  it("changing orientation saves a merged override and tags it set", async () => {
    const { w, store } = await selectFirst(one, { availableScreens: ["a"] });
    // Emit SegmentedControl's event to exercise the parent's @update:model-value handler
    // without depending on SegmentedControl's internal button markup.
    w.findComponent(SegmentedControl).vm.$emit("update:modelValue", "portrait");
    await flushPromises();
    expect(store.saveOverrides).toHaveBeenCalledWith("k1", { availableScreens: ["a"], orientation: "portrait" });
    expect(w.text().toLowerCase()).toContain("set for this kiosk");
  });

  it("Reset to global removes only orientation keys and is disabled with no override", async () => {
    const { w, store } = await selectFirst(one, { orientation: "portrait", availableScreens: ["a"] });
    await w.find("[data-test='reset-orientation']").trigger("click");
    await flushPromises();
    expect(store.saveOverrides).toHaveBeenCalledWith("k1", { availableScreens: ["a"] });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd frontend && npx vitest run tests/unit/components/KiosksSettings.spec.js -t "orientation editor"`
Expected: FAIL — editor markup/handlers not present.

- [ ] **Step 3: Implement the editor**

In `KiosksSettings.vue`, replace the `<!-- Task 3 inserts ... -->` comment with the editor block, and extend `<script setup>`:

Template (after the list `SettingsSection`, inside `.kiosks`):
```vue
    <SettingsSection v-if="selectedId" id="kiosks-orientation" :title="`${selectedId} — Orientation`">
      <SettingRow label="Orientation" :hint="orientationOverridden ? 'set for this kiosk' : 'inherited from global'">
        <SegmentedControl
          :model-value="effOrientation"
          aria-label="Orientation"
          :options="[{ value: 'landscape', label: 'Landscape' }, { value: 'portrait', label: 'Portrait' }]"
          @update:model-value="setOrientation"
        />
      </SettingRow>
      <SettingRow label="Flip 180°" :hint="flipOverridden ? 'set for this kiosk' : 'inherited from global'">
        <ToggleSwitch :model-value="effFlipped" aria-label="Flip 180 degrees" @update:model-value="setFlipped" />
      </SettingRow>
      <SettingRow label="Apply rotation" :hint="applyOverridden ? 'set for this kiosk' : 'inherited from global'">
        <ToggleSwitch :model-value="effApply" aria-label="Apply rotation" @update:model-value="setApply" />
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
      <p v-if="savedMsg" class="kiosks__saved">{{ savedMsg }}</p>
    </SettingsSection>
```
(Note: `SegmentedControl` emits `update:model-value` when an option is chosen; the parent wires it to `setOrientation`. The Task-3 test drives this by emitting the event on the `SegmentedControl` component directly, so no test-only markup is needed.)

Add imports + logic to `<script setup>`:
```javascript
import { computed } from "vue";
import { useConfigStore } from "@/stores/config";
import SettingRow from "@/components/settings/shell/SettingRow.vue";
import SegmentedControl from "@/components/ui/SegmentedControl.vue";
import ToggleSwitch from "@/components/ui/ToggleSwitch.vue";

const config = useConfigStore();
const overrides = ref({});      // raw override layer of the selected kiosk
const savedMsg = ref("");

const ORI_KEYS = ["orientation", "orientationFlipped", "applyDisplayRotation"];

const orientationOverridden = computed(() => "orientation" in overrides.value);
const flipOverridden = computed(() => "orientationFlipped" in overrides.value);
const applyOverridden = computed(() => "applyDisplayRotation" in overrides.value);

const effOrientation = computed(() =>
  orientationOverridden.value ? overrides.value.orientation : config.orientation
);
const effFlipped = computed(() =>
  flipOverridden.value ? overrides.value.orientationFlipped : config.orientationFlipped
);
const effApply = computed(() =>
  applyOverridden.value ? overrides.value.applyDisplayRotation : (config.applyDisplayRotation ?? true)
);

function selectedKiosk() {
  return kiosks.value.find(k => k.id === selectedId.value);
}

async function persist(next) {
  overrides.value = next;
  await store.saveOverrides(selectedId.value, next);
  const online = selectedKiosk() ? isOnline(selectedKiosk()) : false;
  savedMsg.value = online
    ? "Saved. This kiosk applies orientation at its next check-in (~30s)."
    : "Saved. Changes apply when this kiosk reconnects.";
}

function setOrientation(value) { persist({ ...overrides.value, orientation: value }); }
function setFlipped(value) { persist({ ...overrides.value, orientationFlipped: value }); }
function setApply(value) { persist({ ...overrides.value, applyDisplayRotation: value }); }

function resetOrientation() {
  const next = { ...overrides.value };
  for (const k of ORI_KEYS) delete next[k];
  persist(next);
}
```
Update `select(id)` to load the overrides:
```javascript
async function select(id) {
  selectedId.value = id;
  savedMsg.value = "";
  overrides.value = await store.fetchOverrides(id);
}
```

- [ ] **Step 4: Run tests + lint**

Run: `cd frontend && npx vitest run tests/unit/components/KiosksSettings.spec.js` — Expected: PASS (all list + editor tests). Then `npx vitest run tests/unit` (no regressions), `npm run lint`, `npx prettier --check src/components/settings/categories/KiosksSettings.vue tests/unit/components/KiosksSettings.spec.js`.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/settings/categories/KiosksSettings.vue frontend/tests/unit/components/KiosksSettings.spec.js
git commit -m "feat(kiosk): per-kiosk orientation editor (effective value + reset) (dd9-ui)"
```

---

### Task 4: Docs

**Files:**
- Modify: `docs/setup/DEPLOYMENT_TOPOLOGIES.md`

- [ ] **Step 1: Add a UI note**

Under the per-kiosk config section in `docs/setup/DEPLOYMENT_TOPOLOGIES.md`, append:

```markdown
**Managing kiosks from the UI.** Settings → **Kiosks** lists every kiosk that has connected (id,
hostname, last-seen, Online/Offline). Select one to set its **orientation** override; the change
saves immediately and the kiosk applies it at its next check-in (~30s). "Reset to global" clears the
override so the kiosk inherits the global orientation again. (Content assignment and a confirmed
"applied" indicator are planned follow-ons.)
```

- [ ] **Step 2: Commit**

```bash
git add docs/setup/DEPLOYMENT_TOPOLOGIES.md
git commit -m "docs(kiosk): document the Kiosks management UI (dd9-ui)"
```

---

## Self-Review

**Spec coverage:**
- Kiosks store (list + overrides CRUD, network-first + cache, 404→{}) → Task 1. ✅
- Kiosks category registered + list with relative last-seen + Online/Offline + empty state → Task 2. ✅
- Orientation editor: effective value (override ?? global), SegmentedControl + toggles, inherited/set tags, read-modify-write save preserving unrelated keys, Reset-to-global (orientation keys only; disabled when no override), honest async copy → Task 3. ✅
- Reuse shell components, no new palette → Tasks 2–3 (SettingsSection/SettingRow/SegmentedControl/ToggleSwitch). ✅
- Non-goals (content assignment, confirmed apply-status, multi-screen) → not in any task. ✅
- Docs → Task 4. ✅

**Placeholder scan:** Complete Vue/store/test code in every step. No test-only production markup — the Task-3 test emits `SegmentedControl`'s event on the component directly.

**Type consistency:** `useKiosksStore` API (`kiosks`, `loadKiosks`, `fetchOverrides`, `saveOverrides`) matches across Tasks 1→3. Override keys `orientation`/`orientationFlipped`/`applyDisplayRotation` and `ORI_KEYS` consistent; `isOnline`/`relativeTime`/`select`/`persist` names consistent within the SFC. Config store getters (`orientation`, `orientationFlipped`, `applyDisplayRotation`) match `stores/config.js`.

**Ordering note:** Task 3 depends on Task 2's `select`/`kiosks`/`selectedId`/`isOnline` (same SFC) and Task 1's store. Build in order.
