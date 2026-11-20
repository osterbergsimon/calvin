# Kiosk pairing screens (calvin-0xns)

Status: spec (plan Part D, Task 12). This spec gates Part E (the kiosk browser, Task 13) and Part F (Settings,
Task 14). Mock: [mocks/kiosk-pairing/index.html](mocks/kiosk-pairing/index.html). Frames are named A1…G1, and
there are PNGs in `mocks/kiosk-pairing/png/`.

Builds on:
- the kiosk authentication design: [2026-11-19-kiosk-auth-design.md](../superpowers/specs/2026-11-19-kiosk-auth-design.md)
  §4, §7, §9, §10, §13 and §14, and the anti-goals;
- the plan's Tasks 12-14;
- the [frontend doctrine](frontend-doctrine.md) and the [no-developer-words](2026-10-31-no-developer-words.md)
  rules.

The design fixes the behaviour and the API. This spec fixes the layout, the copy, the states, focus and
screen-reader behaviour. Copy in **bold** is exact. Where this page and the design's sample wording differ,
this page wins (design §13).

## 1. Decisions in one place

1. **On the wall, the code sits in a strip docked to the bottom edge, not in a card floating over the
   dashboard.** The dashboard's box gets shorter by the strip's height. Nothing is drawn on top of a dashboard
   pixel, so no event, photo or button is hidden or covered.
   - The strip is 88 px tall at 800×480 (18%) and 155 px at 480×800 (19%).
   - It is a standing nudge for as long as the screen is unpaired (owner decision 1), so it must not cost a
     tap target. A floating card that "avoids" targets can't know where a user-made layout puts them.
2. **There is one place to type a code: Pair a screen on the Screens list.** A code names its own screen, so
   a code field on Kitchen's page that pairs Hall would mislead. A screen's own page links to that field
   (§5).
3. **The pairing state is one meta line on each screen row, not a Tag.** The row already carries Online or
   Offline. A second tag on every row of a fresh upgrade (all unpaired) would be noise. The line turns `warn`
   only in required mode, where being unpaired actually costs the screen something.
4. **The "could pretend to be" warning lives in one place: the count line at the top of the Screens list.**
   It is not repeated on every unpaired row.
5. **Nothing on the wall is interactive.** The strip has no close button and no tap action, and approval
   happens elsewhere.

## 2. The pairing strip (kiosk browser, Part E)

### 2.1 When it shows

It shows only when all of these are true:

| Condition | Source |
|---|---|
| The page has a kiosk id (`?kiosk=`, `kioskId.js`) | a plain browser tab never shows it |
| It is the top-level page (`window.top === window`) | design §14: previews and iframes never show it |
| The pairing store's `state` is `"pending"` and `code` is a non-empty string | `GET /api/kiosks/{id}/pair`, design §4 |

In every other case nothing is rendered and no space is reserved. That covers `paired`, `none`, a failed or
404/401 request (an old server), `setup_required`, no answer yet, and offline.

- There is never a "Loading…" or "Checking pairing…" state.
- The strip shows on every route of the kiosk, Settings included (G1). So someone signed in at the wall can
  read the code and type it in the same browser.

### 2.2 Layout (A1-A4)

- **Placement.** It is the last child of `.app-shell`, in the normal flow (not `position: fixed`).
  - Full width, on the bottom edge.
  - When the clock bar is at the bottom, the strip sits below the clock bar.
- **The dashboard gets shorter by the strip's height.**
  - The strip publishes `--pairing-strip-h` on `<html>`, measured with a `ResizeObserver`, and sets it to
    `0px` when hidden.
  - `.app-shell` (`App.vue:85`), `LayoutManager.vue:20` and `main.css:18` change `height: 100vh` to
    `calc(100vh - var(--pairing-strip-h, 0px))`.
  - Every fixed-position item on the bottom edge adds `var(--pairing-strip-h, 0px)` to its `bottom`. These are
    all of them today:
    - `StatusRail.vue:99`;
    - `NotificationSystem.vue:277`;
    - `ConnectionStatus.vue:304` (the floating pill);
    - `PhoneSettingsButton.vue:58`;
    - `Dashboard.vue:886` (the layout-unlock banner);
    - `MinimalUIOverlay.vue:104, 119` (the bottom hot corners).
  - The full-screen viewers (`PhotoSlideshow.vue:531`, `WebServiceViewer.vue:340`, which are `inset: 0` at
    `--z-dialog`) also end at the strip: `bottom: var(--pairing-strip-h, 0px)`. A photo frame left running
    must not hide the code.
  - The on-screen keyboard and dialogs are left alone: they may cover the strip while open.
