# Recursive region nesting (sub-cells within sub-cells)

- **Date:** 2026-07-14
- **Status:** Design — awaiting review
- **Branch:** `feature/regions-editor-redesign`
- **Related:** the region editor redesign (`ScreenRegionEditor.vue`), the live dashboard (`views/Dashboard.vue`, `components/DashboardRegion.vue`), and the layout model (`utils/layout.js`).

## Problem

A dashboard screen's layout is a list of top-level regions, and a region can be
**split** into sub-regions (`region.split.regions`). Today that nesting is capped
at exactly **two levels**: a top-level region may split once, but a sub-region
cannot split again. Users want true nesting — e.g. *"two columns, the right
column split into two rows, and one of those rows split into two."* That is
level‑3 nesting, which the current model, renderers, and resize interactions
cannot represent or display.

## Investigation findings (current state)

Three layers were audited. The 2‑level cap is enforced in the frontend only; the
backend is depth‑agnostic.

### Backend — no work needed
`dashboardScreens` is persisted as an **opaque `dict[str, Any]`** (Pydantic
`ConfigUpdate.dashboardScreens` in `backend/app/api/routes/config.py:100`) and
stored as JSON via `ConfigDB` (`value_type="json"`) with **zero structural
validation** (`config_service.py` just `json.dumps`/`json.loads`). A layout with
arbitrarily deep `split` nesting is persisted verbatim. **No backend changes.**

### Frontend model (`utils/layout.js`) — three enforcers of the 2‑level cap
1. **`normalizeRegionSplit(split, parentId)` (~line 602)** builds each sub-region
   *without* copying its `.split`, so any deeper nesting is **silently dropped on
   normalize**. This is the hard data-model cap.
2. **`getLeafRegions(layout)` (~line 397)** flattens exactly two levels; it does
   not recurse into a sub-region that has its own split. Used by region cycling,
   `activeRegionId` validation, and `getActiveDashboardRegion`.
3. **All mutation helpers use flat addressing** — `splitTopRegion(layout,
   topIndex)`, `addSubRegion(layout, topIndex)`, `removeSubRegion(layout,
   topIndex, subIndex)`, `setSplitDirection(layout, topIndex, dir)`,
   `resizeSubRegionPair(layout, topIndex, firstIndex, size)`,
   `setSubRegionContent(layout, topIndex, subIndex, patch)`. `(topIndex,
   subIndex)` cannot address a third level.

Already recursive and reusable: **`setRegionView`** (by id) and the focus-light
**`regionContainsLeaf`** (`views/Dashboard.vue`).

### Live dashboard renderer — 2‑level, and resize is top‑level only
- **`components/DashboardRegion.vue`** renders two hardcoded cases: `region.split`
  → loop `region.split.regions` rendering leaf viewers directly; else → a single
  leaf viewer. It never recurses (`<DashboardRegion>` does not render itself) and
  never checks `sub.split`.
- **`views/Dashboard.vue`** owns drag‑to‑resize but only for **top-level**
  dividers: `resizeHandles` emits one handle per gap between top-level regions;
  `startRegionResize(firstIndex)` → `resizeAdjacentRegions(layout.regions, …)`;
  a live `dragSizes` overlay keyed by `region.id` is applied through
  `getRegionAxisStyle`. Sub-region dividers are **not draggable on the kiosk
  today.** The `dragSizes` overlay is keyed by id, so it is already
  depth-agnostic; only handle placement and drag math are top-level-bound.

### Editor — 2‑level render + resize
`ScreenRegionEditor.vue` renders region → sub-split → sub-leaf (two levels) and
has two resize paths (`startResize` top, `startSubResize` sub). `RegionInspector`
marks a region `splittable` only when it is top-level.

## Decisions

