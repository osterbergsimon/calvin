# Settings scope audit: household or per screen?

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

## TL;DR

- **The backend is already done.** `GET /api/kiosks/{id}/config` merges any key
  from a kiosk's overrides over the household config, and since PR #297 the
  ETag covers the whole body, so a kiosk browser picks up any changed key on its
  next poll. A kiosk's config store applies every merged key. Making a setting
  per kiosk needs **no backend work** beyond optional typing.
- **The gap is the Settings UI.** There is no generic way to set a key per
  screen. Each per-screen row on the Screens page is hand-written. Dashboard
  rows always write the household value, and on a kiosk they show the household
  value even when that kiosk overrides it.
- **Recommendation:** move the device-look and device-fit settings (focus light,
  dimming, dashboard size, show-controls corner, clock bar sizes, photo
  rotation, button-press labels, and a new effects level) to **per kiosk with a
  household default**. Set them on **Screens › Default** and **Screens ›
  {screen}**, the same way as orientation and the loading light. Content,
  calendar rules, theme, security and the server stay household.
- **Effects level:** one new per-kiosk key, `effectsLevel` = `auto | full |
  standard | light`. It controls *how* effects draw (cost). The existing focus
  light, dimming and loading light keys keep controlling *whether* they show.
  `auto` resolves on the server from the kiosk agent's report: add the Pi model
  to the report, and fall back to the display stack (`cog` → light).
- **Two corrections to the brief.** The loading light is **already per screen**
  (Screens › Behaviour, override key `loadingLight`). And the Screens › Default
  page's Behaviour rows write *this device's* value, not the household default
  (see finding F1).

## Words used here

- **Household:** one value in the global config, the same on every device.
- **Per kiosk with household default:** the global value is the default. A
  kiosk may store its own value in its overrides. The UI says **Same as
  Default** or **Changed here · Reset to default** (`ScopeLine`). This is the
  model of the Screens page today.
- **Per kiosk:** only meaningful for one kiosk (name, "Screen now"). No useful
  household value.
- **Per screen:** per kiosk with household default, *and* a plain browser (not a
  set-up kiosk) keeps its own choice in `localStorage`. This is what
  `useScreenSetting` does (calvin-hi6w controls, touch, keyboard, text size,
  layout, photo frame, loading light).
- **Browser-local:** stored only in this browser's `localStorage`. A kiosk
  cannot be set remotely.

In the UI a kiosk is called a **screen**. "Screens › Default" is the page that
edits the household default for screen settings
([default-screen design](../design/2026-10-30-default-screen.md)).

## 1. Every user-facing setting

Current scope was checked in code: `frontend/src/stores/configRegistry.js`,
`backend/app/api/routes/config.py` (`ConfigUpdate`, `build_global_config`),
`backend/app/services/kiosk_registry.py`, the Settings categories under
`frontend/src/components/settings/`, and `useScreenSetting` callers.

"Default-only" means the Default page marks the row **Applies to every screen**
(`DefaultOnlyNote`).

### Content

| Setting (UI label · key) | Where | Current scope | Recommended | Reason |
|---|---|---|---|---|
| Calendar sources (plugin instances) | Content › Calendars | Household | Household | The family's data. |
| Refresh every · `calendarRefreshInterval` | Content › Calendars | Household | Household | How fresh the data is, not how the screen looks. |
| Time format · `timeFormat` | Content › Calendar basics | Household | Household | A household convention. |
| Week starts on · `weekStartDay` | Content › Calendar basics | Household | Household | A household convention. |
| Weekend days · `weekendDays` | Content › Calendar basics | Household | Household | A household convention. |
| Highlight holidays · `showRedDays` | Content › Calendar basics | Household | Household | A household convention. |
| Show each photo for · `photoRotationInterval` | Content › Photos | Household | Per kiosk with household default | Each advance costs 0.74–0.96 s on the 3B+; a slow screen wants a longer interval. |
| Shuffle photos · `randomizeImages` | Content › Photos | Household | Household | A content choice. |
| Photo sources, web pages and apps, clock bar info (plugin instances) | Content | Household | Household | The household's sources. Which ones a screen shows is per page/region. |

