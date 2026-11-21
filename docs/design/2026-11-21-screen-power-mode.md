# Screen power mode (calvin-25g9)

Status: spec. It gates the Settings build for calvin-25g9. Mock:
[mocks/screen-power/index.html](mocks/screen-power/index.html), with frames named P1…D1 and PNGs in
`mocks/screen-power/png/`.

Builds on:
- the owner's decision of 2026-11-21: the open-ended power hold is replaced by a plain choice per screen,
  **Screen power: Schedule · Always on · External**, with a household default on the Default screen page;
- the screen power design ([2026-11-18-screen-power-design.md](../superpowers/specs/2026-11-18-screen-power-design.md)),
  whose hold this replaces;
- the [frontend doctrine](frontend-doctrine.md), the [no-developer-words](2026-10-31-no-developer-words.md)
  rules, the [Default screen](2026-10-30-default-screen.md) override pattern and the
  [kiosk pairing](2026-11-21-kiosk-pairing.md) spec (§3.4 hidden presence, §5 Pair a screen).

The server design ([2026-11-21-screen-power-mode-design.md](../superpowers/specs/2026-11-21-screen-power-mode-design.md))
fixes the behaviour, the config key (`screenPower`: `schedule` | `always_on` | `external`) and the routes. This spec fixes the
layout, the copy, the states, focus and screen-reader behaviour. Copy in **bold** is exact.

## 1. Decisions in one place

1. **The control is a `SegmentedControl` in a stacked `SettingRow`**, label **Screen power**, the first row of
   the Power section. The hint under the label changes with the choice, so each option is explained without
   three rows of radio text. It is stacked at every width, so the control always sits in the same place, under
   its hint and above the schedule.
2. **The order of the Power section is:** Screen power → the schedule (Schedule only) → Screen now (Schedule and
   External) → Turn off when idle → Brightness. Screen now moves above Turn off when idle (today it is below),
   so the status and the buttons sit next to the choice that decides what they mean.
3. **Always on has no Screen now row.** There is nothing to turn on, and turning it off would be a hold, which
   Always on rules out. To turn a screen off, choose Schedule or External.
4. **The status line says who set the screen and when.** It is `{On|Off} · {who and when}`. **Set here** means
   Settings (`by: "settings"`), and **set by {key name}** means home automation (`by: "automation"`). It reads
   **set by home automation** when the server does not send the key's name (§3.3).
5. **In External the buttons drop "now"**: **Turn on** / **Turn off**. They stand until the next command, exactly
   like a command from home automation. In Schedule they stay **Turn on now** / **Turn off now**.
6. **"Back to schedule" stays in Schedule mode only**, as today's early undo of a choice that would end at the
   next scheduled change anyway. It never appears in External or Always on. **"The schedule is paused" is gone
   everywhere**: nothing pauses a schedule any more.
7. **The household default and the per-screen override read exactly like every other screen setting:** `ScopeLine`
   (**Same as Default** / **Changed here · Reset to default**) on the screen page, and `DefaultEditNote` on the
   Default page. No new wording.

## 2. The control

### 2.1 The row (P1-P3, K1, K2)

`SettingRow` `stacked`, label **Screen power**, `id` from `rowAnchorId('screenPower')`.

- **Control:** `SegmentedControl`, `aria-label="Screen power"`, options in this order:

