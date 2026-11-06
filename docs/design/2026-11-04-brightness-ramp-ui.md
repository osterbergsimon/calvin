# Brightness ramp and display check: UI

**Date:** 2026-11-04 · **Bead:** calvin-29ws · **Status:** design, for build
**v2 (2026-11-06, calvin-c805 / calvin-u8yn):** §3 calibration and power-trouble states rewritten after the first real
Pi 3B+ run; §3.7 lists what the backend and agent need.
**Functional spec:** [../superpowers/specs/2026-11-04-kiosk-brightness-ramp-design.md](../superpowers/specs/2026-11-04-kiosk-brightness-ramp-design.md).
It is the source of truth for behaviour, including the owner's answers in its section 6. This document covers only
what people see and do.
**Mocks:** [mocks/brightness-ramp/brightness.html](mocks/brightness-ramp/brightness.html), with a capture at
[mocks/brightness-ramp/png/board.png](mocks/brightness-ramp/png/board.png). The figure numbers below refer to it.
**Scope rules:** [settings scope](2026-11-03-settings-scope.md). These are per-screen values with no household
default except "ramp off".

## 1. Where it lives

- **Screens › {screen} › Power**, in a **Brightness** group under **Screen now** (fig. 1). These settings are about the
  screen's power, and they act at the same moments as the schedule and Screen now.
- **Screens › Default › Power** has no Brightness rows. It shows one line in their place: "Brightness is set on each
  screen." These settings have no household value apart from the ramp being off, so there is nothing to edit there
  (settings scope §2 rule 1).
- **This browser** has nothing. A plain browser has no display agent (functional spec §3).
- **The display check** opens as a dialog from the group's **Check this display…** button. The same dialog works on a
  desktop, on a phone (it becomes full-screen) and on the kiosk panel itself.
- **Search keywords:** "brightness", "dim", "ramp", "DDC", "display check", "under-voltage", "brown out", "power
  supply", "wake". All of them open the Kitchen page's Power section, or the screen list when no screen is selected.

## 2. The Brightness group (fig. 1)

Rows, in order:

1. **Ramp brightness at sleep and wake** (toggle). Description: "Dims before the screen turns off and brightens
   slowly after it wakes. Use it when the screen's power supply struggles as it wakes."
2. **Brightness**, shown only while the ramp is on. A slider with the current value shown large.
   - **When a menu match exists**, the value and the track are on the screen's own menu scale: "61 on the screen's
     menu", with "Calvin value 19 · estimated" in small text. The track runs from the menu value of DDC 0 to the
     menu value of the limit.
   - **Without a menu match**, the slider is on Calvin's scale (DDC 0–100): "19 (Calvin's scale)", with a link,
     "Match it to your screen's menu", that opens the check at step 3.
   - **The highest value you can pick** is the limit minus two steps. The range between that and the limit is drawn
     hatched and can't be reached, with the limit marked and labelled. The note under the slider says "You can go up
     to 67 on the screen's menu (Calvin 22). Above that is too close to the limit the display check found on 4 Nov."
     When no limit has been found, there is no hatch, and the note says "No limit found yet. Run the safe-limit step
     to find one" (a link to step 4).
   - **Moving the slider applies now** (owner answer 1). The note changes to "Changing… 61 → 67 on the screen's menu,
     2 at a time" until the agent reports it is done. While the screen is asleep, it says "Applies when Kitchen wakes".
     Save the value when the knob is released, not while it is dragged, so a drag never queues a series of ramps.
   - **The first time the ramp is turned on**, the brightness starts at the lower of "limit minus two steps" and DDC 20.
     It never starts above the limit.
3. **Last wake.** The result of the latest ramp, from the agent's report:
   - "Today 06:30 · brightened to 19 in 22 s · no power trouble" (normal text);
   - "Today 06:30 · stopped at 20: under-voltage · tries again at the next wake" (amber), when a ramp hit a fault;
   - **History** opens a short list of the last 20 ramps and checks, newest first: the time, what triggered it, the
     result and the level reached.
4. **Display check.** One line summarising the latest check: "Answers brightness commands · changes take effect · menu
   match from 3 readings · limit 26 (4 Nov)". The button is **Check this display…**. Before any check has run, the line
   says "Not checked yet".
