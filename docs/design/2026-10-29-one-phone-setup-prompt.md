# One phone-setup prompt on the dashboard (CLV-20)

Status: spec. Mockup: [mocks/clv-20/clv-20.html](mocks/clv-20/clv-20.html), PNGs in
[mocks/clv-20/png/](mocks/clv-20/png/) (`p1.png` … `p4.png`). Frontend only.

## 1. Problem and recommendation

Today every empty region renders `EmptyState` (`frontend/src/components/ui/EmptyState.vue`), and on touch
each one embeds its own `PhoneSetupCard` (`EmptyState.vue:15`). On the default dashboard, calendar and photos
are both empty, so the screen shows two (or three) QR codes that say the same thing.

**Recommendation: unify it, but not as one blocking overlay in every case.** Two modes, chosen from what the
screen shows:

1. **Welcome (first run): every content region on the screen is empty.** One non-modal **welcome card**
   centred over the dashboard owns the phone hand-off: a short checklist of what's missing, one QR and
   **Not now**. Regions behind it shrink to one quiet "what's missing" line.
2. **Gaps (later): some regions have content.** No card covers real content. Empty regions keep their
   normal empty state (message, help, button), but **the QR appears once per screen**, in the largest empty
   region, deep-linked to the missing thing when only one is missing.

Why not a single overlay always? Later, the screen is mostly working content. A card over it would hide
the calendar to report one missing photo source. An in-region prompt says the same thing exactly where the
gap is.

## 2. Definitions

- **Content region:** a region of the active dashboard screen whose kind is calendar, photos or service.
  Clock bar and plugin status items don't count.
- **Setup-empty:** a region showing its *setup* empty state, meaning nothing is configured:
  - calendar: "No calendars yet" (`CalendarView.vue:83`)
  - photos: "No photos yet" (`PhotoSlideshow.vue:63`)
  - service: "No web services yet", renamed **No web pages yet** below (`WebServiceViewer.vue:173`)
  
  **Not** setup-empty: loading, offline/stale, "service unavailable", or "no events this week". Those keep
  their own states and never trigger a prompt.
- **Mode:** `welcome` when every content region on the active screen is setup-empty and the card hasn't been
  dismissed on this device (§5). `gaps` when at least one region is setup-empty otherwise. `none` when
  nothing is missing.
