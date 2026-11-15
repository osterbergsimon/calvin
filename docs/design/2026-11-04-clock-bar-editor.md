# Clock bar editor

**Date:** 2026-11-04 · **Status:** design, owner approved the mockup ("Looks great. Make it real.")
**Mockup:** [mocks/clock-bar-editor/editor.png](mocks/clock-bar-editor/editor.png), a static capture of the clickable sketch the owner approved.
**Related:** [settings scope](2026-11-03-settings-scope.md) (clock bar sizes stay household for now),
[default screen](2026-10-30-default-screen.md), Pages & regions editor (`ScreenRegionEditor.vue`).

## 1. Why

The owner's words: the clock bar settings feel "ugly and broken". The two-line preview shows nothing, and there are no
controls for the logo (show, hide, size). The settings take a lot of room, and they would work better in a popup like
the page and region editor. The owner also wants a drag-and-drop editor for where the parts of the bar sit (plugin
tiles and the rest).

What exists today (`develop`):

- **The settings are spread over four places.** Dashboard › Clock has three toggles (date, seconds, logo). Dashboard ›
  Clock bar layout has two layout pills, two size pickers with Custom sliders, and one preview. Dashboard › Clock bar
  items is a list of tile switches, which write `show_in_statusbar` into each plugin instance's config. Content › Clock
  bar info holds the sources.
- **The arrangement is fixed in code.** `ClockBarHorizontal.vue` hard-codes the left side (logo, room, page dots), the
  centre (time, date) and the right side (tiles, then connection and ⋯). `ClockBarVertical.vue` has top, middle and
  bottom in the same way.
- **"Two lines"** only stacks the date under the time, so with the date off it looks the same as "Single line". This
  is the likely "no preview" bug. It is not confirmed in the running app; the builder should confirm it.
- **Sizes are px keys per shape** (`clockBarFontSize`, `…DateFontSize`, `…Padding`, `…PluginItemSize` and the
  `Vertical` twins). The logo and room name have no size.

## 2. Goals, non-goals, anti-goals

**Goals**

1. **One popup editor for the clock bar's design**, opened from Dashboard and from the region editor's Clock bar panel.
2. **Drag the parts of the bar between zones, and reorder them within a zone.** Hide a part by dragging it to a "Not
   shown" shelf, and show it again by dragging it back.
3. **Each part has its own settings** in a side panel: show, size, and options specific to that part.
4. **The preview is the real bar.** It is the same components as the dashboard, drawn over a page, for both bar shapes.
5. **Existing setups look the same after the upgrade** until someone edits them.

**Non-goals**

- **Where the bar sits on each page** (top, bottom, side, between regions) and whether a page shows it. That stays in
  Pages & regions.
- **Per-screen clock bar designs.** The settings scope spec keeps clock bar sizes household for now. The design is
  stored as one key (§4), so a later per-screen override is one more key in a screen's overrides.
- **What a tile shows.** That belongs to the plugin's `statusbar_schema`. New tile types are also out of scope.

**Anti-goals**: these make it a failure even if it works.

- **The preview differs from the dashboard.** It must render the real bar components, never a look-alike.
- **Settings becomes unreachable.** The connection status and ⋯ menu can be moved but never hidden.
- **An upgrade silently changes someone's bar,** or a plugin tile disappears without any action from the user.

## 3. The editor

It opens as a `Dialog` (`size="full"`), with the same frame as Pages & regions: a title, a context strip, a stage and
an inspector rail. On phones the rail becomes a bottom sheet. Reuse the region editor's sheet and layout behaviour; do
not copy it.

**Context strip**

- **Bar shape:** Top / bottom bar · Side bar. Each shape has its own design.
- **Previewing on:** the same control as Pages & regions (Any browser · each screen), so the preview takes that
  screen's size and orientation.
- **Reset to default** (confirm, then an Undo toast) and **Done**.

**Stage**

- **The real bar is drawn at preview scale over a page placeholder.** The top/bottom shape shows three zones (Left ·
  Centre · Right) side by side. The side shape shows three zones (Top · Middle · Bottom) stacked.
- **Every part of the bar is a chip in a zone.** The parts are: Calvin logo, room name, page dots, time, date, each
  plugin tile (one chip per bar-capable instance), and status & menu (the connection pill plus ⋯, as one chip).
- **The "Not shown" shelf** sits under the bar and holds the hidden parts. Status & menu can't be dropped there; the
  shelf says why when you try.
- **Drag and drop** works on a fine pointer at wide size, the same rule as the region editor's `clockDraggable`. A drop
  indicator shows where the chip will land. Use pointer events, not HTML5 drag-and-drop, so it can later extend to
  touch.
- **Without drag** (touch, compact, phone, keyboard), tapping or focusing a chip selects it, and the rail's **Zone**
  and **Order** controls (§3 Rail) move it. Arrow keys move the focused chip: ←/→ within and across zones (↑/↓ on the
  side bar).