5. **Ramp speed.** "2 every 1.5 s · the pace that worked on this screen", with **Change**. Change reveals two steppers:
   step size (1–5) and interval (1–5 s). It also shows a warning: "Bigger steps are what reset the touch screen. Keep
   the default unless the check says otherwise." This row is shown only while the ramp is on.

**No `ScopeLine` on these rows.** They are per screen only, with no Default to reset to. The section's **Reset
everything to default** turns the ramp off and keeps the check results.

### Unavailable and transient states (figs. 2, 2b)

**When the ramp isn't available, the toggle row stays in place and says why**, with the one action that fixes it:

| State | Row text | Action |
|---|---|---|
| Never checked | "Calvin checks the display first. It takes about 10 s." | Turning it on opens the check at step 1, and the ramp starts once step 2 passes |
| No DDC | "Not available: this screen doesn't answer brightness commands (DDC/CI). Checked 4 Nov." Hint: adapter or cable, or DDC/CI off in the screen's menu | **Check again** |
| Writes don't take effect | "Not available: brightness commands reach the screen but don't change it. Checked 4 Nov." | **Check again** |
| Not cog | "Needs the Calvin kiosk display (cog). Hallway uses X11." | — |
| Agent too old | "Needs a newer kiosk agent on Hallway (1.4 → 1.6)." | **Update kiosk software**, which goes to the screen's Software section |
| Offline | The rows stay editable. The page header already says the screen is offline; the Brightness note says "Applies when Kitchen is back" | — |

In every unavailable state the toggle is disabled. The exception is Never checked, where turning it on is how the
check starts.

**Power trouble found** (§3.3) is not an unavailable state: the ramp is the software help for it, so the toggle stays
on offer. The Display check row shows "Power trouble at Calvin 12 (6 Nov) · How to fix the power" in amber until a
clean check clears it.

Live states:

- **Turn off now with the ramp on** (owner answer 3). The Screen now note reads "Dimming… then off · about 15 s". The
  time is estimated from the current level and the step. **Turn on now** during the dim cancels it and brightens back
  from where it is. At a schedule boundary the same note appears, starting at the boundary.
- **Ramp turned off while the screen sleeps** (owner answer 4). The toggle row's description becomes "Kitchen is asleep
  at its lowest brightness. At its next wake it brightens to 61 once, carefully, then Calvin stops changing its
  brightness." After that wake it goes back to the normal off description.

## 3. The display check (figs. 3–6; calibration v2)

> **v2, 2026-11-06 (calvin-c805, calvin-u8yn).** This version rewrites steps 1–3 and the fault states after the first
> run on the real Pi 3B+. On that run:
> - Step 2 assumed the panel was at 20, because its read-back is a placeholder 0. It brightened the panel from 5 to 20,
>   which browned it out (under-voltage, touch controller reset).
> - The dialog showed none of this.
> - Step 3 left the owner with three equal buttons: "Nothing tells me if I should add another reading, skip or stop."
>
> Figs. 3–4 in the mock show v1 and are replaced by the state tables below. Figs. 5–6 (the limit step) still apply.

It is a dialog titled **Check the {screen} display**, with four steps shown as a progress strip:

- **1 Find the display**
- **2 Does it change?**
- **3 Match the screen's menu**
- **4 Find the safe limit (optional)**

Steps 1–3 are **calibration**. Step 4 is the only step that ever raises the brightness, and it is a separate opt-in.

### 3.1 The rules calibration follows (owner, 2026-11-06)

1. **Calibration never brightens.**
   - Steps 1–3 stay at or below the **start level**: the brightness the screen was at when the check started.
   - Dimming is always safe.
2. **The start level is either known or not.**
   - **Known:** the screen's read-back is real, or the agent knows the last level it set itself.
   - **Unknown:** the read-back is a placeholder and the agent has never set a level. Calvin first dims the screen to
     the **floor** (Calvin 5) and uses that as the start level.
3. **Two readings make the menu match**, taken at the start level and a little below it (start − 4, never below 0).
   - The match is shown as approximate.
   - A third reading near the top is an optional refinement, offered only once a limit is known.
