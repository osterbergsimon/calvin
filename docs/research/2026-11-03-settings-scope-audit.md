# Settings scope audit: household or per screen, and remote editing

> **Recommendations replaced** by [docs/design/2026-11-03-settings-scope.md](../design/2026-11-03-settings-scope.md) (#300). The inventory and backend findings below still stand.

**Date:** 2026-11-03
**Task:** calvin-m23u (feeds calvin-uudb, per-kiosk effects level)
**Status:** research and recommendation. No product code changed.

## Why

The owner runs kiosks that differ a lot in speed: a Pi 3B+ (cog/WPE, 1920×1080
touch), a Pi 400 and desktop browsers. Most settings apply to the whole
household, so one choice applies to every device. The owner wants a rich look
on fast screens and a cheap look on the 3B+. Today that cannot be expressed for
the focus light or dimming. On the 3B+ the focus light is about two thirds of
the cost of a region swap (1.45 core-s with it on, about 0.45 off). See also
[2026-11-02-kiosk-performance.md](2026-11-02-kiosk-performance.md).

**Scope addition from the owner (same day):** "All settings should be handlable
remote." Every setting, including per-kiosk and per-screen ones, must be
viewable and changeable from another device. For example: Settings on a
desktop, pick a kiosk, edit it. The owner hit this today. They could not set a
kiosk's per-screen value from the desktop, and Settings on the Pi asks for an
admin sign-in.

## TL;DR

- **The backend is already done.** `GET /api/kiosks/{id}/config` merges any key
  from a kiosk's overrides over the household config. Since PR #297 the ETag
  covers the whole body, so a kiosk picks up any changed key on its next poll.
  `PUT /api/kiosks/{id}/overrides` (admin) accepts any key. Making a setting per
  kiosk, and editing it remotely, needs **no backend work** beyond optional
  typing.
- **The gap is the Settings UI, in two parts.**
  1. *Per-kiosk rows are hand-written.* Only the Screens page's rows can edit
     another kiosk. Dashboard rows always write the household value.
  2. *Per-screen rows built on `useScreenSetting` can't be edited remotely.*
     They always target "the device I am on": that kiosk's override, or this
     browser's `localStorage`. `uiSize`, `showUI`, `clockBarShowInKiosk`,
     `tapAnywhereReveal` and the new `focusLightStyle` (branch
     `feat/focus-light-style`) can only be set by standing at the kiosk.
- **Recommendation: one "Editing" picker for all of Settings.** A target
  selector (**Default** / each screen / **This browser**) in the Settings top
  bar. Every per-kiosk row reads and writes the picked target. Each row shows
  the effective value and its source (**Same as Default** = household, **Changed
  here** = this kiosk) with **Reset to default**. It reuses
  `kioskOverridesQueue`, `ScopeLine`, `utils/screenOverrides.js` and the
  Screens pages. About 7–10 days of work.
- **What becomes per kiosk:** the device-look and device-fit settings (focus
  light, dimming, focus light style / effects level, dashboard size,
  show-controls corner, clock bar sizes, show seconds, photo rotation,
  button-press labels). Content, calendar rules, theme, security and the server
  stay household.
- **Effects level:** one per-kiosk key controls *how* effects draw (cost). The
  focus light, dimming and loading light keys keep controlling *whether* they
  show. `auto` resolves on the server from the kiosk agent's report: add the Pi
  model, and fall back to the display stack (`cog` → light). The unmerged
  `focusLightStyle` is a first cut of this; widen it before it merges.
- **Corrections and findings.** The loading light is **already per screen**
  (Screens › Behaviour). The Screens › Default page's Behaviour rows write *this
  device's* value, not the household default (F1). On a kiosk without an admin
  session, every per-screen write (including the dashboard ⋯ **Hide controls**
  toggle) goes to `PUT /api/kiosks/{id}/overrides`, which needs admin (F2).

## Words used here

- **Household:** one value in the global config, the same on every device.
- **Per kiosk with household default:** the global value is the default. A
  kiosk may store its own value in its overrides. The UI says **Same as
  Default** or **Changed here · Reset to default** (`ScopeLine`). This is the
  Screens page model today.
- **Per kiosk:** only meaningful for one kiosk (name, "Screen now").
- **Per screen:** per kiosk with household default, *and* a plain browser (not a
  set-up kiosk) keeps its own choice in `localStorage`. This is what
  `useScreenSetting` does.
- **Browser-local:** stored only in this browser's `localStorage`.

In the UI a kiosk is called a **screen**. "Screens › Default" edits the
household default for screen settings
([default-screen design](../design/2026-10-30-default-screen.md)).

**Remote today** in the tables:

- **Yes:** any signed-in browser can view and change it. For a per-kiosk value
  that means from Screens › {screen}.
- **Only on the device:** the row always targets the browser you are on. To
  change a kiosk's value you must open Settings on that kiosk (and sign in as
  admin there, F2). On a desktop the same row changes only the desktop.
