# Brightness ramp and display check: UI

**Date:** 2026-11-04 · **Bead:** calvin-29ws · **Status:** design, for build
**v3 (2026-11-07, calvin-idts / calvin-qkm8 / calvin-mvtv):** §3 rewritten: the owner sets the panel with its own
buttons and Calvin reads. §2 gains a lowest-brightness line and **Clear calibration**.
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
     "Match it to the panel's own menu", that opens the display check.
   - **The highest value you can pick** is the limit minus two steps. The range between that and the limit is drawn
     hatched and can't be reached, with the limit marked and labelled. The note under the slider says "You can go up
     to 67 on the screen's menu (Calvin 22). Above that is too close to the limit the display check found on 4 Nov."
     When no limit has been found, there is no hatch, and the note says "No limit found yet. Run the display check to
     set one" (a link that opens it).
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
   - **Lowest.** A second line shows the floor the check found: "Lowest: Panel 10 (Calvin 2)", the lowest Calvin dims
     to, including the dim sleep. It shows only while a floor is saved.
   - **Clear calibration** sits next to the limit's note and replaces the old "Clear limit". It clears the readings,
     the limit and the floor together (`brightnessConversion`, `brightnessLimit`, `brightnessFloor`). The brightness
     keeps its value, and the slider falls back to Calvin's scale.
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

## 3. The display check (figs. 3–6; calibration v3)

> **v3, 2026-11-07 (calvin-idts, calvin-qkm8, calvin-mvtv).** Rewrites §3 after the second real run on the Pi 3B+.
> v2 wrote brightness values to the panel to find a menu match, and its limit climb browned the panel out.
> **v3 changes who does the work.** The owner sets the panel with its own buttons and Calvin only *reads*.
> - The "does it change?" test (v2 step 2), the two-reading menu match (v2 step 3) and the limit climb (v2 step 4)
>   are gone. The climb is removed from the UI entirely; Calvin never brightens during a check.
> - The run has three readings: the **highest** level that works, an **everyday** level, and the **lowest**.
> - Only **Save** changes anything. A run that doesn't finish keeps the previous calibration.
> - The last v2 text stays in git history (`docs/design/` at `b5827671`), and the mocks' figs. 3–6 are historical.

It is a dialog titled **Check the {screen} display**. The strip shows four steps:

- **1 Find the display**
- **2 Highest level**
- **3 Everyday level**
- **4 Lowest level**

Then a summary, which is not a numbered step. The three levels are always all taken, even when the first reading
matches what was typed.

### 3.1 The rules the check follows

1. **Calvin only reads.** In steps 2–4 it asks the panel what it reports, never writes a level. The one exception is
   the fallback (§3.4), and it only writes low (5, then 1).
2. **The words are "the panel's own menu".** Never put the screen's name in this copy ({screen} names the kiosk in
   the title and in status lines only). A screen named "calvin" must not read as "Calvin's menu" (calvin-mvtv).
   Where a number is shown in two scales it reads **Panel 60 · Calvin 20**: the panel's number first, because that is
   what the person just typed.
3. **Every state has one primary action and a status line.** The status line sits directly above the primary
   button. Busy states have a spinner and no primary button. The footer's **Stop the check** stays throughout.
   There are two exceptions: the number field in a step counts as part of its primary (field + button on one row), and
   **Same as highest** in step 3 is a secondary text button.
4. **Nothing is saved until Save.** Readings live in the dialog. The old calibration is replaced only by **Save**,
   and only with this run's three levels (`brightnessConversion` is *replaced*, not added to).
5. **Power trouble is surfaced, never retried** (§3.5). It never ends the whole check.
6. **Stop always answers at once** (§3.6, calvin-qkm8).

### 3.2 States, copy and the primary action