4. **Power trouble is surfaced, never retried.**
   - **Trouble at idle** before anything changes means the check doesn't start.
   - **Trouble during steps 1–3** ends calibration safely, and the dialog says what happened.
   - **Settling:** after any trouble, Calvin waits for 5 s of clean power before it judges or steps again, so the tail
     of one fault isn't counted as several.
5. **Every state has one primary action and a status line.**
   - The status line sits directly above the primary button and says where you are and what comes next: "1 of 2
     readings · Next, Calvin dims to 15".
   - States where Calvin is busy show the status line with a spinner and have no primary button. **Stop the check**
     stays in the footer throughout.
   - **The exception is a question.** "Did it change?" gets two answer buttons of equal weight, so the design doesn't
     lean the owner towards an answer.

The examples below use a known start of Calvin 19 unless they say otherwise.

### 3.2 States, copy and the primary action

Each table gives the status line, the body copy, then the **primary** action and the secondary actions. A secondary
action is a plain button or a text link, never a second filled button.

**Before step 1: power check (preflight).** It runs as soon as the dialog opens, and nothing is written yet.

| State | Status line | Body | Primary | Secondary |
|---|---|---|---|---|
| Watching | "Checking Kitchen's power before changing anything · 7 s" (counts down from 10) | "Calvin watches the power supply for 10 s while the screen stays as it is." | — (busy) | — |
| Clean | goes straight on to step 1 | — | — | — |
| **Trouble at idle** | "Check not started · power trouble at idle" | **Title** "Kitchen has power trouble already". "Its power supply reported under-voltage while the screen was idle, before Calvin changed anything. A brightness test would only make it worse, so Calvin didn't start." Then the fix line (§3.3) | **How to fix the power** (opens the help page in a new tab) | **Check again** (runs the 10 s power check again; it never repeats on its own) · Close |

**Step 1: Find the display**

| State | Status line | Body | Primary | Secondary |
|---|---|---|---|---|
| Asking | "Step 1 of 3 · Asking Kitchen's screen…" | — | — (busy) | — |
| Found, start known | "Step 1 of 3 · Found · Kitchen is at Calvin 19" | "Found NOMAD TOUCH · DDC/CI 2.1 · HDMI-A-1." "The check stays at Calvin 19 or below. It only dims." | **Next** | — |
| Found, start unknown | "Step 1 of 3 · Found · Kitchen can't report its brightness" | "Found NOMAD TOUCH · DDC/CI 2.1 · HDMI-A-1." "Kitchen always reports brightness 0, so Calvin can't tell how bright it is now. To stay safe, Calvin dims it to 5 first." Then an optional field: "**Before Calvin changes anything:** what Brightness does Kitchen's own menu show now?" with `[ number ]` | **Next: dim to 5** (saves the menu value if one was typed) | "I can't reach the menu now" (text link; same as Next with no value) |
| No DDC | "Check ended · no brightness control" | The No DDC text from §2 | **Close** | **Try again** |

**Why the unknown-start menu question is in step 1** (my call): the owner asked for step 3 to open with the menu value
as it is now. With a known start, step 3 still does, because step 2 returns the screen to the start level. With an
unknown start, step 2 begins by dimming to the floor, which would lose the original value. So the question is asked
once, before that dim.
- **What the answer becomes:** the run's **menu at start**.
- **How it's used:** once two readings exist, Calvin converts it to a Calvin value. The result raises the run's
  ceiling above the floor, so a later third reading can be offered.
- **What the dialog says:** "Kitchen was at menu 28 when you started (about Calvin 5). Calvin stays at or below that."

**Step 2: Does it change?**

| State | Status line | Body | Primary | Secondary |
|---|---|---|---|---|
| Dimming to floor (unknown start only) | "Step 2 of 3 · Dimming Kitchen to 5…" | "Watch Kitchen's screen." | — (busy) | — |
| Testing | "Step 2 of 3 · Dimming 19 → 9 and back · about 8 s" | "Watch Kitchen's screen. It should get dimmer, then come back." | — (busy) | — |
| Question | "Step 2 of 3 · Your answer decides whether Calvin can set the brightness" | "Did Kitchen get dimmer for a moment, then come back?" Below that, small: "Calvin stepped it from 19 down to 9 and back, 2 at a time." | **Yes, it changed** · **No, it looked the same** (two equal answer buttons) | "Show me again" (text link) |
| No | "Check ended · brightness commands don't take effect" | The Writes don't take effect text from §2 | **Close** | **Try again** |