- **No:** no Settings row can change it, or the row writes something other than
  what it says (F1).

## 1. Every user-facing setting

Checked in code: `frontend/src/stores/configRegistry.js`,
`backend/app/api/routes/config.py` (`ConfigUpdate`, `build_global_config`),
`backend/app/services/kiosk_registry.py`, `backend/app/security/route_policy.py`,
the Settings categories under `frontend/src/components/settings/`, and every
`useScreenSetting` caller. `focusLightStyle` is from the unmerged local branch
`feat/focus-light-style`.

"Default-only" means the Default page marks the row **Applies to every screen**
(`DefaultOnlyNote`).

### Content

| Setting (UI label · key) | Where | Current scope | Remote today | Recommended | Reason |
|---|---|---|---|---|---|
| Calendar sources (plugin instances) | Content › Calendars | Household | Yes | Household | The family's data. |
| Refresh every · `calendarRefreshInterval` | Content › Calendars | Household | Yes | Household | How fresh the data is, not how the screen looks. |
| Time format · `timeFormat` | Content › Calendar basics | Household | Yes | Household | A household convention. |
| Week starts on · `weekStartDay` | Content › Calendar basics | Household | Yes | Household | A household convention. |
| Weekend days · `weekendDays` | Content › Calendar basics | Household | Yes | Household | A household convention. |
| Highlight holidays · `showRedDays` | Content › Calendar basics | Household | Yes | Household | A household convention. |
| Show each photo for · `photoRotationInterval` | Content › Photos | Household | Yes | Per kiosk with household default | Each advance costs 0.74–0.96 s on the 3B+; a slow screen wants a longer interval. |
| Shuffle photos · `randomizeImages` | Content › Photos | Household | Yes | Household | A content choice. |
| Photo sources, web pages and apps, clock bar info (plugin instances) | Content | Household | Yes | Household | The household's sources. Which ones a screen shows is per page/region. |

### Dashboard