| `screenPower` | Label | Hint (the row's description) |
|---|---|---|
| `schedule` | **Schedule** | **Turns on and off at the times below.** |
| `always_on` | **Always on** | **Never turns off on a schedule. Turn off when idle still applies.** |
| `external` | **External** | **Homey, Home Assistant or a script with an API key turns it on and off.** |

- **Description slot, in order:**
  1. the hint for the current choice, as a plain `<span data-test="screen-power-hint">`;
  2. in External only, the two API key notes (§5);
  3. on a screen page, `ScopeLine` with `reset-test="reset-screen-power"`.
- **At phone width** the three segments fit in one line at 390 px (the longest label is "Always on"). They
  never wrap or scroll. If a translation or zoom ever makes them overflow, that is a bug in
  `SegmentedControl`, not something this row works around.
- **Saving:** a change saves at once, the way the toggle it replaces does:
  - on a screen page, through `persist(...)` with `powerMsg`, so the line under the section reads
    **Saved. This screen updates within a minute.** (online) or **Saved. Changes apply when this screen
    reconnects.** (offline);
  - on the Default page, through `emitChange`, followed by the `DefaultEditNote` (§4.2).
- **Focus:** stays on the segment that was chosen. Rows that appear or disappear below it (the schedule, Screen
  now) never take focus.

### 2.2 What each mode shows

| | Schedule | Always on | External |
|---|---|---|---|
| Schedule (`DisplayScheduleGrid`) | shown | hidden | hidden |
| Timezone row (Default page only) | shown | hidden | hidden |
| API key notes (§5) | — | — | shown |
| Screen now row (screen page) | shown | **hidden** | shown |
| Buttons | **Turn on now** · **Turn off now** | — | **Turn on** · **Turn off** |
| **Back to schedule** | while a choice is in force | — | never |
| Turn off when idle | shown | shown | shown |
| Brightness, display check | shown | shown | shown |

- A screen's own schedule is kept when the mode is not Schedule. It is only hidden, and it comes back unchanged
  when Schedule is chosen again. Changing the mode never edits or clears `displaySchedule`.
- The schedule keeps its own `ScopeLine` (`reset-daily-schedule`), exactly as today.

## 3. Screen now: the status line and the buttons

The row keeps its label **Screen now** and its `data-test` ids. Its description holds the status line
(`screen-now-state`), then the until line (`screen-now-until`, Schedule only), then the edge notes (§6), then
the dimming note (today's, unchanged).

### 3.1 Schedule

| Case | Status line | Until line |
|---|---|---|
| Following the schedule | **On · by the schedule** / **Off · by the schedule** | **Turns off at {time}** / **Turns on at {time}** (the next scheduled change); no line when no change comes in the next 8 days |
| A choice made here | **On · set here {when}** / **Off · set here {when}** | **Until the next scheduled change at {time}**, where {time} is the answer's `until`; no line when `until` is `null` |
| A command from home automation | **On · set by {who} {when}** / **Off · set by {who} {when}** | same as above |

- **Buttons:** **Turn on now**, **Turn off now** (secondary). The one that matches the current state is
  `aria-disabled` (today's rule).
- **Back to schedule** (`variant="link"`, `screen-now-follow`) shows while a choice or a command is in force. It
  ends it, and the status goes back to **by the schedule**.
- {time} in both until lines is a clock time in the screen's time zone and the household's 12/24-hour choice
  (`formatUntil`). For a command in force it is the answer's `until`; the browser doesn't work out the end
  itself. For the following-the-schedule line it is the next boundary (`nextScheduleBoundary`), as today.

### 3.2 External

| Case | Status line |
|---|---|
| A command from home automation | **On · set by {who} {when}** / **Off · set by {who} {when}** |
| A choice made here | **On · set here {when}** / **Off · set here {when}** |
| No command since External was chosen (the answer's `power` is `"schedule"`) | **On · no command yet** (External with no command is on) |

- No until line: the last command stands.
- **Buttons:** **Turn on**, **Turn off** (secondary), with the same `aria-disabled` rule. Pressing one does what
  a command from home automation does: it stands until the next one, from either side.
- **No Back to schedule.** To leave External, choose another mode in Screen power.

### 3.3 {who} and {when}

- **{who}** is the answer's `keyName` (for example **Homey**, the name the person typed when making the key),
  else **home automation**. It is never "API", a key id or a key prefix. The name is shown as given, cut to 40
  characters with "…".
  - The server sends `keyName` only to an admin session, which Settings is. A `null` `keyName` reads **set by
    home automation**, which is still correct.
- **{when}** is `setAt`, in the screen's time zone and the household's 12/24-hour choice:
  - today: **at 21:04** (or **at 9:04 PM**);
  - in the last 6 days: **on Tue at 21:04**;
  - older: **on 12 Oct**.
  - Reuse `formatDataFrom` from `utils/connectionTime.js` and add **at** / **on**. Don't write a third date
    format.
- No `setAt`: drop {when} (**Off · set here**).

### 3.4 Pressing a button

- **While it runs:** the pressed Button has `loading`, with `loading-label` **Turning on…** / **Turning off…**.
  Both buttons are `aria-disabled` until the answer comes back (today's `powerBusy`).
- **Success:** the status line changes from the server's answer, and `powerMsg` reads **Saved. This screen
  updates within a minute.**, or the offline line. Focus stays on the pressed button (now `aria-disabled`).
- **Failure:** `powerMsg` `tone="err"`, `friendlyError(err, "turn {name} on")` / `"turn {name} off"`. Nothing
  else changes.
- **409** (`screen_power_always_on`, `screen_power_external`): Settings never sends a call that gets one,
  because the buttons and Back to schedule aren't shown in those modes. If one comes back anyway (the mode
  changed on another device), `powerMsg` `tone="err"` shows the server's `message` as given, for example
  **This screen is set to Always on. Choose Schedule or External to switch it.** Then reload the screen's
  power state. No new UI and no copy of our own.
- **429:** **Too many changes in a minute. Try again in {wait}.** `{wait}` is the pairing spec's §4.1 rule
  (`Retry-After`).
- One press is one call. Today's two-step (end the hold, then save `screenNow`) and its
  `POWER_CHOICE_FAILED` copy are removed. The server design owns the call.

### 3.5 Always on

The Screen now row is not rendered. `desiredOnNow` is `true` for the Brightness group and the display check, so
neither says the screen is asleep. The server refuses commands in Always on with a 409 (§3.4), so there is no
command to show.

## 4. Household default and per-screen override

### 4.1 A screen's page

- `ScopeLine` in the Screen power row (§2.1): **Same as Default** while the screen follows the household's
  choice, **Changed here · Reset to default** when it has its own.
- **Reset to default** removes only the screen's mode override. Its own schedule, if any, stays (and keeps its
  own scope line).
- The **Changed here** list at the top of the page (`ChangedHereLine`) and the footer count include the mode
  under the label **Screen power**.

### 4.2 The Default screen page (D1)

The Power section (`device-power`) shows, in order:
1. **Screen power**, the same row as §2.1, without a `ScopeLine` (the Default page has none);
2. `DefaultEditNote` for `screenPower`, so after a change: **Hall keeps its own screen power.** /
   **Hall and Office keep their own screen power.**, with **Change them too** (today's component);
3. in Schedule: the schedule, its `DefaultEditNote`, and the Timezone row, as today;
4. Turn off when idle and the brightness note, as today.

There is no Screen now row and there are no buttons on the Default page: the Default isn't a screen.

- `SCREEN_SETTING_LABELS.screenPower` is **screen power**. It drives the note and the Changed here list.
- The old `displayScheduleEnabled` label and its toggle go. The server maps the stored value
  (`true` → Schedule, `false` → Always on).

### 4.3 Summaries on the Screens list

The summary line of each screen row and of the Default card (`summaryFor`, `defaultSummary`):

| Mode | Part in the summary |
|---|---|
| Schedule | today's **off {offTime}–{onTime}** |
| Always on | nothing (as today with the schedule off) |
| External | **External on/off** |

Settings search (`settingsRegistry.js`): the power entry's label becomes **Screen on/off and idle**, with the
keywords `screen power`, `schedule`, `always on`, `external`, `home automation`, `homey`, `home assistant`.

## 5. External: where the API key comes from

In External, two neutral `InlineNote`s follow the hint, on both the screen page and the Default page:

1. **It needs an API key that can turn screens on and off.**, with the action **Open API keys**
   (`Button variant="link" size="sm"`, `data-test="screen-power-keys"`). It opens Settings › Security › API keys
   in the same tab: `router.push({ path: "/settings", query: { setting: "security-api-keys" } })`.
2. **The home automation guide shows the steps for Homey and Home Assistant.**, with the action
   **Open the guide** (`data-test="screen-power-guide"`). It opens `docs/integrations/HOME_AUTOMATION.md` in a new
   tab (`target="_blank" rel="noopener"`), at a URL held in one constant, `HOME_AUTOMATION_GUIDE_URL` in
   `utils/screenPower.js`.

On the kiosk itself (`calvin-kiosk` on `<html>`), drop note 2. A new browser tab on a wall panel is a dead end.

## 6. Edge copy

Each note is an `InlineNote` in the Screen now description, below the status lines. Where two apply, they show
in this order.

| Case | When | Mode | Note |
|---|---|---|---|
| Hidden presence | `presenceHidden` | Schedule, External | replaces the status and until lines, neutral: **Sign in as admin to see whether this screen is on or off, and who set it.** (`screen-now-hidden`). Both buttons stay enabled, and Back to schedule shows, as today |
| Not paired, while Only paired screens is on | `paired === false` and `kioskPairing === "required"` | Schedule | `warn`: **Not paired, so home automation can't switch it. Its schedule still works.** (`screen-now-unpaired`) |
| | | External | `warn`: **Not paired, so home automation can't switch it. Pair it to use External.**, with the action **Pair a screen** (the pairing spec's §5 handler) |
| Offline | `!isOnline(selectedKiosk)` | Schedule, External | neutral: **Offline. It turns on when it's back.** / **Offline. It turns off when it's back.** (from `desiredOn`) (`screen-now-offline`) |

- In the unpaired case, the status line keeps its state and drops {who and when}: **On** / **Off**. Home
  automation's command isn't reaching the screen, so naming it would mislead.
- Old screen software needs no note in any mode: the server sends External to it in a form it already obeys.
  `agentHolds` is not read by the Power section any more, and today's `screen-now-old-agent` note is removed.
- An offline screen's buttons stay enabled. The press is stored, and the offline save line says when it
  applies.

## 7. Phone, kiosk, light and dark

The mock shows every state at 390 px (phone) and 800×480 (the wall panel, landscape), in light and Backlit
(dark). The PNGs are in `mocks/screen-power/png/`.

- Role tokens only, and the `ui/` blocks. No new token, and no `<style>` in `ScreensSettings.vue` or
  `DefaultScreenSettings.vue`.
- Orange appears only on the chosen segment and on focus. The `warn` notes use `--warn-text`. No Tag is added:
  the mode is visible in the control.
- At 800×480 the Power section is one column (the two-pane layout starts above 900 px). The Screen power row,
  the status and the buttons fit above the fold once the section is scrolled to (K1, K2).

## 8. What the builder must not do or guess

- **Don't show the word "API"** anywhere but **API key** / **API keys**. The mode is **External**. Don't say
  "hold", "held", "paused", "override", "agent" or "projection" in copy. Run `tests/unit/copy/noDevWords.spec.js`.
- **Don't keep "The schedule is paused."**, **Back to schedule** outside Schedule, the two-call hold ending, or the
  `POWER_CHOICE_FAILED` strings.
- **Don't clear or edit the schedule** when the mode changes (§2.2).
- **Don't show Screen now, or Turn on or Turn off, in Always on** (§3.5), and don't show buttons on the Default
  page.
- **Don't invent a key name.** With no `keyName`, say **home automation** (§3.3). Never show a key id,
  a prefix or a secret.
- **Don't read `presenceHidden` as "following the schedule"** (pairing spec §3.4).
- **Don't add a Tag or a coloured dot** for the mode, or a second copy of the control elsewhere (for example on
  the Screens list).
- **Don't link to the guide from the kiosk itself** (§5).
- **Don't add new blocks or styles.** Everything here is `SettingsSection`, `SettingRow`, `SegmentedControl`,
  `ScopeLine`, `InlineNote`, `Button`, `DisplayScheduleGrid` and `DefaultEditNote`.
- **Anything left open goes to the design lead**, not to a guess: a state not listed, copy for an error not
  listed, or the order of notes.

## 9. Tests the builder adds

- **Unit (`ScreensSettings`)**, per mode:
  - the hint text;
  - the schedule shown only in Schedule;
  - Screen now absent in Always on;
  - the button labels **Turn on now**/**Turn off now** versus **Turn on**/**Turn off**;
  - Back to schedule only in Schedule with a choice in force;
  - the API key notes only in External, and **Open API keys** routes to `security-api-keys`.
- **Status lines:**
  - `by: "settings"` → **set here**;
  - `by: "automation"` with and without a key name;
  - **no command yet**;
  - {when} for today, 3 days ago and 20 days ago, in 24h and 12h;
  - a name longer than 40 characters is cut.
- **Edges:** `presenceHidden`, unpaired with required pairing (both modes, and the **Pair a screen** action),
  no note for `agentHolds: false` in any mode, and offline with each `desiredOn`.
- **Override:** ScopeLine reads **Same as Default** / **Changed here**. Reset removes only `screenPower` and keeps
  `displaySchedule`.
- **Default page:** no Screen now, and the `DefaultEditNote` sentence **Hall keeps its own screen power.**
- **Summaries:** **External on/off** in the list and the Default card.
- **Copy guard:** `noDevWords.spec.js` passes. A new check asserts that no rendered Power section text matches
  `/\b(hold|held|paused)\b/i`.
- **Playwright (mocked routes, `E2E_PORT=5196`):**
  - the Power section in each mode at 390 and 800×480, light and Backlit, with no horizontal scroll and the three
    segments on one line;
  - screenshots attached to the PR per the doctrine §7.
- Update the existing `ScreensSettings.hold.spec.js` and `settings-dashboard-screens.spec.js` cases that assert
  the old copy. Don't delete them: rewrite them to the new copy.

## 10. The server's answers

The server design answers what this page asked:
- **The key** is `screenPower` (`schedule`, `always_on`, `external`). When a layer doesn't have it, the server
  derives it from `displayScheduleEnabled`, so existing installs read as before.
- **A command in Always on**, or `schedule` in External, gets a 409 with the server's own message (§3.4).
- **Changing the mode ends the last command.** External with no command is on (§3.2).
- **Old screen software obeys External**, so there is no old-software note (§6).
- **The answer** carries `mode`, `power`, `by`, `setAt`, `until` (§3.1) and, for admin sessions, `keyName`
  (§3.3).

Still open, for the docs lane: `HOME_AUTOMATION.md` "Settings and people" and the Homey app spec must be
rewritten to this page's words.