- **Room name and page dots** show sample values in the preview ("Kitchen", two dots). Today the preview hides them,
  which is part of why it looks broken.
- **Every change saves live** and the dashboard follows, like the rest of Settings ("All changes saved"). Done only
  closes the editor.

**Rail: the selected part.** It has a header with the part's name, and these rows:

| Part | Rows |
|---|---|
| Every part except Status & menu | Show (the same as dragging to or from the shelf) |
| Every part | Zone (select), Order (Move earlier · Move later) |
| Calvin logo | Size S · M · L |
| Room name | Size S · M · L. Note: "Shows this screen's Name; nothing on a browser that isn't a screen" |
| Page dots | Note: "Only shows when the screen has more than one page" |
| Time | Size S · M · L · XL · Show seconds. Side bar only: Style Upright · Stacked digits (today's `compact-time`) |
| Date | Size S · M · L · Under the time (on only when Date directly follows Time in the same zone; this replaces "Two lines" on the top/bottom bar and `compact-time-date` on the side bar) |
| A plugin tile | Opens its source settings (link to Content › Clock bar info, at that instance) |
| Status & menu | Note: "Always shown, so Settings stays reachable" |

**Rail: whole bar.** Shown below the part's rows, and alone when nothing is selected:

- Bar height Slim · Normal · Roomy (the padding);
- Tile size S · M · L (all tiles share one size);
- a note: "Where the bar sits on each page is set in Pages & regions", with a link.

The size steps map to px tables per shape, and the builder picks the values. "Normal" and "M" must equal today's
defaults (time 16 / date 14 / padding 8 / tiles 16 on top/bottom; 18 / 11 / 8 / 16 on the side), so default setups
don't move. A stored px value that matches no step shows as **Custom (n px)** with a reset to the nearest step, so
existing custom sizes survive.

## 4. Data

There is one new household config key, **`clockBarDesign`**:

```json
{
  "version": 1,
  "horizontal": {
    "zones": { "left": ["logo", "room", "pageDots"], "center": ["time", "date"], "right": ["tiles", "status"] },
    "hidden": [],
    "parts": {
      "logo": { "size": "m" }, "room": { "size": "m" },
      "time": { "size": "m", "seconds": false },
      "date": { "size": "m", "underTime": false }
    },
    "barHeight": "normal",
    "tileSize": "m"
  },
  "vertical": { "zones": { "top": [], "middle": [], "bottom": [] }, "hidden": [], "parts": {}, "barHeight": "normal", "tileSize": "m" }
}
```

(A size is a step name or a number in px for Custom.)

- **Part ids:** `logo`, `room`, `pageDots`, `time`, `date`, `status`, `tile:<instanceId>`. The placeholder `tiles`
  stands for "every tile not listed elsewhere", placed together in instance order.
- **Tile instances.** A new plugin instance appears where the `tiles` placeholder is. Dragging a single tile out pins
  it by its own id. A deleted instance's id is dropped when the design is read.
- **One resolver**, `resolveClockBarDesign(config, services)` in `frontend/src/utils/`, is the only reader. Both bar
  components and the editor use it. It fills defaults, drops unknown ids, makes sure `status` is in a zone, and, when
  `clockBarDesign` is absent, **derives the design from the old keys**:
  - `clockShowDate` → date hidden or shown;
  - `clockShowSeconds` → `time.seconds`;
  - `clockBarShowLogo` → logo hidden or shown;
  - `clockBarLayout: two-lines` → `date.underTime`;
  - `clockBarVerticalLayout` → time style and `date.underTime`;
  - the px size keys → Custom or the matching step;
  - each instance's `show_in_statusbar: false` → that tile hidden.

  The result must render exactly what the bar renders today (anti-goal 3).
- **Writes.** The editor writes only `clockBarDesign`. Old keys stay in the config and are read only by the resolver's
  fallback. Remove them in a later cleanup, not in this work.
- **Tile visibility moves into the design.** The editor stops writing `show_in_statusbar`. An instance that has
  `show_in_statusbar: false` and isn't listed in the design starts hidden (the plugin's own default still counts for
  new instances).
- **Backend:** add `clockBarDesign` to `ConfigUpdate`, typed: zones and lists of strings, step enums or numbers, and
  a size cap. Leave it out of `CONFIG_DISPLAY_KEYS`, so editing needs admin, like the other clock bar keys today.

## 5. Where it opens, and what leaves Dashboard

- **Dashboard › Clock bar:** one section with a live mini preview of the current design (top/bottom shape) and **Edit
  clock bar**. It replaces the Clock, Clock bar layout and Clock bar items sections. `ClockBarSections.vue`,
  `ClockBarSizePicker.vue` and `ClockBarItemsTab.vue` are retired once nothing uses them.