| Setting (UI label · key) | Where | Current scope | Remote today | Recommended | Reason |
|---|---|---|---|---|---|
| Pages and regions · `dashboardScreens` | Dashboard › Pages & regions | Household | Yes | Household | The page library. A screen picks pages with `availableScreens` (already per kiosk). |
| Region view options (photo fit, week numbers, events per day) · `dashboardScreens[].regions[].view` | Region inspector, on-calendar controls | Household (part of the page) | Yes | Household | They describe the page. A screen that needs different ones can show a different page. |
| Lock layout · `regionsLocked` | Dashboard ⋯ menu | Household | Yes | Household | An editing mode, not a look. |
| Theme · `selectedTheme` | Dashboard › Appearance | Household | Yes | Household (Q1) | The home's look. |
| Light or dark · `themeMode`; Dark from / to · `darkModeStart`, `darkModeEnd` | Dashboard › Appearance | Household | Yes | Household (Q1) | Same as theme. A bedroom screen is the one case for per kiosk. |
| Font · `calvin-type-theme` (localStorage) | Dashboard › Appearance | Browser-local, unlabelled | Only on the device | Household (Q7) | No other device can set a kiosk's font, and the row doesn't say it is local. |
| Settings text size · `uiSize` | Dashboard › Appearance, This browser | Per screen | Only on the device | Per screen | Reading distance differs per device. |
| Hide controls · `showUI` | Dashboard › Controls, dashboard ⋯ menu | Per screen (calvin-hi6w) | Only on the device | Per screen | A wall panel hides chrome, a desk browser doesn't. |
| Keep the clock bar when hidden · `clockBarShowInKiosk` | Dashboard › Controls | Per screen (calvin-hi6w) | Only on the device | Per screen | Same. |
| Tap anywhere to show controls · `tapAnywhereReveal` | Dashboard › Controls | Per screen (calvin-hi6w) | Only on the device | Per screen | Only touch screens need it. |
| Show-controls corner · `hotCornerPosition` | Dashboard › Controls | Household | Yes | Per kiosk with household default | Depends on how the screen is mounted and where hands reach. |
| Corner visibility · `hotCornerOpacity` | Dashboard › Controls | Household | Yes | Per kiosk with household default | Goes with the corner. |
| Corner size · `hotCornerSize` | Dashboard › Controls | Household | Yes | Per kiosk with household default | Pixels; depends on screen size and density. |
| Hold for · `hotCornerLongPressMs` | Dashboard › Controls | Household | Yes | Per kiosk with household default | Goes with the corner. |
| Focus light · `focusLightMode` | Dashboard › Focus & remote | Household | Yes | Per kiosk with household default | The main 3B+ cost. Whether it shows; *how* is the effects level (§4). |
| Focus light style · `focusLightStyle` (`performance` / `full`; branch `feat/focus-light-style`) | Dashboard › Focus & remote | Per screen | Only on the device | Per kiosk with household default, as the effects level (§4) | The cost choice itself. Must be settable from the desktop. |
| Dim other regions · `focusLightDimOthers` | Dashboard › Focus & remote | Household | Yes | Per kiosk with household default | Same as the focus light. |
| Dashboard size · `touchControlSize` | Dashboard › Focus & remote | Household | Yes | Per kiosk with household default (Q3) | Screen size and viewing distance differ per device. |
| Show button presses · `keyboardFeedbackEnabled` | Dashboard › Focus & remote | Household | Yes | Per kiosk with household default | Only useful on a screen with a remote. |
| Label size · `keyboardFeedbackMode` | Dashboard › Focus & remote | Household | Yes | Per kiosk with household default | Viewing distance. |
| Hide label after · `modeIndicatorTimeout` | Dashboard › Focus & remote | Household | Yes | Household (Q5) | A behaviour, not a cost. It also sets the focus light's idle fade. |
| Button bindings · `/api/keyboard/mappings` | Dashboard › Focus & remote | Household (own table) | Yes | Household (Q6) | One remote type in the house today. |
| Show date · `clockShowDate` | Dashboard › Clock | Household | Yes | Household | Content of the clock. |
| Show seconds · `clockShowSeconds` | Dashboard › Clock | Household | Yes | Per kiosk with household default (Q8) | Re-renders the clock every second; a 3B+ should be able to opt out alone. |
| Show Calvin logo · `clockBarShowLogo` | Dashboard › Clock | Household | Yes | Household | Branding. |
| Top or bottom bar layout · `clockBarLayout` | Dashboard › Clock bar layout | Household | Yes | Per kiosk with household default (Q2) | Fits the screen's width. |
| Side bar layout · `clockBarVerticalLayout` | Dashboard › Clock bar layout | Household | Yes | Per kiosk with household default (Q2) | Fits the screen's height. |
| Bar sizes: time, date, padding, plugin info · `clockBarFontSize`, `clockBarDateFontSize`, `clockBarPadding`, `clockBarPluginItemSize` and the `clockBarVertical*` twins | Dashboard › Clock bar layout | Household | Yes | Per kiosk with household default (Q2) | Pixel sizes depend on screen size and distance. |
| Clock bar items (which status tiles show) | Dashboard › Clock bar items | Household | Yes | Household | Which information the home shows. |

"Yes" for a household Dashboard row means the household value. None of the
rows marked "Per kiosk with household default" can be set for one kiosk today.

### Screens (Default and each screen)

These already follow the Default/override model.