1. **Depth: soft cap at 3 levels.** The recursion is general; the cap is a single
   guard. A cell can be split only when its depth (`path.length`) is `< 3`, so
   level‑1 and level‑2 cells can split, and level‑3 cells cannot. Enforced both in
   the UI (Split control disabled) and in data (`normalizeRegionSplit` drops a
   level‑3 child's `.split`). Constant: `MAX_SPLIT_DEPTH = 3`. Raising it later is
   a one-line change.
2. **Approach A: path-based helpers + recursive rendering.** Nodes are addressed
   by an index **path**; mutations are pure path-addressed functions in
   `layout.js`; rendering recurses in each renderer. Rejected alternatives:
   controlled patch-bubbling components (welds mutation to the view tree, breaks
   whole-layout ops like leaf cycling), and unifying the editor + live renderers
   into one component (they render fundamentally different content).
3. **Symmetric resize.** Both the editor **and** the live kiosk get nested
   drag-resize at every divider at every level. Nothing regresses: top-level
   resize behaves exactly as today.

## Data model & path semantics

Node shape is unchanged. `split.regions[]` becomes **recursive** — a sub-node may
carry its own `.split`.

A **path** is an array of indices into `regions` / `split.regions`, alternating:

| Path | Resolves to | Level (depth) |
|---|---|---|
| `[]` | layout root (container, not a node) | 0 |
| `[2]` | `layout.regions[2]` | 1 |
| `[2,0]` | `layout.regions[2].split.regions[0]` | 2 |
| `[2,0,1]` | `…regions[2].split.regions[0].split.regions[1]` | 3 |

- **Depth = `path.length`.** `canSplit(path) ⇔ path.length < MAX_SPLIT_DEPTH`.
- **Selection stays id-based** (`selectedRegionId`) so it survives re-renders; the
  mutation path is derived on demand via `getPathById(layout, id)`.

## `utils/layout.js` changes

### New primitives
```js
export const MAX_SPLIT_DEPTH = 3;

// Walk indices to the addressed node (or null).
export function getNodeAtPath(layout, path) { … }

// Immutably replace the node at `path` with fn(node). JSON-clone (reactive-safe),
// consistent with setRegionView's existing clone strategy.
export function updateNodeAtPath(layout, path, fn) { … }

// Immutably transform the regions array of the container at `containerPath`
// (containerPath === [] → layout.regions; otherwise node.split.regions).
export function updateContainerAtPath(layout, containerPath, fn) { … }

// Recursive id → path lookup (null if not found).
export function getPathById(layout, id) { … }
```

### Path-addressed mutation helpers (replace the flat ones)
Each is a thin wrapper over the primitives, reusing existing size math
(`resizeAdjacentRegions`, `normalizeRegionSizes`, `normalizeRegionPercentages`):

- `splitRegionAtPath(layout, path)` — guard `canSplit(path)` and "not already
  split"; produces the same `{regions:[a,b]}` shape as today's `splitTopRegion`.
- `unsplitRegionAtPath(layout, path)` — collapse `.split` into a leaf, keeping the
  first sub's content (as `unsplitTopRegion`).
- `addSubRegionAtPath(layout, path)` — node must be split; append a sub (guard
  `< MAX_TOP_REGIONS`), rescaling as today's `addSubRegion`.
- `setSplitDirectionAtPath(layout, path, dir)`.
- `setRegionContentAtPath(layout, path, patch)` — kind/serviceId/instanceIds.
- `removeRegionAtPath(layout, path)` — remove the node from its parent container
  (`parentPath = path.slice(0,-1)`, `index = path.at(-1)`): root parent keeps a
  min of 1 (as `removeTopRegion`); split parent collapses to a leaf when it would
  drop below 2 children (as `removeSubRegion`).
- `resizePairAtPath(layout, containerPath, firstIndex, firstSize)` — one resize
  entry point for every level, wrapping `resizeAdjacentRegions` on the addressed
  container's children.

The existing flat helpers are removed once no caller remains (editor and dashboard
migrate to the path helpers). `resizeAdjacentRegions` / size-normalization stay.

### Recursion in existing functions
- **`normalizeRegionSplit(split, parentId, childLevel)`** — normalize each child,
  then set `child.split = childLevel < MAX_SPLIT_DEPTH ?
  normalizeRegionSplit(child.split, child.id, childLevel + 1) : null`. Called from
  `normalizeDashboardLayout` with `childLevel = 2` (top regions are level 1).
  This both enables nesting and **enforces the depth cap in data**.
- **`getLeafRegions(layout)`** — recurse to the deepest leaves (carry `parentId`).

## Live dashboard renderer (`components/DashboardRegion.vue` + `views/Dashboard.vue`)

`DashboardRegion.vue` becomes **recursive and owns resize for its own container**:

- Template: `v-if="region.split"` → a flex container (direction = split direction)
  that loops children, rendering `<DashboardRegion :region="child" …>` for each,
  with a **resize handle between adjacent children** (skipped when
  `configStore.regionsLocked`); `v-else` → the leaf viewer
  (`CalendarView`/`PhotoSlideshow`/`WebServiceViewer`), unchanged. Content
  resolution stays keyed by `kind`/`id`, valid at any depth.
- **Ownership split (single source of truth):** `Dashboard.vue` owns the whole
  drag *lifecycle* — pointer listeners, the id-keyed `dragSizes` overlay, the
  commit-on-`pointerup` persistence, the between-clock-bar gap skip, and the
  `regionsLocked` gate. `DashboardRegion.vue` owns only *rendering the handles*
  and reporting a drag: on handle `pointerdown` it emits `(containerPath,
  firstIndex, containerEl)` up to `Dashboard.vue`, which measures that element and
  runs `resizePairAtPath` on the addressed container. So the recursive component
  never mutates layout state itself — it just says "a divider at this path
  started dragging," matching how top-level resize is wired today.
- `regionStyle`/`getRegionAxisStyle` already size a node by `size` + parent
  direction; each recursion level applies it to its children.

## Editor (`ScreenRegionEditor.vue`, `regions/RegionNode.vue`, `regions/RegionInspector.vue`)

- **Extract `regions/RegionNode.vue`** — a recursive editor cell. `v-if="split"` →
  flex container (direction = split direction) of child `RegionNode`s with
  resizers between siblings; else → the leaf face (emoji / name / size badge).
  Emits `select(id)` and `resize(containerId, firstIndex, event)`. Registers its
  container element ref by id so the parent can measure the right rect.
- **`ScreenRegionEditor`** computes a **selection context** from the derived path —
  `{ depth, isSub, canSplit, canAddSub, splitDir }` — and passes it to
  `RegionInspector` as props. `RegionInspector` stops walking the tree itself
  (removing its current 2-level `screen.layout.regions.some/find` logic) and
  simply renders controls from the context: Split enabled when `canSplit`, Add
  row/column when `canAddSub`, sub-direction from `splitDir`. Its emitted events
  are unchanged.
- **Unified resize:** the two handlers (`startResize`, `startSubResize`) collapse
  into one that takes `(containerId, firstIndex)`, resolves the container path via
  `getPathById`, measures that container's element, and calls `resizePairAtPath`.
  Per-container element refs are registered by `RegionNode` (keyed by the
  split-owner id), replacing the current `screenEl`/`subRefs` pair.
- All existing editor handlers (`toggleSplitSelected`, `addSubToSelected`,
  `removeSelected`, `toggleSubDirSelected`, `setSelectedComponent`,
  `applySourceIds`) switch from `topIndexOf(region)` to `getPathById` + the
  path helpers.
- **Clock-bar "between" stays top-level only** — no clock bar between deep
  sub-cells. Unchanged.

## Navigation & active region

With `getLeafRegions` recursive, `cycleActiveDashboardRegion` (region arrows /
keyboard), the touch nav dots, `getActiveDashboardRegion`, and the
`activeRegionId` validation in `normalizeDashboardScreen` all reach the deepest
leaves with no further change. `regionContainsLeaf` (focus lighting) is already
recursive. Verify arrows cycle through level‑3 leaves.

## Testing

- **`tests/unit/utils/layout.spec.js`** — extend: `getNodeAtPath` /
  `updateNodeAtPath` / `updateContainerAtPath` / `getPathById`; `splitRegionAtPath`
  incl. the `MAX_SPLIT_DEPTH` guard (level‑3 split refused); `addSubRegionAtPath`;
  `removeRegionAtPath` (root-min-1 and split-collapse cases); `resizePairAtPath` at
  each level; recursive `getLeafRegions`; recursive `normalizeRegionSplit`
  asserting a level‑3 child's `.split` is dropped; a **backward-compat** case
  proving an existing 2-level config normalizes byte-identically.
- **`tests/unit/views/DashboardKioskResize.spec.js`** — extend for nested resize
  (drag an inner divider; assert only that container's children rescale; top-level
  resize still behaves as before; `regionsLocked` still gates).
- **Live verification (Playwright + real backend on `:5174`/`:18001`)** — build a
  3‑level layout in the editor; confirm the **live dashboard** renders it; confirm
  persistence; confirm region arrows reach the deep leaves; confirm nested
  drag-resize works on the kiosk view.

## Scope boundaries (non-goals)

- No migration — recursion is additive; existing 2-level configs are unchanged. An
  older frontend reading a 3-level config degrades gracefully (drops level‑3 on
  normalize).
- No cell drag-to-reorder.
- Presets remain top-level only.
- Clock-bar "between" remains between top-level regions only.
- Depth stays capped at 3 (soft; one constant).

## File-by-file change list

| File | Change |
|---|---|
| `frontend/src/utils/layout.js` | Add path primitives + path mutation helpers + `MAX_SPLIT_DEPTH`; make `normalizeRegionSplit` and `getLeafRegions` recursive; remove flat split helpers once callers migrate. |
| `frontend/src/components/DashboardRegion.vue` | Make recursive; render nested resize handles; measure own container. |
| `frontend/src/views/Dashboard.vue` | Generalize the drag lifecycle to accept a container path; keep `dragSizes`/persistence/`regionsLocked`; move/param top-level handle logic. |
| `frontend/src/components/settings/shared/regions/RegionNode.vue` | New recursive editor cell (extracted from `ScreenRegionEditor`). |
| `frontend/src/components/settings/shared/ScreenRegionEditor.vue` | Use `RegionNode`; derive path from selection id; compute selection context; unify resize; migrate handlers to path helpers. |
| `frontend/src/components/settings/shared/regions/RegionInspector.vue` | Consume selection-context props; drop internal 2-level tree-walking. |
| `frontend/tests/unit/utils/layout.spec.js` | Extend (above). |
| `frontend/tests/unit/views/DashboardKioskResize.spec.js` | Extend for nested resize. |

## Risks

- **Nested resize drag math on the live renderer** is the fiddliest piece — each
  container must measure its own element and rescale only its own children. Covered
  by unit tests + live Playwright verification.
- **Tiny cells** at depth 3 — the existing `minSize` floor in `resizeAdjacentRegions`
  guards correctness; depth is capped to keep cells usable on a Pi screen.
