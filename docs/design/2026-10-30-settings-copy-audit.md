# Settings copy and knobs audit

Status: spec. Mockup: [mocks/settings-copy/settings-copy.html](mocks/settings-copy/settings-copy.html), PNGs
`mocks/settings-copy/png/c1.png`, `c2.png`. Frontend only, except §2 (scope), which needs an owner decision.

Every `SettingRow`, section and option label in Settings was read against what the code actually does.
Category structure (CLV-17) stays. This is about the words and the knobs inside it.

## 1. Findings, worst first

1. **You can't tell which screens a setting changes.** Almost every knob is saved on the server and applies to
   every screen, but several say "this device", "this Pi" or "the Pi's timezone". *Touchscreen* says "Whether this
   device is treated as a touchscreen" and then forces touch on every kiosk, phone and laptop. *Settings UI size*
   scales Settings on the phone and the wall alike. This is what caused the photos-fullscreen trap (PR #149).
2. **Some descriptions are wrong.**
   - *Photo-frame timeout*: "Seconds before the photo frame advances." It is actually the idle time before photo-frame
     mode starts (`usePhotoFrameMode.js`). The slider also defaults to 60 while the store defaults to 300.
   - *Display name*: "shown in the title bar". It's shown in the clock bar.
   - *Auto-hide delay*: "the mode indicator". The section is about key-press feedback.
3. **Engineer words.** "Origins", "statusbar items", "Config polling interval", "Backend/Frontend version",
   "Horizontal/Vertical layout" (meaning top/bottom vs side bars), "Apply display rotation … OS display output",
   "‹inherited from global›".
4. **Redundant or half-knobs.**
   - *Screen timeout* toggle + *Timeout* "(0 = never)": two ways to say off.
   - *Theme mode* "Auto" vs "Time": you can't tell which one follows the clock.
   - *Dark mode start/end (hour)*: number inputs taking 0–23.
5. **Things a family member should never meet sit next to things they use daily.** Repository, Branch, Log level,
   Config polling interval and Console logging sit in the open in System.
6. **Similar names for different things.** "Keyboard" (on-screen keyboard) vs "Button bindings" (remote) vs
   "Key-press feedback". "Photo-frame mode" vs photos "Fullscreen". "Power schedule" (Screen & keyboard) vs
   "Display schedule" (Kiosks).

## 2. Scope: say where a setting applies (owner decision)

**Every row says who it affects**, using one rule, not ad-hoc copy:

- Default (no marker): **all screens**. That's most settings, so no noise.
- A row that applies only to the browser you're holding gets a scope chip after the label: **This screen**
  (`--fs-xs`, `--ink-2`, 1px `--line` border, `--radius-sm`, padding 0 6px). Its description never repeats "this
  device".
- A row a kiosk can override keeps the Kiosks pattern, with new copy (§3.5).

**Decision needed (gate):** move the two settings that are obviously per-screen from server config to the
browser (`localStorage`, try/catch, same pattern as `calvin-osk-layout`):

| Setting | Today | Proposed | Why |
|---|---|---|---|
| Touchscreen (`touchControls`) | server, all screens | **This screen** (`calvin-touch-controls`) | A mouse PC and a wall panel need opposite answers |
| Settings text size (`uiSize`) | server, all screens | **This screen** (`calvin-ui-size`) | A phone and a 7" panel need opposite answers |

On first load after the change, a browser with no local value starts from the old server value, so nothing
visibly changes on upgrade. The server key is then only that seed. Everything else stays server-wide.

**Recommendation: yes.** Without it, the copy in §3 has to keep warning "applies to every screen", which is the
problem we're fixing.

## 3. Copy changes, by category

Verbatim. Unlisted rows stay as they are. "—" = no description.

### 3.1 Content

| Row | Label now → new | Description new |
|---|---|---|
| Max visible events | **Events per day** | How many events fit in one day before it shows "+N more". |
| Highlight holidays | (same) | Marks public holidays on the calendar. |
| Show week numbers | (same) | Shows the week number at the start of each week. |
| Rotation interval | **Show each photo for** | — (the slider shows the unit, e.g. "30 s") |
| Image display mode | **Fit photos** | How a photo fills its space. |
| | options **Smart · Whole photo · Fill · Crop · Centre** | Smart picks Whole photo or Fill per photo. (shown as hint only when Smart is selected) |
| Randomize image order | **Shuffle photos** | — |
| Photo-frame mode | **Photo frame when idle** | After a while with no touches or key presses, photos go full screen. Any touch brings the dashboard back. |
| Photo-frame timeout | **Start after** | — . SelectPill: 1, 2, 5, 10, 15, 30 min. Default **5 min** (matches the store's 300 s; fix the `|| 60` fallback). |
| Refresh interval (calendars) | **Check for new events every** | — (5–120 min on the control) |

### 3.2 Dashboard

| Row | Label now → new | Description new |
|---|---|---|
| Theme | (same) | — |
| Theme mode | **Light or dark** | options **Light · Dark · Follow device · On a schedule** |
| Dark mode start/end (hour) | one row **Dark from** with two time pickers "{20:00} to {07:00}" (`<input type="time" step="3600">`, whole hours) | — |
| Typeface | **Font** | — |
| Settings UI size | **Settings text size** + **This screen** chip (§2) | Only changes Settings. The dashboard has its own size below. |
| Display name | **Room name** | Shown in the clock bar, e.g. "Kitchen". |
| Hide controls in kiosk mode | **Hide controls** | Hides the ⋯ menu and region headers for a calm wall display. |
| Keep clock bar visible | **Keep the clock bar when hidden** | — |
| Focus light | (same) | Outlines the region the remote or arrow keys will act on. |
| | options **Always · Only while controls show · Off** | |
| Dim other regions | (same) | Dims the rest while the focus light is on. |
| Reveal corner | **Show-controls corner** | Press and hold this corner to bring hidden controls back. |
| Reveal corner opacity | **Corner visibility** | At 0 it's invisible but still works. |
| Reveal corner size | **Corner size** | — |
| Reveal hold time | **Hold for** | — |
| Tap anywhere to show controls | (same) | A tap on calendar or photos brings controls back. |
| Touchscreen | (same) + **This screen** chip (§2) | Shows touch buttons: arrows, screen dots, the ✕ in fullscreen. Auto works for most screens; choose On if a touch panel acts like a mouse. |
| | options **Auto · On · Off** | |
| Dashboard size | (same) | Size of labels and touch buttons on the dashboard. |

Section **Touch & controls** is split in two (mock C1):
- **Controls**: Hide controls, Keep the clock bar when hidden, Show-controls corner, Corner visibility, Corner size,
  Hold for, Tap anywhere. The four corner rows show only while **Hide controls** is on (today they show always).
- **Touch & focus**: Touchscreen, Dashboard size, Focus light, Dim other regions.

Clock bar:

| Row | Label now → new | Description new |
|---|---|---|
| Show seconds | (same) | — |
| Show Calvin logo | (same) | — |
| Show plugin items | **Show plugin info** | Weather and other plugin readouts. Turn each on in its own settings. |
| Horizontal layout / sizing | **Top or bottom bar** / **Top or bottom bar size** | — |
| Vertical layout / sizing | **Side bar** / **Side bar size** | — |

### 3.3 Screen & keyboard

| Row | Label now → new | Description new |
|---|---|---|
| Orientation | (same) | Which way the screen is mounted. Screens & regions decides how regions stack. |
| Flip 180° | **Upside down** | For screens mounted with the cable on top. |
| Apply display rotation | **Rotate the screen output** | On: Calvin turns the Pi's picture itself. Off: leave it to the OS or the screen. |
| Power schedule | **Screen on/off schedule** | Turns the screen off and on at set times. |
| Timezone | (same) | Used by the schedule. **Server's timezone** (option renamed from "System default"). |
| Screen timeout + Timeout | one row **Turn off when idle** with SelectPill **Never · 5 min · 15 min · 30 min · 1 hour · 2 hours** | — |
| Manual control | **Screen now** with buttons **Turn off · Turn on** | — |
| section Keyboard | **On-screen keyboard** | |
| On-screen keyboard | **Show it** | When you tap a text field. Auto shows it on touchscreens. |
| | options **Auto · Always · Never** | |
| section Key-press feedback | moved into **Remote & buttons** (below) | |
| Enable feedback | **Show button presses** | A short label appears when a remote or keyboard button does something. |
| Feedback style | **Label size**, options **Normal · Small** | — |
| Auto-hide delay (s) | **Hide label after** | — |
| Button bindings | (same), section renamed **Remote & buttons** | (same) |

### 3.4 System

| Row | Label now → new | Description new |
|---|---|---|
| Backend version / Frontend version | one row **Version** showing "{backend}" and, only if they differ, "(screen {frontend})" | — |
| System status | (same) | — |
| Reload UI | **Reload this screen** | — (Docker hint unchanged) |
| Every / Keep (backups) | **Back up every** / **Keep the last** | — . Units on the control: "{n} hours", "{n} backups". |
| Repository, Branch | moved into **Advanced** (§4) | |
| Console logging, Log level, Config polling interval | moved into **Advanced** | Config polling: label **Check for setting changes every**, description **How fast other screens pick up a change.** |

### 3.5 Kiosks

| Now | New |
|---|---|
| ‹inherited from global› | **Same as all screens** (`--ink-3`) |
| ‹set for this kiosk› | **Only this kiosk** (`--ink`, 600; orange text fails contrast) + text button **Use the shared setting** |
| `{id} — Display schedule` | `{name} · Screen on/off schedule` |
| Apply rotation | **Rotate the screen output** (match §3.3) |

### 3.6 Security

| Row | New |
|---|---|
| section Allowed origins | **Allowed sites** |
| intro | **Sites this dashboard may show or load from. Everything else is blocked. Use a domain like grafana.lab or \*.lab.example.com, or a full address.** (CIDR line moves to the input's validation error) |
| Sealed mode description | **Only this Calvin server is reachable: no outside embeds, sites or plugins that go online. Calendars, photos and local plugins keep working.** |

## 4. Advanced disclosure

System gets one `CollapsibleSection` **Advanced**, closed by default, last in the category. It holds: Repository,
Branch, Console logging, Log level, Check for setting changes every. Search (`settingsRegistry.js`) still finds
them and opens the section. No other category gets one: hiding more would make search the only way in.

## 5. Copy rules (for every future row)

1. Label = what you'd say out loud: a noun ("Font") or a short verb phrase ("Shuffle photos"). No "Enable".
2. Description only when the label isn't enough. One sentence, ≤ 110 characters, no "this device" (that's the chip).
   No "Controls whether …".
3. Units go on the control ("30 s", "5 min"), never in the label "(s)" or the description.
4. Never describe the code: no "statusbar", "origins", "polling", "backend", "OS output".
5. Use the same word for the same thing everywhere: **screen** (not display), **clock bar**, **plugin**, **web page**.
6. Options are short, parallel words; "Always on" is "Always" when the label already says what's on.

This section is the reference until there is a design README.

## 6. Tests (vitest)

- Snapshot-free text checks: each renamed label and description in §3 renders verbatim (one test per category
  file, table-driven).
- Photo frame: description says idle; the slider default is 5 min when the config value is missing.
- Theme mode: "On a schedule" shows the **Dark from** time pickers; each picker writes a whole hour (0–23) to the
  existing keys.
- Turn off when idle: "Never" writes `displayTimeoutEnabled: false`; any other option writes `true` plus `displayTimeout` in seconds. An existing value not in the list shows as its own option ("{n} min").
- The corner rows show only while **Hide controls** is on.
- Advanced: closed by default; a search hit for "branch" opens it and scrolls to the row.
- Kiosks: inherited rows read "Same as all screens"; **Use the shared setting** removes the override key.
- §2, if approved: Touchscreen and Settings text size read/write `localStorage`, seed once from the server value,
  survive a storage exception (fall back to the server value), and show the **This screen** chip.