| Setting (UI label · key) | Where | Current scope | Remote today | Recommended | Reason |
|---|---|---|---|---|---|
| Name · `displayName` | Screens › {screen} | Per kiosk | Yes | Per kiosk | Identity. |
| Pages shown · `availableScreens`; Start page · `defaultScreenId` | Screens › Pages | Per kiosk with household default | Yes | Keep | Already right. |
| Orientation · `orientation`; Upside down · `orientationFlipped`; Rotate the screen output · `applyDisplayRotation` | Screens › Display | Per kiosk with household default (device-physical) | Yes | Keep | Physical mounting. |
| Screen on/off schedule · `displayScheduleEnabled`, `displaySchedule` | Screens › Power | Per kiosk with household default (device-physical) | Yes | Keep | Room use differs. |
| Turn off when idle · `displayTimeoutEnabled`, `displayTimeout` | Screens › Power | Per kiosk with household default | Yes | Keep | Room use differs. |
| Screen now · `screenNow` | Screens › {screen} › Power | Per kiosk | Yes | Keep | A one-off for one screen. |
| Touchscreen · `touchControls` | Screens › Touch & keyboard, This browser | Per screen | Yes (kiosk); browser: only on the device | Keep | Hardware. |
| On-screen keyboard · `onScreenKeyboard` | Screens › Touch & keyboard, This browser | Per screen | Yes (kiosk); browser: only on the device | Keep | Hardware. |
| Keyboard layout · `oskLayout`; Also switch to · `oskExtraLayouts` | Screens › Default | Household, Default-only | Yes | Keep | Owner decision CLV-21: the keyboard itself can switch. |
| Timezone · `timezone` | Screens › Default | Household, Default-only | Yes | Keep | One home, one zone. The agent uses it for the schedule. |
| Reboot button combo · `rebootComboKey1`, `rebootComboKey2`, `rebootComboDuration` | Screens › Default › Power | Household, Default-only | Yes | Household (Q6) | One remote type today. |
| Photo frame · `photoFrameEnabled`; Start after · `photoFrameTimeout`; Photos from · `photoFrameSourceIds` | Screens › Behaviour | Per screen (calvin-3xz9) | Kiosk value: yes. Household default: no (F1) | Keep; fix F1 | Already right per kiosk. |
| Loading light · `loadingLight` | Screens › Behaviour | Per screen | Kiosk value: yes. Household default: no (F1) | Keep; fix F1 | Already per screen. The brief said household-only; that is out of date. |
| Layout · `layoutMode` | Screens › Behaviour | Per screen (calvin-tnkg) | Kiosk value: yes. Default: no (F1) | Keep; fix F1 | Already right per kiosk. |
| Kiosk software update · `_agentUpdateRequested` | Screens › {screen} › Software | Per kiosk (host-internal) | Yes | Keep | An action, not a setting. |

### This browser

| Setting | Current scope | Remote today | Recommended | Reason |
|---|---|---|---|---|
| Touchscreen, On-screen keyboard, Settings text size (plus focus light style on the branch) for a plain browser | Browser-local | Only on the device | Keep (Q11) | A plain browser has no id the server knows, so nothing can address it. Make it a screen to edit it remotely. |

### System, Security, Plugins, Backup

| Setting (UI label · key) | Where | Current scope | Remote today | Recommended | Reason |
|---|---|---|---|---|---|
| Release channel, Update source · `gitRepoUrl`, `gitBranch` | System › Updates | Household (server) | Yes | Household | The server updates itself. |
| Automatic backups, Back up every, Keep the last, Include … | System › Backup | Household (server) | Yes | Household | Server data. |
| Console logging · `consoleLogEnabled`; Log level · `consoleLogLevel` | System › Advanced | Household | Yes | Per kiosk with household default (Q10) | Debug one screen (the 3B+) without noise on the rest. |
| Check for setting changes every · `configPollInterval` | System › Advanced | Household | Yes | Household | Polls are cheap 304s since PR #297. |
| Reload this screen, Restart this screen | System › Restart | Action on the device you hold | Only on the device | Add per-screen remote actions later (out of scope) | Actions, not settings. |
| This server's screen (Turn off / on) | System › Restart | Action on the server | Yes | — | Not a setting. |
| Admin password, API keys, Allowed sites, Sealed mode | Security | Household | Yes | Household | Security is the home's, never a device's. |
| Plugin catalog · `pluginCatalogRepo`, `pluginRepositoryUrl`; plugin instances | Plugins | Household | Yes | Household | Server-side. |
| Developer mode · `devMode` | (no Settings row; read by Plugins) | Household | No (API only) | Household | Server-side. |