Notes on step 2:
- **The test dims from the start level by up to 10 and back** (start S → max(0, S − 10) → S). With an unknown start,
  that is 5 → 0 → 5.
- **"Show me again" repeats the same dim.** Because the agent ignores an unchanged step, the UI sends it as a new
  target: S − 9 instead of S − 10.

**Step 3: Match the screen's menu.** Readings are saved as they are taken, as today.

| State | Status line | Body | Primary | Secondary |
|---|---|---|---|---|
| Reading 1 | "Reading 1 of 2 · Kitchen is at Calvin 19, unchanged" | "Open Kitchen's own menu (the buttons on the screen) and type the Brightness it shows now. Calvin hasn't changed it." `[ number ]` | **Save reading** | "Skip: finish without a menu match" (text link) |
| After reading 1 | "1 of 2 readings · Next, Calvin dims to 15" | The readings list (1 row) | **Dim to 15 for reading 2** | "Skip: finish without a menu match" |
| Dimming | "1 of 2 readings · Dimming to 15…" | — | — (busy) | — |
| Reading 2 | "Reading 2 of 2 · Kitchen is at Calvin 15" | "Type the Brightness Kitchen's menu shows now." `[ number ]` | **Save reading** | — |
| Matched | "2 of 2 readings · enough for a menu match" | "Menu ≈ 16 + 2.4 × Calvin value. **This is approximate:** both readings are low, so near the top it can be off by about 4 on the menu." With a menu at start, add: "Kitchen was at menu 28 when you started (about Calvin 5). Calvin stays at or below that." | **Next: safe limit (optional)** | Only when a limit is known: "Add a reading near the top (Calvin 22) for a closer match" |
| Room for one reading only | "1 reading · Kitchen is already at its lowest" | "Kitchen started at Calvin 1, so there's no room to dim for a second reading. A menu match needs two, so the slider stays on Calvin's scale." | **Finish with 1 reading** | — |
| Third reading (optional) | "Reading 3 · Kitchen is at Calvin 22" | "Type the Brightness Kitchen's menu shows now." `[ number ]` | **Save reading** | "Skip" |
| Third reading off the line | "3 readings · the last one doesn't line up" | "These readings don't line up: Calvin 22 should be about 69 on the menu, you typed 52. Check the menu and type it again." | **Type it again** (focuses the field for that row) | "Remove it" |

Notes on step 3:
- **The readings list stays visible below the body** in every state after the first save. Each row reads "Calvin 19 ·
  menu 61" with **Remove**. Removing a reading returns to the matching state above.
- **Where the third reading is offered:**
  - in step 3, when a saved limit already exists;
  - on the finish screen, after step 4 has found a limit (§3.4).
- **Its point is limit − 2 × step.** This is the only calibration point above the start level, and it is allowed
  because it is under a known limit.

**Step 4: Find the safe limit.** This step is unchanged from v1 (figs. 5–6): the warning, the on-panel block, **Start
the test** as the primary, the live bar and log, and the full-width **Stop now**. Its status lines:
- **Before it starts:** "Step 4 · optional · raises the brightness until the power shows trouble".
- **While it runs:** "Raising 2 every 1.5 s · Calvin 24 · no trouble yet".

Step 4 also follows the settling rule. It shows faults the same way as §3.3.

### 3.3 Power trouble during the check

**Showing it.** When the agent reports a fault in any step:
- **Banner:** a red banner appears at the top of the body, under the strip. It stays until the dialog closes.
  - Line 1: "**Power trouble at Calvin 12** · under-voltage".
  - Line 2 says what Calvin did: "Calvin is dimming Kitchen to 5 and waiting for the power to settle."
- **One incident:** faults reported while Calvin is still settling join the same incident. The banner keeps the first
  level, and the log adds "also at 8 while settling".
- **Announced once:** the banner is announced once with `role="alert"`.

**A fault in steps 1–3 ends calibration.**