### Dashboard

| Setting (UI label · key) | Where | Current scope | Recommended | Reason |
|---|---|---|---|---|
| Pages and regions · `dashboardScreens` | Dashboard › Pages & regions | Household | Household | The page library. A screen picks pages with `availableScreens` (already per kiosk). |
| Region view options (photo fit, week numbers, events per day) · `dashboardScreens[].regions[].view` | Region inspector, on-calendar controls | Household (part of the page) | Household | They describe the page. A screen that needs different ones can show a different page. |
| Lock layout · `regionsLocked` | Dashboard ⋯ menu | Household | Household | An editing mode, not a look. |
| Theme · `selectedTheme` | Dashboard › Appearance | Household | Household (owner's call, Q1) | The home's look. |
| Light or dark · `themeMode`; Dark from / to · `darkModeStart`, `darkModeEnd` | Dashboard › Appearance | Household | Household (owner's call, Q1) | Same as theme. A bedroom screen is the one case for per kiosk. |
| Font · `calvin-type-theme` (localStorage) | Dashboard › Appearance | Browser-local, unlabelled | Household (Q7) | Today a kiosk can't be set from elsewhere, and the row does not say it is local. |
| Settings text size · `uiSize` | Dashboard › Appearance, This browser | Per screen | Per screen | Reading distance differs per device. Add it to the Screens page (G4). |
| Hide controls · `showUI` | Dashboard › Controls | Per screen (calvin-hi6w) | Per screen | A wall panel hides chrome, a desk browser doesn't. Add it to the Screens page (G4). |
| Keep the clock bar when hidden · `clockBarShowInKiosk` | Dashboard › Controls | Per screen (calvin-hi6w) | Per screen | Same. Add it to the Screens page (G4). |
| Tap anywhere to show controls · `tapAnywhereReveal` | Dashboard › Controls | Per screen (calvin-hi6w) | Per screen | Only touch screens need it. Add it to the Screens page (G4). |
| Show-controls corner · `hotCornerPosition` | Dashboard › Controls | Household | Per kiosk with household default | Depends on how the screen is mounted and where hands reach. |
| Corner visibility · `hotCornerOpacity` | Dashboard › Controls | Household | Per kiosk with household default | Goes with the corner. |
| Corner size · `hotCornerSize` | Dashboard › Controls | Household | Per kiosk with household default | Pixels; depends on screen size and density. |
| Hold for · `hotCornerLongPressMs` | Dashboard › Controls | Household | Per kiosk with household default | Goes with the corner; a slow screen may want a longer hold. |
| Focus light · `focusLightMode` | Dashboard › Focus & remote | Household | Per kiosk with household default | The main 3B+ cost. Whether it shows; *how* is the effects level (§4). |
| Dim other regions · `focusLightDimOthers` | Dashboard › Focus & remote | Household | Per kiosk with household default | Same as the focus light. |
| Dashboard size · `touchControlSize` | Dashboard › Focus & remote | Household | Per kiosk with household default | Screen size and viewing distance differ per device. |
| Show button presses · `keyboardFeedbackEnabled` | Dashboard › Focus & remote | Household | Per kiosk with household default | Only useful on a screen with a remote. |
| Label size · `keyboardFeedbackMode` | Dashboard › Focus & remote | Household | Per kiosk with household default | Viewing distance. |
| Hide label after · `modeIndicatorTimeout` | Dashboard › Focus & remote | Household | Household (Q5) | A behaviour, not a cost. Note it also sets the focus light's idle fade. |
| Button bindings · `/api/keyboard/mappings` | Dashboard › Focus & remote | Household (own table) | Household (Q6) | One remote type in the house today. |
| Show date · `clockShowDate` | Dashboard › Clock | Household | Household | Content of the clock. |
| Show seconds · `clockShowSeconds` | Dashboard › Clock | Household | Per kiosk with household default (Q8) | Re-renders the clock every second; a 3B+ should be able to opt out alone. |
| Show Calvin logo · `clockBarShowLogo` | Dashboard › Clock | Household | Household | Branding. |
| Top or bottom bar layout · `clockBarLayout` | Dashboard › Clock bar layout | Household | Per kiosk with household default | Fits the screen's width. |
| Side bar layout · `clockBarVerticalLayout` | Dashboard › Clock bar layout | Household | Per kiosk with household default | Fits the screen's height. |
| Bar sizes: time, date, padding, plugin info · `clockBarFontSize`, `clockBarDateFontSize`, `clockBarPadding`, `clockBarPluginItemSize` and the `clockBarVertical*` twins | Dashboard › Clock bar layout (`ClockBarSizePicker`) | Household | Per kiosk with household default | Pixel sizes depend on screen size and distance. |
| Clock bar items (which status tiles show) | Dashboard › Clock bar items | Household | Household | Which information the home shows. |

### Screens (Default and each screen)

These already follow the Default/override model.

| Setting (UI label · key) | Where | Current scope | Recommended | Reason |
|---|---|---|---|---|
| Name · `displayName` | Screens › {screen} | Per kiosk | Per kiosk | Identity. |
| Pages shown · `availableScreens`; Start page · `defaultScreenId` | Screens › Default / {screen} › Pages | Per kiosk with household default | Keep | Already right. |
| Orientation · `orientation`; Upside down · `orientationFlipped`; Rotate the screen output · `applyDisplayRotation` | Screens › Display | Per kiosk with household default (device-physical) | Keep | Physical mounting. |
| Screen on/off schedule · `displayScheduleEnabled`, `displaySchedule` | Screens › Power | Per kiosk with household default (device-physical) | Keep | Room use differs. |
| Turn off when idle · `displayTimeoutEnabled`, `displayTimeout` | Screens › Power | Per kiosk with household default | Keep | Room use differs. |
| Screen now · `screenNow` | Screens › {screen} › Power | Per kiosk | Keep | A one-off for one screen. |
| Touchscreen · `touchControls` | Screens › Touch & keyboard, This browser | Per screen | Keep | Hardware. |
| On-screen keyboard · `onScreenKeyboard` | Screens › Touch & keyboard, This browser | Per screen | Keep | Hardware. |
| Keyboard layout · `oskLayout`; Also switch to · `oskExtraLayouts` | Screens › Default | Household, Default-only | Keep | Owner decision CLV-21: the keyboard itself can switch. |
| Timezone · `timezone` | Screens › Default | Household, Default-only | Keep | One home, one zone. The agent uses it for the schedule. |
| Reboot button combo · `rebootComboKey1`, `rebootComboKey2`, `rebootComboDuration` | Screens › Default › Power | Household, Default-only | Household (Q6) | One remote type today. |
| Photo frame · `photoFrameEnabled`; Start after · `photoFrameTimeout`; Photos from · `photoFrameSourceIds` | Screens › Behaviour | Per screen (calvin-3xz9) | Keep | Already right. |
| Loading light · `loadingLight` | Screens › Behaviour | Per screen | Keep | Already per screen. The brief said household-only; that is out of date. |
| Layout · `layoutMode` | Screens › Behaviour | Per screen (calvin-tnkg) | Keep | Already right. |
| Kiosk software update · `_agentUpdateRequested` | Screens › {screen} › Software | Per kiosk (host-internal) | Keep | An action, not a setting. |

### This browser

| Setting | Current scope | Recommended | Reason |
|---|---|---|---|
| Touchscreen, On-screen keyboard, Settings text size | Per screen (localStorage on a browser) | Keep | Same keys as above, edited for the browser you hold. |

### System, Security, Plugins, Backup

| Setting (UI label · key) | Where | Current scope | Recommended | Reason |
|---|---|---|---|---|
| Release channel, Update source · `gitRepoUrl`, `gitBranch` | System › Updates | Household (server) | Household | The server updates itself. |
| Automatic backups, Back up every, Keep the last, Include … | System › Backup | Household (server) | Household | Server data. |
| Console logging · `consoleLogEnabled`; Log level · `consoleLogLevel` | System › Advanced | Household | Per kiosk with household default (Q10) | Lets you debug one screen (the 3B+) without noise on the rest. |
| Check for setting changes every · `configPollInterval` | System › Advanced | Household | Household | Polls are cheap 304s since PR #297. |
| This server's screen (Turn off / on) | System › Restart | Action on the server | — | Not a setting. |
| Admin password, API keys, Allowed sites, Sealed mode | Security | Household | Household | Security is the home's, never a device's. |
| Plugin catalog · `pluginCatalogRepo`, `pluginRepositoryUrl`; plugin instances | Plugins | Household | Household | Server-side. |
| Developer mode · `devMode` | (no Settings row; read by Plugins) | Household | Household | Server-side. |

### Keys with no Settings row that still change a kiosk

| Key | Current scope | Note |
|---|---|---|
| `displayBrightness`, `displayOutput`, `displayResolution` | Reserved in `DEVICE_PHYSICAL_KEYS`, no UI | Per kiosk with household default when they land. Already bump `deviceConfigVersion`. |
| `clockBarMode`, `clockBarPosition`, `clockBarShowPluginItems` | Household, no row found | Read by the dashboard. Likely legacy; treat like the clock bar layout if revived. |
| `showWeekNumbers`, `maxVisibleEvents`, `imageDisplayMode` | Household, no row | Superseded by region `view` options. Candidates for removal. |
| `calendarSplit`, `lastSideViewMode`, `dashboardLayout` | Household | Legacy inputs to `dashboardScreens`. |
| `deviceConfigVersion`, `agentAvailableVersion`, `agentUpdateRequested` | Computed per kiosk | Not settings. |

## 2. Needs the owner's call

Each with a recommendation.

1. **Theme and light/dark per screen?** A bedroom screen might want dark all
   day. *Recommend:* household for now. It is cheap to make per kiosk later with
   the same rows (§3).
2. **Clock bar sizes per kiosk?** The 3B+ panel and a desktop differ. *Recommend:*
   per kiosk with household default.
3. **Dashboard size (`touchControlSize`) per kiosk?** *Recommend:* yes, per kiosk
   with household default.
4. **Photo rotation per kiosk, or part of the effects level?** *Recommend:* a
   separate per-kiosk key. The effects level should change how things draw, not
   timing.
5. **Hide label after (`modeIndicatorTimeout`).** It also times the focus light.
   *Recommend:* household.
6. **Button bindings and reboot combo per kiosk?** Only matters with different
   remotes. *Recommend:* household until a second remote type exists.
7. **Font.** Today it is local to each browser and the row does not say so.
   *Recommend:* make it a household setting.
8. **Show seconds.** *Recommend:* per kiosk with household default. Do not fold
   it into the effects level.
9. **Where do per-kiosk rows live?** Option A: move them to Screens › Default
   and Screens › {screen}, and leave Dashboard with household rows plus a
   pointer. Option B: keep them in Dashboard with a "This screen" picker.
   *Recommend:* A. It is the pattern the Behaviour rows already followed
   (photo frame, loading light, layout moved from Dashboard to Screens), and
   the Default page already has the "keeps its own" note and "Use these as the
   default".
10. **Console logging per kiosk?** *Recommend:* yes, low priority.
11. **Should new per-kiosk keys also be per browser (`localStorage`)?**
    *Recommend:* no. A plain browser follows Default. Keep `useScreenSetting`'s
    browser scope for the keys that are about the hardware you hold (touch,
    keyboard, text size, layout). The effects level's `auto` already gives a
    desktop browser `full`.

## 3. The plumbing gap

### What already works

- **Backend merge.** `merge_overrides` replaces any top-level key and both its
  spellings (`kiosk_registry.py`). `PUT /api/kiosks/{id}/overrides` accepts any
  key (`ConfigUpdate` has `extra="allow"`) and caps size at 64 kB.
- **Delivery.** The kiosk browser loads `/api/kiosks/{id}/config`
  (`configPath()` in `utils/kioskId.js`). `applyConfigPayload` applies every
  key in `CONFIG_FIELD_DEFINITIONS`. Since PR #297 a change to any key reaches
  the kiosk on its next poll. A component that reads `configStore.focusLightMode`
  therefore already sees the kiosk's own value.
- **Display agent.** Only `DEVICE_PHYSICAL_KEYS` bump `deviceConfigVersion`.
  Look-and-feel keys don't need the agent.
- **Remote editing pattern.** The Screens page edits one kiosk's overrides
  through `kioskOverridesQueue(kioskId)` (optimistic, one queue per kiosk, so
  two rows never clobber each other). Each row shows `ScopeLine`: **Same as
  Default** or **Changed here · Reset to default**. `ScreenBehaviourRows.vue`
  is the cleanest example: it takes values plus an `overridden` map and emits
  `set(key, value)` and `reset(key)`. The Default page and a screen page both
  render it.
- **Default-side helpers.** `utils/screenOverrides.js` has
  `SCREEN_SETTING_LABELS` (labels for "Hallway keeps its own …"),
  `DEFAULT_COPYABLE_KEYS` ("Use these as the default"), `screensOverriding`,
  `changedSettingCount` and `DefaultEditNote`.
- **"This screen" pattern.** `useScreenSetting(key)` edits the device you are
  holding: a kiosk's override, or `localStorage` on a browser. Used by the
  calvin-hi6w controls (`ScopeChip` "This screen").

### What is missing

- **G1. No generic per-screen row.** `ScreensSettings.vue` hand-writes a
  `xOverridden` computed, an effective-value computed and a `persistX` function
  for each key. Adding ten Dashboard keys this way would add hundreds of lines.
- **G2. Dashboard rows don't know about overrides.** They are bound to the
  Settings form (`props.config`, the household value) and write with
  `update:config` (`POST /api/config`). On a kiosk that overrides a key the row
  shows the household value while the screen does something else. Nothing tells
  you which value is in force or where it comes from.
- **G3. Finding F1: Default page Behaviour rows write the wrong scope.**
  `DefaultScreenSettings.vue` uses `useScreenSetting` for photo frame, loading
  light and layout. On a plain browser that writes `localStorage`; on a kiosk it
  writes that kiosk's override. Neither is the household default the page
  promises. The household `loadingLight` can only be set through the API today.
- **G4. calvin-hi6w controls are per screen but only editable on the device.**
  `showUI`, `clockBarShowInKiosk`, `tapAnywhereReveal` and `uiSize` have no row
  on Screens › {screen}. To change the 3B+ you must stand at the 3B+.
- **G5. No effective-value view on the kiosk itself.** `useScreenSetting`
  reports `overridden` only for browser scope; for a kiosk it defers to the
  Screens page.
- **G6. Typing.** `ConfigUpdate` doesn't declare `focusLightMode`,
  `focusLightDimOthers`, `loadingLight`, `hotCorner*`, `touchControlSize` and
  others. A bad override value is stored as-is.
- **G7. Labels.** `SCREEN_SETTING_LABELS` and `DEFAULT_COPYABLE_KEYS` list only
  today's per-screen keys.

### What to build (rough work items)

Reuse; don't invent. Sizes: S ≈ half a day, M ≈ one to two days.

1. **One list of per-screen keys (S).** Extend `utils/screenOverrides.js` with
   a descriptor per key: key, label, section, control and options. Derive
   `SCREEN_SETTING_LABELS` and `DEFAULT_COPYABLE_KEYS` from it. This is the
   single place that says "this key is per kiosk with household default".
2. **A generic row (M).** Generalise `ScreenBehaviourRows.vue` into a row set
   driven by the descriptors: value, `ScopeLine`, `set` and `reset` events. On a
   screen page the host wires them to `kioskOverridesQueue(kioskId)`; on the
   Default page to `update:config`. Move the existing hand-written rows over
   when touched, not all at once.
3. **Fix F1 (S).** Default page Behaviour rows write the household config.
   Keep `useScreenSetting` only for **This browser**.
4. **A "Look" section on Default and each screen (S, after 1–2).** Focus light,
   Dim other regions, Dashboard size, Show-controls corner (4 rows), Show button
   presses, Label size, Show seconds, Clock bar layout and sizes, Photo rotation,
   and the effects level (§4). Plus the calvin-hi6w controls and text size (G4).
5. **Dashboard keeps household rows plus a pointer (S).** For each moved key,
   Dashboard either drops the row and links "Set per screen in Screens", or
   keeps it as the Default value with the same `DefaultEditNote` ("Hallway
   keeps its own Focus light · Change them too"). Recommend the pointer: one
   place per setting.
6. **Effective value on the kiosk (S).** When Settings is open on a kiosk, rows
   for per-screen keys read `configStore[key]` (merged) and show `ScopeLine`
   from that kiosk's overrides. `DefaultScreenSettings.screenServerValue` is
   already the right helper.
7. **Typed overrides (S).** Add the moved keys to `ConfigUpdate` with enums or
   ranges, so a bad PUT is rejected with 400.
8. **No migration needed (none).** Unlike calvin-hi6w, the household value stays
   the fallback, so no copy onto existing kiosks is required. Every kiosk starts
   as **Same as Default**.
9. **Tests (S–M).** Vitest for descriptor-driven rows (Same as Default, Changed
   here, Reset), the Default page writing global, and a backend test that
   overrides for the new keys merge and type-check.

Total: about 4–6 days of focused work for items 1–9, most of it in 2 and 4.

## 4. Per-kiosk effects level (calvin-uudb)

### Shape

One new key, **`effectsLevel`**, per kiosk with household default:

| Value | Focus light (when shown) | Dim other regions (when on) | Photo backdrop | Loading light `comet` | Decorative motion |
|---|---|---|---|---|---|
| `full` | Old multi-layer glow | `saturate()`/`brightness()` filter | Real blur | Comet | On |
| `standard` | Today's 2 px ring and one halo | Today's opacity wash | Today's soft upscaled 640 px copy, no blur | Comet | On |
| `light` | Border colour only, no shadow, no lift | Opacity only | Solid scrim | Draws as Pulse | Off |
| `auto` (default) | Resolves to one of the above per device | | | | |

Rules:

- **Split *whether* from *how*.** `focusLightMode`, `focusLightDimOthers` and
  `loadingLight` keep deciding whether something shows. `effectsLevel` only
  decides how it is drawn. This avoids a precedence puzzle between a preset and
  the individual keys. Off is still off at every level.
- **Apply it as an attribute.** Set `data-effects="full|standard|light"` on
  `<html>`, like `useLayoutOverride` sets the layout classes. CSS gates the
  costly rules: `[data-effects="full"] .focus-panel.is-focused { … }`.
- **Keep the guard test.** `noExpensiveFilters.spec.js` bans blur and filters
  everywhere today. Change it to allow them only under a
  `[data-effects="full"]` selector, so a cheap screen can never get them by
  accident.
- `prefers-reduced-motion` still wins over `full` for motion.
- The row lives in the new "Look" section on Screens › Default and Screens ›
  {screen} (§3, item 4), shown as **Effects: Auto (Light, Pi 3B+)** when Auto
  resolved.

### Should Auto pick by device class?

Yes. Most owners will never set it, and the 3B+ is the device that suffers.

Signals, best first:

1. **Pi model from the kiosk agent (best; small new work).** The agent already
   reports `khost`, `kagent` and `kstack` on its config poll. Add `kmodel` from
   `/proc/device-tree/model` (for example "Raspberry Pi 3 Model B Plus") and
   store it in `KioskDB` next to `display_stack`. Map Pi 3 and older to `light`,
   Pi 4/400 to `standard`, Pi 5 to `full`.
2. **Display stack (works today).** `display_stack` is already stored. `cog`
   is in practice the 3B+ path, so `cog` → `light`; `x11`/`wayland` → `standard`.
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
does not. A plain browser resolves `auto` itself (no kiosk id → `full`). An
explicit value always wins over Auto.

### Order of work

1. Plumbing items 1–2 and 4 from §3 (so the row has a home).
2. `effectsLevel` with explicit values only, gated CSS, spec change.
3. `kmodel` in the agent and registry, then Auto.

calvin-uudb also says to wait for the swap root cause (calvin-fufd). PR #297
landed that fix, so this is unblocked from that side.

## Open questions

The items in §2. The structural one is Q9 (Screens page as the one home for
per-kiosk rows). Everything in §3 and §4 assumes option A.