### Keys with no Settings row that still change a kiosk

| Key | Current scope | Remote today | Note |
|---|---|---|---|
| `displayBrightness`, `displayOutput`, `displayResolution` | Reserved in `DEVICE_PHYSICAL_KEYS` | No (API only) | Per kiosk with household default when they land. Already bump `deviceConfigVersion`. |
| `clockBarMode`, `clockBarPosition`, `clockBarShowPluginItems` | Household | No (API only) | Read by the dashboard. Likely legacy; treat like the clock bar layout if revived. |
| `showWeekNumbers`, `maxVisibleEvents`, `imageDisplayMode` | Household | No (API only) | Superseded by region `view` options. Candidates for removal. |
| `calendarSplit`, `lastSideViewMode`, `dashboardLayout` | Household | No (API only) | Legacy inputs to `dashboardScreens`. |
| `deviceConfigVersion`, `agentAvailableVersion`, `agentUpdateRequested` | Computed per kiosk | — | Not settings. |

## 2. Needs the owner's call

Each with a recommendation.

1. **Theme and light/dark per screen?** A bedroom screen might want dark all
   day. *Recommend:* household for now. It is cheap to make per kiosk later
   with the same rows (§3).
2. **Clock bar sizes per kiosk?** *Recommend:* yes, per kiosk with household
   default.
3. **Dashboard size (`touchControlSize`) per kiosk?** *Recommend:* yes.
4. **Photo rotation per kiosk, or part of the effects level?** *Recommend:* a
   separate per-kiosk key. The effects level changes how things draw, not
   timing.
5. **Hide label after (`modeIndicatorTimeout`).** It also times the focus
   light. *Recommend:* household.
6. **Button bindings and reboot combo per kiosk?** Only matters with different
   remotes. *Recommend:* household until a second remote type exists.
7. **Font.** Local to each browser today. *Recommend:* a household setting in
   the config, so it is remote like the theme.
8. **Show seconds.** *Recommend:* per kiosk with household default. Don't fold
   it into the effects level.
9. **Where does remote editing live?** Option A: one **Editing** picker in the
   Settings top bar; every per-kiosk row in every category follows it. Option
   B: put every per-kiosk row on Screens › {screen} only. *Recommend:* A, with
   the Screens list as the way in (tapping a screen sets the picker). The owner
   thinks of "Dashboard settings for the kitchen screen"; B would split
   Dashboard across two places.
10. **Console logging per kiosk?** *Recommend:* yes, low priority.
11. **Plain browsers.** A phone or laptop that isn't a set-up screen has no id
    the server knows. Its own choices (touch, keyboard, text size) stay in its
    `localStorage` and can't be edited remotely. *Recommend:* keep that, and
    say so in the picker ("This browser"). Anyone who wants it remote can add
    the browser as a screen. New per-kiosk keys should not get a
    `localStorage` layer at all: a plain browser follows Default.
12. **Writing on the kiosk without admin (F2).** Today any per-screen change
    made on the kiosk itself needs an admin session there, including the
    dashboard ⋯ **Hide controls** toggle. *Recommend:* remote editing from a
    signed-in desktop is the main answer. Separately, decide whether a kiosk may
    write a small allowlist of its own override keys without admin (`showUI`
    for the ⋯ toggle, like `CONFIG_DISPLAY_KEYS` does for the household
    config). Never device-physical keys.
13. **`focusLightStyle` before it merges.** *Recommend:* widen it into the
    effects level now (§4), while no stored values exist. Otherwise ship it as
    is, but on the remote path (§3), and migrate later.

## 3. The plumbing gap, with remote editing first-class

### What already works

- **Backend merge.** `merge_overrides` replaces any top-level key and both its
  spellings (`kiosk_registry.py`).
