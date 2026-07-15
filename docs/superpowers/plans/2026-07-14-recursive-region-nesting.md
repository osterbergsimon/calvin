# Recursive Region Nesting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a dashboard region split recursively into sub-cells (soft cap 3 levels), rendered and drag-resizable both in the editor modal and on the live kiosk.

**Architecture:** Nodes are addressed by an index **path** (`[2,0,1]`). Pure path-addressed mutation helpers live in `utils/layout.js`; rendering recurses in each renderer (`DashboardRegion.vue` for the kiosk, a new `RegionNode.vue` for the editor). `normalizeRegionSplit` and `getLeafRegions` become recursive; the depth cap is enforced in both UI and normalization. The backend stores the layout as opaque JSON — no backend changes.

**Tech Stack:** Vue 3 (Composition API, `<script setup>`), Vitest + `@vue/test-utils`, Vite. Frontend lives in `frontend/`.

## Global Constraints

- All frontend paths are relative to `frontend/` unless stated otherwise.
- Run commands from `frontend/`. Test runner: `npx vitest run <file>`. Lint: `npx eslint <files>`. Build: `npm run build`.
- Test glob: `tests/**/*.spec.js` (co-located tests are NOT picked up). Setup: `tests/setup.js`.
- Additive only in `layout.js`: **do not remove** the existing flat helpers (`splitTopRegion`, `addSubRegion`, `removeSubRegion`, `setSubRegionContent`, `setSplitDirection`, `resizeSubRegion`, `resizeSubRegionPair`, `removeTopRegion`) — they are still imported by `DashboardRegionsEditor.vue` (slated for later deletion) and exercised by existing tests. New path helpers are added alongside.
- `MAX_SPLIT_DEPTH = 3`. A node at `path.length` 1 or 2 may split; a node at `path.length === 3` may not.
- Existing 2-level configs MUST normalize byte-identically (backward compatibility).
- Immutable helpers clone via `JSON.parse(JSON.stringify(...))` (reactive-proxy-safe), matching the existing `setRegionView` convention. Never `structuredClone`.
- Commit after each task with a `feat:`/`test:`/`refactor:` message.

---

## Task 1: Path primitives in `layout.js`

**Files:**
- Modify: `frontend/src/utils/layout.js` (add near the other exported helpers, e.g. after `getLeafRegions`)
- Test: `frontend/tests/unit/utils/layout.spec.js` (add a new `describe("path addressing", …)` block)

