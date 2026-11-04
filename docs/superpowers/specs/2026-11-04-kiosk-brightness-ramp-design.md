# Kiosk brightness ramp at sleep/wake, and a display diagnostics helper

Status: design, owner-approved functionality (2026-11-04). UI/UX goes through the design lead. Bead: calvin-29ws.
Motivation and evidence: calvin-ppiu.

## 1. Why

On the Pi 3B+ kiosk the touch panel (Logicom NOMAD TOUCH) is fed by a Y-cable: USB-C into the panel, the data
leg into the Pi, the power leg into a PSU. With no power blocker on the data leg, the panel also draws 5 V through
the Pi. When the panel **wakes from standby at normal brightness** (schedule off, then on; or a manual turn off,
then on), the surge browns out the Pi. The persistent journal shows `Undervoltage detected!`, then the panel's touch
controller (`27c0:0859`) resetting every ~2 s, then the Pi resetting, in a loop. The Pi's USB hub also logged
`over-current change` on its ports. Measured on 2026-11-04:

- At panel-menu brightness 0–1, off → on works (one wake still dipped under-voltage for ~20 s, then recovered).
- Raising brightness in one DDC step (0 → 50) reset the touch controller. Raising it in steps of 2 every 1.5 s was
  fine up to DDC 26; at DDC 28 the touch controller reset; the Pi stayed up.
- DDC and the panel's own menu use different scales: DDC 5 → menu 28, DDC 19 → menu 61, DDC 22 → menu 67
  (≈ menu 16 + 2.3 × DDC). The panel's DDC read-back is a placeholder: brightness and contrast always read 0.

The hardware fix (a USB power blocker on the data leg) is coming. But other people's kiosks will have the same
class of problem: a USB-powered panel, a weak supply, a panel whose wake surge is too much. A per-screen ramp makes
the wake gentle, and a helper lets someone find out what their panel supports and where its limit is.

## 2. Goals

1. A per-screen setting, **Ramp brightness at sleep and wake** (on/off; default off), and a **Brightness** value
   (DDC 0–100) that Calvin applies after boot and after every wake.
2. When the ramp is on, the display agent:
   - before the panel sleeps (schedule boundary, "Turn off now", any off), steps the brightness **down** to 0,
     then runs the normal off;
   - after the panel wakes, and after boot, waits until the panel and its USB devices have settled, then steps
     the brightness **up** to the chosen value.
3. A **display diagnostics helper**, run from Calvin settings on any device (phone, desktop browser, or the kiosk
   panel itself once it's onboarded), that:
   1. checks whether the screen answers over DDC/CI at all (detect, model, VCP version);
   2. checks whether brightness **writes take effect**, even when reads lie (the owner confirms what they see);
   3. builds a **DDC → panel-menu conversion** from the owner's readings (set a DDC value, the owner types in the
      menu value; at least two points), so the UI can show "≈ menu 61" next to the DDC value;
   4. optionally runs a **careful ramp test** that finds the level where the hardware faults (under-voltage,
      over-current, a USB device reset) and stores it as this screen's **brightness limit**. Calvin then never
      steps above it, even if the slider asks for more.
4. The agent records what it did, so it can be read back. Diagnostics results and each ramp's outcome are visible
   to the owner in settings, and in the kiosk's journal.

## 3. Non-goals

- Fixing power hardware. The ramp is mitigation; the setup docs should say that a USB-powered touch panel needs a
  data-only (power-blocked) link to a Pi.
- Automatic brightness (ambient light, time-of-day curves).
- DDC power control. Some monitors can't be woken over DDC; the MSI G241 on the Pi 400 is one (see memory
  `pi400-monitor-freesync`). Power stays with the existing DPMS/fb path.
- Non-cog display stacks in this round. X11/Wayland kiosks keep today's behaviour; the setting is hidden or
  disabled there, saying why.
- Plain browsers (no kiosk agent): the setting and the helper are unavailable there.

## 4. Anti-goals (would be a failure even if it "works")

- **A big brightness step.** Any single write larger than the configured step (default 2 DDC units) is a bug.
  That's exactly what reset the touch controller on 2026-11-04.
- Brightness changes while the panel is asleep or waking, before it has settled.
- A diagnostics run that can leave the screen dark, or at a level above the limit, if the page or the network
  goes away mid-run. The agent owns the run and always finishes it in a safe state.
- Any change in behaviour for screens with the setting off. The agent never touches brightness unless the
  setting is on, or a diagnostics run is active.
- Flapping: a ramp must not race another on/off. A new on/off cancels the running ramp cleanly.

## 5. Constraints and facts

- The DDC work runs in the **display agent on the Pi** (`deploy/kiosk-agent/calvin_display_agent.py`): only it can
  reach the panel. It calls `ddcutil` (already used on the Pi 400; it needs the `ddcutil` package and the `i2c-dev`
  module, so `install-kiosk.sh` and the updater must provide both). On the 3B+ the bus was `/dev/i2c-2`, connector
  `card0-HDMI-A-1`. Use `--bus` (or the connector) to stay fast; `ddcutil detect` is slow.
- Power on/off on cog goes through `calvin-cog-panel.sh on|off` (`apply_on_cog`). The ramp wraps it: down, then
  `off`; `on`, then settle, then up.
- Settle signal after wake (my call; the builder may refine it): DRM connector `connected`, plus no new
  `usb … reset` / `Undervoltage` kernel lines for ~5 s, plus `calvin-cog` active. Cap the wait at ~30 s, then ramp
  anyway, still with fault checks.