- **Landscape and wider than 600 px** (A1, A2): one row, `align-items: center`, `gap: var(--gap-4)`, padding
  `var(--gap-3) var(--gap-5)`.
  - The row holds an icon, then the body (title over text, `flex: 1`), then the code on the right.
- **Phone width (≤ 600, the doctrine's `(--bp-phone)`)** (A3, A4): stacked, `align-items: flex-start`,
  `gap: var(--gap-2)`, padding `var(--gap-3) var(--gap-4)`.
  - Icon and title on the first line, the text under them, and the code on its own line, left-aligned.
- **Surface:** `--bg-1`, with a `1px solid var(--line)` top border. No shadow, no radius, no orange. Nothing
  here is "act here" on this screen.
- **Icon:** `mdiCellphoneLink`, 28 px, `--ink-2`, `aria-hidden`.
- **Title:** `--text-label`, `--weight-strong`, `--ink`.
- **Text:** `--text-body`, `--ink-2`, line-height 1.35.
- **Code:** `--font-data`, weight `--weight-strong`, line-height 1, letter-spacing `0.06em`, `--ink`, at the
  new component token **`--pairing-code-size: calc(var(--text-display) * 1.75)`** (about 48 px).
  - Declare the token in `theme.css` beside the other component tokens. It is the only new token.
  - The cap height is about 6 mm on the 7-inch panel: readable from about 3 m, across a living room.
  - It follows the screen's UI scale like the rest of the dashboard.
- **Themes:** role tokens only, so it follows all 5 themes in light and dark. Check the CLV-64 contrast test.
  In the mock, `--ink-2` on `--bg-1` is 5.5:1 in light and 7.0:1 in Backlit, and the `warn` text is 5.3:1 and 12.4:1.
- **Motion:** it appears and disappears with no animation, because the dashboard re-flows anyway. Under
  `prefers-reduced-motion` nothing changes.
- **Layers:** no z-index, because it is in the flow. The on-screen keyboard (`--z-osk`) and dialogs
  (`--z-dialog`) draw over it as they draw over the page.

### 2.3 Copy

| Part | Text |
|---|---|
| Title | **Pair this screen** |
| Text | **On your phone or computer, open Settings › Screens in Calvin and type this code under Pair a screen.** |
| Code | the server's formatted code, as given (`K7Q-4MD`); never reformatted, never shortened |

### 2.4 Behaviour

- **The code changes** (a pending entry expired after 10 minutes and the next poll made a new one): replace
  the text in place. No highlight, no announcement.
- **Approval:** the store's 10-second poll sees `paired`, and the strip is removed (and
  `--pairing-strip-h` becomes `0px`).
  - No "Paired" message on the wall. Settings already said "Hall is paired", and the strip disappearing is
    the confirmation.
  - The worst case is about 10 s after approval, as design §13 asks.
- **Unpair:** the next poll after the agent's new secret answers `pending` with a new code, and the strip
  comes back.
- **Taps on the strip do nothing.** It has no handler, and it never wakes a dimmed screen differently from
  the rest of the page.

### 2.5 Screen readers and keyboard

- The element is `<aside aria-labelledby="{title id}">` (a complementary landmark named "Pair this screen").
  It is **not** a live region, because a code that changes every 10 minutes must not interrupt.
- The code element carries `aria-label="Code: K 7 Q, 4 M D"`: the characters separated by spaces, with a
  comma at the dash. So it is spelled out, not read as a word.