**Interfaces:**
- Produces:
  - `MAX_SPLIT_DEPTH: number` (= 3)
  - `getNodeAtPath(layout, path: number[]) → node | null`
  - `getContainerAtPath(layout, containerPath: number[]) → node[] | null` (`[]` → `layout.regions`; else the addressed node's `split.regions`)
  - `updateContainerAtPath(layout, containerPath: number[], fn: (regions) => regions) → layout`
  - `updateNodeAtPath(layout, path: number[], fn: (node) => node) → layout`
  - `getPathById(layout, id: string) → number[] | null`
  - `canSplitAtPath(path: number[]) → boolean`

- [ ] **Step 1: Write the failing test**

Add to `frontend/tests/unit/utils/layout.spec.js` (and add the new names to the top `import { … } from "../../../src/utils/layout"` — match the existing import path used in that file):

```js
describe("path addressing", () => {
  // region-1 split into [a, b]; b split again into [b-a, b-b] (3 levels).
  const deep = () => {
    const l0 = splitRegionAtPath(createDashboardLayoutFromPreset("single"), [0]);
    return splitRegionAtPath(l0, [0, 1]);
  };

  it("getNodeAtPath walks indices to the node", () => {
    const layout = deep();
    expect(getNodeAtPath(layout, [0]).id).toBe("region-1");
    expect(getNodeAtPath(layout, [0, 0]).id).toBe("region-1-a");
    expect(getNodeAtPath(layout, [0, 1, 0]).id).toBe("region-1-b-a");
    expect(getNodeAtPath(layout, [9])).toBeNull();
    expect(getNodeAtPath(layout, [])).toBeNull();
  });

  it("getPathById round-trips with getNodeAtPath", () => {
    const layout = deep();
    expect(getPathById(layout, "region-1-b-b")).toEqual([0, 1, 1]);
    expect(getNodeAtPath(layout, getPathById(layout, "region-1-a")).id).toBe("region-1-a");
    expect(getPathById(layout, "nope")).toBeNull();
  });

  it("updateNodeAtPath immutably replaces a nested node", () => {
    const layout = deep();
    const next = updateNodeAtPath(layout, [0, 1, 0], n => ({ ...n, size: 77 }));
    expect(getNodeAtPath(next, [0, 1, 0]).size).toBe(77);
    expect(getNodeAtPath(layout, [0, 1, 0]).size).not.toBe(77); // original untouched
  });

  it("canSplitAtPath enforces MAX_SPLIT_DEPTH", () => {
    expect(canSplitAtPath([0])).toBe(true);
    expect(canSplitAtPath([0, 1])).toBe(true);
    expect(canSplitAtPath([0, 1, 0])).toBe(false);
    expect(canSplitAtPath([])).toBe(false);
    expect(MAX_SPLIT_DEPTH).toBe(3);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run tests/unit/utils/layout.spec.js -t "path addressing"`
Expected: FAIL — `getNodeAtPath is not a function` / `splitRegionAtPath is not a function` (both are defined in this task and Task 3; this test file also drives Task 3, so expect failures until both land — that's fine, we implement the primitives now and re-run in Step 4 with a temporary local `splitRegionAtPath` stub only if needed. Simpler: implement Task 1 primitives now; this test's `deep()` uses `splitRegionAtPath` from Task 3, so run only the non-split assertions first by temporarily commenting the `deep`-based `it` blocks, OR implement Task 1 and Task 3 back-to-back. Recommended: proceed to Step 3, then run the `canSplitAtPath` assertion which needs no `deep()`.)

- [ ] **Step 3: Add the primitives to `layout.js`**

```js
export const MAX_SPLIT_DEPTH = 3;

export function getNodeAtPath(layout, path) {
  if (!layout?.regions || !Array.isArray(path) || path.length === 0) return null;
  let nodes = layout.regions;
  let node = null;
  for (const index of path) {
    node = nodes?.[index] ?? null;
    if (!node) return null;
    nodes = node.split?.regions;
  }
  return node;
}

export function getContainerAtPath(layout, containerPath) {
  if (!Array.isArray(containerPath) || containerPath.length === 0) {
    return layout?.regions ?? null;
  }
  const node = getNodeAtPath(layout, containerPath);
  return node?.split?.regions ?? null;
}

export function updateContainerAtPath(layout, containerPath, fn) {
  const clone = JSON.parse(JSON.stringify(layout));
  if (!Array.isArray(containerPath) || containerPath.length === 0) {
    clone.regions = fn(clone.regions);
    return clone;
  }
  const node = getNodeAtPath(clone, containerPath);
  if (!node?.split) return layout;
  node.split.regions = fn(node.split.regions);
  return clone;
}

export function updateNodeAtPath(layout, path, fn) {
  if (!Array.isArray(path) || path.length === 0) return layout;
  const parentPath = path.slice(0, -1);
  const index = path[path.length - 1];
  return updateContainerAtPath(layout, parentPath, regions =>
    regions.map((region, i) => (i === index ? fn(region) : region))
  );
}

export function getPathById(layout, id) {
  const walk = (regions, prefix) => {
    for (let i = 0; i < (regions?.length || 0); i += 1) {
      const region = regions[i];
      const here = [...prefix, i];
      if (region.id === id) return here;
      if (region.split) {
        const found = walk(region.split.regions, here);
        if (found) return found;
      }
    }
    return null;
  };
  return walk(layout?.regions, []);
}

export function canSplitAtPath(path) {
  return Array.isArray(path) && path.length >= 1 && path.length < MAX_SPLIT_DEPTH;
}
```

- [ ] **Step 4: Run tests to verify the primitive-only assertions pass**

Run: `cd frontend && npx vitest run tests/unit/utils/layout.spec.js -t "canSplitAtPath"`
Expected: PASS. (The `deep()`-based cases pass after Task 3.)

- [ ] **Step 5: Commit**

```bash
cd frontend && git add src/utils/layout.js tests/unit/utils/layout.spec.js
git commit -m "feat(layout): add path-addressing primitives for nested regions"
```

---

## Task 2: Recursive normalization + leaf extraction

**Files:**
- Modify: `frontend/src/utils/layout.js` — `normalizeRegionSplit` (~line 602), its call site in `normalizeDashboardLayout` (~line 521), and `getLeafRegions` (~line 397)
- Test: `frontend/tests/unit/utils/layout.spec.js`

**Interfaces:**
- Consumes: `MAX_SPLIT_DEPTH`, `normalizeRegionInstanceIds`, `viewForKind`, `clampRegionSize`, `normalizeDirection`, `normalizeRegionPercentages` (all already in `layout.js`).
- Produces: `getLeafRegions` recurses to deepest leaves (top-level leaves keep no `parentId`); `normalizeRegionSplit(split, parentId, childLevel=2)` recurses and drops level-3 children's `.split`.

- [ ] **Step 1: Write the failing tests**

Add to the `describe("path addressing", …)` block (or a new `describe`):

```js
it("normalizeRegionSplit preserves nesting up to 3 levels and drops deeper", () => {
  const raw = {
    version: 1,
    preset: "single",
    regions: [
      {
        id: "r1", kind: "calendar", size: 100,
        split: {
          regions: [
            { id: "r1-a", kind: "photos", size: 50 },
            {
              id: "r1-b", kind: "calendar", size: 50,
              split: {
                regions: [
                  { id: "r1-b-a", kind: "photos", size: 50 },
                  // 4th level must be stripped:
                  { id: "r1-b-b", kind: "service", size: 50,
                    split: { regions: [
                      { id: "x", kind: "photos", size: 50 },
                      { id: "y", kind: "photos", size: 50 },
                    ] } },
                ],
              },
            },
          ],
        },
      },
    ],
  };
  const layout = normalizeDashboardLayout(raw);
  expect(getNodeAtPath(layout, [0, 1]).split).toBeTruthy();       // level-2 split kept
  expect(getNodeAtPath(layout, [0, 1, 0]).split).toBeNull();      // level-3 leaf, no split
  expect(getNodeAtPath(layout, [0, 1, 1]).split).toBeNull();      // level-3: deeper split dropped
});

it("getLeafRegions recurses to the deepest leaves", () => {
  const layout = normalizeDashboardLayout({
    version: 1, preset: "single",
    regions: [{
      id: "r1", kind: "calendar", size: 100,
      split: { regions: [
        { id: "r1-a", kind: "photos", size: 50 },
        { id: "r1-b", kind: "calendar", size: 50,
          split: { regions: [
            { id: "r1-b-a", kind: "photos", size: 50 },
            { id: "r1-b-b", kind: "service", size: 50 },
          ] } },
      ] },
    }],
  });
  expect(getLeafRegions(layout).map(l => l.id)).toEqual(["r1-a", "r1-b-a", "r1-b-b"]);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npx vitest run tests/unit/utils/layout.spec.js -t "recurses to the deepest"`
Expected: FAIL — `getLeafRegions` returns `["r1-a","r1-b"]` (2-level), and normalization currently strips all sub-splits.

- [ ] **Step 3: Make `normalizeRegionSplit` recursive**

Replace the body of `normalizeRegionSplit` (currently ~line 602) with:

```js
function normalizeRegionSplit(split, parentId, childLevel = 2) {
  if (!split || typeof split !== "object" || !Array.isArray(split.regions)) return null;
  const subs = split.regions.slice(0, MAX_TOP_REGIONS);
  if (subs.length < 2) return null;
  const normalized = subs.map((sub, index) => {
    const kind = DASHBOARD_REGION_KINDS.includes(sub.kind) ? sub.kind : "photos";
    const instanceIds = normalizeRegionInstanceIds(sub, kind);
    const id = sub.id || `${parentId}-${String.fromCharCode(97 + index)}`;
    return {
      id,
      kind,
      serviceId: kind === "service" ? instanceIds[0] || null : null,
      instanceIds,
      size: clampRegionSize(Number(sub.size) || 100 / subs.length),
      split: childLevel < MAX_SPLIT_DEPTH ? normalizeRegionSplit(sub.split, id, childLevel + 1) : null,
      ...viewForKind(sub, kind),
    };
  });
  return {
    direction: normalizeDirection(split.direction),
    regions: normalizeRegionPercentages(normalized),
  };
}
```

The call site in `normalizeDashboardLayout` stays `split: normalizeRegionSplit(region.split, id)` (defaults `childLevel = 2`).

- [ ] **Step 4: Make `getLeafRegions` recursive**

Replace `getLeafRegions` (currently ~line 397) with:

```js
export function getLeafRegions(layout) {
  const walk = (regions, parentId) =>
    (regions || []).flatMap(region =>
      region.split
        ? walk(region.split.regions, region.id)
        : parentId
          ? [{ ...region, parentId }]
          : [region]
    );
  return walk(layout?.regions, null);
}
```

- [ ] **Step 5: Run the full layout suite**

Run: `cd frontend && npx vitest run tests/unit/utils/layout.spec.js`
Expected: PASS — new recursion tests pass AND all pre-existing tests still pass (backward compatibility: 2-level `getLeafRegions` output unchanged, top-level leaf `parentId` still undefined).

- [ ] **Step 6: Commit**

```bash
cd frontend && git add src/utils/layout.js tests/unit/utils/layout.spec.js
git commit -m "feat(layout): recurse in normalizeRegionSplit (depth cap) and getLeafRegions"
```

---

## Task 3: Path-addressed mutation helpers

**Files:**
- Modify: `frontend/src/utils/layout.js`
- Test: `frontend/tests/unit/utils/layout.spec.js`

**Interfaces:**
- Consumes: Task 1 primitives, `normalizeRegionInstanceIds`, `nextSubId`, `resizeAdjacentRegions`, `normalizeRegionPercentages`, `normalizeRegionSizes`, `DASHBOARD_REGION_KINDS`, `MAX_TOP_REGIONS`, `normalizeDirection`.
- Produces:
  - `splitRegionAtPath(layout, path) → layout`
  - `unsplitRegionAtPath(layout, path) → layout`
  - `addSubRegionAtPath(layout, path) → layout`
  - `setSplitDirectionAtPath(layout, path, direction) → layout`
  - `setRegionContentAtPath(layout, path, { kind, serviceId, instanceIds }) → layout`
  - `removeRegionAtPath(layout, path) → layout`
  - `resizePairAtPath(layout, containerPath, firstIndex, firstSize) → layout`
  - `applyDragSizesById(layout, sizeById: Record<string, number>) → layout`

- [ ] **Step 1: Write the failing tests**

```js
describe("path mutations", () => {
  const twoTop = () => addTopRegion(createDashboardLayoutFromPreset("single")); // [region-1, region-2]

  it("splitRegionAtPath splits a nested cell but refuses at depth 3", () => {
    let l = splitRegionAtPath(twoTop(), [0]);           // region-1 -> a,b (level 2)
    l = splitRegionAtPath(l, [0, 1]);                    // region-1-b -> b-a,b-b (level 3)
    expect(getNodeAtPath(l, [0, 1, 0]).id).toBe("region-1-b-a");
    const refused = splitRegionAtPath(l, [0, 1, 0]);     // level 3 -> no-op
    expect(refused).toBe(l);
  });

  it("addSubRegionAtPath adds a sub to a nested split", () => {
    let l = splitRegionAtPath(twoTop(), [0]);
    l = addSubRegionAtPath(l, [0]);
    expect(getNodeAtPath(l, [0]).split.regions).toHaveLength(3);
  });

  it("removeRegionAtPath collapses a 2-child split, preserving the survivor's subtree", () => {
    let l = splitRegionAtPath(twoTop(), [0]);   // region-1 -> a,b
    l = splitRegionAtPath(l, [0, 1]);           // region-1-b -> b-a,b-b
    l = removeRegionAtPath(l, [0, 0]);          // remove region-1-a; survivor region-1-b (split) adopts slot
    expect(getNodeAtPath(l, [0]).split.regions.map(r => r.id)).toEqual(["region-1-b-a", "region-1-b-b"]);
  });

  it("removeRegionAtPath keeps a min of one top-level region", () => {
    const single = createDashboardLayoutFromPreset("single");
    expect(removeRegionAtPath(single, [0])).toBe(single);
  });

  it("resizePairAtPath rescales a nested container to 100%", () => {
    const l = splitRegionAtPath(twoTop(), [0]);
    const resized = resizePairAtPath(l, [0], 0, 70);    // container = region-1.split
    const subs = getNodeAtPath(resized, [0]).split.regions;
    expect(subs[0].size + subs[1].size).toBe(100);
    expect(subs[0].size).toBe(70);
  });

  it("applyDragSizesById overrides sizes by id at any depth", () => {
    const l = splitRegionAtPath(twoTop(), [0]);
    const out = applyDragSizesById(l, { "region-1-a": 80, "region-1-b": 20 });
    expect(getNodeAtPath(out, [0, 0]).size).toBe(80);
    expect(getNodeAtPath(out, [0, 1]).size).toBe(20);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npx vitest run tests/unit/utils/layout.spec.js -t "path mutations"`
Expected: FAIL — `splitRegionAtPath is not a function`, etc.

- [ ] **Step 3: Implement the path mutation helpers in `layout.js`**

```js
export function splitRegionAtPath(layout, path) {
  if (!canSplitAtPath(path)) return layout;
  const node = getNodeAtPath(layout, path);
  if (!node || node.split) return layout;
  const secondaryKind = node.kind === "calendar" ? "photos" : "calendar";
  return updateNodeAtPath(layout, path, target => ({
    ...target,
    split: {
      direction: null,
      regions: [
        {
          id: `${target.id}-a`,
          kind: target.kind,
          serviceId:
            target.kind === "service" ? target.instanceIds?.[0] || target.serviceId || null : null,
          instanceIds: normalizeRegionInstanceIds(target, target.kind),
          size: 50,
        },
        {
          id: `${target.id}-b`,
          kind: secondaryKind,
          serviceId: null,
          instanceIds: [],
          size: 50,
        },
      ],
    },
  }));
}

export function unsplitRegionAtPath(layout, path) {
  const node = getNodeAtPath(layout, path);
  if (!node?.split) return layout;
  const first = node.split.regions[0];
  return updateNodeAtPath(layout, path, target => ({
    id: target.id,
    kind: first.kind,
    serviceId: first.kind === "service" ? first.instanceIds?.[0] || first.serviceId || null : null,
    instanceIds: normalizeRegionInstanceIds(first, first.kind),
    size: target.size,
    split: null,
  }));
}

export function addSubRegionAtPath(layout, path) {
  const node = getNodeAtPath(layout, path);
  if (!node?.split || node.split.regions.length >= MAX_TOP_REGIONS) return layout;
  return updateNodeAtPath(layout, path, target => {
    const subs = target.split.regions;
    const nextCount = subs.length + 1;
    const newSize = Math.max(10, Math.round(100 / nextCount));
    const remaining = 100 - newSize;
    const total = subs.reduce((sum, sub) => sum + (Number(sub.size) || 0), 0) || 100;
    const scaled = subs.map(sub => ({
      ...sub,
      size: Math.max(10, Math.round(((Number(sub.size) || 0) / total) * remaining)),
    }));
    const newSub = {
      id: nextSubId(target.id, subs),
      kind: "service",
      serviceId: null,
      instanceIds: [],
      size: newSize,
    };
    return { ...target, split: { ...target.split, regions: [...scaled, newSub] } };
  });
}

export function setSplitDirectionAtPath(layout, path, direction) {
  const node = getNodeAtPath(layout, path);
  if (!node?.split) return layout;
  return updateNodeAtPath(layout, path, target => ({
    ...target,
    split: { ...target.split, direction: normalizeDirection(direction) },
  }));
}

export function setRegionContentAtPath(layout, path, { kind, serviceId, instanceIds }) {
  const node = getNodeAtPath(layout, path);
  if (!node) return layout;
  const nextKind = DASHBOARD_REGION_KINDS.includes(kind) ? kind : node.kind;
  return updateNodeAtPath(layout, path, target => ({
    ...target,
    kind: nextKind,
    serviceId: nextKind === "service" ? instanceIds?.[0] || serviceId || null : null,
    instanceIds: normalizeRegionInstanceIds({ serviceId, instanceIds }, nextKind),
  }));
}

export function removeRegionAtPath(layout, path) {
  if (!Array.isArray(path) || path.length === 0) return layout;
  const parentPath = path.slice(0, -1);
  const index = path[path.length - 1];
  if (parentPath.length === 0) {
    if (layout.regions.length <= 1) return layout;
    return normalizeRegionSizes(
      updateContainerAtPath(layout, [], regions => regions.filter((_, i) => i !== index))
    );
  }
  const parent = getNodeAtPath(layout, parentPath);
  if (!parent?.split) return layout;
  const subs = parent.split.regions;
  if (index < 0 || index >= subs.length) return layout;
  if (subs.length <= 2) {
    const surviving = subs[index === 0 ? 1 : 0];
    // Preserve the survivor's full subtree; it adopts the parent's slot (id + size).
    return updateNodeAtPath(layout, parentPath, target => ({
      ...surviving,
      id: target.id,
      size: target.size,
    }));
  }
  return updateNodeAtPath(layout, parentPath, target => ({
    ...target,
    split: {
      ...target.split,
      regions: normalizeRegionPercentages(subs.filter((_, i) => i !== index)),
    },
  }));
}

export function resizePairAtPath(layout, containerPath, firstIndex, firstSize) {
  const regions = getContainerAtPath(layout, containerPath);
  if (!Array.isArray(regions) || regions.length < 2) return layout;
  return updateContainerAtPath(layout, containerPath, regs =>
    resizeAdjacentRegions(regs, firstIndex, firstSize)
  );
}

export function applyDragSizesById(layout, sizeById) {
  if (!sizeById) return layout;
  const walk = regions =>
    regions.map(region => {
      const next = { ...region };
      if (sizeById[region.id] != null) next.size = sizeById[region.id];
      if (region.split) next.split = { ...region.split, regions: walk(region.split.regions) };
      return next;
    });
  return { ...layout, regions: walk(layout.regions) };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npx vitest run tests/unit/utils/layout.spec.js`
Expected: PASS (including the Task 1 `deep()`-based cases, which now resolve `splitRegionAtPath`).

- [ ] **Step 5: Commit**

```bash
cd frontend && git add src/utils/layout.js tests/unit/utils/layout.spec.js
git commit -m "feat(layout): add path-addressed split/add/remove/resize helpers"
```

---

## Task 4: Recursive live renderer (`DashboardRegion.vue`)

**Files:**
- Modify: `frontend/src/components/DashboardRegion.vue`
- Test: `frontend/tests/unit/components/DashboardRegion.spec.js` (create)

**Interfaces:**
- Consumes: `getSplitDirection` (existing import).
- Produces: `DashboardRegion` renders itself recursively for split children; a leaf renders its viewer as before. A child that *contains* the active leaf gets `dashboard-subregion--lit` (recursive containment), so the active branch is raised at every level.

- [ ] **Step 1: Write the failing test**

Create `frontend/tests/unit/components/DashboardRegion.spec.js`:

```js
import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import DashboardRegion from "../../../src/components/DashboardRegion.vue";

const threeLevel = {
  id: "r1", kind: "calendar", size: 100,
  split: { direction: "row", regions: [
    { id: "r1-a", kind: "photos", size: 50 },
    { id: "r1-b", kind: "calendar", size: 50,
      split: { direction: "column", regions: [
        { id: "r1-b-a", kind: "photos", size: 50 },
        { id: "r1-b-b", kind: "service", size: 50 },
      ] } },
  ] },
};

describe("DashboardRegion recursion", () => {
  it("renders a nested DashboardRegion for a split child", () => {
    const wrapper = mount(DashboardRegion, {
      props: { region: threeLevel, photoRotationInterval: 5, parentDirection: "row" },
      global: { stubs: { CalendarView: true, PhotoSlideshow: true, WebServiceViewer: true } },
    });
    // One root + one per split node (r1, r1-b) => 2 DashboardRegion instances with a split class,
    // and leaf DashboardRegion instances for r1-a, r1-b-a, r1-b-b.
    const all = wrapper.findAllComponents(DashboardRegion);
    expect(all.length).toBeGreaterThanOrEqual(4);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run tests/unit/components/DashboardRegion.spec.js`
Expected: FAIL — the current component renders sub-viewers directly, so only 1 `DashboardRegion` instance exists.

- [ ] **Step 3: Rewrite `DashboardRegion.vue` to recurse**

Replace the `<template>` and the `getSubStyle`/`containerClass` logic. New template:

```vue
<template>
  <div class="dashboard-region" :class="containerClass" @click="emit('focus-region', region.id)">
    <template v-if="region.split">
      <DashboardRegion
        v-for="sub in region.split.regions"
        :key="sub.id"
        class="dashboard-subregion"
        :class="{ 'dashboard-subregion--lit': subtreeContainsActive(sub) }"
        :style="getSubStyle(sub)"
        :region="sub"
        :photo-rotation-interval="photoRotationInterval"
        :parent-direction="splitDirection"
        :active-region-id="activeRegionId"
        :light-active="lightActive"
        :dim-others="dimOthers"
        @focus-region="emit('focus-region', $event)"
      />
    </template>
    <template v-else>
      <CalendarView
        v-if="region.kind === 'calendar'"
        :source-ids="region.instanceIds || []"
        :view="region.view"
        :region-id="region.id"
        :focused="isFocused(region.id)"
        :dim="isDim(region.id)"
      />
      <PhotoSlideshow
        v-else-if="region.kind === 'photos'"
        :is-fullscreen="false"
        :auto-rotate="true"
        :rotation-interval="photoRotationInterval * 1000"
        :source-ids="region.instanceIds || []"
        :focused="isFocused(region.id)"
        :dim="isDim(region.id)"
      />
      <WebServiceViewer
        v-else-if="region.kind === 'service'"
        :is-fullscreen="false"
        :service-id="region.instanceIds?.[0] || region.serviceId"
        :region-id="region.id"
        :view="region.view"
        :focused="isFocused(region.id)"
        :dim="isDim(region.id)"
      />
    </template>
  </div>
</template>
```

In `<script setup>`, keep the props/emits/`isFocused`/`isDim`/async imports/`splitDirection`/`containerClass`/`getSubStyle` as they are, and add a recursive containment helper (used for the lit class):

```js
const subtreeContainsActive = node => {
  if (!props.lightActive || !props.activeRegionId) return false;
  if (!node.split) return node.id === props.activeRegionId;
  return node.split.regions.some(subtreeContainsActive);
};
```

Note: a recursive SFC references itself by its filename-derived name (`DashboardRegion`); no extra registration needed with `<script setup>`.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run tests/unit/components/DashboardRegion.spec.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd frontend && git add src/components/DashboardRegion.vue tests/unit/components/DashboardRegion.spec.js
git commit -m "feat(dashboard): render nested region splits recursively on the kiosk"
```

---

## Task 5: Nested drag-resize on the live kiosk

**Files:**
- Modify: `frontend/src/views/Dashboard.vue`, `frontend/src/components/DashboardRegion.vue`
- Test: `frontend/tests/unit/views/DashboardKioskResize.spec.js`

**Interfaces:**
- Consumes: `resizePairAtPath`, `applyDragSizesById`, `getPathById` (from `layout.js`), and the existing `resizeAdjacentRegions`.
- Produces: `Dashboard.vue` `provide`s a resize context `{ regionsLocked, dragSizes, startNestedResize(containerPath, firstIndex, containerEl, direction) }`. `DashboardRegion.vue` `inject`s it, renders a handle between each pair of split children (when unlocked), reports drag-start with its own container path + element, and reads live sizes from `dragSizes` in `getSubStyle`.

Design notes for the implementer:
- `Dashboard.vue` already owns `dragSizes` (a `{ [id]: size }` ref), the pointer lifecycle, and commit-on-`pointerup`. Generalize its handler so it accepts a **container path** and a **container element** instead of assuming the top-level dashboard viewport. Top-level handles pass `containerPath = []` and `containerEl = dashboardViewEl`.
- On `pointermove`: compute offset within `containerEl.getBoundingClientRect()` along `direction`; sum the sizes of children before `firstIndex` *within that container*; call `resizeAdjacentRegions(children, firstIndex, nextFirstSize)`; write each resulting `{id: size}` into `dragSizes`.
- On `pointerup`: commit by `applyDragSizesById(layout, dragSizes)` → persist via the existing config-save path, then clear `dragSizes`. This works for any depth because ids are unique.
- `DashboardRegion.getSubStyle(sub)` must read `injected.dragSizes.value?.[sub.id] ?? sub.size`.
- The top-level `resizeHandles`/`startRegionResize` in `Dashboard.vue` are refactored to call the same generalized handler with `containerPath = []`; the between-clock-bar gap skip stays top-level.
- Each `DashboardRegion` computes its own container path via `getPathById(activeLayout, region.id)` — inject the active layout too, or pass `path` down as a prop from the parent (prefer passing `path` down: root passes `[]` for top-level regions via `Dashboard.vue`, and each `DashboardRegion` extends it with the child index when rendering children). Passing `path` as a prop avoids a whole-layout lookup per node.

Add a `path` prop to `DashboardRegion` (`{ type: Array, default: () => [] }`); when rendering children, pass `:path="[...path, i]"` using the `v-for` index.

- [ ] **Step 1: Write the failing test**

Extend `frontend/tests/unit/views/DashboardKioskResize.spec.js` with a nested-resize case. Follow the file's existing mount/setup pattern (reuse its store mocks and `regionsLocked = false` setup). Add:

```js
it("dragging a nested divider rescales only that container's children", async () => {
  // Arrange a screen whose region-1 is split into [a,b]; unlock the layout.
  // (Reuse the file's existing helper to build the wrapper + config store.)
  // Simulate startNestedResize([0], 0, <container el>, "row") then a pointermove,
  // and assert dragSizes contains region-1-a / region-1-b summing to 100,
  // while the top-level region sizes are untouched.
});
```

(Match the concrete store-mock and mount helpers already present at the top of that spec file; the assertion targets the exposed `dragSizes` state after a simulated move.)

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run tests/unit/views/DashboardKioskResize.spec.js`
Expected: FAIL — nested resize not wired yet.

- [ ] **Step 3: Implement `provide`/`inject` resize context**

In `Dashboard.vue` `<script setup>`:
- `import { provide } from "vue";` (add to the existing `vue` import) and `applyDragSizesById, resizePairAtPath, getPathById` to the `layout` import.
- Replace `resizeState` + `startRegionResize` + `onRegionResizeMove` with a generalized version keyed by container:

```js
let resizeState = null; // { containerPath, firstIndex, rect, direction }

const startNestedResize = (containerPath, firstIndex, containerEl, direction) => {
  if (configStore.regionsLocked || !containerEl) return;
  resizeState = { containerPath, firstIndex, rect: containerEl.getBoundingClientRect(), direction };
  window.addEventListener("pointermove", onNestedResizeMove);
  window.addEventListener("pointerup", stopNestedResize, { once: true });
};

const onNestedResizeMove = event => {
  if (!resizeState) return;
  const { containerPath, firstIndex, rect, direction } = resizeState;
  const isColumn = direction === "column";
  const offset = isColumn ? event.clientY - rect.top : event.clientX - rect.left;
  const axis = isColumn ? rect.height : rect.width;
  if (axis <= 0) return;
  const layout = activeScreen.value.layout;
  const container =
    containerPath.length === 0
      ? layout.regions
      : (getNodeAtPath(layout, containerPath)?.split?.regions ?? []);
  const before = container.slice(0, firstIndex).reduce((s, r) => s + (Number(dragSizes.value?.[r.id] ?? r.size) || 0), 0);
  const nextFirstSize = (offset / axis) * 100 - before;
  const resized = resizeAdjacentRegions(container, firstIndex, nextFirstSize);
  const map = { ...(dragSizes.value || {}) };
  resized.forEach(r => { map[r.id] = r.size; });
  dragSizes.value = map;
};
```

Add `getNodeAtPath` to the `layout` import. Update `stopNestedResize` to commit via `applyDragSizesById(activeScreen.value.layout, dragSizes.value)` through the existing persistence call the old `stopRegionResize` used (keep that persistence logic; only swap how the resized layout is computed). Keep the top-level `resizeHandles` template but change its handler to `@pointerdown="startNestedResize([], handle.firstIndex, dashboardViewEl, layoutDirection)"`.

Provide the context near the top of setup:

```js
provide("dashboardResize", {
  dragSizes,
  regionsLocked: computed(() => configStore.regionsLocked),
  start: startNestedResize,
});
```

- [ ] **Step 4: Render nested handles in `DashboardRegion.vue`**

- `inject` the context: `const resizeCtx = inject("dashboardResize", null);` (add `inject` to the `vue` import).
- Add the `path` prop and pass `:path="[...path, i]"` to child `DashboardRegion`s (use the `v-for="(sub, i) in region.split.regions"` index).
- `getSubStyle(sub)` reads the live override:
  ```js
  const getSubStyle = sub => {
    const size = `${resizeCtx?.dragSizes.value?.[sub.id] ?? sub.size}%`;
    return splitDirection.value === "column"
      ? { height: size, width: "100%" }
      : { width: size, height: "100%" };
  };
  ```
- Between adjacent split children, render a handle (a template ref on the split container element is needed for the rect). Give the split container element a `ref` and, on handle `pointerdown`, call `resizeCtx.start([...path], firstIndex, containerEl, splitDirection.value)`. Only render handles when `resizeCtx && !resizeCtx.regionsLocked.value` and there are ≥2 children.

- [ ] **Step 5: Run tests + lint + build**

Run: `cd frontend && npx vitest run tests/unit/views/DashboardKioskResize.spec.js tests/unit/components/DashboardRegion.spec.js && npx eslint src/views/Dashboard.vue src/components/DashboardRegion.vue`
Expected: PASS, lint clean.

- [ ] **Step 6: Commit**

```bash
cd frontend && git add src/views/Dashboard.vue src/components/DashboardRegion.vue tests/unit/views/DashboardKioskResize.spec.js
git commit -m "feat(dashboard): nested drag-resize on the kiosk via provide/inject"
```

---

## Task 6: Recursive editor cell `RegionNode.vue`

**Files:**
- Create: `frontend/src/components/settings/shared/regions/RegionNode.vue`
- Modify: `frontend/src/components/settings/shared/ScreenRegionEditor.vue` (use `RegionNode` in the preview; wire selection + resize)
- Test: `frontend/tests/unit/components/RegionNode.spec.js` (create)

**Interfaces:**
- Consumes: `getSplitDirection` from `layout.js`.
- Produces: `RegionNode` renders a region recursively — split → flex container of child `RegionNode`s with resizers between siblings; leaf → the emoji/name/size face. Props: `region`, `path` (`number[]`), `parentDirection`, `selectedId`, `layoutDir`. Emits: `select(id)`, `resize({ containerId, firstIndex, event, direction })`, and registers its split-container element via `register({ id, el })` / cleanup on unmount. Reuses the existing `.sre-region*` / `.sre-resizer` styles (moved or imported).

- [ ] **Step 1: Write the failing test**

Create `frontend/tests/unit/components/RegionNode.spec.js`:

```js
import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import RegionNode from "../../../src/components/settings/shared/regions/RegionNode.vue";

const split3 = {
  id: "r1", kind: "calendar", size: 100,
  split: { direction: "column", regions: [
    { id: "r1-a", kind: "photos", size: 50 },
    { id: "r1-b", kind: "service", size: 50,
      split: { direction: "row", regions: [
        { id: "r1-b-a", kind: "photos", size: 50 },
        { id: "r1-b-b", kind: "calendar", size: 50 },
      ] } },
  ] },
};

describe("RegionNode", () => {
  it("renders nested RegionNodes and emits select with the clicked id", async () => {
    const wrapper = mount(RegionNode, {
      props: { region: split3, path: [0], parentDirection: "row", selectedId: null, layoutDir: "row" },
    });
    expect(wrapper.findAllComponents(RegionNode).length).toBeGreaterThanOrEqual(5);
    await wrapper.find("[data-region-id='r1-b-a']").trigger("click");
    const selects = wrapper.emittedByComponent ? null : wrapper.emitted("select");
    // The deepest node re-emits up to the root; assert the root saw a select for r1-b-a.
    expect(wrapper.emitted("select").flat()).toContain("r1-b-a");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run tests/unit/components/RegionNode.spec.js`
Expected: FAIL — file does not exist.

- [ ] **Step 3: Create `RegionNode.vue`**

Extract the per-region preview markup currently inline in `ScreenRegionEditor.vue` (the `.sre-region` / `.sre-subsplit` / `.sre-region-face` / `.sre-resizer` blocks) into a recursive component. Sketch:

```vue
<template>
  <div
    class="sre-region"
    :class="[region.split ? 'is-split' : `kind-${region.kind}`, { 'is-active': region.id === selectedId }]"
    :style="{ flex: `${region.size} ${region.size} 0` }"
    tabindex="0"
    :data-region-id="region.id"
    @click.stop="emit('select', region.id)"
    @keydown.enter.prevent="emit('select', region.id)"
  >
    <div v-if="region.split" ref="containerEl" class="sre-subsplit" :class="`dir-${splitDir}`">
      <template v-for="(sub, i) in region.split.regions" :key="sub.id">
        <RegionNode
          :region="sub"
          :path="[...path, i]"
          :parent-direction="splitDir"
          :selected-id="selectedId"
          :layout-dir="layoutDir"
          @select="emit('select', $event)"
          @resize="emit('resize', $event)"
        />
        <button
          v-if="i < region.split.regions.length - 1"
          type="button"
          class="sre-resizer"
          :class="splitDir === 'row' ? 'col' : 'row'"
          aria-label="Resize sub-regions"
          @pointerdown.stop="onResize(i, $event)"
        >
          <span class="grip" />
        </button>
      </template>
    </div>
    <div v-else class="sre-region-face">
      <span class="sre-region-emoji">{{ emoji }}</span>
      <span class="sre-region-name">{{ title }}</span>
      <span class="sre-region-size">{{ region.size }}%</span>
    </div>
  </div>
</template>

<script setup>
import { computed, ref } from "vue";
import { getSplitDirection } from "@/utils/layout";

const props = defineProps({
  region: { type: Object, required: true },
  path: { type: Array, default: () => [] },
  parentDirection: { type: String, default: "row" },
  selectedId: { type: String, default: null },
  layoutDir: { type: String, required: true },
});
const emit = defineEmits(["select", "resize"]);

const containerEl = ref(null);
const splitDir = computed(() => getSplitDirection(props.region.split, props.parentDirection));
const emoji = computed(() =>
  props.region.kind === "calendar" ? "📅" : props.region.kind === "photos" ? "🖼️" : "🌐"
);
const title = computed(() =>
  props.region.kind === "calendar" ? "Calendar" : props.region.kind === "photos" ? "Photos" : "Service"
);
const onResize = (firstIndex, event) =>
  emit("resize", { containerId: props.region.id, firstIndex, event, direction: splitDir.value, el: containerEl.value });
</script>
```

Move the relevant `.sre-region`, `.sre-subsplit`, `.sre-region-face`, `.sre-resizer`, `.sre-region-emoji/name/size` styles from `ScreenRegionEditor.vue` into `RegionNode.vue`'s `<style scoped>` (copy them verbatim; leave the modal-chrome styles in `ScreenRegionEditor`). The service `title` here is a simple label; the real service name shown in the editor comes from the inspector — keeping "Service" as the face label matches the leaf face's existing generic look for services without a resolved name. (If richer names are desired later, pass a `label` down; out of scope now.)

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run tests/unit/components/RegionNode.spec.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd frontend && git add src/components/settings/shared/regions/RegionNode.vue tests/unit/components/RegionNode.spec.js
git commit -m "feat(editor): add recursive RegionNode preview cell"
```

---

## Task 7: Editor path migration — `ScreenRegionEditor` + `RegionInspector`

**Files:**
- Modify: `frontend/src/components/settings/shared/ScreenRegionEditor.vue`
- Modify: `frontend/src/components/settings/shared/regions/RegionInspector.vue`

**Interfaces:**
- Consumes: `getPathById`, `canSplitAtPath`, `splitRegionAtPath`, `unsplitRegionAtPath`, `addSubRegionAtPath`, `setSplitDirectionAtPath`, `setRegionContentAtPath`, `removeRegionAtPath`, `resizePairAtPath`, `getNodeAtPath`, `MAX_SPLIT_DEPTH`, `getSplitDirection` from `layout.js`; the `RegionNode` component.
- Produces: the editor preview renders top-level regions via `RegionNode` (recursive); all editor mutations go through path helpers; `RegionInspector` receives a `context` prop `{ depth, isSub, canSplit, canAddSub, splitDir }` and stops walking the tree itself.

Design notes:
- **Preview:** replace the inline region loop in `ScreenRegionEditor.vue` with, per top-level region `i`, a `<RegionNode :region="region" :path="[i]" :parent-direction="layoutDir" :selected-id="selectedRegionId" :layout-dir="layoutDir" @select="selectRegion" @resize="onNodeResize" />`, keeping the top-level resizers and clock-bar-between markup exactly as they are (clock-between stays top-level).
- **Selection → path:** add `const selectedPath = computed(() => selectedRegionId.value ? getPathById(activeScreen.value.layout, selectedRegionId.value) : null);`
- **Selection context** passed to `RegionInspector`:
  ```js
  const selectionContext = computed(() => {
    const path = selectedPath.value;
    if (!path) return null;
    const node = getNodeAtPath(activeScreen.value.layout, path);
    const parent = path.length > 1 ? getNodeAtPath(activeScreen.value.layout, path.slice(0, -1)) : null;
    const owner = node?.split ? node : parent;
    return {
      depth: path.length,
      isSub: path.length > 1,
      canSplit: canSplitAtPath(path) && !node?.split,
      canAddSub: Boolean(owner?.split) && owner.split.regions.length < MAX_TOP_REGIONS,
      splitDir: owner?.split ? getSplitDirection(owner.split, layoutDir.value) : layoutDir.value,
    };
  });
  ```
- **Handlers** rewritten to use the path (replace `topIndexOf`-based bodies):
  - `toggleSplitSelected`: `const p = selectedPath.value; const node = getNodeAtPath(layout, p); updateActiveLayout(node.split ? unsplitRegionAtPath(cloneLayout(), p) : splitRegionAtPath(cloneLayout(), p));`
  - `addSubToSelected`: `updateActiveLayout(addSubRegionAtPath(cloneLayout(), ownerPath))` where `ownerPath = node.split ? p : p.slice(0,-1)`.
  - `toggleSubDirSelected`: compute `ownerPath` as above; `const cur = getSplitDirection(owner.split, layoutDir); setSplitDirectionAtPath(cloneLayout(), ownerPath, cur === "column" ? "row" : "column")`.
  - `setSelectedComponent`: `setRegionContentAtPath(cloneLayout(), p, { kind, serviceId, instanceIds })`.
  - `toggleSelectedSource`/`clearSelectedSources`: build the id set as today, then `setRegionContentAtPath(cloneLayout(), p, { kind: node.kind, instanceIds: ids })`.
  - `removeSelected`: `updateActiveLayout(removeRegionAtPath(cloneLayout(), p)); selectedRegionId.value = null;`
  - `patchSelectedView`: unchanged (still by id via `setRegionView`).
- **Resize:** replace `startResize`/`startSubResize` with one `onNodeResize({ containerId, firstIndex, direction, el })`: resolve `containerPath = getPathById(layout, containerId)` (or `[]` if the container is the top-level `.sre-regions`), store `{ containerPath, firstIndex, rect: el.getBoundingClientRect(), direction }`, and on move call `resizePairAtPath(cloneLayout(), containerPath, firstIndex, nextSize)`. Top-level resizers pass a sentinel handled as `containerPath = []`.
- **`RegionInspector.vue`:** add a `context` prop (object). Replace its internal `splitOwner`/`isSub`/`canAddSub`/`splitDir`/`splittable` computeds with reads from `props.context` (e.g. `const splittable = computed(() => props.context?.canSplit)`; `canAddSub` → `props.context?.canAddSub`; `splitDir` → `props.context?.splitDir`; `isSub` → `props.context?.isSub`). Emitted events are unchanged; `ScreenRegionEditor` already maps them to the handlers above.

- [ ] **Step 1: Migrate `RegionInspector` to the context prop**

Add `context: { type: Object, default: null }` to its `defineProps`, and replace the tree-walking computeds with `props.context` reads (keep template bindings identical). Keep `getSplitDirection`/`MAX_TOP_REGIONS` imports only if still referenced; otherwise remove to satisfy lint.

- [ ] **Step 2: Wire `ScreenRegionEditor` — imports, preview, context, handlers, resize**

Apply the design-note changes: import the path helpers + `RegionNode`; swap the preview loop to `RegionNode`; add `selectedPath`/`selectionContext`; pass `:context="selectionContext"` to `RegionInspector`; rewrite the handlers and resize as above. Remove now-unused imports (`splitTopRegion`, `unsplitTopRegion`, `addSubRegion`, `removeSubRegion`, `removeTopRegion`, `setSubRegionContent`, `setSplitDirection`, `resizeSubRegionPair`, `topIndexOf`, `subRefs`, `setSubRef`).

- [ ] **Step 3: Lint**

Run: `cd frontend && npx eslint src/components/settings/shared/ScreenRegionEditor.vue src/components/settings/shared/regions/RegionInspector.vue src/components/settings/shared/regions/RegionNode.vue`
Expected: exit 0 (fix any unused-import warnings).

- [ ] **Step 4: Build**

Run: `cd frontend && npm run build`
Expected: build succeeds.

- [ ] **Step 5: Commit**

```bash
cd frontend && git add src/components/settings/shared/ScreenRegionEditor.vue src/components/settings/shared/regions/RegionInspector.vue
git commit -m "feat(editor): recursive preview + path-addressed region mutations"
```

---

## Task 8: Live end-to-end verification

**Files:** none (verification + fixups only).

Precondition: Vite dev server on `:5174` proxying `/api` → the `calvin-backend-dev` container on `:18001` (see prior sessions). If not running: `cd frontend && VITE_API_PROXY_TARGET=http://127.0.0.1:18001 npx vite --port 5174 --strictPort`.

- [ ] **Step 1: Full unit suite + lint + build**

Run: `cd frontend && npx vitest run && npx eslint src/utils/layout.js src/components/DashboardRegion.vue src/views/Dashboard.vue src/components/settings/shared/ScreenRegionEditor.vue src/components/settings/shared/regions/*.vue && npm run build`
Expected: all green.

- [ ] **Step 2: Editor — build a 3-level layout**

In the browser at `http://localhost:5174/settings` → Display → **Open editor**: split a top region into two, select one sub-cell, confirm **Split** is enabled (depth 2 → allowed), split it, and confirm the third-level cell shows **Split disabled** (depth 3). Confirm the layout persists (`curl -s http://localhost:18001/api/config | python3 -c "import sys,json;d=json.load(sys.stdin);print(json.dumps(d['dashboard_screens']['screens'][0]['layout'],indent=1))"` shows the nested `split`).

- [ ] **Step 3: Live dashboard — render + nested resize**

Navigate to `http://localhost:5174/`. Confirm the 3-level layout renders on the dashboard. Unlock the layout (admin overflow → unlock) and drag an **inner** divider; confirm only that container's cells rescale and the change persists. Confirm region arrows / keyboard cycling reach the deepest leaves.

- [ ] **Step 4: Restore the dev config**

Restore the Home screen to its baseline 2-region layout via the API (`POST /api/config` with `{"dashboardScreens": …}`, Home = Calendar 61 / Photos 39, `clockBar: null`), with the browser navigated away first (as in prior sessions) so the open editor doesn't race the write.

- [ ] **Step 5: Final commit (if any fixups were needed)**

```bash
cd frontend && git add -A && git commit -m "fix: nested-region edge cases found in live verification"   # only if changes were made
```

---

## Self-review

**Spec coverage:**
- Data model & path semantics → Task 1. ✅
- `layout.js` path primitives + helpers → Tasks 1, 3. ✅
- Recursive `normalizeRegionSplit` (depth cap) + `getLeafRegions` → Task 2. ✅
- Live renderer recursion → Task 4. ✅
- Live nested drag-resize (symmetric) → Task 5. ✅
- Editor recursion (`RegionNode`) + selection-context `RegionInspector` + path handlers + unified resize → Tasks 6, 7. ✅
- Navigation/active region (via recursive `getLeafRegions`) → Task 2 covers the helper; Task 8 Step 3 verifies cycling. ✅
- Testing (layout.spec.js, DashboardKioskResize.spec.js, new component specs, live Playwright) → Tasks 1–8. ✅
- Backend: no changes → not a task (correct). ✅
- Non-goals (no reorder, presets top-level, clock-between top-level, no migration) → respected; clock-between kept top-level in Task 7 notes. ✅

**Placeholder scan:** Task 5 Step 1 and Task 8 describe test/verification actions rather than full literal code because they depend on the existing `DashboardKioskResize.spec.js` mount harness and a live browser; the concrete wiring they exercise is fully specified in Task 5 Steps 3–4. All `layout.js` tasks (1–3) contain complete code. No `TBD`/`TODO`.

**Type consistency:** helper names match across tasks (`getNodeAtPath`, `getContainerAtPath`, `updateNodeAtPath`, `updateContainerAtPath`, `getPathById`, `canSplitAtPath`, `splitRegionAtPath`, `unsplitRegionAtPath`, `addSubRegionAtPath`, `setSplitDirectionAtPath`, `setRegionContentAtPath`, `removeRegionAtPath`, `resizePairAtPath`, `applyDragSizesById`). `DashboardRegion` gains a `path` prop (Task 5) consistent with its usage. `RegionNode` emits `select`/`resize` consumed by `ScreenRegionEditor` (Tasks 6–7). Resize context shape `{ dragSizes, regionsLocked, start }` consistent between Task 5 Steps 3–4.
