# Brightness ramp and display check: UI

**Date:** 2026-11-04 · **Bead:** calvin-29ws · **Status:** design, for build
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

Live states:

- **Turn off now with the ramp on** (owner answer 3). The Screen now note reads "Dimming… then off · about 15 s". The
  time is estimated from the current level and the step. **Turn on now** during the dim cancels it and brightens back
  from where it is. At a schedule boundary the same note appears, starting at the boundary.
- **Ramp turned off while the screen sleeps** (owner answer 4). The toggle row's description becomes "Kitchen is asleep
  at its lowest brightness. At its next wake it brightens to 61 once, carefully, then Calvin stops changing its
  brightness." After that wake it goes back to the normal off description.

## 3. The display check (figs. 3–6)

It is a dialog titled **Check the {screen} display**, with four steps shown as a progress strip. Steps 1–3 follow each
other and step 4 is optional, so the numbers are a real sequence:

1. **Find the display.** This runs on its own as soon as the dialog opens: "Asking Kitchen's screen…". On success:
   "Found NOMAD TOUCH · DDC/CI 2.1 · HDMI-A-1". If the screen's reads are placeholders, it adds: "The screen always
   reports brightness 0, so Calvin needs your eyes for the next step." On failure: the No DDC text from §2 with **Try
   again**, and the check ends there.
2. **Does it change?** "Did Kitchen get dimmer for a moment, then brighter again?" The sub-line says what Calvin did:
   "Calvin stepped it from 19 down to 9 and back, 2 at a time. That took about 8 s." The test dims rather than
   brightens, so it can't go over an unknown limit. There are three buttons: **Yes, it changed** / **No, it looked the
   same** / **Show me again**. "No" ends the check in the "Writes don't take effect" state.
3. **Match the screen's menu.** "Calvin set Kitchen to 19. Open the screen's own menu (the buttons on the screen) and
   type the Brightness it shows."
   - There is a number field and **Save reading**, and a table of the readings, each with **Remove**.
   - Calvin picks the points: 5 first, then the middle of the known-safe range, then near its top. It never picks a
     point above the limit, and without a limit it stays at 20 or below.
   - After two readings it shows the fit in words: "menu ≈ 16 + 2.3 × Calvin value". If a third reading is off the
     line by more than 5 menu units, it says "These readings don't line up. Check the last one".
   - **Add a reading** sets the next point. **Next** needs at least two readings. **Skip this step** is allowed.
4. **Find the safe limit** (optional). Before it starts, a plain warning (fig. 6): "Calvin raises the brightness until
   the power supply shows trouble. Then it steps back down and remembers that level as Kitchen's limit. Calvin never
   goes above it. While it runs, the screen may flicker, its touch may stop for a few seconds, and in the worst case
   it may restart." The buttons are **Start the test** and **Skip, finish**.
   - **On the panel itself** (the browser's kiosk id is the screen being checked), Start is replaced by a red note:
     "You're on Kitchen itself. Run this step from your phone or computer, because the touch screen can stop
     responding mid-test" (owner answer 2).
   - **While it runs** (fig. 5): a large live level, a bar from 0 to 100 with the fault level marked once it is found,
     the line "Raising 2 every 1.5 s and watching for power trouble", and a plain log ("24 · fine", "28 · touch
     controller reset", "→ back down to 24", "Limit found: 26"). **Stop now** is full-width and always visible. Stop
     asks the agent to step back down to the brightness, at the normal pace. It never jumps.
   - **After a fault**: "Limit found: 26. Kitchen is going back to 19." Then: "If this page closes, Kitchen finishes
     safely on its own."
   - **If Kitchen restarts mid-test**: "Kitchen restarted. That's the limit at work. Waiting for it to come back…",
     then the result once the agent reports it.

**Finish screen.** It lists what was found, with a tick or a warning per line, and what changes because of it: "The
Brightness slider now shows the screen's menu numbers" and "Brightness can go up to 67". Its button is **Done**. All
results are saved per screen and appear in the Display check row and in History.

**Rules for the whole dialog**

- **Closing the dialog, or Stop the check in the footer, ends the run.** The agent returns the screen to its
  brightness at the normal pace. The footer says "Kitchen is checking every 2 s while this is open". When the agent
  hasn't answered for 10 s, it says "Waiting for Kitchen…"; after 60 s, "Kitchen isn't answering. Is it on and
  online?" with **Try again**.
- **One check per screen at a time.** If another device is already running one, the dialog opens read-only: "A check
  is running from another device", with the live progress and Stop. Stop stays available, because it is a safety
  action.
- **The check can't start while the screen is asleep or in a sleep window.** The button is disabled with "Kitchen is
  asleep. Turn it on now to check it." That keeps kiosk tests outside the sleep window (functional spec §5).
- **The check needs admin, like every per-screen write.** Without admin, the dialog shows the sign-in prompt first.

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
- **Live progress** in steps 2 and 4 and the Changing… notes go in a polite live region. Log lines are not announced
  one by one; only the result is.
- **Touch targets are at least 44 px**, which matters on the 3B+ panel and on phones. **Stop now** is at least 48 px
  high.
- **The number field in step 3** uses `inputmode="numeric"`, so on the kiosk the on-screen keyboard opens with the
  number layout.

## 6. Design-lead calls (the owner can overturn them)

- The Brightness group sits in Power, not in Display.
- There are no Brightness rows on Default; one line explains why.
- The first-time brightness is the lower of "limit minus two steps" and DDC 20.
- Step 2 dims rather than brightens. Step 3's points stay at 20 or below until a limit is known.
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
  - step 1 failing ends the run;
  - step 2 "No" ends in the writes-don't-take-effect state;
  - step 3 needs two readings to go on, shows the fit, and warns about an outlier;
  - step 4's Start is replaced on the panel itself;
  - Stop is always visible while the test runs;
  - closing the dialog ends the run;
  - a second device sees the read-only view.
- **Screens › Default** shows the one-line note and no rows.