- **Phone hand-off shown** = `useTouchCapability().isTouch && viewport width ≥ 720px` (the same rule as
  CLV-9's lock screen). Phones and laptops never see a QR: they can already type.

## 3. Architecture

- New composable `useSetupPrompt()` (`frontend/src/composables/useSetupPrompt.js`), module-level state:
  - `report(regionKey, { kind, settingId, area })` / `clear(regionKey)`, called by `EmptyState` when it renders
    a setup empty state (new prop `setup: true` on the three call sites above) and on unmount. `area` is the
    region's pixel area from a `ResizeObserver` on the EmptyState root.
  - `contentRegionCount`, set by `LayoutManager` from the active screen's layout.
  - Computed `mode`, `missing` (kinds in layout order), `qrOwner` (regionKey with the largest area, ties →
    first in layout order) and `qrSettingId` (the single missing kind's settingId, else `null` → `/settings`,
    which lands on Content since CLV-17).
- New component `SetupWelcomeCard.vue` (`frontend/src/components/dashboard/`), mounted once in
  `LayoutManager.vue` and shown when `mode === "welcome"`.
- `EmptyState` changes:
  - `showPhone` becomes `isTouchHandoff && mode === "gaps" && qrOwner === myKey`, so the QR shows once per screen.
  - In `welcome` mode, render **quiet** (§4.3).
  - QR deep link = `qrSettingId` (not the region's own settingId), so it is correct when several are missing.
- Fix while here: `WebServiceViewer.vue:176-180` still says "No web services yet" / "Add a web service" /
  `plugins-services` from before CLV-17. It becomes **No web pages yet** / **Add a web page** /
  `content-services`, matching CLV-17's names. Its help line is already current and stays.

Settings ids: calendar `content-calendars`, photos `content-images`, service `content-services`.

## 4. Screens and states

### 4.1 Welcome card (mode `welcome`), P1, P3, P4

**Container:** `position: absolute`, centred in the dashboard area **below the clock bar**, z above the regions
but **no scrim**, and not modal. The clock bar, ⋯ menu and keyboard shortcuts keep working.
`width: min(46rem, calc(100% - 32px))`, `padding: 1.75rem`, `background: var(--bg-1)`,
`border: 1px solid var(--line)`, `border-radius: 16px`, `box-shadow: 0 18px 50px -16px var(--shadow-hover)`.
`role="region"`, `aria-labelledby` = its title. It takes no focus on appear.

**Layout:** a 2-column grid (`1fr auto`, gap 28px) when the phone hand-off is shown; otherwise 1 column.

Left column:
- Title `<h2>` (`--fs-xl`, 600): **Let's set up Calvin**
- Lead (`0.95rem`, `--ink-2`):
  - with hand-off: **Add what this screen shows. Typing is easier on your phone.**
  - without: **Add what this screen shows.**
- Checklist (bordered list, `--line` 1px, radius 12px, rows ≥ 3.5rem, `--line-soft` dividers). One row per
  content kind **present on this screen**, in layout order:
  - **Calendars** / **Photos** / **Web pages**, each with the sub-line **Not added yet** (`--fs-xs`, `--ink-3`).
  - Button: **Add here** on a touch kiosk, **Add** elsewhere (`.btn`; on phone width the first row's button is
    `.btn--primary`). It routes to `/settings?setting=<settingId>` (the CLV-9 lock screen shows first if needed).
  - A kind that gets configured while the card is open: its row shows **✓ Added** (`--ok`, `--fs-sm`) in place
    of the button. When all rows are added, the regions have content, so mode becomes `none` and the card
    fades out (200ms, none under reduced motion).
- **Not now** (ghost button: no border, `--ink-2`), below the list. See §5.

Right column (only with the phone hand-off), 15rem wide:
- QR 180px (white plate, 8px radius), for `settingsLink(serverUrl, qrSettingId)` (`utils/serverUrl.js`).
- **Set it up from your phone** (600), hint **Scan the code or open this address on the same network.**
  (`--fs-sm`, `--ink-2`), then the URL (`--font-data`, 0.78rem, `overflow-wrap: anywhere`).
- While `auth.status === "setup"` (no admin password yet, CLV-9): a line under a `--line-soft` rule,
  **Your phone asks you to choose an admin password first.** (`--fs-xs`, `--ink-2`).
- Implement this column by extending `PhoneSetupCard` with a `stacked` variant (QR above text, no border, no
  background), not by copying it.

**Fit rules (800×480, P3):** when the dashboard area is under 520px tall, drop the lead, the sub-lines and the
QR hint, use QR 132px, title **Let's set up Calvin**, and change the phone title to **Or use your phone**.
`padding: 1.1rem 1.25rem`, `gap: 18px`, `width: calc(100% - 24px)`.

**Phone width (< 480px, P4):** 1 column, docked at the bottom (`bottom: 16px`), no QR, buttons **Add**.

### 4.2 Gaps mode (P2)

- Each setup-empty region shows today's `EmptyState`: message, help and the action button.
- **Exactly one** of them, the `qrOwner`, also shows the compact `PhoneSetupCard` (132px QR), with the hint
  shortened to **Typing is easier there.** and the URL for `qrSettingId`.
- If the owner region is too small for the QR (the existing `@container (max-height: 360px)` rule hides it),
  the QR moves to the next-largest empty region that fits. If none fits, there is no QR, and the buttons still work.
- No dismissal in this mode: it isn't intrusive and it disappears once the gap is filled.

### 4.3 Quiet region (behind the welcome card)

`EmptyState` with `quiet`: only the message, in `--ink-3`, 1rem, weight 500. No help, no button, no QR. It stays
legible around the card's edges, so the screen still says what's missing.

### 4.4 Interaction with other phone hand-offs

- **Settings lock screen and AdminSignInDialog (CLV-9)** keep their own QR. They are other surfaces (Settings,
  or a modal over the dashboard). When `AdminSignInDialog` is open over the dashboard, the welcome card stays
  under the scrim. No change there.
- **Settings › "📱 Use your phone"** stays.
- **On-screen keyboard:** the welcome card has no text fields, so it never brings up the keyboard. **Add here**
  opens Settings on the kiosk, where the OSK takes over.
- **Hidden controls** (`showUI` off): the welcome card still shows (it is setup, not chrome), but its buttons are
  hidden and only the QR remains on touch. Without the hand-off it shows the checklist without buttons, plus the
  line **Open Settings on a phone or computer to add these.**

## 5. Dismissal and persistence

- **Not now** hides the welcome card **on this device only**: `localStorage["calvin-setup-welcome-dismissed"] = "1"`
  (try/catch; if storage fails, it hides for this page load only). It is per device because a wall kiosk and
  the phone that set it up shouldn't hide each other's prompts.
- After dismissal, the screen behaves like **gaps** mode: the full empty states return, with one QR per screen.
  The setup path is never lost.
- The flag **clears itself** when the device later sees mode `none` (everything configured), so a fresh empty
  screen (for example, after removing all sources) greets again.
- Not per server, so nothing is written to config and no admin is needed. The dashboard is public (CLV-9 §3).

## 6. Accessibility

- The card is a landmark region, not a dialog: no focus trap and no autofocus. Tab reaches it in DOM order after
  the clock bar.
- Checklist buttons have accessible names **Add calendars**, **Add photos**, **Add web pages** (visible text stays
  short).
- The QR `<img>` has `alt="QR code for {url}"` (existing PhoneSetupCard behaviour), and the URL is selectable text.
- **✓ Added** changes are announced by an `aria-live="polite"` line: **Calendars added.**
- Contrast uses existing token pairs in both themes. The QR keeps its white plate in Backlit.

## 7. Tests (vitest)

- `useSetupPrompt`:
  - `welcome` only when every content region on the screen reports setup-empty;
  - `gaps` with any content present;
  - `none` with nothing missing;
  - `qrOwner` is the largest area, ties go to layout order;
  - `qrSettingId` is the single missing settingId, or `null` with two or more.
- `EmptyState`: renders quiet in welcome; exactly one QR across three empty regions in gaps; the QR is hidden on
  non-touch or < 720px; the QR moves to the next region when the owner is under 360px tall.
- `SetupWelcomeCard`:
  - checklist rows follow the screen's kinds in layout order;
  - **Add here** vs **Add** by device;
  - the routes per settingId;
  - **✓ Added** when a kind gets configured;
  - the admin-password line only while auth is `setup`;
  - the fit rules under 520px; the phone docking.
- Dismissal:
  - **Not now** sets the flag and switches to gaps rendering;
  - the flag clears on mode `none`;
  - a storage exception hides for the page load only.
- `WebServiceViewer`: the new copy and `content-services` deep link.
- Loading, offline and "service unavailable" states never report setup-empty.
