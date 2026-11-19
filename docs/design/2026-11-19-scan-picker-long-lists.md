# Device picker for long lists (calvin-zpg7)

Status: spec. Mock: [mocks/scan-picker/index.html](mocks/scan-picker/index.html), PNG
`mocks/scan-picker/png/picker.png`. Also in this PR: the not-responding tile treatment in
[mocks/switch-grid/index.html](mocks/switch-grid/index.html) (PNG `mocks/switch-grid/png/tiles.png`).

Builds on the frontend doctrine (§3 one component per job, §4 layout, §5 colour and state), the no-developer-words
rule and the Homey sign-off review (findings B3, B5/B9, B6, B12).

## 1. What's wrong

The `multi-select-scan` field (`frontend/src/components/PluginFieldRenderer.vue:63-87`) is a Scan button and one
`ChipMultiSelect` holding every scanned option. That works for five devices. A real Homey lists 50 or more
switchable devices, so:
- one wall of right-aligned chips (`ChipMultiSelect.vue:45`, `justify-content: flex-end`), each labelled
  "Name (Room)", with nothing to find a device by;
- the devices already chosen are scattered through the wall, so "what have I picked?" means reading every chip;
- before a scan (always, when editing), saved devices show as raw ids (B3);
- the field's label and hint aren't connected to the controls (B12).

## 2. The field

Anatomy, top to bottom (mock A):

1. **Label** (`--text-label`, `--weight-strong`), then the plugin's hint (`--text-meta`, `--ink-2`). For Homey:
   "Choose Scan, then pick the devices to show. Only these can be switched." (A3).
2. **Bar**: the search box, then the Scan button on the same line (`--gap-inline`); under 600px the search box
   takes the full line and Scan wraps below it, right-aligned.
   - Scan reads **Scan** before the first scan, **Scan again** after one, **Scanning…** while it runs
     (`aria-disabled`, not `disabled`, as today).
   - The search box is `TextField` (label **"Find {label, lowercased}"**, so "Find devices"; a plugin may set
     `ui.filter_label`), `type="search"`. It appears only when there are **more than 12** options. It opens the
     on-screen keyboard on a kiosk like every `TextField`.
3. **Chosen** group, always first, whenever anything is chosen: heading **Chosen** with the count as meta
   (`--ink-2`), a **Clear all** link button on the right (`Button variant="link"`), then one chip per chosen device
   in saved order, labelled **"Name (Room)"** (the room is needed here because the chips are out of their group).
   Searching never hides this group.
4. **Room groups**, in the order the scan returns them, then **Other** for options with no group. Heading = the room
   (`--text-body`, `--weight-strong`, sentence case as Homey gives it); meta **"{n} chosen"** when n > 0. Chips are
   the device name only. Groups are split by a `--line-soft` divider (doctrine §4.2).
   - With 12 or fewer options, or only one group, there are no headings: one plain chip group, as today.
5. **Count line** (`--text-meta`, `--ink-2`), the field's only live region (`role="status"`, polite): empty when
   not searching, **"{shown} of {total} devices match."** while searching (debounced 300 ms). It also carries the
   scan notes (B4 copy), which replace the count until the next keystroke.

## 3. States