**Before step 1: waiting for the screen (calvin-elko).** The agent only picks a check up on its next config poll
(up to about a minute), so the dialog first shows "Waiting for the screen to pick up the check. It checks in about
once a minute." with no countdown and Stop available. The power check below starts when the agent's first report for
this run arrives (arrival time in the browser, not the screen's clock).

**Before step 1: power check (preflight).** Unchanged from v2 apart from when it starts: it writes nothing, and
shows "Checking the power before changing anything · 7 s" (no screen name), counting 10 s from the first report. Trouble at idle shows the v2 "has power trouble
already" state with **How to fix the power** as the primary and **Check again** / **Close** as secondaries.

**Step 1: Find the display** (detect)

| State | Status line | Body | Primary | Secondary |
|---|---|---|---|---|
| Asking | "Step 1 of 4 · Asking {screen}'s screen…" | — | — (busy) | — |
| Found | "Step 1 of 4 · Found the display" | "Found NOMAD TOUCH · DDC/CI 2.1 · HDMI-A-1." "Next you'll set the panel's brightness with its own buttons, three times, and Calvin will read what it reports. Calvin won't change the brightness." | **Next** | — |
| No DDC | "Check ended · no brightness control" | The No DDC text from §2 | **Close** | **Try again** |

**Steps 2–4: a level is read.** All three steps share one layout; only the question changes.

| Step | Heading | Body |
|---|---|---|
| 2 | Highest level | "Use the panel's own buttons to set Brightness to the highest level that works: its max, or the highest without flicker or the screen cutting out." |
| 3 | Everyday level | "Now set Brightness to a comfortable level for everyday use. It can be the same as the highest." |
| 4 | Lowest level | "Now set Brightness to the lowest level you'd use, the lowest that is still readable." |

Below the body: "Type the Brightness the panel's own menu shows." and a number field (`inputmode="numeric"`, 6 ch wide).

| State | Status line | Primary | Secondary |
|---|---|---|---|
| Waiting for a number | "Step 2 of 4 · Highest level · type what the panel's menu shows" | **Read it** (disabled until the field holds 0–100) | Step 3 only: **Same as highest** (fills the field with the highest level and reads at once) |
| Reading | "Step 2 of 4 · Reading…" | — (busy) | — |
| Read | "Step 2 of 4 · Highest level · Panel 60 · Calvin 20" | **Next** (step 4: **See the summary**) | **Read it again** (text link) |

Notes:
- **The pair is the result.** After the read the body shows it large, in tabular figures: "Panel 60 · Calvin 20". The
  number field is hidden so nothing looks editable but **Read it again**.
- **A level can't be higher than the one before.** The field refuses a number above the previous level ("The
  everyday level can't be higher than the highest, 60"). It fits the owner's order and keeps the saved floor ≤
  brightness ≤ limit.
- **Same scale.** After step 4, when all three Calvin values equal the typed numbers, the summary says "Calvin and the
  panel use the same scale." Nothing else changes.
- **The first read is not special.** Even when the typed number equals the DDC value, the user does steps 3 and 4.

### 3.3 Fallback: this panel doesn't report its own buttons

After step 4 Calvin checks whether the DDC value followed the buttons. It didn't when **all three reads are equal**, or
when **a read equals the agent's `lastWrite` while the typed number differs from it**.

| State | Status line | Body | Primary | Secondary |
|---|---|---|---|---|
| Explaining | "This panel doesn't report its own buttons" | "Its brightness reading didn't change when you changed it with the buttons. Calvin can still match the panel's menu: it will set the brightness low, twice, and ask what the menu shows each time. It won't go above 5." | **Set 5 and ask** | — |
| Setting 5 / 1 | "Low level 1 of 2 · Setting Calvin 5…" | — | — (busy) | — |
| Question 5 | "Low level 1 of 2 · Calvin 5 · type what the panel's menu shows" | "Type the Brightness the panel's own menu shows now." `[ number ]` | **Save reading** | — |
| Set 1 | "Low level 2 of 2 · Setting Calvin 1…" (busy) then the same question for Calvin 1 | | **Save reading** | — |

Then the summary. The typed highest, everyday and lowest levels are converted with the line fitted through the two low
readings, and **the highest rounds down** (never up). The summary labels the line **approximate**, because the fit
rests on two low points and may be off near the top by a few menu units. If the two typed numbers are equal the fit
is impossible, and the check says "The panel showed the same Brightness at 5 and at 1, so Calvin can't match it. Nothing was
changed." with **Done** and **Try again**.

What is saved in the fallback is the two low pairs as `brightnessConversion` (they are what the line is made of),
plus the three converted values.

### 3.4 Summary

| Status line | Body | Primary | Secondary |
|---|---|---|---|
| "Check finished · not saved yet" | Three rows: **Highest** Panel 60 · Calvin 20; **Everyday** Panel 40 · Calvin 12; **Lowest** Panel 10 · Calvin 2. Then one line saying what Save does: "Saving sets the limit to Calvin 20, the everyday brightness to 12 and the lowest to 2, and replaces the earlier readings." The same-scale or approximate note when it applies. | **Save** | **Try again** |
| "Saved" | "Saved. Brightness can go from Panel 10 to Panel 60." | **Done** | — |

- **Not saved yet, until it is.** The summary's lead reads "Not saved yet" until Save succeeds. **Save** waits for the
  write to land: the button shows a spinner, and "Saved" appears only after the server accepted it. On failure the
  dialog shows the error ("Couldn't save to the server. Check the connection and try again.") and keeps the three
  readings, so **Save** can be tapped again.
- **Order check.** Each read must be no higher (in Calvin values) than the one before: highest ≥ everyday ≥ lowest.
  If it is higher, the panel's reading probably lags the menu by a step. The step says "That reading looks behind"
  and offers **Read it again** as the primary action instead of **Next**.
- **One write.** Save sends a single PATCH of overrides:
  `brightnessConversion` = this run's pairs, `brightnessLimit` = the highest Calvin value, `brightness` = the everyday
  Calvin value, `brightnessFloor` = the lowest Calvin value.
- **The everyday value is held under the limit.** The brightness is never stored above the limit minus two steps
  (§2). When everyday equals highest, the summary says so: "Brightness is kept 4 under the limit."
- **Done before Save asks nothing.** There is no "Leave without saving?" modal; the stopped view (§3.6) says what was kept.

### 3.5 Power trouble during a level

A fault in any of steps 2–4 (or the fallback) shows the red banner from v2 ("Power trouble at Calvin 12 ·
under-voltage", `role="alert"`, announced once, with later faults joining as "also at … while settling").

| State | Status line | Body | Primary | Secondary |
|---|---|---|---|---|
| Fault | "Power trouble · the panel's power dropped at that level" | "The power dropped at that level. Calvin dimmed the screen. Set it back to one step below where it was and read it again." The field is kept with what was typed. | **Read it again** | — |

- **A drop at the highest level (step 2, calvin-tzzx)** does not ask the person to set the panel there again (that
  would brown it out again). The body reads "…Type the Brightness the panel's menu showed just before it dropped.
  Calvin will use one step below it as the highest and won't ask you to set the panel there again." and the primary
  is **Use as highest**. The typed level minus one panel step becomes the highest; the banner goes and the check moves
  on to the everyday level (no "Same as highest" there). After the lowest level the highest's Calvin value comes from
  the line through the everyday and lowest pairs, rounded down; with no usable line the low-level fallback supplies
  it. The summary shows "Highest: Panel 60 · Calvin 18 (it dropped at 62)" and says it is approximate. The worked-out
  pair is not saved as a reading. A drop at the everyday or lowest level keeps **Read it again**.
- **The banner names the panel's level** the person typed ("Power trouble at Panel 60 · under-voltage") when the
  agent reports no Calvin level, and never prints "Calvin" with no number.
- **The agent ends the run itself** (touch may be dead). The dialog does not wait for a tap: the next **Read it again**
  starts a new session if the old one has ended, or reuses it if it hasn't.
- **Nothing from the faulted level is kept.** Pairs already read in this dialog stay on screen, but only Save writes.
- **The limit step never raises the brightness**, so there is no "save the fault level as the limit" offer any more.

### 3.6 Stop (calvin-qkm8) and an unfinished run

**Stop the check** (footer, ≥ 48 px high) has a **visible pressed state at once**, on `pointerdown`, before the
request returns: the button darkens, shows a spinner and reads "Stopping…" (`aria-pressed="true"`). Then, in **every
step** until the agent reports the run finished:

- **Status line:** "Stopping, bringing brightness down". It is busy, with no primary button.
- **Repeated taps are safe.** Each tap sends Stop again; the dialog shows no error and keeps the same text.
- **Touch may drop during a fault.** The agent ends the run on its own at the first fault, so Stop is a backstop.

**The stopped / ended view says exactly what was kept.** It replaces v2's "Check stopped" + "Try again" only:

| Ending | Status line | Body | Primary | Secondary |
|---|---|---|---|---|
| Stopped | "Check stopped" | "Nothing changed; the previous calibration is still in place." (With no earlier calibration: "Nothing changed; no calibration is saved yet.") | **Done** | **Try again** |
| Timed out, restarted, error | "Check ended" | The reason, then the same "Nothing changed…" line | **Done** | **Try again** |
| No DDC / no control | as §3.2 | | **Close** | **Try again** |

Nothing is saved from an unfinished run.

### 3.7 Rules for the whole dialog

- **Watching another device.** When the watched run ends, the read-only view gives way to an ended state
  ("The check on the other device ended"), with **Done** and **Try again**. A reloaded browser recognises its own
  run again (the run ids it started are kept in the tab's session storage).
- **Fallback levels never dead-end.** The two low writes are min(5, the run's ceiling, the start level) and then
  min(1, …), at least 1.
- **Closing the dialog, or Stop the check, ends the run.** Closing before Save keeps the previous calibration. The
  agent returns the screen to where it was.
- **Footer**, **one check per screen**, **asleep**, **admin**: unchanged from v2 (§3.5 there). A read-only dialog (a
  run from another device) keeps Stop.
- **Phone layout** is unchanged from v2: full-screen, sticky bar with the status line then the primary at full width,
  secondaries under it as text buttons, and Stop the check at the bar's top right. The number field and **Read it**
  share one row. The strip uses short labels below 480 px: "1 Display · 2 Highest · 3 Everyday · 4 Lowest".

### 3.8 Needs from backend/agent (lane A)

- Step **`read`** returns `{level, lastWrite}`: `level` is the DDC reading; `lastWrite` is the last value the agent
  wrote, or `null`. It writes nothing.
- Every step request carries a per-run **`seq`** that the agent echoes in its result, so the dialog matches each
  read to the request it sent (three reads in a row each resolve).
- Step **`limit`** is removed. A run has `detect`, `read`, `conversion` (the fallback, low only) and `write` is no longer asked for.
- A per-screen key **`brightnessFloor`** (0–100, no higher than `brightnessLimit`).
- The agent ends a run itself on the first fault and reports `fault` as in v2.
- `value_above_ceiling` etc. for the fallback stay as they are.

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
- v2: the unknown-start menu question is asked in step 1, before the dim (§3.2).
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