| State | Status line | Body | Primary | Secondary |
|---|---|---|---|---|
| Stopping safely | "Stopping safely · waiting for 5 s of clean power" | The banner | — (busy) | — |
| Ended by power trouble | "Calibration stopped · power trouble at Calvin 12" | **Title** "Kitchen's power supply is too weak". "Kitchen showed power trouble at Calvin 12, even at this low brightness. Calvin dimmed it to 5 and stopped. It won't try again on its own." Then the readings line, then the limit line, then the fix line | **Save 10 as Kitchen's limit** | "How to fix the power" (link) · Done |
| …after saving | "Calvin stays at or below 10 on Kitchen" | "Saved. The ramp and the slider stay under 10 until you fix the power and check again." | **Done** | "How to fix the power" |

The lines in the body:
- **Readings line.** Either "Your 1 reading is saved. A menu match needs 2, so the slider stays on Calvin's scale." or
  "Your 2 readings are saved, so the menu match is kept."
- **Limit line** (my call): "Calvin can keep Kitchen at **10** or below (one step under where the trouble showed)."
  - The offered value is **`faultLimit = min(lastGood, fault.level) − step`** (fault at 12, step 2 → 10). In steps
    1–3 the panel is dimming, so the last clean level is *above* the fault; taking the minimum keeps the offer under
    the fault. Step 4 is unchanged: it is rising, so its last good level is already below the fault.
  - The fault level gives a real limit, and saving it is the one thing in this dialog that protects the screen now.
    So it is the primary action, and the power fix is a link.
  - It follows the same explicit-save rule as step 4: the old limit stays until it is saved, and Done with it unsaved
    asks "Leave without saving limit 10?".
- **Fix line**, used in the preflight state too: "The usual fix is to keep the screen's USB data link from also
  powering it (a USB power blocker on the data leg), or to use a stronger power supply." It ends with **How to fix
  the power**.

**After the dialog.** The Display check row (§2) shows "Power trouble at Calvin 12 (6 Nov) · How to fix the power" in
amber. A later run that passes the power check and steps 1–3 cleanly clears it. The ramp toggle stays available,
because the ramp is the software help for exactly this problem.

### 3.4 Finish screen

It lists what was found, with a tick (✓) or a warning (⚠) per line:
- the display;
- whether changes take effect;
- the menu match, "approximate";
- the limit;
- any power trouble.

It also says what changes because of it: "The Brightness slider now shows the screen's menu numbers".

**The limit is saved explicitly.**
- A limit found in step 4 is only offered. The primary button is **Save 26 as Kitchen's limit**, with a quiet note
  that the old limit stays until it is saved.
- Once it is saved, the screen says "Brightness can go up to 67". The primary then becomes **Done**, with a secondary
  "Add a reading near the top (Calvin 22) for a closer match" when the menu match came from two low readings.
- With an unsaved limit, Done (and ×) asks "Leave without saving limit 26?", with **Save** / **Leave** (Cancel
  stays).

Saved results are per screen and appear in the Display check row and in History.

### 3.5 Rules for the whole dialog

- **Closing the dialog, or Stop the check in the footer, ends the run.**
  - **Calibration never brightens on the way out.** The agent returns the screen to the start level when it is
    known, at the normal pace. When the start was unknown, the screen stays at the floor, and the dialog says on
    close: "Kitchen stays at 5. Set its brightness with the slider or its own menu."
  - **After step 4,** the agent returns to the start level.
- **Footer.**
  - It says "Kitchen is checking every 2 s while this is open".
  - When the agent hasn't answered for 10 s: "Waiting for Kitchen…".
  - After 60 s: "Kitchen isn't answering. Is it on and online?", with **Try again**.
- **One check per screen at a time.** If another device is already running one, the dialog opens read-only: "A check
  is running from another device", with the live progress and Stop. Stop stays available, because it is a safety
  action. Fault banners show there too.
- **The check can't start while the screen is asleep or in a sleep window.** The button is disabled, with "Kitchen is
  asleep. Turn it on now to check it.", and **Turn on now** is the primary.
- **The check needs admin, like every per-screen write.** Without admin, the dialog shows the sign-in prompt first.

### 3.6 Phone layout

- **Full-screen dialog with the 16 px gutter** (no bleed).
- **The status line and the primary button sit in a sticky footer bar.**
  - The order is the status line, then the primary at full width.
  - Secondary actions sit underneath as text buttons.
  - **Stop the check** is the bar's top-right text button.
  - The bar clears the bottom safe area.
  - The answer pair in step 2 sits side by side at 50/50. Below 360 px it stacks, with "Yes" first.