- **Remote write API.** `PUT /api/kiosks/{id}/overrides` replaces a kiosk's
  override layer. It is admin-only (it is not in `PUBLIC_WRITES` in
  `security/route_policy.py`), accepts any key (`ConfigUpdate` has
  `extra="allow"`) and caps size at 64 kB. `GET /api/kiosks` lists every kiosk
  with its overrides (`public_overrides` strips host-internal keys).
- **Delivery.** The kiosk browser loads `/api/kiosks/{id}/config`.
  `applyConfigPayload` applies every key in `CONFIG_FIELD_DEFINITIONS`. Since
  PR #297 a change to any key reaches the kiosk on its next poll (about 30 s).
  A component that reads `configStore.focusLightMode` already sees the kiosk's
  own value.
- **Display agent.** Only `DEVICE_PHYSICAL_KEYS` bump `deviceConfigVersion`.
  Look-and-feel keys don't involve the agent.
- **Remote editing pattern (Screens page).** Screens › {screen} edits one
  kiosk's overrides through `kioskOverridesQueue(kioskId)`: optimistic, one
  queue per kiosk, so two rows never clobber each other, flushed on
  navigation. Each row shows `ScopeLine`: **Same as Default** or **Changed here
  · Reset to default**. The page footer has **Reset everything to default** and
  **Use these as the default**. `ScreenBehaviourRows.vue` is the cleanest
  example: values plus an `overridden` map in, `set(key, value)` and
  `reset(key)` out. Both the Default page and a screen page render it.
- **Default-side helpers.** `utils/screenOverrides.js` has
  `SCREEN_SETTING_LABELS`, `DEFAULT_COPYABLE_KEYS`, `screensOverriding`,
  `changedSettingCount`, and `DefaultEditNote` shows "Hallway keeps its own …
  · Change them too".
- **"This screen" pattern.** `useScreenSetting(key)` edits the device you are
  holding: a kiosk's override (via the same queue), or `localStorage` on a
  browser.

### What is missing

- **G1. `useScreenSetting` has no target.** It takes its kiosk from
  `getKioskId()`, the device it runs on. So `uiSize`, `showUI`,
  `clockBarShowInKiosk`, `tapAnywhereReveal` and `focusLightStyle` can't be
  edited for another kiosk, and none of them has a row on Screens › {screen}.
  This is the bug the owner hit.
- **G2. No generic per-kiosk row.** `ScreensSettings.vue` hand-writes an
  `xOverridden` computed, an effective-value computed and a `persistX` function
  per key. Adding the Dashboard keys this way would add hundreds of lines.
- **G3. Dashboard rows don't know about overrides.** They are bound to the
  household form (`props.config`) and write with `POST /api/config`. Opened on a
  kiosk that overrides a key, a row shows the household value while the screen
  does something else, and nothing says which value is in force.
- **G4. Finding F1: Default page Behaviour rows write the wrong scope.**
  `DefaultScreenSettings.vue` uses `useScreenSetting` for photo frame, loading
  light and layout. On a plain browser that writes `localStorage`; on a kiosk it
  writes that kiosk's override. Neither is the household default the page
  promises. The household `loadingLight` can only be set through the API.
- **G5. Finding F2: per-screen writes on a kiosk need admin.** `useScreenSetting`
  and the ⋯ **Hide controls** toggle (`config.toggleUI` → `writeScreenSetting`)
  call `PUT /api/kiosks/{id}/overrides`. Without an admin session on the kiosk
  that fails, and the user sees "Couldn't save". That is why Settings on the Pi
  asks for a sign-in.
- **G6. Typing.** `ConfigUpdate` doesn't declare `focusLightMode`,
  `focusLightDimOthers`, `loadingLight`, `focusLightStyle`, `hotCorner*`,
  `touchControlSize` and others. A bad override value is stored as-is.
- **G7. Font is browser-local** (`useTypeTheme`, `calvin-type-theme`).

### Recommended design: an Editing picker

- **Picker.** The Settings top bar gets **Editing: Default ▾**. Options:
  **Default** (household), each screen by name with its online dot, and **This
  browser** on a browser that isn't a screen. Default selection: on a kiosk,
  that kiosk; elsewhere, Default. Tapping a screen card on the Screens list sets
  the picker and opens Screens › {screen}, so the Screens pages stay the way in.
