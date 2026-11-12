# Settings scope: what each screen can change, and where

**Date:** 2026-11-03 · **Task:** calvin-m23u (feeds calvin-uudb, effects level)
**Status:** design proposal. Owner decisions in §8. No product code changed.
**Replaces** the recommendations in the settings scope audit (PR #299,
`docs/research/2026-11-03-settings-scope-audit.md`). That audit's inventory and its backend findings still stand.
This document redoes the user-facing part: which settings a screen can change, where people find them, and how they
see what differs. Code facts were checked on `develop` at `d01fc4ee`.

## 1. What changed from the audit

| | Audit (PR #299) | This proposal |
|---|---|---|
| Where per-screen settings are edited | An **Editing** picker in the Settings top bar; every category follows it | **Screens**, which already has Default as a screen, per-row "Same as Default / Changed here" and counts. No picker |
| Household value of a per-screen setting | Edited in its old category with the picker on Default | **Screens › Default**, so the whole setting lives in one place |
| Theme, light/dark, font | Household | **Per screen**, as one **Look** group (owner leaning yes) |
| Show-controls corner, button-press labels, settings text size | Per screen, spread over Dashboard | Per screen, moved to Screens with the rest of their group |
| Clock bar sizes, Show seconds | Per screen now | Household until a screen needs its own; then they move as a group |
| Effects level | Row under Dashboard › Focus & remote, after the picker work | Row on Screens, **shipped first** (it doesn't need the picker) |
| Seeing what a screen changes | A `ScopeLine` under each row, in every category | Counts on the Screens list, plus a **Changed here** line at the top of each screen page that jumps to each row |

Why the picker loses:

- It is a mode. Every category's rows silently mean "Kitchen" or "Default" depending on a control at the top. People
  forget modes, and a wrong guess changes the wrong screen.
- It mixes two kinds of row in one list: rows that follow the picker and household rows that don't.
- The audit itself estimates 7–10 days, mostly for the picker and re-targeting.
- Screens already has the model, and the owner agreed it on 2026-10-30
  ([default-screen design](2026-10-30-default-screen.md)).

## 2. The rule

> **Dashboard and Content are what the home shows. Screens is how each screen shows it.**

1. **One home per setting.** A setting that a screen can change lives only in Screens. Its household value is on
   Screens › Default, and each screen's own value is on its own page. It does not also appear in Dashboard.
2. **Move whole groups.** A group of settings that work together moves together (theme with light/dark and font; the
   whole Controls section with the corner). Half a group in each place is how people end up with a dark-only bedroom
   whose dark hours come from the household.
3. **Every per-screen row says where its value comes from.** **Same as Default**, or **Changed here · Reset to
   default**. These are the existing words; don't add new ones.
4. **Leave a signpost where people used to look.** Where a group leaves Dashboard, one line stays in its place, with a
   link to it. Search finds the new row.
5. **Every setting is remote.** Any signed-in browser can edit any screen. The device you're holding is just one of the
   screens on the list.
6. **A setting becomes per screen only when a screen needs it.** Each one makes the screen page longer and adds one more
   possible reason why "the kitchen looks different". Clock bar sizes and Show seconds wait.

## 3. Findings (checked in code)

From the audit, still true:

- **F1. The Default page's Behaviour rows write the wrong scope.** `DefaultScreenSettings.vue` uses `useScreenSetting`
  for photo frame, loading light and layout (lines 516–528). On a plain browser that writes `localStorage`, and on a
  kiosk it writes that kiosk's override. Neither is the household value the page promises.
- **F2. Per-screen writes on a kiosk need admin.** `PUT /api/kiosks/{id}/overrides` is admin-only, so the dashboard's
  ⋯ **Hide controls** toggle fails on a kiosk without an admin session.
- **G1. `useScreenSetting` edits only the device you're on** (`getKioskId()`). `uiSize`, `showUI`,
  `clockBarShowInKiosk` and `tapAnywhereReveal` can't be changed for another screen. This is the bug the owner hit.

New:

- **H1. Dashboard already mixes per-screen and household rows in one section.** Under Dashboard › Controls, Hide
  controls, Keep the clock bar and Tap anywhere carry a `ScopeChip` and edit this device only. The corner rows right
  below them edit the household. The page doesn't say that the two kinds behave differently, and the per-screen rows
  can't reach any other screen.
- **H2. A per-screen theme would overwrite the household theme. Fix this first.** On a viewer, `useTheme.loadTheme()`
  reads the merged config, so a kiosk does get its own theme. But `watch(themeMode)` then calls `saveTheme()`. That
  posts `themeMode`, `selectedTheme`, `darkModeStart` and `darkModeEnd` to `POST /api/config`, which is the household
  config. Those keys are in `CONFIG_DISPLAY_KEYS`, so a kiosk can write them without admin. The first kiosk with its
  own dark mode would push dark to every screen when it loads. `useTheme` must stop writing on load, and per-screen
  theme rows must write that screen's overrides.
- **H3. A theme change reaches screens only when they reload.** `loadTheme()` runs once in `App.vue` `onMounted`.
  Nothing watches `configStore.selectedTheme` or `themeMode` afterwards. Other settings arrive on the next config poll
  (about 30 s since PR #297), and the theme should too, especially once it can be changed remotely.
- **H4. Font is local to each browser** (`useTypeTheme`, `localStorage` `calvin-type-theme`), and its row doesn't say
  so. It can't be set for a screen, and it isn't even the same across browsers.

## 4. Where every setting lives

### Stays in Dashboard: what the home shows

Dashboard's subtitle becomes **Pages · clock bar**.

| Section | Rows |
|---|---|
| Pages & regions | The page library, region view options, Lock layout |
| Clock | Show date, Show Calvin logo, Show seconds (for now) |
| Clock bar layout | Top or bottom layout, side layout, all sizes (for now) |
| Clock bar items | Which status tiles show |
| Remote buttons | Button bindings, Hide label after (it also times the focus light's fade) |
| *(signpost)* | "Look, focus light and controls are set per screen." **Open Screens** |

On a kiosk the signpost opens that screen's page, and elsewhere Screens › Default. It replaces the Appearance and
Controls sections and the per-screen half of Focus & remote. **Remote buttons** is what's left of Focus & remote,
renamed for what it now holds.

### Stays in Content, System, Security, Plugins: household

Unchanged from the audit. Photo rotation (`photoRotationInterval`) first stayed household (§2 rule 6); it has since
moved to Screens › Behaviour as **Show each photo for**, beside the per-screen photo frame, because a screen with its
own photo frame needs its own photo time (and the audit's 3B+ cost argument). Its choices are presets from 10 s to
1 hour instead of a 5 s stepper.
Installing and removing themes stays in Plugins. Only *choosing* a theme moves.

### Screens › Default and Screens › {screen}

Both pages use the same sections in the same order. Default has no Software section and no reset links, and its
default-only rows say **Applies to every screen**, as today.

| Section | Rows | Status |
|---|---|---|
| Name | Name | Built |
| Pages | Pages shown, Start page | Built |
| **Look** | Theme, Light or dark, Dark from / to, Font | **New.** From Dashboard › Appearance; needs H2, H3 and H4 fixed |
| Display | Orientation, Upside down, Rotate the screen output, **Dashboard size**, **Settings text size** | Sizes move in from Dashboard |
| **Effects & focus** | **Effects**, Focus light, Dim other regions, Show button presses, Label size | **New.** From Dashboard › Focus & remote |
| **Controls** | Hide controls, Keep the clock bar when hidden, Tap anywhere to show controls, Show-controls corner, Corner visibility, Corner size, Hold for | **New.** The whole Dashboard › Controls section |
| Touch & keyboard | Touchscreen, On-screen keyboard; on Default only: Keyboard layout, Also switch to | Built |
| Behaviour | Photo frame, Start after, Photos from, Loading light, Layout | Built; fix F1 on Default |
| Power | Screen on/off schedule, Turn off when idle, Reboot button combo (Default only); Screen now (screen only) | Built |
| Software | Kiosk software | Built (screen only) |

The order goes from the most-used, visible changes (Look, Display) to the rare ones (Power, Software).

### This browser

Unchanged in scope: Touchscreen, On-screen keyboard and Settings text size, stored in `localStorage` (a plain browser
has no id the server knows). **New per-screen settings get no `localStorage` layer**, so a plain browser follows
Default. The page says once at the top: "Only this browser. To change it from elsewhere, set it up as a screen."

## 5. How the Screens pages behave

- **Screens list.** As built: Default first, with "{n} screens have their own settings". Each screen card shows
  "{n} settings changed", and the This browser card shows "Same as Default" or "{n} settings just for this browser".
- **Changed here line.** At the top of a screen page with overrides: **Changed here: Theme, Focus light, Corner
  size**. Each name is a link that scrolls to its row and briefly highlights it. **Reset everything to default** stays
  in the footer. On Default, the matching line is **Screens with their own settings: Kitchen (3), Hallway (1)**, each
  name opening that screen.
- **Section jump.** With ten sections, the page gets a compact section index under the header (Look · Display ·
  Effects & focus · Controls · …). On a phone it's a select. These are the same anchors that deep links use.
- **Every per-screen row** shows `ScopeLine`. Writes go through `kioskOverridesQueue(screenId)`, which works from any
  browser for any screen.
- **Offline screens** are fully editable. The page header already says "Offline. It will apply the new display
  settings when it's back."; widen it to all settings.
- **Theme picker** shows a thumbnail of each theme in light and dark. When you change Kitchen from a desktop, the
  desktop doesn't change, so the thumbnail is the only preview. After a change the row says "Kitchen will switch on
  its next check (about 30 s)".
- **Editing Default when screens differ:** the existing note, "Kitchen keeps its own Theme · Change them too".
- **Use these as the default** and **Reset everything to default**, with their confirms, now cover the new sections
  too. Name and pages are still left alone.
- **Search** keywords on the moved rows include their old place ("appearance", "theme", "focus", "controls", "hot
  corner"), so a search from habit still lands on the row.
- **Old deep links** (`dashboard-ui`, `dashboard-kiosk`, `dashboard-kiosk-focus`) open the matching section: on a
  kiosk on its own screen page, elsewhere on Default. This is the same way `device-power` and `layout` were redirected
  in the default-screen work.
- **The dashboard's ⋯ Hide controls toggle** stays as a quick action on the screen you're at. It writes the same
  override as the Controls row (and needs F2 resolved to work without admin).

## 6. Effects level (calvin-uudb)

The audit's §4 design stands (values, `data-effects` on `<html>`, guard test, server-side Auto, `kmodel` later), with
two changes:

- **Where:** Screens › {screen} › Effects & focus › **Effects**, with the household value on Screens › Default. It
  describes what the device can afford.
- **When:** first, before the rest of this work. Screen pages already edit any screen remotely, so it needs none of the
  other changes.

The unmerged `focusLightStyle` (`feat/focus-light-style`) must not merge as a two-value **This screen** row. It edits
only the device you're on, which fails the remote requirement. "Performance" also doesn't say what the screen will
look like. Rename it to `effectsLevel`, with values **Auto · Full · Standard** (`performance` → `standard`; **Light**
comes later and adds without a migration). Auto, until `kmodel` exists: a kiosk on `cog` gets Standard, other kiosks
get Standard, a plain browser gets Full. The row shows what Auto picked: "Auto (Standard on this screen)".

## 7. Work, in order

Sizes: S ≈ half a day, M ≈ one to two days.

1. **Effects (S–M).** Rename `focusLightStyle` to `effectsLevel` and add the row on screen pages and Default, using the
   existing per-screen row pattern. Default writes the household value. Add the `data-effects` attribute and widen the
   guard test.
2. **Descriptor rows (M).** One descriptor per per-screen setting in `utils/screenOverrides.js` (key, label, section,
   control, whether it has a browser layer). Generalise `ScreenBehaviourRows` into one row component for both pages.
   This is the audit's G2, minus the picker.
3. **Fix F1 (S).** Default rows write the household config. Comes free with item 2.
4. **Controls and Effects & focus move (M).** Move the Dashboard rows to Screens and remove them from Dashboard. Add the
   signpost, search keywords and deep-link redirects. This closes G1 and H1.
5. **Theme fixes (M).** Fix H2: `useTheme` stops writing on load, and Look rows write to the screen's own settings.
   Fix H3: watch the config so a theme change applies on the next poll. Move font into the config (H4).
6. **Look moves (S).** The Look section on both pages, with theme thumbnails. Remove Appearance from Dashboard.
7. **Changed here line and section index (S).**
8. **Typed overrides (S).** Declare the per-screen keys in `ConfigUpdate` so a bad value is rejected with 400.
9. **F2 (S, after the owner decides).** An allowlist of keys a kiosk may write to its own overrides without admin.
   `showUI` first; never device-physical keys.
10. **Tests.** Each per-screen row writes the right target from any browser. Default writes the household config (F1
    regression). The theme doesn't leak to the household (H2 regression). The signpost and redirects work. The Changed
    here line lists exactly the overridden keys.

About 6–8 days in total. Item 1 is about a day and gives the 3B+ its speed-up on its own.

## 8. Owner decisions

1. **Screens is the one home for every setting a screen can change**, with the household value on Screens › Default.
   Dashboard keeps what the home shows, plus a signpost. No Editing picker.
2. **Themes per screen:** theme, light or dark with its hours, and font move together as Screens › Look. Screens
   follow Default, so a home with one look notices nothing. *Recommended, and the owner is leaning yes.*
3. **What moves now:** Look, Effects & focus, the whole Controls section (corner included), Dashboard size and
   Settings text size. **What waits:** clock bar sizes, Show seconds, photo rotation, console logging.
4. **Rename `focusLightStyle` to `effectsLevel`** (Auto · Full · Standard) before it merges, and ship it first.
5. **F2:** may a kiosk change a small list of its own settings without an admin sign-in (`showUI` first, so the ⋯
   toggle works)? *Recommended yes*, never for orientation, power or other device-physical settings.
