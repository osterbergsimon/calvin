# Kiosk performance profile — Raspberry Pi 3B+ / cog (WPE WebKit)

**Date:** 2026-11-02
**Task:** calvin-qpao (phase 1: measure, do not optimise)
**Scope:** the dashboard, not Settings. The owner reports that Settings feels fast
while the dashboard feels slow. The profile is weighted towards the dashboard and
breaks the cost down per region type.

## TL;DR

- **A dashboard tap is not a JavaScript problem.** The all-regions tap costs
  **658 ms** of main-thread time, but application JS is only **8 ms**. About
  **90 %** is native `(program)` work — paint, raster and image decode. The same
  is true for the photo advance (**18.9 ms** app JS, **558 ms** native).
- **The two biggest paint costs are the focus light and the photo backdrop.**
  Every tap turns on a four-layer `box-shadow` (up to 68 px blur) on the active
  region and applies `filter: saturate() brightness()` to every other region.
  Every photo is drawn twice: a full-size `<img>` plus a full-size copy with
  `filter: blur(28px) brightness(0.55)`.
- **The initial bundle is 1.22 MB of JS (≈392 kB gzip) plus 257 kB of CSS.**
  The 630 kB `settings` chunk and the 378 kB `plugins` chunk are both loaded on
  the first dashboard paint, although the dashboard does not need most of either.
- **A photo is downloaded and decoded at 4032×3024 (12.2 MP) for a 626×637
  (0.40 MP) box** — about 30× more pixels than displayed — and a second
  full-size `<img>` copy is rasterized with a 28 px blur for the backdrop. The
  mock photo is 4.00 MB.
- **Idle is cheap but not quiet.** Steady-state idle is 54–160 ms of main-thread
  work per 30 s (≈0.2–0.5 % of one core), but a **100 ms `setInterval` fires 300
  times per 30 s**, a **30 s photo rotation** triggers the full 0.74–0.96 s photo
  advance, and 66 `comet-orbit` CSS animations exist (paused at idle, running
  during loads).
- **A "low-power screen" setting would help**, because the dominant cost is
  decorative paint. It can switch off the comet loading light, the focus glow and
  dim filter, the photo backdrop blur, and lengthen/disable photo rotation. It
  will not fix the initial bundle or the calendar's forced layout.

All timings below are from Chromium with `Emulation.setCPUThrottlingRate = 6`
(the Pi 3 core is roughly 6–10× slower than a desktop core). Treat them as
approximations of the Pi, not exact port measurements.

## Method

- Production build (`npm run build`), served from `dist/` by `vite preview` on
  `127.0.0.1:4173`. The profiling script builds with sourcemaps and a temporary
  Vite config that exposes the Vue app for component mount/update counters; the
  repository config is unchanged.
- Playwright Chromium 143, viewport **1280×720**, `serviceWorkers: "block"`.
- **Every `/api` request is answered by the existing mocked harness**
  (`frontend/tests/e2e/phone/fixtures/api-mock.js`). Host-acting routes
  (`/api/system/reboot`, `/restart-*`, `/update`, `/display/*`, …) are
  intercepted and recorded; `hostActions` is empty in every run. No real backend
  is contacted.
- Realistic mock data: two/three dashboard screens; a calendar with 22 timed and
  all-day events; five 4032×3024 photos (4.00 MB each); the horizontal clock bar
  at the top; `showUI: true`, focus light on interaction, dim-others on, 30 s
  photo rotation, 30 s config poll.
- Measurements:
  - CDP `Performance.getMetrics()` for `TaskDuration`, `ScriptDuration`,
    `RecalcStyleCount/Duration`, `LayoutCount/Duration`;
  - CDP `Profiler` (500 µs sampling) for self time, symbolised through the
    production sourcemaps to `frontend/src/...:line`;
  - `PerformanceObserver({ entryTypes: ["longtask"] })` for tasks > 50 ms;
  - a Vue mixin in the profiling build for per-component mount/update counts;
  - wrapped `setInterval`/`setTimeout`/`requestAnimationFrame` for the idle
    timer inventory, with stacks symbolised to source.
- **Caveats:** Chromium, not cog/WPE WebKit. Paint and raster behaviour differs;
  the Pi's GPU may make some effects cheaper and others more expensive. Mock
  data is not the owner's real library. Run-to-run variance was ±20–30 % (initial
  load ranged 1.58–2.24 s across runs). The iframe region is a mocked external
  page and is not present on the owner's real dashboard; it was measured briefly.
  The unauthenticated Settings lock screen crashes the production renderer in
  this harness, so the OSK was measured on the Settings search field instead.

