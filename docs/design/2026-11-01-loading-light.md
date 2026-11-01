# Loading light: one engine, swappable indicators

Status: spec (owner agreed 2026-11-01). Frontend only. Builds on `stores/progress.js` and `PerimeterProgress.vue`
(commit 105d4f93). Today the comet only runs for the calendar's background refresh
(`Dashboard.vue` → `progressStore.begin("calendar")`).

## 1. Model

Two layers:

1. **Progress engine** (`stores/progress.js`, one implementation): decides **what** is loading, **where** and
   **when** the light shows. Every indicator style behaves identically because the engine owns timing.
2. **Indicator** (swappable): draws the light in a frame. It knows nothing about sources.

## 2. Engine

API (extends today's `begin`/`end`, keyed per source):

```js
begin(sourceId, { regionId = null }) // regionId → region frame; null → app frame
end(sourceId)
```

- **Scope:**
  - a source with a `regionId` lights **that region's frame**, on the same path as its focus glow. If the region is
    focused, the light travels on top of the glow;
  - a source without one lights the **app frame** (the whole dashboard perimeter);
  - **2 or more regions loading at once → one app-frame light** instead of several region lights.
- **Timing** (constants in the store, tested):

| Rule | Value |
|---|---|
| Show only if still loading after | **400 ms** |
| Once shown, visible at least | **800 ms** |
| End after the last active source in that frame | **+300 ms** |
| Fade in / out | 450 ms (today) |
| Hard stop per source (a stuck fetch never spins forever) | **60 s**, then `end` + `logError` |

- **Sources that drive it:**
  - first load after a page load, until the dashboard has content (app);
  - **Reload UI** and a service-worker update, from the tap until the new page is up (app, on any view);
  - calendar, photo-source and plugin data fetches, foreground or background (region when the source belongs to one
    region, otherwise app);
  - clock-bar and status plugins (app).
- **Never drives it:**
  - the `/health` check and the connection backoff (`ConnectionStatus` owns those);
  - config polling and clock ticks;
  - photo rotation from cache and prefetching the next photo;
  - SSE keepalives.
- **Failure:** a failing source ends its progress. The region's own state or `ConnectionStatus` then speaks.

## 3. Indicators

Contract: a component receiving `{ active: boolean, frame: "app" | HTMLElement, reducedMotion: boolean }`. It draws
inside that frame's border box only, with `aria-hidden="true"` and `pointer-events: none`, at `--z-raised` above
region content.

| Style | Look | Notes |
|---|---|---|
| **Comet** (default) | today's bead-train orbit (`--orbit-duration` 3.8s), focus-light tokens | Calvin's identity |
| **Pulse** | today's slow frame pulse (2.4s), low opacity | **forced when `prefers-reduced-motion: reduce`**, whatever the setting |
| **Off** | nothing | errors, empty states and the connection pill still show, so a stuck load is never hidden |

`PerimeterProgress.vue` splits into `LoadingLight.vue` (engine-facing: picks the style, mounts one per active frame)
plus `indicators/Comet.vue` and `indicators/Pulse.vue`. Region frames reuse the region's existing focus-glow
geometry (`DashboardPanel` / `FocusPanel`), so the light follows the panel radius.

## 4. Setting

Dashboard › Focus & remote › **Loading light**: SegmentedControl **Comet · Pulse · Off**.
- Description: **What Calvin shows while it's fetching something.** When the device prefers reduced motion, a
  second line reads **This device prefers less motion, so it pulses.**
- Per screen ("Same as Default" / "Changed here · Reset to default", default-screen model). Config key `loadingLight`
  (`comet` | `pulse` | `off`), default `comet`.

## 5. Replaces / keeps

- **Replaces:** the region loading spinners in `CalendarView.vue` and `WebServiceViewer.vue` (background refresh, and
  first load when cached content is shown), and any remaining refresh spinner in the clock bar.
- **Keeps:**
  - empty and "nothing configured" states (the light means *working*, an empty state means *nothing set up*);
  - button loading labels ("Saving…") for actions you started;
  - Settings and phone views have no light except the app light for Reload UI / service-worker update.

## 6. Not now

- Indicators from plugins or themes: the contract allows it later, but third-party animation on a wall display is a
  performance and accessibility risk.
- Different styles per region (one style per screen keeps it calm).
- A determinate bar: background fetches have no real percentage.

## 7. Tests (vitest)

- Engine timing with fake timers:
  - < 400 ms: never shown;
  - 450 ms: shown for ≥ 800 ms;
  - back-to-back sources within 300 ms: one continuous light;
  - 60 s cap ends the source and logs.
- Scope: a regionId source lights that region; a regionless source lights the app; 2 regions promote to one app light.
- Excluded sources (health, polling, rotation) never call `begin` (spy on the store from those modules).
- Style: the setting picks Comet / Pulse / Off; reduced motion forces Pulse; Off renders nothing while the
  connection pill still appears on failure.
- Reload UI / service-worker update shows the app light on the Settings view too.
- Spinners removed: no spinner element in CalendarView / WebServiceViewer during a refresh.