- **State.** A small Pinia store (or a field on `kiosks`), for example
  `settingsTarget` = `{ kind: "default" } | { kind: "kiosk", id } | { kind:
  "browser" }`. Not persisted beyond the session.
- **Rows.** Every row for a per-kiosk key renders through one component driven
  by a descriptor (key, label, control, options). With a kiosk target it shows
  the effective value (that kiosk's override if present, else the household
  value), a `ScopeLine` (**Same as Default** = household, **Changed here** =
  this kiosk) and **Reset to default**. Writes go to
  `kioskOverridesQueue(target.id)`. With the Default target it writes the
  household config and shows `DefaultEditNote` when screens override the key.
  With This browser it uses `localStorage`, as now.
- **Household-only rows** stay editable under any target. When a kiosk is
  picked they carry the existing **Applies to every screen** line
  (`DefaultOnlyNote`), so it is clear the change is not just for that kiosk.
- **Effective value on the kiosk itself.** Same rows, target = this kiosk. The
  value comes from the merged `configStore[key]`; the source from that kiosk's
  overrides in the kiosks store. `DefaultScreenSettings.screenServerValue`
  already does the value half.
- **Words** stay those of the default-screen design (§7): **Default**, **Same
  as Default**, **Changed here**, **Reset to default**. "Household" stays a
  developer word.

### Work items (rough)

Sizes: S ≈ half a day, M ≈ one to two days.

1. **Per-kiosk key descriptors (S).** Extend `utils/screenOverrides.js` with a
   descriptor per key: key, label, section, control, options, and whether it
   has a `localStorage` layer. Derive `SCREEN_SETTING_LABELS` and
   `DEFAULT_COPYABLE_KEYS` from it. This is the one place that says "this key
   is per kiosk with household default".