Reproduce:

```bash
cd frontend
node scripts/profile-kiosk.mjs --out /tmp/opencode/kiosk-profile.json

# reuse an existing build/preview
node scripts/profile-kiosk.mjs --skip-build --base-url http://localhost:4173 \
  --only initial-load,photo-advance,page-switch-calendar-photos
```

The script prints a summary and writes the raw JSON (scenario metrics, profiles,
timer stacks, bundle list) to the `--out` path.

## Bundle and first-load payload

Build output (`frontend/dist/assets/js`):

| Chunk                              |      Raw |     gzip | Loaded on first dashboard paint? |
| ---------------------------------- | -------: | -------: | -------------------------------- |
| `settings-C71QFHqq.js`             | 630.6 kB | 186.8 kB | **yes** (preloaded)              |
| `plugins-kQWZQFpj.js`              | 378.3 kB | 134.9 kB | **yes** (preloaded)              |
| `vendor-DuaJhtm4.js`               | 116.0 kB |  36.3 kB | yes                              |
| `index-B51Nxhm5.js`                |  28.4 kB |  10.8 kB | yes (entry)                      |
| `Dashboard-XjzAyQU3.js`            |  21.7 kB |   7.6 kB | yes (route)                      |
| `CalendarView-D_KO-5WP.js`         |  31.6 kB |  10.2 kB | yes (region, async)              |
| `PhotoSlideshow-CdRN-oIq.js`       |   5.1 kB |   2.2 kB | yes (region, async)              |
| `vendor-vue-BayPuY_-.js`           |   2.5 kB |   0.9 kB | yes                              |
| `RegionHeaderControls-BS7EwiVc.js` |   1.9 kB |   0.9 kB | yes                              |
| `RegionViewOptions-ZOkEm_vJ.js`    |   1.3 kB |   0.7 kB | yes                              |
| `rolldown-runtime-BWaJ3C7D.js`     |   0.9 kB |   0.5 kB | yes                              |
| `WebServiceViewer-D3Zx5VP2.js`     |   8.6 kB |   3.2 kB | no (service region only)         |
| `Settings-CyLxLekw.js`             |   8.0 kB |   3.1 kB | no (route chunk)                 |
| `GuestShare-DrulyO9M.js`           |   8.2 kB |   3.5 kB | no (route chunk)                 |