- **Pages & regions › Clock bar panel:** add **Edit clock bar look…** under Position. It opens the clock bar editor on
  top of the region editor, with the same shape and preview screen. Closing it goes back to the region editor.
- **Content › Clock bar info** (sources) stays as it is, with a line linking to the editor.
- **Search:** the new section keeps every old keyword ("clock", "date", "seconds", "logo", "two lines", "clock bar
  items", "plugin tiles", "size"). The old ids `clock-bar-appearance`, `clock-bar-layout` and `clock-bar-items` deep
  link to the new section.

## 6. Constraints

- Vue 3 Composition API, the existing settings UI kit (`Dialog`, `SettingRow`, `SegmentedControl`, `SelectPill`,
  `ScopeLine`, `IconButton`), and `.calvin-plugin-*` / token CSS. Don't add a new drag library.
- **The 3B+ budget.** The bar components resolve the design once per config change, not per tick. The time's
  every-second redraw exists only when `seconds` is on.
- **Accessibility.** Every chip is a focusable button with a label ("Time, in Centre, 1 of 2"). Zone and Order are
  reachable without drag. Moves are announced (`aria-live`). Touch targets are at least 44 px in the rail.
- **Plugins stay self-contained.** Tiles are still drawn by `SchemaStatusbarItem`, and the editor only arranges them.

## 7. Decided after the builder check

These are design-lead calls, made after a builder read the spec against `develop`. The owner can still overrule them.

1. **Tiles render per zone.** `PluginStatusbarItems` gets an optional `ids` prop (an ordered list of instance ids).
   Without it, it behaves exactly as today, so other callers are unaffected. The bars render one
   `PluginStatusbarItems` per zone that holds tiles. The services fetch stays a single store call at bar mount, not one
   per zone.
2. **`clockBarDesign` decides which tiles show.** Once a tile is listed in the design (in a zone or in `hidden`), the
   design wins and `show_in_statusbar` is ignored for it. **Adding a source** in Content › Clock bar info still writes
   `show_in_statusbar: true`, and it also removes that tile from `hidden`, because adding it means you want to see
   it. `PluginStatusbarItems` with `ids` never reads the flag; only the resolver does.
3. **Side bar layouts.** `upright`, `single-line` and `two-lines` map to time style Upright. `compact-time` maps to
   Stacked digits. `compact-time-date` maps to Stacked digits plus the date's Stacked style. Legacy `vertical-compact`
   maps to Stacked digits. On the side bar the date always sits under the time, so the side bar has no "Under the time"
   option. Its Date row offers **Style: Line · Stacked** instead (weekday / day month / year, as `compact-time-date`
   draws today). "Under the time" exists on the top/bottom bar only.
4. **One renderer.** The bar components render the parts from the resolved design. In the editor they get an
   `editable` mode: each part is wrapped in a chip (focus, selection, drag handle) through a wrapper in the bar
   component itself, not a separate renderer. A `sample` mode fills in the room name ("Kitchen"), two page dots and
   Status & menu. `previewMode` and the `preview*` props are retired once `ClockBarPreview` goes, since the dashboard
   never passes them.
5. **What stays as it is today.**
   - The phone-width CSS that hides the room name and page dots (CLV-66), and the `between` position's fixed text
     sizes. The editor's rail notes both ("Hidden on phones", "Fixed size between regions").
   - The Centre zone always takes the middle, even when empty, so the parts in it stay centred.
   - Status & menu uses the compact cluster on the side bar, wherever it is placed.
6. **Under the time** shows only while Date directly follows Time in the same zone. If they're separated, the stored
   `underTime` is kept but ignored, and the row is disabled with the note "Put Date right after Time". The preview
   reflects Show seconds, including the wider time.
7. **"M" is today's look** for every part. That includes the logo and room name, which get a size input whose M
   equals their current CSS. A default setup renders pixel-identical.
8. **Backend validation** checks the shape only: the zone keys, lists of strings, step enums or numbers within range,
   and a size cap. Part ids are not checked, since tile ids are dynamic and the resolver drops unknown ones. `version: 1`
   needs no migration code.
9. **Previewing on** only changes the stage's size and orientation, never which design is shown. There is one design.

**Where the spec and the mockup differ, the spec wins.** Seconds is an option on Time, not a chip on the shelf, and
"Under the time" is on Date, not Time.

## 8. Left to the builder

- The px values for each size step, and the drop-indicator visuals.
- Whether the stage draws the real bar inside a scaled container or at 1:1 with scroll on small screens.
- How to split `ClockBarHorizontal` / `ClockBarVertical` so both render from the resolved design. Keep their public
  props for the dashboard.
- Test layout. It must cover: resolver migration parity for every old-key combination listed in §4; status can't be
  hidden; new and deleted tile instances; Under the time only when adjacent; keyboard move; live save; and the deep
  links.