- Nothing in it is focusable.

## 3. Settings › Screens: the list (Part F)

### 3.1 The count line (B1-B3)

It goes in the Screens section's `#description` slot, as an `InlineNote` (it shares the slot with today's
"That screen was removed." note, which stays first).

**"Seen this week"** means `lastSeen` within the last 7 days. The count is over registry rows only. Waiting
entries (§3.3) are not counted.

| Case | Tone | Text |
|---|---|---|
| No screen seen this week | | no line |
| All seen this week paired | `neutral` | **All {n} screens seen this week are paired.** / for one screen: **The screen seen this week is paired.** |
| Some unpaired, optional mode | `warn` | **{p} of {n} screens seen this week are paired. Another device on your home network could pretend to be an unpaired screen.** |
| None paired, optional mode | `warn` | **None of the {n} screens seen this week are paired. Another device on your home network could pretend to be any of them.** / for one screen: **The screen seen this week isn't paired. Another device on your home network could pretend to be it.** |
| Some or none unpaired, required mode | `warn` | **{p} of {n} screens seen this week are paired. Only paired screens is on, so the others show the dashboard but can't report in or follow home automation.** |

- Numbers are digits.
- The `warn` line carries `mdiAlert` before the text, as the mock shows. The icon is `aria-hidden`; the text
  says it all.

### 3.2 The pairing line on each screen row

It is the last `InlineNote` in the row's `#meta` (after the software line), with
`data-test="screen-pairing-line"`.

The state comes from the list fields:
- **paired:** `paired === true`.
- **needs update:** not paired, `agentVersion != null` and `agentPairs !== true`.
- **can pair:** every other unpaired row. That covers an agent that pairs, and a browser-only screen.

| State | Optional mode | Required mode |
|---|---|---|
| paired | **Paired since {date}**, neutral; **Paired today** when `pairedAt` is today | same |
| can pair | **Not paired. It shows a code to type in Pair a screen.** neutral | **Not paired, so it can't report in or follow home automation. It shows a code to type in Pair a screen.** `warn` |
| needs update | **Needs a software update before it can be paired.** neutral | **Needs a software update before it can be paired. Until then it can't report in or follow home automation.** `warn` |

- `{date}` is `formatKeyDate(pairedAt)` from `utils/apiKeyFormat.js` ("3 Nov", with the year when it isn't
  this year).
- The Default and This browser rows get no pairing line.

### 3.3 Screens waiting to be paired (B2)

These are entries from `GET /api/kiosks/pairings` whose `kioskId` is not a row in the list. That is a new
screen in required mode, or a quick-install screen before its first authenticated poll.

- They are listed after the screen rows and before This browser, as `ListRow`s.
  - Name: `hostname`, else `kioskId`.
  - Lead: an empty thumbnail with a dashed `--line` border.
  - Meta: **Waiting to be paired. Type the code it shows in Pair a screen.**
- They are **not** buttons: no `role="button"`, no tabindex, no chevron, no click, because there is no page
  to open.
- Fetch the pairings with the kiosk list (on open, and on the existing 30-second `useIntervalWhenVisible`), and
  again right after a pairing succeeds.
- If the request fails, show no waiting rows and no error: it is a hint, not a feature.

### 3.4 Hidden presence

When a row has `presenceHidden: true`, nothing may read as "not held". The screen page's "Screen now" lines
that describe a hold (`screen-now-state`, `screen-now-until`) are replaced by one neutral note:
**Sign in as admin to see whether home automation is holding this screen.** Admins never see this, because
the server shows them everything.

## 4. The Pairing section on the Screens list (Part F)

It is a new `SettingsSection id="screens-pairing" title="Pairing"` directly under the Screens section, in the
list column. It holds two rows (B1, B2). It is shown whenever the Screens list is, including when there are no
screens yet, so the first quick-install screen can be paired.

### 4.1 Pair a screen (C1-C6)