- Fault detection during any ramp: `vcgencmd get_throttled` bit 0 (under-voltage now), and new kernel lines
  matching `Undervoltage detected`, `over-current`, `usb .*: reset`. On a fault: stop, step back down by two steps,
  record the level, and don't retry above it until the next wake.
- The agent's normal poll is 60 s (`DEFAULT_REFRESH_SECONDS`). Diagnostics need a back-and-forth with the owner,
  so while a diagnostics run is requested the agent polls every 1–2 s (my call), and falls back afterwards and
  after a timeout (~10 min).
- Settings follow the settings-scope spec (`docs/design/2026-11-03-settings-scope.md`). The ramp, the brightness,
  the conversion and the limit are **per-screen** (device-physical) values with no household default except
  "ramp off". They're added as per-screen descriptors next to `displayScheduleEnabled` in
  `frontend/src/utils/screenOverrides.js`, typed on the backend's per-screen write paths.
- The kiosk config the agent polls is `/api/kiosks/{id}/config` (`backend/app/api/routes/kiosks.py`). The agent
  already reports `kagent`/`kstat`/`kmsg` on that poll; diagnostics results need a small structured report
  channel (a POST from the agent, or richer poll params; the builder chooses), stored per kiosk and shown in
  settings.
- Kiosk agent self-update ships through the bundle; a backend that offers the setting to an agent too old to
  honour it must say so ("update the kiosk agent") rather than silently doing nothing.
- Never run kiosk tests during a sleep window (see memory `pi-kiosk-webdriver-testing`).

## 6. Decided (by the owner)

- Setting shape: **ramp at sleep/wake y/n**; if yes, **which brightness to set once up** (after boot and wake).
- Brightness is the value set in **Calvin's screen settings**, applied over DDC.
- A helper to diagnose when DDC and the screen don't match, run from **Calvin settings on a phone, a browser, or
  the panel itself** if it's onboarded.
- UI/UX by the design lead; functionality as above.

Answers to the design lead's review (owner, 2026-11-04, all as recommended):

1. **The Brightness slider applies now** while the screen is awake: ramped at the same step to the new value, never
   above the limit, with "Changing…" feedback. It's also re-applied after boot and every wake.
2. **The limit-finding ramp test may crash or reboot the kiosk**, so it's offered **only from another device**
   (phone or desktop), never from the kiosk panel itself. The panel offers the safe steps only (detect, writes,
   conversion). Warn before starting that the screen may restart; the agent finishes a run safely on its own after
   a reboot.
3. **"Turn off now" dims first, then turns off** ("Dimming… then off" in the UI). At a schedule boundary the dim
   **starts at the boundary**, not early.
4. **Turning the ramp off while the screen sleeps** (at DDC 0): at the next wake the agent does one last careful
   step-up to the chosen brightness, then stops touching brightness. This is the only exception to "never touch
   brightness when the ramp is off".
5. **With a conversion, the slider reads in the panel's own menu numbers** ("≈ 61 on the screen's menu", with the
   DDC value in small text); storage stays DDC. Without a conversion it uses DDC units, with a pointer to the helper.
   This replaces the first item in section 7.

6. **"Dim only" sleep mode** (owner, 2026-11-04 late). Per screen: **At sleep: Standby** (default, today's
   behaviour) **or Dim only**. With Dim only, a sleep (schedule boundary or "Turn off now") ramps the brightness down
   to 0 and leaves the panel and the page running: no DPMS power-down, cog keeps running. A wake ramps back up to the
   chosen brightness. It needs DDC (it's unavailable where DDC isn't). Trade-off shown in the UI: the backlight never
   fully turns off and the page keeps running. Coordinator calls: dim to DDC 0; the setting lives in the same
   Brightness group; it doesn't require "Ramp brightness" to be on (Dim only always ramps). Config key: sleepMode =
   "standby" | "dim".

## 7. My calls (marked; the owner can overturn them)

- The slider is on the **DDC scale (0–100)**, because that's what Calvin controls. With a conversion, the UI also
  shows the estimated panel-menu value. Without one, it shows the DDC value only and says why.
- Default step: 2 DDC units every 1.5 s (tonight's proven-safe pace), configurable per screen in advanced settings.
- Ramp down before sleep goes to DDC 0.
- The conversion is linear from ≥2 points (the owner can add more); show "estimated".
- If the helper's ramp test found a limit, the brightness slider's max is the limit minus two steps.
- With the ramp off, the agent never touches brightness. With it on but DDC unsupported, the setting shows as
  unavailable for that screen, with the helper's finding.

## 8. Left to the builder

- The diagnostics protocol between backend and agent (job request in the config poll, report endpoint, storage).
- How the helper's steps look and read (the design lead's mock), within section 2.3.
- Where the ramp state machine lives in the agent, and its tests (the agent already has `test_display_agent.py`).
- Packaging `ddcutil` + `i2c-dev` for new installs and existing kiosks through the updater.
- Docs: a short page on USB-powered touch panels (data-only link), the setting, and the helper.

## 9. Verification (the coordinator, on the real kiosks, outside the sleep window)

- Pi 3B+ without the blocker, ramp on, brightness at the owner's level: turn off, wait more than 1 min, turn on.
  There are no resets and no `usb … reset` lines; brightness steps up after settle.
- The same with the schedule boundary as the trigger.
- The helper on the 3B+ reproduces tonight's findings: writes take effect, reads are placeholders, a conversion of
  ≈ 16 + 2.3 × DDC, a limit near DDC 26–28.
- Pi 400 (MSI G241): DDC brightness only, never DDC power; the ramp off leaves it untouched.