2. **Target-aware `useScreenSetting` (M).** Add a target argument (default: the
   current device, so existing callers don't change). For a kiosk target, read
   the kiosk's overrides from the kiosks store plus the household value, and
   write through `kioskOverridesQueue(target.id)`. Return the source alongside
   `value`, `set`, `reset`.
3. **Editing picker and target store (M).** Top bar control, Screens list hook,
   default selection rules, an offline note ("Applies when Kitchen is back").
4. **Generic row component (M).** Generalise `ScreenBehaviourRows.vue` into a
   descriptor-driven row with `ScopeLine`. Move the hand-written Screens rows
   over when touched, not all at once.
5. **Move the `useScreenSetting` rows to the target (S).** `uiSize`, `showUI`,
   `clockBarShowInKiosk`, `tapAnywhereReveal`, `focusLightStyle`, touch,
   keyboard, photo frame, loading light, layout. This closes G1 and fixes F1:
   the Default target writes the household config.
6. **Make the recommended Dashboard and Content keys per kiosk (M).** Focus
   light, dim others, effects level, dashboard size, corner (4 keys), button
   press labels, show seconds, clock bar layout and sizes, photo rotation,
   console logging. Each is one descriptor plus switching the row to the
   generic component.
7. **Typed overrides (S).** Add the per-kiosk keys to `ConfigUpdate` with enums
   or ranges, so a bad PUT gets a 400.
8. **Font into the config (S).** Household key, read by `useTypeTheme`, keeping
   `localStorage` only as a first-paint cache.
9. **F2 decision (S, after Q12).** If the owner agrees, a viewer-writable
   allowlist of override keys for the kiosk's own id (`showUI` first), checked
   in the route like `CONFIG_DISPLAY_KEYS`.
10. **No data migration.** The household value stays the fallback, so every
    kiosk starts as **Same as Default**. Existing `localStorage` choices on
    plain browsers stay where they are.
11. **Tests (M).** Vitest: the picker drives the rows; a kiosk target writes
    that kiosk's overrides and shows Same as Default / Changed here / Reset;
    the Default target writes global (F1 regression); household-only rows show
    the note. Backend: overrides for the new keys merge and type-check.

Total: about 7–10 days, most of it in items 2–6.

## 4. Per-kiosk effects level (calvin-uudb)

### Shape

One per-kiosk key with household default. Call it **`effectsLevel`**. The
branch `feat/focus-light-style` already adds `focusLightStyle` =
`performance | full` (per screen, through `useScreenSetting`). That is the
focus-light half of this key. While it is unmerged, widen it to the values
below (`performance` → `standard`) so there is one key, not two (Q13).

| Value | Focus light (when shown) | Dim other regions (when on) | Photo backdrop | Loading light `comet` | Decorative motion |
|---|---|---|---|---|---|
| `full` | Old multi-layer glow | `saturate()`/`brightness()` filter | Real blur | Comet | On |
| `standard` | Today's 2 px ring and one halo | Today's opacity wash | Today's soft upscaled 640 px copy, no blur | Comet | On |
| `light` | Border colour only, no shadow, no lift | Opacity only | Solid scrim | Draws as Pulse | Off |
| `auto` (default) | Resolves to one of the above per device | | | | |

Rules:

- **Split *whether* from *how*.** `focusLightMode`, `focusLightDimOthers` and
  `loadingLight` keep deciding whether something shows. `effectsLevel` only
  decides how it is drawn. No precedence puzzle between a preset and the
  individual keys. Off is still off at every level.
- **Apply it as an attribute.** Set `data-effects="full|standard|light"` on
  `<html>`, like `useLayoutOverride` sets the layout classes. CSS gates the
  costly rules, for example `[data-effects="full"] .focus-panel.is-focused`.
- **Keep the guard test.** `noExpensiveFilters.spec.js` bans blur and filters
  everywhere today. Allow them only under a `[data-effects="full"]` selector, so
  a cheap screen can never get them by accident.
- `prefers-reduced-motion` still wins over `full` for motion.
- **Remote first.** The row is one of the per-kiosk descriptors (§3 item 6), so
  the owner sets the 3B+ to Light from the desktop. It reads **Effects: Auto
  (Light, Pi 3B+)** when Auto resolved, so the source is visible.

### Should Auto pick by device class?

Yes. Most owners will never set it, and the 3B+ is the device that suffers.

Signals, best first:

1. **Pi model from the kiosk agent (best; small new work).** The agent already
   reports `khost`, `kagent` and `kstack` on its config poll. Add `kmodel` from
   `/proc/device-tree/model` (for example "Raspberry Pi 3 Model B Plus") and
   store it in `KioskDB` next to `display_stack`. Pi 3 and older → `light`,
   Pi 4/400 → `standard`, Pi 5 → `full`.
2. **Display stack (works today).** `display_stack` is already stored. `cog` is
   in practice the 3B+ path, so `cog` → `light`; `x11`/`wayland` → `standard`.
   Use it when the model is unknown (older agent).
3. **No kiosk id (works today).** A plain browser is a phone or a desktop:
   `full`, with `prefers-reduced-motion` respected.
4. **Viewport: don't use.** The 3B+ and a desktop both report 1920×1080. Size
   says nothing about speed.
5. **Browser hints: don't use.** `navigator.hardwareConcurrency` is 4 on both a
   3B+ and a Pi 400. Measuring frame times at runtime is noisy and makes the
   look change on its own.

Resolve `auto` **on the server** in `GET /api/kiosks/{id}/config`, as a
computed field such as `effectsLevelResolved`, the same way
`deviceConfigVersion` is added. The server has the agent's report; the browser
does not. Because it is on the server, the desktop's Settings can show the
resolved value for any kiosk (`GET /api/kiosks` would carry the model and the
resolved level too). A plain browser resolves `auto` itself (no kiosk id →
`full`). An explicit value always wins over Auto.

### Order of work

1. Remote plumbing: §3 items 1–5 (target, picker, generic row).
2. `effectsLevel` with explicit values (widened from `focusLightStyle`), gated
   CSS, spec change.
3. `kmodel` in the agent and registry, then Auto.

calvin-uudb also says to wait for the swap root cause (calvin-fufd). PR #297
landed that fix, so this is unblocked from that side.

## Open questions

The items in §2. The structural ones are Q9 (one Editing picker for all of
Settings), Q12 (kiosk writes without admin) and Q13 (widen `focusLightStyle`
before it merges). §3 and §4 assume the recommended answers.
