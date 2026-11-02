# Pages & regions: swap regions and change what a region shows

Status: spec (owner request calvin-7at6; rc.2, builds after rc.1). No mockup yet; sketches below. Frontend only:
`ScreenRegionEditor.vue`, `regions/RegionNode.vue`, `regions/RegionInspector.vue`, `utils/layout.js`. No backend
or config-shape change.

## 1. Today

- In the preview, only the clock bar drags (HTML5 drag, wide editor with a mouse only). Dividers resize.
- You can't move a region. To put photos on the left and the calendar on the right, you have to remove both regions
  and add them again. That loses each region's settings: view, week numbers, events per day, photo fit, sources and
  When tapped.
- The inspector already has a **Shows** picker that changes a region in place. But `setRegionContentAtPath` keeps
  the old `view` object. A calendar turned into photos carries `mode`, `weeks` and `weekNumbers` it never reads.
  The next calendar patch then rebuilds the view from only the calendar's own keys, so what survives depends on the
  order of edits. §4 fixes this.

## 2. The model: content swaps, slots stay

A page is made of **slots**: each slot is a position plus a size, with nested splits. Each slot holds **content**:
`id`, `kind`, `serviceId`, `instanceIds` and `view`.

- **Swap** exchanges the content of two leaf slots. Each slot keeps its `size`, and the split tree stays as it was.
- The `id` travels with the content, so anything keyed by region id follows it: the screen's `activeRegionId`
  (loading light, focus and dim) and the editor selection. Swapping is the same as moving the region, with nothing
  to re-point.
- Any two leaves on the same page can swap, at any depth. A sub-region of a split can swap with a top-level region,
  and it takes that region's slot size.
- Split regions are not swappable in v1: they have no face to grab, and their sub-regions are the targets. Moving a
  whole split is a follow-up if anyone asks.
- New helper `swapLeavesAtPaths(layout, pathA, pathB)` in `utils/layout.js`. It is a pure function and returns the
  layout unchanged when the paths are equal or when either one is a split.

## 3. Ways to swap

### 3.1 Drag (every size, mouse and touch)

The clock bar's HTML5 drag doesn't work with touch, which is why it's limited to the wide editor with a mouse.
Regions should move on the touch kiosk too, so region drag uses **pointer events** instead. That gives one code path
for mouse, touch and pen, in every size class.

| | Mouse / pen | Touch |
|---|---|---|
| Start | Press on a region face and move 6px or more | **Long-press 400ms** on a region face, then move |
| Before the start | A click selects, as today | A tap selects, as today. Moving before 400ms does nothing, so a stray swipe never lifts a region |
| Cancel | Escape, release over the lifted region, or release outside every region | Release over the lifted region or outside every region |

- Dividers (`.sre-resizer`) keep their own `pointerdown` with `.stop`, so resizing never starts a swap.
- Hit-testing uses `document.elementFromPoint` → the closest leaf `[data-region-id]`, so nested leaves just work.
- On release over another leaf: swap (§2), select the moved content, and announce it (§3.3).
- On a coarse pointer the 400ms press shows its progress: the face's outline fills in `--focus`, over `--dur`
  (none under reduced motion). Then the region lifts (§5). Call `navigator.vibrate?.(10)` when the region lifts;
  where vibration isn't available, skip it.
- On phone with the sheet open (65%), the stage is still visible above the sheet, so dragging works there too.
  Starting a drag doesn't close the sheet.

### 3.2 Swap with… (keyboard and tap)

For anyone who can't or won't drag. It goes in the inspector's **Arrange** group, before Split / Remove:

```
Arrange
  ⓘ Size 30% — drag the divider in the preview to resize.
  [ Swap with… ▾ ]  [ Split region ]  [ Remove region ]
```

- It is a `Button size="sm"` that opens a `Popover` + `Menu` (doctrine §3) listing every **other** leaf on the page.
  It's hidden when the page has only one leaf.
- Each item gives the kind, the source summary when it's filtered, and where the region sits:
  **Photos · right**, **Calendar · Family · top left**.
  - The position comes from the leaf's centre in the preview: left/centre/right × top/middle/bottom. Drop the axis
    the split doesn't use, so a plain row says only **left / centre / right**.
  - If two items still read the same, add the size: **Service · right · 25%**.
- Each item has the kind icon (`ListRow`/`Menu` icon slot), and items are ≥ `--touch-target` tall.
- While an item has focus or hover, its region in the preview gets the drop-target highlight (§5). Then a keyboard
  user sees which region they're about to pick.
- Choosing an item swaps the regions, keeps the moved content selected, closes the menu, returns focus to
  **Swap with…**, and announces the swap (§3.3).

There are no separate Move left / Move right actions. In a two- or three-region page, Swap with… is the same thing in
one step, and it also covers nested regions.

### 3.3 After a swap

- A visually hidden `role="status"` in the editor announces **Swapped Calendar and Photos.**
- Nothing to confirm: a swap only rearranges, and doing it again undoes it. The editor's normal Save / Cancel still
  applies.