| State | What shows |
|---|---|
| New source, before a scan | Label, hint, Scan. No search box, no groups. |
| Editing, on open | Scan runs once by itself (B3), button reads **Scanning…**; Chosen shows the saved ids as **"Saved device"** chips until the scan answers, then their names. |
| Scanned, ≤ 12 options | One chip group, no headings, no search box (today's look, left-aligned). |
| Scanned, > 12 options | Search box, Chosen, room groups (mock A). |
| Searching | Only chips whose name or room contains the text (case- and accent-insensitive, `localeCompare` base sensitivity or NFD-stripped `includes`). Rooms with no hits disappear; Chosen stays (mock B). |
| No match | Chosen stays, then **No devices match "{text}".** with a **Clear search** link button (mock C). |
| A saved device the scan didn't find | Stays in Chosen, labelled **Not found by the last scan**, dashed `--ink-3` border on a transparent fill, × still removes it (mock C). It never appears in a room group. |
| Scan failed | Today's notes (B4 copy) in the count line; Chosen and any earlier results stay. |

Chip states are `ChipMultiSelect`'s: chosen = filled `--focus` with `--focus-ink`; in the Chosen group a chosen chip
also shows **×** after the name (decorative, `aria-hidden`), because there a tap only removes. A tap on a chip in
a room group toggles it, and the Chosen group updates in place; focus stays on the tapped chip.

## 4. Builder notes

- **New block `ScanPicker.vue`** in `components/ui/` (doctrine §3: the control lives in `ui/`, the field renderer
  only wires it). Props: `modelValue: string[]`, `options: {value, label, group?}[]`, `label`, `hint`,
  `scanning`, `scanned` (bool), `note`; emits `update:modelValue`, `scan`. `PluginFieldRenderer`'s
  multi-select-scan branch becomes `<ScanPicker>` plus its scan call.
- **Don't nest one `ChipMultiSelect` per group as is.** Its `toggle` emits only values that are in its own
  `options` (`ChipMultiSelect.vue:31-37`), so a per-group instance would drop the other groups' choices.
  `ScanPicker` owns the selection: each group renders chips through `ChipMultiSelect` with the full
  `modelValue` and merges the group's emit back (`others ∪ groupSelection`, saved order kept, new ids appended).
  Also change `ChipMultiSelect`'s `justify-content` to `flex-start` (a prop `align="start|end"`, default `end`, so
  existing uses don't move).
- **Grouping data.** Scan options gain an optional `group` string. Host: `_scan_response`
  (`backend/app/api/routes/plugins/management.py:1144-1160`) keeps `group` when it is a string, cut like `label`.
  Homey: return `label = name`, `group = zone`, instead of `"name (zone)"`; the Chosen chip builds "Name (Room)"
  itself. A plugin without `group` gets the flat list.
- **Semantics** (B12): the label is a `<span id>`, not a `<label for>`. The whole picker is `role="group"`
  `aria-labelledby` = label id and `aria-describedby` = hint id; each room and Chosen is a nested `role="group"`
  `aria-labelledby` its heading (`<h4>` inside the settings dialog, under the dialog's title). Scan also gets
  `aria-describedby` = hint id. Chips keep `aria-pressed`; the × is `aria-hidden`, so a chosen chip reads
  "Lamp A (Kitchen), toggle button, pressed".
- **No inner scroll.** The dialog scrolls; a nested scroll box on a touch kiosk traps the finger. 50 chips in rooms
  are about four screens of a 390px phone, which is fine with the search box at the top.
- Tokens only: chip radius `--radius-control`, gaps `--gap-inline`, group rhythm `--gap-group`, touch targets
  `--touch-target` both ways (chips and both link buttons). No new tokens.
- **Tests:** grouping and the >12 threshold; search filters names and rooms and never hides Chosen; toggling in
  a room keeps other rooms' choices; Clear all; a saved id missing from the scan stays as "Not found by the last
  scan"; edit auto-scans once; the count line debounces and is the only live region; no ids or "Saved device"
  remain after a scan answers.

## 5. The not-responding tile (B5/B9)

Mock: `mocks/switch-grid/index.html`. `SwitchGrid.vue:296-299` drops `opacity: 0.5` (it took "Not responding" to
2.1:1 in light and 2.6:1 in Backlit). An unavailable tile keeps the plain surface and border, label and state in
`--ink-3` (5.2:1 light, 4.5:1 Backlit), the dotted lamp and `cursor: not-allowed`; hover doesn't change it. The same
holds for "Can't be switched from here". The note in the mock now ends with a full stop (A4).

## 6. Not in this spec

Choose-all per room, drag to reorder the tiles, and remembering the last search. Add them only if the owner asks.