- **The strip uses short labels** below 480 px: "1 Display · 2 Change · 3 Menu · 4 Limit". The current step is bold,
  and the optional step is dashed.
- **The number field and Save reading sit on one row.** The field is 6 ch wide, with `inputmode="numeric"`.
- **The readings list is a stacked list** ("Calvin 19 · menu 61", then **Remove** right-aligned, 44 px high), not a
  table.
- **The fault banner scrolls with the body** and isn't sticky, so it never covers the footer. The status line repeats
  its key fact ("power trouble at Calvin 12").

### 3.7 Needs from backend/agent

Everything below is new unless it says otherwise. The names are suggestions; the lane can rename them.

**Agent (`deploy/kiosk-agent/calvin_display_agent.py`)**

1. **Preflight.**
   - Before the first write of a run, watch the existing fault monitor for 10 s. Report it as
     `preflight: {status: "clean"|"fault", faults: [...]}`.
   - A fault means: end the run with `status: "error"` and `reason: "power_at_idle"`, and write nothing.
2. **Start level.**
   - Report `start: {level, known, source: "read"|"last_set"|null}`.
   - Add `placeholderReads: true|false` to the detect `info` (the read-back is always 0, or doesn't follow a write).
   - **Unknown start:** ramp down to `CHECK_FLOOR = 5` before step 2, and use that as the start.
3. **Calibration ceiling.**
   - Steps 1–3 never write above the run's `ceiling` (defined once, in point 9). The third
     reading's limit − 2 × step point is the only exception (rule 3).
   - `write` steps S → max(0, S − 10) → S. It no longer uses `self.level or brightness_target(...)`, which was the 5 →
     20 jump.
   - `conversion` refuses a value above the ceiling (`error`, `reason: "above_ceiling"`). It doesn't clamp silently.
4. **Fault in steps 1–3.**
   - Stop the step, ramp down to the floor at the normal pace, then settle: 5 s without new faults, capped at 30 s, as
     `wait_for_settle` does.
   - Report `status: "error"`, `reason: "power_trouble"`,
     `fault: {step, level, kind, at, lastGood, alsoAt: [...]}`. `level` is where the fault showed; `lastGood` is the
     last level written before it with no fault (above `level` while dimming). `kind` is one of `under-voltage`,
     `over-current`, `touch controller reset`.
   - The run ends there, with no retry.
5. **Settling in every step, step 4 included.** Faults seen while settling join the incident's `alsoAt`; they never
   start a new step-down.
6. **Ending a run.** Return to `start.level` when it is known; otherwise stay at the floor. Never go above the start on
   the way out of steps 1–3.

**Backend (`display_check.py`, `kiosks.py`)**

7. **Run record fields:** `preflight`, `start`, `ceiling`, `fault` (the incident), `menuAtStart`, and `reason` on
   ending states. These are pass-through from the report, with `ceiling` recomputed from point 9.
8. **`POST /kiosks/{id}/display-check/menu-at-start`**, body `{menu: 0–100}`, admin only. It stores `menuAtStart` on
   the active run (404 when there is no active run).
9. **Ceiling enforcement.**
   - `step`/`start` with `conversion` refuses a value above the run's ceiling: 422 `value_above_ceiling`, with `max`.
     This extends today's `value_above_limit`.
   - The ceiling, used by both the backend and the agent:
     - `base = convert(menuAtStart)` once the fit has 2 points, else `start.level`;
     - `faultLimit = min(fault.lastGood, fault.level) − step` (none when there is no fault);
     - `faultCap = faultLimit − 2×step`;
     - `ceiling = min(base, limit − 2×step, faultCap)`, leaving out the terms that don't exist.
     A known fault or limit always wins over `menuAtStart`; `menuAtStart` can only raise the base, never a cap.
   - The third reading (limit − 2 × step) passes this check because it is under a known limit.
10. **`save-limit` accepts a calibration fault.** With no `steps.limit` result, it saves `faultLimit` (point 9) from
    the latest run's `fault`, never `lastGood` itself. Otherwise it is unchanged, including 409 `no_limit` when there is neither.
11. **Findings gain `powerTrouble: {at, step, level, kind}|null`.**
    - It is set by a preflight fault (`level: null`) or a calibration fault.
    - It is cleared by a later run whose preflight is clean and whose steps 1–3 finish without one.
    - The Display check row reads it.

**Docs**

12. **A help page, `docs/setup/KIOSK_POWER.md`.** It covers how to tell under-voltage happened, a USB power blocker on
    the screen's data leg, and choosing a stronger power supply. **How to fix the power** links to its GitHub URL until
    the app serves docs.

## 4. Words

Use these words everywhere: **Ramp brightness at sleep and wake**, **Brightness**, **Display check** / **Check this
display…**, **menu match**, **safe limit** / **limit**, **Changing…**, **Dimming… then off**, **Applies when {screen}
wakes**, **Last wake**.

Users see "Calvin value", never "DDC" (the only exception is the No DDC message, which names DDC/CI because the
screen's own menu uses that word). Avoid "VCP", "i2c", "throttled" and "brown-out". The log says "under-voltage",
"over-current" and "touch controller reset", because those are what the owner will search for.

## 5. Accessibility and input

- **The slider** is a native range input. It has an accessible value text ("61 on the screen's menu, Calvin value 19")
  and steps by one menu unit (or one Calvin unit) with the arrow keys. It commits on release or on key-up.
- **Live progress** in steps 2 and 4, the status line (§3.1 rule 5) and the Changing… notes go in a polite live
  region. A power-trouble banner is announced once with `role="alert"`. Log lines are not announced
  one by one; only the result is.
- **Touch targets are at least 44 px**, which matters on the 3B+ panel and on phones. **Stop now** is at least 48 px
  high.
- **The number field in step 3** uses `inputmode="numeric"`, so on the kiosk the on-screen keyboard opens with the
  number layout.

## 6. Design-lead calls (the owner can overturn them)

- The Brightness group sits in Power, not in Display.
- There are no Brightness rows on Default; one line explains why.
- The first-time brightness is the lower of "limit minus two steps" and DDC 20.
- Calibration (steps 1–3) never brightens above the start level (owner, v2). Step 2 dims from the start and back.
  Step 3 reads at the start and start − 4; a third point near limit − 2 × step only once a limit is known.
- v2: the unknown-start menu question is asked in step 1, before the dim to the floor (§3.2).
- v2: a calibration fault offers its last good level as the limit, as the primary action (§3.3).
- The check can't run while the screen is asleep.
- If a check is already running, the dialog opens read-only, with Stop still available.
- History keeps the last 20 entries.
- Ramp speed sits behind Change, with a warning.

## 7. Tests the build should have (vitest)

- **The Brightness rows** appear only while the ramp is on.
- **Every unavailable state** shows its text and action, and its toggle is disabled (Never checked opens the check).
- **The slider:**
  - menu scale with a menu match, Calvin scale without one;
  - it can't go past the limit minus two steps;
  - it saves once on release, not during the drag;
  - it shows "Changing…" until the agent reports, and "Applies when Kitchen wakes" while the screen is asleep.
- **Screen now** shows "Dimming… then off" while the ramp is on.
- **Ramp off while asleep** shows the one-last-step-up note.
- **The dialog:**
  - a preflight fault shows the trouble-at-idle state and starts nothing; Check again is manual;
  - step 1 failing ends the run;
  - known start: step 2 and step 3 never ask for a value above the start; unknown start: the floor is used and the
    menu-at-start question appears in step 1;
  - step 2 "No" ends in the writes-don't-take-effect state;
  - every state renders exactly one primary button and a status line (busy states: none, Stop in the footer);
  - step 3: reading 1 at the start, then "Dim to {start − 4}"; Next only after two; fit marked approximate; the third
    reading only when a limit is known; an off-line third reading asks to type it again;
  - a fault report in steps 1–3 shows the banner, then the ended-by-power-trouble state with Save {faultLimit} as the
    primary; settling faults join the same incident;
  - step 4's Start is replaced on the panel itself;
  - Stop is always visible while the test runs;
  - closing the dialog ends the run;
  - a second device sees the read-only view.
- **Screens › Default** shows the one-line note and no rows.