## 4. Shows: change a region in place

The **Shows** picker stays where it is. When you pick something, what happens depends on whether the kind changes:

| Change | Sources | Settings (`view`) |
|---|---|---|
| Same kind (one service → another service, or calendar → calendar) | As the picked option says (today's behaviour) | **Kept** |
| Different kind (calendar → photos) | Reset to the new option's (all sources) | **The new kind's defaults** (`viewForKind(null, kind)`) |

- **Undo instead of confirm.** When the kind changes, the old content (`kind`, `serviceId`, `instanceIds`, `view`)
  is parked in editor memory under that region's id. Under the Shows button an `InlineNote` says:
  **Calendar settings were reset.** with an **Undo** `Button size="sm"` in the note's action slot.
  - Undo puts the parked content back exactly.
  - The note goes away when another region is selected, or after the next edit to this region.
- **Switching back restores.** If you pick the parked kind again for that region during the same editor session, the
  region gets its parked settings back, not the defaults. Turning calendar → photos → calendar loses nothing.
- Parked content is editor memory only. It is never saved, and closing the editor drops it, so the saved config only
  ever holds the active kind's `view`.
- Fix the leak from §1: `setRegionContentAtPath` sets `view` from `viewForKind` when the kind changes, and keeps it
  as-is when the kind stays.

## 5. Drag and drop-target feedback

The drop targets reuse the clock bar's drop look (`.sre-drop`: `--focus` 9% wash, dashed 50% `--focus` border,
`--radius-control`, `--focus-text` caption). Swap and the clock bar should read as the same gesture.

| State | Look |
|---|---|
| Lifted region (source) | Stays in place; content at 45% opacity, dashed `--line` outline, `--elev-2`; cursor `grabbing` |
| Drag chip | A small pill under the pointer (offset 12px so a finger doesn't hide it): kind icon + **Calendar**. `--bg-2`, `--elev-2`, `--radius-round`, `--text-caption`, `--z-raised` inside the stage. Under reduced motion it still follows the pointer; it just has no fade-in |
| Every other leaf | An `.sre-drop` overlay inset 3px, caption **Swap** |
| Leaf under the pointer | `.sre-drop:hover` look (28% wash, solid `--focus` border), caption **Swap with Photos** |
| Over the source or outside | No highlight. Releasing does nothing |
| Clock-bar drop zones | Never shown during a region drag, and region overlays never show during a clock drag |
| Hover with a mouse, not dragging | Face shows the `⠿` grip (as on the clock bar) and cursor `grab`. On touch the grip is always hidden; the long-press is the affordance, and the inspector's Swap with… is the visible path |

Sizes:

| Size class | Device | Notes |
|---|---|---|
| Wide (laptop, 1280×800 kiosk) | Fitted device, region faces with icon, name, % | Captions as above |
| Compact (800×480 kiosk landscape) | Smaller faces | The caption drops to **Swap** on the target too when the face is under 120px wide |
| Phone, and 480×800 kiosk portrait | Faces may be `narrow` (name only, < 320px device) | Captions are **Swap** only, and the chip shows only the icon. The sheet stays as it is (§3.1). The subtitle that names gestures is hidden here already |

Sketch, wide, landscape, Calendar lifted over Photos:

```
┌──────────────────────────────┬────────────┐
│ ┊ ⠿ Calendar          70%  ┊ │┏━━━━━━━━━━┓│
│ ┊   (45%, dashed)          ┊ ││ Swap with ││
│ ┊                          ┊ ││  Photos   ││
│ ┊               [▣ Calendar]──▶          ││
│ ┊                          ┊ │┗━━━━━━━━━━┛│
└──────────────────────────────┴────────────┘
```

Copy changes: the wide header subtitle becomes **Design the pages your screens display · drag regions to swap them,
dividers to resize, the clock bar to reposition**. Region faces keep Enter to select. The inspector's Swap with… is
the keyboard path, so the face itself gets no drag ARIA.

## 6. Tests

- `layout.spec.js`: `swapLeavesAtPaths` swaps content and ids, keeps sizes and the split tree, works across depths,
  and is a no-op for equal paths or a split path.
- `layout.spec.js`: `setRegionContentAtPath` resets `view` on a kind change and keeps it on the same kind.
- `RegionInspector` spec:
  - Swap with… lists the other leaves with position labels, and is hidden with one leaf.
  - Choosing an item emits the swap.
  - A kind change shows the Undo note; Undo restores; switching back restores the parked view.
- `ScreenRegionEditor` spec:
  - A pointer drag (6px) over another leaf swaps them and selects the moved content.
  - Escape cancels.
  - Pressing on a divider never starts a swap.
  - Clock and region drop zones never show together.
- e2e phone (mocked harness): long-press a region, drag it onto another, check that the preview order and selection
  changed. Then Swap with… does the same from the sheet.

## 7. Follow-ups (not in this spec)

- Move the clock bar to the same pointer-event drag, so it also drags on touch.
- Swap a whole split region.