`SettingRow` `stacked`, label **Pair a screen**, description **Type the code shown at the bottom of the
screen.** The control line is a `TextField` and a Button on one line (`--gap-inline`, aligned to the bottom).
At phone width the field takes the remaining width. On wider screens it is at most 14rem.

- **Field:** `TextField`
  - label **Code**;
  - `autocapitalize="characters"`, `autocomplete="off"`, `spellcheck="false"`, `maxlength="12"`,
    `enterkeyhint="go"` (`inputmode` is the default text: the code has letters);
  - no placeholder;
  - on input, the value is upper-cased in place. Nothing else changes as it is typed: no auto-dash.
- **Button:** `Button variant="primary"` **Pair** (the only primary in this section), `type="submit"`.
  - The field and the button are in a `<form>`, so Enter submits.
- **Before sending:** strip spaces and dashes.
  - Empty → error **Type the code shown on the screen.**
  - Not 6 characters → error **A code has 6 letters and numbers, like K7Q-4MD.**
  - Either way, no request is sent.
- **Sending** (C1): `POST /api/kiosks/pairings` `{"code": "<6 characters>"}`. While it runs, the Button has
  `loading` with `loading-label="Pairing…"`, and the field is `readonly`.

| Answer | What shows | Field | Focus |
|---|---|---|---|
| 200 | `InlineNote tone="ok"`: **✓ {displayName} is paired.**, with an action link **Open {displayName}** (`Button variant="link" size="sm"`, selects that screen). With `replaced: true`: **✓ {displayName} is paired again. Its old pairing no longer works.** | cleared | stays in the field |
| 404 `pairing_code_invalid` | `InlineNote tone="err"`: **No screen is showing that code. Check the screen and type the code it shows now.** | kept, `aria-invalid="true"` | stays in the field |
| 429 | `tone="err"`: **Too many wrong codes. Try again in {wait}.** Pair is `aria-disabled` until then, and the line clears when the wait is over | kept | stays |
| 401 / 403 (`admin_required`, `session_required`) | `tone="err"`: `friendlyError(err, "pair a screen")` → "You need to sign in as admin to pair a screen." | kept | stays |
| anything else | `tone="err"`: `friendlyError(err, "pair a screen")` | kept | stays |

- `{wait}` comes from `Retry-After` in seconds:
  - 60 s or less: **{s} seconds**;
  - otherwise rounded up to minutes: **1 minute** / **{m} minutes**;
  - with no header: **a minute**.
- The result line sits under the control line (`data-test="pair-result"`).
  - The `ok` line is `role="status"` `aria-live="polite"`. Error lines are in the same live element, so one
    region announces both.
  - The field's `error` prop is not used for server answers, so the message is announced once. It is used for
    the two before-sending checks, which `TextField` already wires with `aria-describedby` and `aria-invalid`.
- The next keystroke in the field clears an error line (not the 429 wait).
- After a 200, refresh the kiosk list and the pairings, so the row's line changes to **Paired today** and a
  waiting row moves into the list.

### 4.2 Only paired screens (B1, B2, E2, E3)

`SettingRow`, label **Only paired screens**, description **Unpaired screens still show the dashboard, but
can't report in or follow home automation.** The control is a `ToggleSwitch` with
`aria-label="Only paired screens"`, bound to the `kioskPairing` config key (`"required"` = on).

- **Turning on** while any row seen this week (§3.1) is unpaired asks first, with `ConfirmModal`:
  - title **Turn on Only paired screens?**;
  - message **{names} aren't paired. They'll keep showing the dashboard, but stop reporting in and following
    home automation.** For one screen: **{name} isn't paired. It'll keep showing the dashboard, but stop
    reporting in and following home automation.**;
  - `confirm-text` **Turn on**, not `danger`.
  - `{names}` are the display names in list order:
    - two: "Hall and Office";
    - three: "Hall, Office and Landing";
    - more than three: the first three, then "and {k} more" ("Hall, Office, Landing and 2 more").
  - The toggle stays off until Turn on is pressed. Cancel leaves it off and returns focus to the toggle.
