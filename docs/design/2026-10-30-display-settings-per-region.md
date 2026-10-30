# Display settings: household, source or region

Status: spec (owner agreed 2026-10-30). Frontend only. Every display setting gets exactly one home, picked by what
it describes:

| It describes… | Home | Examples |
|---|---|---|
| the household / locale | Content, global | week starts on, weekend days, time format, holidays |
| one source | that source's row (Content) | colour, show times, address, refresh |
| how one region looks | that region, in Pages & regions (and on-dashboard controls) | calendar view, week numbers, events per day, photo fit |

No setting lives in two places. Region settings have no global default layer.

## 1. Calendar

- **Content › Calendar basics** (renamed from Calendar display) keeps: Week starts on, Weekend days, Time format,
  Highlight holidays.
- **Content › Calendars** gets a **Where calendars show** list (§5) instead of a bare pointer.
- **Removed from Content:** Show week numbers, Events per day.
- **Region inspector, calendar section**, after Weeks ahead:
  - **Week numbers**: ToggleSwitch, writes `view.weekNumbers` (already read by `CalendarView.vue`).
  - **Events per day**: SelectPill **Auto · 1 · 2 · 3 · 4 · 6 · 8**, writes `view.maxVisibleEvents` (`null` = Auto).
    **Auto** fits as many event rows as the day cell's measured height allows (row height from the rendered chip;
    at least 1), and shows "+N more" for the rest.
- **On the dashboard**: the calendar's existing view controls (`calendar-header__controls`) get a **⋯** with Week
  numbers on/off. Events per day stays in the editor (it's set once, not toggled).

**Upgrade:** on first load after the change, every calendar region without its own `view.weekNumbers` /
`view.maxVisibleEvents` gets today's global `showWeekNumbers` / `maxVisibleEvents`. Do it once (flag
`displaySettingsMigrated: true` in config), then stop reading the global keys.

## 2. Photos

### 2.1 Smart fit isn't built yet

`PhotoSlideshow.vue` "smart" never measures the region. It assumes every photo region is a ~30% side panel
(`containerAspect` hardcoded to 0.59 landscape / 1.7 portrait). In a full-width region, or in photo-frame
fullscreen on a landscape screen (aspect ~1.78), nearly every photo compares as "wider than 0.59" and gets `cover`.
A portrait photo then shows as a cropped band. Also, **Fill** and **Crop** both render `object-fit: cover`, so they
are the same option.

### 2.2 Smart, for real

- Measure the photo area with a `ResizeObserver`: `containerAspect = width / height`, updated on resize and when
  entering or leaving fullscreen / photo frame.
- Per photo, with `r = imageAspect / containerAspect`:
  - `0.8 ≤ r ≤ 1.25` → **fill** (`cover`): at most ~20% is cropped;
  - otherwise → **whole photo** (`contain`) over a **blurred backdrop**: the same image, `object-fit: cover`,
    `filter: blur(28px) brightness(.55)`, scaled 1.1 to hide blur edges, `aria-hidden`. No black bars.
- `image.width/height` missing → load the image and use its `naturalWidth/naturalHeight`. Until then, show it
  `contain`.
- Reduced data: the backdrop reuses the loaded image (no second request).

### 2.3 Where Fit lives

- **Fit photos** moves to the **region inspector, photos section**: SelectPill **Smart · Whole photo · Fill ·
  Centre** (Crop removed; it was Fill). It writes `view.fit`; missing = Smart. **Whole photo** also gets the blurred
  backdrop.
- Photo frame (fullscreen when idle) always uses Smart: it's a different shape from any region.
- **Stays in Content › Photos** (they're about the collection's rhythm, and photo frame uses them too): Show each
  photo for, Shuffle photos, Photo frame when idle, Start after.
- Upgrade: copy the global `imageDisplayMode` into each photos region's `view.fit` once (same flag). `crop` →
  `fill`.

## 3. Content stays the hub (§5 applies to every kind)

Content loses three rows (week numbers, events per day, photo fit) and gains a view of *where* each kind shows.
Content answers "what Calvin shows, and where"; the editor answers "how this region looks". So Content isn't
downgraded: it becomes the place you start, and every look setting is one tap away from it.

## 4. Web pages & apps, and the clock bar

No moves. **When tapped** is already per region. Address, zoom and refresh are per source. The clock bar's show and
position are already per page, and its look stays global.

## 5. "Where it shows" in each Content section

Under the source list of Calendars, Photos and Web pages & apps, a compact list headed **Where {kind} show**
(`--fs-sm`, 600):
- One line per region of that kind, across all pages: **{page} · {region label}**, then a summary of its look in
  `--ink-2`:
  - Calendars: **Month · week numbers · Auto events** / **Agenda, 7 days**;
  - Photos: **Smart fit**;
  - Web pages & apps: the source name.
  It also lists which sources the region shows when it doesn't show all of them: **Family, School**.
- Each line is a button (≥ 44px) that opens Pages & regions on that page with that region selected.
- None: **Not on any page yet.** + **Put it on a page** (the place mode from the content & plugins spec §3.6).
- For Web pages & apps, this replaces nothing: the per-row placement line (content & plugins §3.6) stays, and this
  list is the region view of the same thing.

## 6. Tests (vitest)

- Content › Calendar basics has no week-number or events-per-day rows.
- Where it shows: one line per region of the kind with its look summary and source filter; a tap opens the editor
  with that region selected; none → **Put it on a page**.
- The region inspector writes `view.weekNumbers` and `view.maxVisibleEvents`. Auto fits the rows to the cell height
  (mock height → count) and shows "+N more".
- The on-dashboard ⋯ toggles week numbers for that region only.
- Migration copies the globals into regions without their own values, runs once (flag), and maps `crop` → `fill`.
- Smart fit:
  - a 16:9 container with a 3:2 photo → fill;
  - a 16:9 container with a 2:3 photo → contain plus backdrop;
  - a 9:16 container with a 16:9 photo → contain plus backdrop;
  - a resize recomputes it;
  - missing dimensions fall back to `naturalWidth/Height`.
- Fit options: no Crop; Whole photo renders the backdrop; photo frame uses Smart whatever the region's fit is.
