# Setting up what each screen shows

Status: spec. Mockup: [mocks/screens-setup/screens-setup.html](mocks/screens-setup/screens-setup.html), PNGs
`mocks/screens-setup/png/s1.png` … `s3.png`. Builds on the settings audit
([2026-10-30-settings-copy-audit.md](2026-10-30-settings-copy-audit.md)) and the CLV-17 reorg
([2026-10-29-settings-categories-reorg.md](2026-10-29-settings-categories-reorg.md)). The preview-orientation bug is
fixed separately in PR #155.

## 1. The job, and how it goes today

The job: *"The kitchen screen shows the calendar page, the hallway one shows photos and is mounted in portrait."*

Today that takes four places:

| Step | Where |
|---|---|
| Design the layouts | Dashboard › Screens & regions › **Open editor** (modal) |
| Check how it looks on the hallway Pi | Same editor, **Preview as** (until #155, it ignored the kiosk's rotation) |
| Choose which layouts each Pi shows, and its start layout | Kiosks › select card › **{id} — Content** |
| Set portrait, upside down, rotate output | Kiosks › **Display hardware** (drawer) for one Pi, or Screen & keyboard › Screen orientation for "everyone" |
| Power schedule, idle off, touch, keyboard | Screen & keyboard for everyone; Kiosks for one Pi (schedule and keyboard only) |
| Room name in the clock bar | Dashboard › Appearance › Display name (one name for every Pi) |

The editor itself is solid. The problems are around it.

## 2. Findings

1. **"Screen" means two different things.** "Screens & regions", "Screens shown", "Default screen" and the editor's
   "This screen" mean a *dashboard layout*. "Screen & keyboard", "Screen power", "Screen timeout" and the audit's
   **This screen** / **Same as all screens** mean a *physical display*. On the Kiosks page, both meanings sit in
   adjacent rows ("Screens shown" just above "Same as all screens").
2. **One Pi's settings are split across three categories.** Physical defaults live in Screen & keyboard, per-Pi
   exceptions in Kiosks, and the room name in Dashboard. The same row (Orientation, Power schedule) appears in two
   categories, with nothing linking them.
3. **The editor doesn't know about the Pis.**
   - Its tabs don't say which Pi shows which layout.
   - The "isn't set to show" warning says "assign it in Kiosks", but that word isn't a link (`<span class="link">`).
   - The preview is always 5:3 or 3:5, whatever the Pi's real screen is (800×480 and 1080×1920 look very different).
   - **Upside down** turns the preview upside down. On the real screen the picture is the right way up: that's the
     point of the setting.
4. **The Kiosks page doesn't show the layouts.** "Screens shown" is a row of name chips. You can't see what a Pi will
   look like, and the "add more screens" hint points to another category in plain text.
5. **Pis have no name of their own.** A card shows the install id (`hall-pi`) and hostname. The room name that
   would identify it ("Hallway") is one global value.
6. **Its own vocabulary:** "‹inherited from global›", "Reset content to global", "Global default".

## 3. Proposal

### 3.1 Words (owner decision A)

- A dashboard layout is a **page**: "Pages & regions", "Pages shown", "Start page", the editor's **Page** inspector.
- A physical display is a **screen**, as in the audit. "Kiosk" stays only where it's about installing the Pi
  software ("Add a screen" → the Raspberry Pi kiosk install steps).
- Config keys don't change (`dashboardScreens`, `availableScreens`, `defaultScreenId`); only UI copy and docs do.

### 3.2 One place per screen (owner decision B)

**Kiosks and Screen & keyboard merge into one category, Screens** (📺, subtitle "Pages · rotation · power ·
touch"). That makes 6 categories: Content · Dashboard · Screens · Plugins · System · Security.

The Screens category (mock S1):
- **All screens** card first: the shared settings every screen uses unless it has its own. Today's Screen & keyboard
  rows split by what they're about (decision C):
  - **here, things about the screen itself:** orientation, upside down, rotate output; power schedule, turn off when
    idle, reboot combo (it restarts the Pi, so it sits under Power); touchscreen, on-screen keyboard, keyboard
    layout (how text is typed *on this screen*, and per-screen per CLV-21/27);
  - **to Dashboard, things about operating the dashboard:** Remote & buttons (button bindings) and key-press
    feedback move to a Dashboard section **Focus & remote**, next to Focus light and Dim other regions. Those rows
    only matter to someone driving the dashboard with a remote or arrow keys, and the focus light is what those
    buttons move. They're the same on every screen, and no screen overrides them.
- Then one card per screen:
  - its **name** (§3.3) and the id in `--font-data` `--ink-3`;
  - online/offline;
  - a **thumbnail of its start page**, drawn in its own orientation (the editor's region boxes at 96px, no live content);
  - a one-line summary, e.g. **2 pages · portrait · off 23:00–06:30**;
  - the kiosk software line (CLV-19, unchanged).
- **+ Add a screen** (today's AddKioskPanel).

Selecting a card opens **that screen's page** (mock S2). It's a sub-view with a back link **‹ Screens**, not more
sections stacked under the list. On a phone the list hides; on a kiosk width it's a two-pane layout (list 320px,
detail the rest). Sections:
1. **Name**: one field, **Name**, description **Shown in this screen's clock bar.** It writes the override
   `displayName` (§3.3).
2. **Pages**:
   - the pages as a list of thumbnails (same 96px drawing), each with a checkbox **Show** and a radio **Start here**;
   - button **Edit pages**, which opens the editor previewing this screen (§3.4);
   - with one page only: **Only one page so far.** + **Edit pages** (replaces the plain-text hint).
3. **Display**:
   - Orientation, Upside down, Rotate the screen output;
   - a live 160px preview of the start page in this orientation beside them, which updates as you change them.
4. **Power**: Screen on/off schedule, Turn off when idle.
5. **Touch & keyboard**: Touchscreen (once audit §2 lands), On-screen keyboard (CLV-27).
6. **Software**: kiosk software version and Update (CLV-19 card actions, moved here from the list card's
   second row).

Every row in 1–5 uses the audit §3.5 pattern: **Same as all screens** (`--ink-3`), or **Only this screen** (`--ink`,
600) followed on the same description line by ` · ` and the text button **Use the shared setting**. The control
stays alone on the right, so the row fits at 50% width. The per-section "Reset … to global" buttons go away.

Search (`settingsRegistry.js`): the `device-*` and `kiosks*` destinations move under `screens`, with the old ids
aliased like CLV-17 did (`device` → `screens`, `kiosks` → `screens`), so deep links and phone QR codes keep working.

### 3.3 A screen's name is its room name

`displayName` is already a config key and kiosks already get merged config. A screen's **Name** is just that key in
its overrides:
- The Screens card, the editor's preview picker and the clock bar on that Pi all show it.
- With no override, the card falls back to the hostname, then the id.
- Dashboard › Appearance › **Room name** stays as the shared name for any browser that isn't a known screen.

### 3.4 The editor knows the screens (mock S3)

- **Preview on** (renamed from "Preview as"): options are **Any browser** (the shared settings) and then each screen
  by name. It opens preselected:
  - on a kiosk → that kiosk;
  - from a screen's **Edit pages** → that screen;
  - otherwise → Any browser.
- **Orientation and size come from the screen.**
  - Orientation and upside down come from its overrides (#155).
  - The device's aspect ratio comes from the screen's reported viewport (§4). Without a report, use 16:9 (or 9:16
    in portrait).
  - The badge reads e.g. **Portrait · 1080×1920 · mounted upside down**. **Upside down no longer rotates the
    preview**: the badge only says it.
  - With **Any browser**, a two-option toggle **Landscape · Portrait** previews either orientation without saving.
- **Page tabs show their screens.**
  - Under each tab name, a `--fs-xs` `--ink-3` line: **Kitchen · Hallway**, **All screens**, or **Not on any screen**.
  - While previewing a screen, tabs it doesn't show are drawn at 50% opacity.
- **The mismatch banner works.** "Hallway doesn't show "Photos"." + button **Show it on Hallway**, which adds the
  page to that screen's `availableScreens` override (GET, merge, PUT) and dismisses the banner. The plain-text
  "Kiosks" is gone.
- The note under the stage stays: **Previewing on Hallway · edits change the shared "Photos" page.** Pages are shared;
  only which pages a screen shows is per screen.

## 4. Data needed

- **Viewport report:** the kiosk frontend adds `vw`/`vh` (`window.innerWidth/innerHeight` at load and on resize,
  debounced 2s) to its existing kiosk config fetch (`configPath()`). The registry stores `viewport: {w, h}` on
  `KioskDB` (new nullable JSON column, Alembic migration) and returns it in `GET /kiosks`.
- **Overrides in the list:** `GET /kiosks` also returns each kiosk's `overrides`. The list then renders names,
  thumbnails and summaries without N extra requests, and the editor (#155) can read them without a fetch.
  Override payloads are already size-capped. Agent-only keys (the update flag) are stripped.

## 5. Phasing

1. **Builder integration** (§3.4 + §4), the page/screen wording (decision A), and §3.3 names. No category change.
   This fixes the job's worst step: you see what each screen will really show.
2. **Screens category** (decision B, §3.2): moves rows, adds the sub-view, aliases ids.

Phase 1 is useful on its own. Phase 2 only moves things.

## 6. Owner decisions

Approved 2026-10-30: A and B. C is a follow-up to the owner's question "should keyboard really be there?".

- **A. Rename dashboard "screens" to "pages" in the UI** (keys unchanged). Recommended: it ends the double meaning
  at its source.
- **B. Merge Kiosks + Screen & keyboard into one Screens category** (7 → 6) with an "All screens" card and a page per
  screen. Recommended: one Pi's settings end up in one place.
- **C. Keyboard placement** (§3.2): the on-screen keyboard and its layout stay with Screens; remote buttons and
  key-press feedback go to Dashboard › Focus & remote; the reboot combo goes under Screens › Power.

## 7. For CLV-31 (audit build, in flight)

Phase 2 waits for CLV-31. To avoid redoing its work, CLV-31 should:
- **Use "page" for layouts in any string it touches** (decision A). For example, the audit's Orientation description
  becomes **Which way the screen is mounted. Pages & regions decides how regions stack.**, and "Screens shown" /
  "Default screen" become **Pages shown** / **Start page**.
- **Use "Only this screen", not "Only this kiosk"**, for the audit §3.5 override label. The rest of §3.5 is unchanged
  (**Same as all screens**, **Use the shared setting**). Kiosk section titles use the name from §3.3 when it's
  set, otherwise the id: `{name} · Screen on/off schedule`.
- **Leave rows where they are.** Don't move Touchscreen, Remote & buttons or key-press feedback between categories;
  phase 2 does that (§3.2, decision C). The audit's Dashboard split (**Controls** / **Touch & focus**) stays as specced.
  Phase 2 then renames Touch & focus to **Focus & remote** when Touchscreen leaves and the remote rows arrive.

## 8. Tests (vitest), phase 1

- Preview on:
  - preselects the kiosk on a kiosk, and the screen from **Edit pages**;
  - uses the screen's orientation and viewport ratio, falling back to 16:9 / 9:16;
  - upside down shows in the badge and doesn't rotate the device;
  - with **Any browser**, the Landscape · Portrait toggle changes the preview and writes nothing.
- Page tabs: the screens line for each case (named screens, all, none), and dimming while previewing a screen.
- Mismatch: **Show it on Hallway** PUTs merged overrides with the page added and the banner disappears; a failed
  PUT keeps the banner and shows **Couldn't update Hallway. Try again.**
- Names: the card, the picker and the clock bar show the override `displayName`; the fallback order is hostname,
  then id.
- Backend: the config fetch with `vw`/`vh` stores the viewport; `GET /kiosks` returns `viewport` and `overrides`
  without agent-only keys; the migration upgrades and downgrades.
- Copy: no "‹inherited from global›", "Global default" or "Reset … to global" left in Settings.