- **Turning on** with every recent screen paired, or with no recent screens, saves at once without asking.
- **Turning off** never asks.
- **Saving:** through the existing config save. While saving, the toggle is `disabled`.
  - On failure, the toggle goes back, and an `InlineNote tone="err"` under the row reads
    `friendlyError(err, "change Only paired screens")`.
  - No "Saved" line: the toggle and the count line (§3.1, whose wording changes with the mode) show the
    result.

## 5. One screen's page: the Pairing section (D1-D5)

It is a new `SettingsSection id="screen-pairing" title="Pairing"`, between Behaviour and Software. It also
gets an entry in the screen's section index (`ScreenSectionIndex`). It holds one `SettingRow` whose label is
the state.

| State | Label | Description | Action |
|---|---|---|---|
| paired | **Paired** | **Since {date}. Only this screen can report in for itself.** (`Today.` replaces `Since {date}.` when paired today) | `Button` **Unpair** (secondary) |
| can pair | **Not paired** | **This screen shows a code at the bottom. Type it in Pair a screen.** | `Button` **Pair a screen** (secondary) |
| needs update | **Not paired** | **Needs a software update before it can be paired.** | today's Update button: the same handler, `loading` state and labels as the Software section (`onUpdate`, **Updating…**, **Try again**) |

- **Required mode, not paired** (D4): add a second description line,
  `InlineNote tone="warn"`: **Only paired screens is on, so until it is paired this screen can't report in or
  follow home automation.**
- **Pair a screen** (the button) goes back to the list on a phone (as ‹ Screens does). On the two-pane
  layout the list is already visible. Then it scrolls `#screens-pairing` into view and focuses the Code
  field.

### 5.1 Unpair (E1, D5)

- `ConfirmModal`, `danger`:
  - title **Unpair {name}?**;
  - message **{name} will show a new code and stop reporting in until you pair it again.**;
  - `confirm-text` **Unpair**.
- On confirm: `DELETE /api/kiosks/{id}/pairing`.
  - While it runs, the Unpair button has `loading`, with `loading-label` **Unpairing…**.