Measured initial requests: **1.22 MB JS + 257 kB CSS** (the preview server did
not gzip; the gzip column is the build's own figure, ≈392 kB JS gzip).

Why the two big chunks are initial:

- `AdminOverflow.vue:30` imports `ConfirmModal` from
  `components/settings/shared/`. `vite.config.js:145-148` puts every
  `components/settings/*` file into the `settings` chunk, so the whole settings
  chunk is pulled in by the clock-bar menu.
- `ClockBarHorizontal.vue:37` imports `PluginStatusbarItems.vue`, which imports
  `SchemaStatusbarItem.vue` → `SchemaRenderer.vue` → `rendererRegistry.js`, which
  imports every built-in renderer. `vite.config.js:141-144` puts all
  `components/plugins/*` into the `plugins` chunk, so the whole plugin renderer
  set is initial.
- `App.vue:10` mounts `OnScreenKeyboard` globally; it imports `simple-keyboard`
  and constructs it on load even when no field is focused. `App.vue:11` mounts
  `AdminSignInDialog`, which pulls `Dialog`/`ConfirmModal`/`Popover`.

The initial load mounts **77 Vue components**, including `OnScreenKeyboard`,
`AdminSignInDialog`, `Dialog`, `ConfirmModal`, `Popover`, `NotificationSystem`,
`StatusRail`, `ReloadLight` and three `CometIndicator` frames.

## Initial load to first meaningful paint

| Metric                                                              |                                               Value |
| ------------------------------------------------------------------- | --------------------------------------------------: |
| First paint                                                         |                                              108 ms |
| First contentful paint                                              |                                            1 020 ms |
| First meaningful paint (calendar events + photo loaded + clock bar) |                                        **1 560 ms** |
| Largest contentful paint                                            |                                            1 568 ms |
| Main-thread task time                                               |                                        **1 583 ms** |
| Script                                                              |                                              238 ms |
| Style recalc                                                        |                                        28 × / 83 ms |
| Layout                                                              |                                        9 × / 296 ms |
| Long tasks (> 50 ms)                                                | **7, total 766 ms** (244, 85, 111, 68, 141, 52, 65) |
| Vue                                                                 |                              20 updates, 77 mounted |

Top application self time (share of busy CPU; total busy 1 544 ms):

|    Self | Share | Function                           | Location                                |
| ------: | ----: | ---------------------------------- | --------------------------------------- |
| 93.5 ms | 6.1 % | `measureHeaderWidth`               | `src/components/CalendarView.vue:613`   |
| 39.0 ms | 2.5 % | `computed` (clock formatting)      | `src/composables/useClockBar.js:133`    |
| 38.9 ms | 2.5 % | service/plugin instance loading    | `src/stores/webServices.js:39`          |
| 15.5 ms | 1.0 % | `reportArea`                       | `src/components/ui/EmptyState.vue:144`  |
| 10.5 ms | 0.7 % | anonymous (plugin renderer bundle) | `assets/js/plugins-*.js:1`              |
| 10.1 ms | 0.7 % | event time formatting              | `src/composables/useEventHelpers.js:35` |
|  9.2 ms | 0.6 % | `measureContainer`                 | `src/components/PhotoSlideshow.vue:196` |
|  7.7 ms | 0.5 % | app setup                          | `assets/js/index-*.js:2`                |
|  7.4 ms | 0.5 % | `appendChild` (Vue mount)          | `assets/js/index-*.js:2`                |

Vendor self time on the first load: `simple-keyboard` 43.7 ms
(`node_modules/simple-keyboard/build/index.js:12`) and `vuedraggable` 14.3 ms.
Both are in the initial graph even though the dashboard does not use them.
`(program)` native work was 829 ms, which is mostly compile/parse of the 1.22 MB
bundle, style/layout and first paint.

## Interaction measurements

All scenarios use the real dashboard layout (calendar + photos + clock bar)
unless the name says otherwise. "Main thread" is `TaskDuration`; "app JS" is the
CPU-profile category for `frontend/src` and unmapped app chunks.

| Interaction              | Main thread | Script | Style recalc |       Layout | Long tasks | Vue                              |
| ------------------------ | ----------: | -----: | -----------: | -----------: | ---------: | -------------------------------- |
| Initial load to FMP      |    1 583 ms | 238 ms | 28 × / 83 ms | 9 × / 296 ms | 7 / 766 ms | 20 upd, 77 mounted               |
| Page switch, all regions |      895 ms |  14 ms | 13 × / 16 ms | 7 × / 119 ms | 2 / 194 ms | 50 upd, 41 mounted, 46 unmounted |
| Tap, all regions         |      658 ms |  10 ms |  21 × / 7 ms |   1 × / 5 ms | 1 / 152 ms | 34 updates                       |
| Photo advance            |      739 ms |  47 ms | 17 × / 12 ms |   1 × / 8 ms |          0 | 41 updates                       |
| Kiosk menu open + close  |      638 ms |  10 ms | 27 × / 22 ms |  4 × / 11 ms |          0 | 18 updates, 1 mounted            |
| OSK open + close         |      532 ms |  15 ms | 20 × / 47 ms |   2 × / 5 ms |          0 | 6 updates                        |
| Idle 30 s, all regions   |      160 ms |  18 ms |   2 × / 0 ms |            0 |          0 | 13 updates                       |

The same interactions on the isolated region sets are in the next section.

### Top application self time per interaction

Only application frames (`frontend/src`, unmapped app chunks) are listed. The
rest of the busy time is mostly native `(program)`; vendor and harness shares are
given where they matter.

**Page switch, all regions** — busy 867 ms, app 167.9 ms, vendor 73.2 ms, native
program 539.5 ms.

|    Self |  Share | Function                              | Location                                                     |
| ------: | -----: | ------------------------------------- | ------------------------------------------------------------ |
| 90.8 ms | 10.5 % | `get clientWidth` (forced layout)     | `src/components/CalendarView.vue:613` (`measureHeaderWidth`) |
| 25.7 ms |  3.0 % | event time formatting                 | `src/composables/useEventHelpers.js:35`                      |
|  9.0 ms |  1.0 % | `formatEventStartTime`                | `src/composables/useEventHelpers.js:55`                      |
|  9.0 ms |  1.0 % | anonymous calendar render             | `src/components/CalendarView.vue:746`                        |
|  6.4 ms |  0.7 % | `get clientWidth` (container measure) | `src/components/PhotoSlideshow.vue:196` (`measureContainer`) |
|  2.7 ms |  0.3 % | calendar lifecycle                    | `src/components/CalendarView.vue:140`                        |
|  1.8 ms |  0.2 % | calendar helper                       | `src/components/CalendarView.vue:1319`                       |
|  1.4 ms |  0.2 % | calendar computed                     | `src/components/CalendarView.vue:890`                        |
|  1.4 ms |  0.2 % | image store                           | `src/stores/images.js:65`                                    |
|  1.4 ms |  0.2 % | OSK layout helper                     | `src/composables/useOnScreenKeyboard.js:695`                 |

**Tap, all regions** — busy 634.6 ms, app **8.3 ms**, vendor 26.0 ms, native
program **570.4 ms**. The top application frames are all ≤ 1.3 ms
(`src/main.js:106`, `src/utils/kioskId.js:16`, `src/utils/layout.js:725`,
`src/components/CalendarView.vue:158`, `src/components/DashboardRegion.vue:5`).
This is the clearest signal in the profile: **the tap cost is paint/raster, not
application code.**

**Photo advance** — busy 675.8 ms, app **18.9 ms**, vendor 37.4 ms, native
program **558.1 ms**, GC 25.4 ms.

|   Self | Share | Function                              | Location                                |
| -----: | ----: | ------------------------------------- | --------------------------------------- |
| 3.4 ms | 0.5 % | calendar lifecycle (unrelated region) | `src/components/CalendarView.vue:140`   |
| 1.8 ms | 0.3 % | photo next click handler              | `src/components/PhotoSlideshow.vue:37`  |
| 1.4 ms | 0.2 % | legacy layout creation                | `src/utils/layout.js:698`               |
| 1.3 ms | 0.2 % | photo source computed                 | `src/components/PhotoSlideshow.vue:178` |
| 1.2 ms | 0.2 % | panel render helper                   | `src/components/DashboardPanel.vue:3`   |
| 1.2 ms | 0.2 % | layout helper                         | `src/utils/layout.js:725`               |
| 1.1 ms | 0.2 % | dashboard render                      | `src/views/Dashboard.vue:350`           |

The remaining time is the browser decoding a 12.2 MP image, rasterizing a second
full-size blurred backdrop layer and painting the transition.

**Calendar page switch (calendar only)** — busy 664.6 ms, app 159.5 ms, vendor
61 ms, native program 420.3 ms. Same top frames as the all-regions switch:
`get clientWidth` 92.7 ms (`CalendarView.vue:613`), event formatting 22.4 ms
(`useEventHelpers.js:35`), `formatEventStartTime` 12 ms (`:55`), anonymous
calendar render 7 ms (`:746`).

**Photos page switch (photos only)** — busy 474 ms, app 11.3 ms, vendor 24.4 ms,
native program 414.2 ms. Top app frame: `measureContainer` 2.9 ms
(`PhotoSlideshow.vue:196`).

**Clock bar only** — busy 474.4 ms, app 8.7 ms, vendor 39.2 ms, native program
400.3 ms. The "clock bar only" screen contains one empty service region because
the layout normaliser always materialises at least one region; it does no content
fetch. Tap cost: busy 461.8 ms, app 1.9 ms.

**Iframe service only (short run)** — page switch 599 ms, tap 481 ms, idle 10 s
15 ms. This is not on the owner's real dashboard; it is included for completeness.

**Menu** — busy 612.4 ms, app 21.9 ms. Top: `getBoundingClientRect` 7.9 ms
(`usePopoverPlacement.js:48`, `place`), `focus` 2.7 ms (`Popover.vue:122`),
`onActivity` 1.4 ms (`useFocusLight.js:41`). Style recalc 27 × / 22 ms; the
popover placement reads layout twice.

**OSK** — busy 505.5 ms, app 49.3 ms. Top: `getPropertyValue` 20.4 ms
(`utils/themePalettes.js:40`), `getBoundingClientRect` 20 ms
(`ui/OnScreenKeyboard.vue:260`, `measureHeight`), `getBoundingClientRect` 2 ms
(`useOnScreenKeyboard.js:513`, `raf`). Style recalc **20 × / 47 ms**: opening the
keyboard re-resolves theme colours and re-lays out the page.

## Per-region breakdown (owner's real dashboard)

The owner's dashboard is calendar + photos + clock bar. The table below repeats
the same interactions with only one region type at a time. "Idle" is 30 s of no
input (10 s for the iframe); the number is main-thread task time, not wall time.

| Region set                               | Page switch |        Tap |    Idle 30 s | Tap re-renders (total)                                                   | Page-switch mounts / unmounts |
| ---------------------------------------- | ----------: | ---------: | -----------: | ------------------------------------------------------------------------ | ----------------------------- |
| **Calendar + photos + clock bar** (real) |  **895 ms** | **658 ms** |   **160 ms** | **34** — CalendarView 3, PhotoSlideshow 3, ClockBar 2, DashboardRegion 6 | 41 / 46                       |
| Calendar only                            |      694 ms |     627 ms |        64 ms | 23 — CalendarView 3, ClockBar 2                                          | 39 / 39                       |
| Photos only                              |      496 ms |     468 ms |        98 ms | 18 — PhotoSlideshow 3, ClockBar 2                                        | 11 / 11                       |
| Clock bar + one empty service region     |      500 ms |     482 ms |        54 ms | 6 — WebServiceViewer 1, FocusPanel 1                                     | 11 / 11                       |
| Iframe service only (short)              |      599 ms |     481 ms | 15 ms (10 s) | 8 — WebServiceViewer 1, ServiceViewer 1                                  | 12 / 12                       |

What changes in the _other_ regions:

- **A tap on the calendar re-renders the photos region three times and the clock
  bar twice**, even though neither changed. `focusRegion`
  (`useKeyboardActions.js:1031`) calls `saveDashboardScreens`, which posts the
  whole `dashboardScreens` config through `updateConfig` (`:67-76`). The response
  replaces the config payload and re-renders every region. `activeRegionId` is
  screen state, not a global setting, and should not be persisted on every tap.
- **Advancing a photo re-renders the calendar four times and the clock bar three
  times.** The same full-config write is involved (focusing the photo region
  before the advance), plus the photo store update.
- **A page switch unmounts and remounts every region component** (46 unmounted,
  41 mounted in the all-regions layout). That is where the 119 ms layout and the
  90–126 ms `measureHeaderWidth` go: 20 `CalendarTimedEvent` and 3
  `CalendarRibbon` components are created again.
- **Idle cost is mostly timers, not region rendering.** The isolated idle runs
  are 54–160 ms per 30 s. The photos-only idle is higher because the 30 s
  rotation fires at the edge of the window; the real cost of that rotation is the
  photo-advance measurement (0.74–0.96 s).
- **The clock bar itself is cheap** (tap 482 ms with app JS 1.9 ms; idle 54 ms).
  It is the focus light / paint path that makes even the clock-bar tap expensive.

## Idle: every timer, animation and transition

30 s idle on the real dashboard (calendar + photos + clock bar), 1280×720, no
input. `TaskDuration` 160 ms, script 18 ms, style 2 × / 0 ms, layout 0, no long
tasks, 13 Vue updates.

### `setInterval`s active while idle

|      Delay | Fires in 30 s | Source                                                                       |
| ---------: | ------------: | ---------------------------------------------------------------------------- |
| 900 000 ms |             0 | `src/utils/serviceWorkerUpdate.js:87` (15 min deploy check; production only) |
|  30 000 ms |             1 | `src/components/KeyboardHandler.vue:177` (keyboard config poll)              |
| **100 ms** |       **300** | `src/components/KeyboardHandler.vue:216` (reboot combo check)                |
|  30 000 ms |             1 | `src/views/Dashboard.vue:545` (config poll)                                  |
|  60 000 ms |             0 | `src/components/CalendarView.vue:566` (today refresh)                        |
| 900 000 ms |             0 | `src/components/CalendarView.vue:521` (calendar auto-refresh)                |
|  30 000 ms |             1 | `src/components/PhotoSlideshow.vue:265` (photo rotation; photos/all only)    |

### Pending `setTimeout`s at the end of the idle window

|      Delay | Remaining | Source                                                         |
| ---------: | --------: | -------------------------------------------------------------- |
|  60 000 ms |     ~28 s | `src/composables/useClockBar.js:233` (next minute tick)        |
|  30 000 ms |     ~26 s | `src/stores/connection.js:65` (health check)                   |
| 300 000 ms |    ~287 s | `@tanstack/query-core` timeout manager (service-only scenario) |

### `requestAnimationFrame`

**Zero callbacks during idle.** There is no rAF loop on the dashboard. (The
interaction runs use Playwright's `waitForFunction` polling, which does use rAF;
that is harness traffic, not app traffic.)

### CSS animations and transitions

- **66 paused `comet-orbit` CSSAnimations**: 22 `CometIndicator` beads × 3
  `LoadingLight` frames (app frame + calendar region + photos region). In the
  calendar-only or clock-bar-only layout there are 44 (app + one region).
  `animation-play-state: paused` is working: `playState` is `paused` and there is
  no animation work at idle. During a load, the same 66 elements animate
  `offset-path` and paint three box-shadow layers each.
- **No running CSS transitions at idle.** The focus-light and panel transitions
  finish within 200 ms of the last input.
- **No animated gradients.** The gradients in `FocusPanel.vue:40-42`,
  `DashboardPanel.vue:100-104` and the between-bar are static; `color-mix()` in
  them is resolved during style recalc, not animated.
- The 30 s photo rotation and 30 s config poll each fire once per idle window and
  account for the 13 Vue updates (CalendarView, PhotoSlideshow, ClockBar,
  DashboardRegion, ScreenDots, FocusPanel, RegionHeaderControls,
  CalendarViewOptions).

## Expensive CSS on a Pi GPU (and where it is used)

| Property                               | Where                                                                                                                                                                                            | Value                                                                                  | Why it matters                                                                                                                                      |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `filter: blur()`                       | `src/components/PhotoSlideshow.vue:422`                                                                                                                                                          | `blur(28px) brightness(0.55)` on `.photo-backdrop`                                     | A full-size blurred copy of a 12 MP photo; blur is a full-layer raster operation, and the same URL is already shown by the main `<img>` (`:68-76`). |
| `filter: saturate() brightness()`      | `src/components/ui/FocusPanel.vue:56`                                                                                                                                                            | `.focus-panel.is-dim { opacity: .62; filter: saturate(.65) brightness(.86) }`          | Applied to every non-active region on every tap; the filter is transitioned at `:33-37`, so the whole region layer is re-rastered for 200 ms.       |
| Large multi-layer `box-shadow`         | `src/components/ui/FocusPanel.vue:47-51`                                                                                                                                                         | `0 0 0 2px`, `0 0 10px`, `0 0 30px 1px`, `0 0 68px 3px`                                | A 68 px blur is paint-heavy, not compositor-friendly; active on every tap and page switch.                                                          |
| `backdrop-filter: blur()`              | `src/components/ui/DialogScrim.vue:25`                                                                                                                                                           | `blur(6px)` on `.dialog-scrim.is-blurred`                                              | Only dialogs, not the dashboard; still expensive on a Pi and should stay opt-in.                                                                    |
| 22 animated beads with 3-layer shadows | `src/components/indicators/CometIndicator.vue:38,83-93`                                                                                                                                          | `beadCount = 22`; each bead `0 0 4px`, `0 0 12px`, `0 0 24px`; `offset-path` animation | 22 elements per frame × 3 frames; runs during first load and region loads. Paused at idle.                                                          |
| Pulsing box-shadow                     | `src/components/indicators/PulseIndicator.vue:49-53`                                                                                                                                             | inset + outer shadow, `pulse-breathe`                                                  | Cheaper than the comet, but still animates a box-shadow; active during loads.                                                                       |
| `filter: brightness()` keyframes       | `src/components/StatusRail.vue:264-292`                                                                                                                                                          | `lamp-arrive`, `lamp-alert`                                                            | Animated filter on notification arrival; brief, but avoid on a low-power screen.                                                                    |
| `transition: all`                      | `PluginSections.vue:106`, `PluginFieldRenderer.vue:301`, `PluginActions.vue:156,178`, `CalendarEventItem.vue:110`, `ThemeSelector.vue:161`, `CollapsibleSection.vue:74`, `TabNavigation.vue:125` | `all var(--dur) ease`                                                                  | Animates every property (including layout-affecting ones). Mostly Settings, but the dashboard's event chips also use it.                            |
| Static gradients + `color-mix()`       | `FocusPanel.vue:40-42`, `DashboardPanel.vue:100-104`, `ClockBarHorizontal.vue:179`                                                                                                               | linear-gradient / color-mix                                                            | Not animated, but each theme change forces style recalc; keep an eye on it when changing theme tokens.                                              |
| `will-change`                          | —                                                                                                                                                                                                | none found in `frontend/src`                                                           | No misuse. Do not add it to the focus panel: the problem is the paint itself, not layer promotion.                                                  |

The dashboard does **not** use `backdrop-filter`. The two effects that dominate
the measured dashboard interactions are the focus-light filter/box-shadow and the
photo backdrop blur.

## Ranked fixes (10)

Estimated wins are measured under the 6× CPU throttle, so they approximate the
Pi. "Risk" is implementation risk, not visual risk.

|   # | Fix                                                                                                                                                                                                                                                      | Estimated win                                                                                                                                          | Risk                                                               | Files                                                                                                                                                                                                                        |
| --: | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
|   1 | **Request display-sized photos.** Add width/height (or a thumbnail endpoint) to `/api/images/{id}` and use `srcset`; cache resized variants.                                                                                                             | Photo advance 739 ms → likely <200 ms; 4.0 MB → ~100–200 kB per photo. Removes the 12.2 MP decode for a 0.40 MP box.                                   | Medium (backend image route, EXIF/orientation, cache invalidation) | `backend/app/api/routes/images.py` (image route), `frontend/src/stores/images.js:173-180`, `frontend/src/components/PhotoSlideshow.vue:77-86`                                                                                |
|   2 | **Make the focus light cheap.** Replace the four-layer 68 px glow with a 2 px border/outline or one small shadow; remove `filter: saturate() brightness()` from `.is-dim`; transition only `opacity`/`border-color`.                                     | Tap 658 ms → ~150–250 ms (est. 400–500 ms saved); page-switch paint also drops. App JS is already only 8 ms, so this is the main tap win.              | Low (visual only)                                                  | `frontend/src/components/ui/FocusPanel.vue:33-56`, `frontend/src/components/DashboardRegion.vue:287-305`, `frontend/src/views/Dashboard.vue:713-732`                                                                         |
|   3 | **Stop preloading the `settings` chunk.** Move `ConfirmModal` out of `components/settings/shared` (e.g. to `components/ui`) or lazy-load it; stop grouping every settings component into one manual chunk.                                               | ~187 kB gzip and its parse/compile removed from first paint; initial load est. −150–300 ms.                                                            | Medium (chunk graph, import paths)                                 | `frontend/vite.config.js:145-148`, `frontend/src/components/dashboard/AdminOverflow.vue:30`, `frontend/src/components/settings/shared/ConfirmModal.vue`                                                                      |
|   4 | **Stop preloading the `plugins` chunk.** Lazy-load `PluginStatusbarItems`/`SchemaRenderer`/`rendererRegistry`, or split each renderer; only load plugin renderers when a statusbar/region plugin actually needs one.                                     | ~135 kB gzip removed from first paint; initial load est. −100–250 ms.                                                                                  | Medium (async component, plugin rendering timing)                  | `frontend/src/components/ClockBarHorizontal.vue:37`, `ClockBarVertical.vue`, `frontend/src/components/PluginStatusbarItems.vue:20`, `frontend/src/components/plugins/rendererRegistry.js`, `frontend/vite.config.js:141-144` |
|   5 | **Keep the active region local.** Do not POST the whole `dashboardScreens` config on every tap/focus; store `activeRegionId` in a local/session ref and persist only on a deliberate change.                                                             | Removes 34–41 component updates per tap/photo, including 3–4 re-renders of the unrelated region; est. 50–150 ms per interaction and less layout churn. | Medium (persistence semantics)                                     | `frontend/src/composables/useKeyboardActions.js:1031`, `frontend/src/stores/config.js:565-575`, `frontend/src/utils/layout.js`                                                                                               |
|   6 | **Fix `measureHeaderWidth` forced layout.** Use the `ResizeObserver` `contentRect` already available (`CalendarView.vue:552-559`) instead of reading `clientWidth` per render/event; cache the header width.                                             | 90–126 ms app self time + up to 122 ms layout per calendar page switch (~25–35 % of the switch).                                                       | Low                                                                | `frontend/src/components/CalendarView.vue:552-559,613`                                                                                                                                                                       |
|   7 | **Remove the photo backdrop blur / duplicate layer.** Use a solid scrim or a pre-blurred thumbnail; or only render the backdrop for non-`fill` fits and never at full resolution.                                                                        | Part of the photo advance: est. 100–200 ms and one full-size raster layer; less GPU memory.                                                            | Low–medium (visual)                                                | `frontend/src/components/PhotoSlideshow.vue:68-76,416-425`, `frontend/src/utils/photoFit.js`                                                                                                                                 |
|   8 | **Cheapen the loading light.** Default to `pulse`, or a single static edge; if the comet stays, use fewer beads and one shadow layer, and do not run it on every region frame.                                                                           | Initial load and page-switch paint est. 100–300 ms; removes 66 animated elements during loads.                                                         | Low                                                                | `frontend/src/components/indicators/CometIndicator.vue`, `frontend/src/components/LoadingLight.vue`, `frontend/src/stores/progress.js`                                                                                       |
|   9 | **Lazy-load the OSK / `simple-keyboard`.** Mount `OnScreenKeyboard` only when a text field is focused or the keyboard button is shown; import `simple-keyboard` dynamically.                                                                             | ~44 ms vendor self time on first load plus its parse/compile; smaller initial graph.                                                                   | Medium (focus timing, first-tap keyboard)                          | `frontend/src/App.vue:10`, `frontend/src/components/ui/OnScreenKeyboard.vue:80`, `frontend/src/composables/useOnScreenKeyboard.js`                                                                                           |
|  10 | **Idle timer hygiene.** Replace the 100 ms reboot-combo interval with keydown/keyup tracking + a timeout only while both keys are held; lengthen photo rotation (or rotate only when visible); skip config re-application when the payload is unchanged. | Removes 300 wakeups/30 s; removes the 0.74–0.96 s photo spike every 30 s; removes the 30 s full-config re-render (13 updates).                         | Low                                                                | `frontend/src/components/KeyboardHandler.vue:216`, `frontend/src/components/PhotoSlideshow.vue:265`, `frontend/src/views/Dashboard.vue:545`, `frontend/src/stores/config.js:340-380`                                         |

Not in the top 10 but visible in the data: event formatting (`useEventHelpers.js:35`
and `:55`) costs 22–35 ms per calendar switch; caching formatted event strings per
event/time-format would remove most of it. The menu's popover placement does two
`getBoundingClientRect` reads (`usePopoverPlacement.js:48`); one is avoidable.

## Would a "low-power screen" setting help?

**Yes.** The measurements show the dashboard's per-interaction cost is dominated
by decorative paint, not application JS (tap: 8 ms app JS vs 570 ms native
program). A per-screen preset can remove most of that paint without touching the
data model.

It should switch off:

- **Loading light** → `off` (or `pulse`): removes the 22-bead comet with three
  box-shadow layers and `offset-path` animation on the app frame and each region.
- **Focus light** → `off`, and **dim others** → `false`: removes the 68 px
  four-layer glow and the `filter: saturate() brightness()` transition on every
  non-active region.
- **Photo backdrop** → force `fill` (or a new "no backdrop" option): removes the
  second full-size layer and the 28 px blur.
- **Photo rotation** → 5–15 min, or only while the screen is awake: removes the
  0.74–0.96 s spike every 30 s.
- **On-screen keyboard** → `off` on kiosks that use a remote/keyboard, and/or
  lazy-load it so `simple-keyboard` is not in the initial graph.
- **Decorative motion** → a `data-low-power` class (or reusing the
  `prefers-reduced-motion` rules) that sets `animation: none`, `transition: none`,
  `filter: none`, `backdrop-filter: none` for non-essential chrome.
- **Clock seconds** → keep off (already the default); if on, it re-renders the
  clock every second.

It will **not** fix:

- the 1.22 MB initial JS / 630 kB settings + 378 kB plugins chunks (fixes 3–4);
- the calendar's forced layout and event formatting (fix 6);
- the full-config write that re-renders unrelated regions (fix 5);
- the 12 MP photo decode unless photos are also resized (fix 1).

A low-power preset is therefore a useful **mitigation** (estimated 40–60 % of the
tap/page-switch paint cost and most of the photo cost if combined with resized
photos), but not a substitute for the bundle, photo-resize and focus-light code
fixes.

## Other findings / follow-ups

- **The photo next/previous buttons are under the image for hit-testing.**
  Playwright's click on `.photo-slideshow [data-action="next"]` is intercepted by
  `img.photo-image`: the header overlay and the photo both use
  `--z-raised`, and the photo is later in the DOM. The profiling script drives
  the handler directly, but a real tap on the arrow may do nothing. This looks
  like a real hit-testing defect worth a separate issue with a small
  z-index/stacking fix in `DashboardPanel.vue`/`PhotoSlideshow.vue`.
- **The unauthenticated Settings lock screen crashes the production renderer in
  this harness** (`#auth-signin-password` never appears; the target crashes).
  The existing e2e OSK spec runs against the dev server and passes, so this may
  be a production-build/harness interaction rather than a user-facing bug; it was
  not investigated further in this measurement task.
- **`simple-keyboard` and `vuedraggable` are in the initial graph** (43.7 ms and
  14.3 ms of self time) even though the dashboard does not use them. This is part
  of fixes 3, 4 and 9.
- **`configPollInterval` is 30 s** and each poll replaces the whole config
  payload, causing 13 component updates in an otherwise idle window. If the
  payload is unchanged, skip the reactive write.