- **Success:**
  - The row changes to the can-pair state.
  - A neutral `InlineNote`, `role="status"`, under the row: **{name} is unpaired. It shows a new code within
    a minute.**
  - Focus moves to the **Pair a screen** button that took Unpair's place (`nextTick`, then focus). Cancel
    returns focus to Unpair (ConfirmModal's default).
- **`{"changed": false}`** (it was already unpaired): the same row change, and the line reads
  **{name} wasn't paired.**
- **Failure:** `tone="err"`: `friendlyError(err, "unpair {name}")`. The row is unchanged.
- **{name}** everywhere is `screenLabel(k)` (the display name), never the id.

## 6. Add a screen (F1-F5)

`AddKioskPanel.vue`: the Raspberry Pi card changes, and the browser card gains one sentence.

- **When the panel opens** (each time `addOpen` becomes true), call `POST /api/kiosks/install-codes` once.
  Closing and opening again makes a new code. That is fine, because the server keeps 5 and drops the oldest.
- **Intro line** (replaces today's): **On a fresh Raspberry Pi OS, open a terminal (or SSH in) and run the
  command below. The Pi installs the kiosk, pairs itself, reboots into the dashboard and shows up in this
  list.**
- **The command block** shows the answer's `command` exactly. The block and **Copy** / **Copied** are
  unchanged.

| State | Command block | Line under it (`InlineNote`, `role="status"`) |
|---|---|---|
| Getting a code (F2) | **Getting a one-time code…** in `--font-ui` `--ink-2`; Copy `disabled` | none |
| Ready (F1) | `command` | neutral: **This command works once, for 30 minutes (until {time}).**, with an action link **New code** |
| Run out (F3), when the clock passes `expiresAt` with the panel open | `command`, unchanged | `warn`: **This code has run out. Get a new one before you run the command.**, with an action link **New code** |
| Failed (F4) | today's plain command (no `?pair=`) | `warn`: **Couldn't get a one-time code. This command still works: the screen then shows a code to type in Pair a screen.**, with an action link **Try again** |
| Not signed in (401/403) | today's plain command | `warn`: `friendlyError(err, "make a one-time code")`, with no action |

- `{time}` is `expiresAt` as a clock time, in the household's 12/24-hour choice, the way the connection pill
  formats times (`utils/connectionTime.js`).
- **New code** / **Try again** go back to the "Getting a code" state, then to the answer.
  - **Copy** resets to **Copy**.
  - Focus stays on the link button while it is replaced. Re-render it in the same place, with the same
    `data-test="install-new-code"`.
- Check "run out" with one `setTimeout` to `expiresAt`, not a ticking interval.
- **Browser card** (F5): append to its note: **A few minutes later it shows a code at the bottom: type it in
  Pair a screen.**

## 7. What the builder must not do or guess

- **Don't put the strip over the dashboard** (`position: fixed`, `absolute` or an overlay). It reflows the
  page (§2.2). Don't add a close button, and don't make it dismissible.
- **Don't show the strip without a code,** and don't show a placeholder code, a spinner or "Loading…".
- **Don't animate the code,** don't highlight it when it changes, and don't make the strip a live region.
- **Don't add a code field anywhere but the Pairing section** (§1.2). The screen page links to it.
- **Don't show a code or a secret in Settings.** The server never sends one, and the pairings list has no
  code. A waiting row shows only a name.
- **Don't add a `<style>` block** to `ScreensSettings.vue` or `AddKioskPanel.vue` for this work.
  - Settings is built from `SettingsSection`, `SettingRow`, `ListRow`, `InlineNote`, `Button`, `TextField`,
    `ToggleSwitch` and `ConfirmModal`.
  - The dashed waiting thumbnail is a new boolean prop on `PageThumbnail` (`placeholder`), styled inside that
    component.
  - The pairing strip (`components/PairingStrip.vue`, dashboard chrome, not Settings) has its own scoped
    style, built from role tokens and `--pairing-code-size`.
- **Don't use the words** "kiosk secret", "credential", "token", "API", "required mode", "optional mode" or
  "hash" in any copy.
  - The household choice is only ever "Only paired screens".
  - Every string above passes `tests/unit/copy/noDevWords.spec.js`. Run it.
- **Don't change "Online"/"Offline"** or add a pairing Tag to rows.
- **Don't treat `presenceHidden` as "no hold"** (§3.4).
- **Anything this page leaves open goes to the design lead,** not to a guess. That includes the order of
  lines, a missing state, and copy for an error not listed here.

## 8. Tests the builder adds (beyond the plan's)

- **Part E**
  - The strip renders only for `pending` with a code, with a kiosk id, at the top level.
  - `--pairing-strip-h` is set while it shows and is `0px` after `paired`.
  - The code's `aria-label` is spelled out.
  - It is not `aria-live`.
  - A Playwright check at 800×480 and 480×800 confirms that the clock bar's show-controls button and the
    last region's bottom edge are above the strip's top edge: nothing overlaps.
- **Part F**
  - The pairing line per state and mode, with the exact copy, and the date via `formatKeyDate`.
  - The count line for each case in §3.1, counting only rows seen in the last 7 days.
  - Waiting rows are not focusable.
  - Pair a screen:
    - normalization (`k7q-4md ` → `K7Q4MD`);
    - the two checks before sending (no request);
    - the copy for 200, `replaced`, 404 and 429 (with `Retry-After: 90` → "2 minutes");
    - focus stays in the field.
  - The confirm names, for 1, 2, 3 and 5 unpaired screens; turning off sends no confirm.
  - Unpair: confirm, `DELETE`, the success line, and focus on Pair a screen.
  - Add a screen: the answer's `command` is shown, run out after `expiresAt`, and the fallback when minting
    fails.
- **Screenshots:** the UI PRs attach the mocked-harness screenshots that the doctrine §7 asks for: 1280 and 390,
  light and Backlit, plus 800×480 and 480×800 for the strip. The design lead reviews against this page.
