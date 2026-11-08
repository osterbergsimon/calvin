# Kiosk power: fixing under-voltage with a USB touch panel

Calvin's display check stops and shows **power trouble** when the kiosk's power supply sags while the screen's brightness changes. This page explains what that means and how to fix it.

## Why it happens

Many touch panels are powered over USB and also send their touch data over USB. If the panel's USB cable plugs into a Raspberry Pi, the panel can draw part of its 5 V from the Pi's USB port as well as from its own power supply. The Pi's USB ports can't supply that much current. The backlight is the biggest load, and it surges when the screen wakes from standby or when its brightness rises.

When the supply sags:

- the Pi reports **under-voltage** (and may log USB over-current);
- the panel's touch controller resets (a "USB reset" in the kernel log);
- in the worst case the Pi resets.

A panel that works at boot and at low brightness, but fails when it wakes or gets brighter, is the typical pattern.

## Under-voltage or a touch-only reset

The two signs mean different things, and Calvin reports them separately.

- **Under-voltage** (`Under-voltage detected!`, or bit `0x1` in `vcgencmd get_throttled`): the Pi's own 5 V rail sagged. The Pi's supply or cable, or the panel drawing from the Pi, is the cause.
- **Touch-only reset** (`usb 1-1.1: reset full-speed USB device` with no under-voltage line): only the panel's USB link dropped. It can happen when the panel's own supply sags at a high backlight level, even though the Pi stayed healthy. The touch stops for a moment, then comes back, and it can repeat for a minute or so.

A touch-only reset still counts as power trouble, because the cure is the same. Calvin waits for it to stop before it starts another check. After a drop, the next check shows "Waiting for the touch controller to settle", and starts once the touch controller has been quiet for 20 s (it gives up waiting after 90 s and checks the power as usual).

## How to tell it happened

On the Pi, run:

```bash
vcgencmd get_throttled
```

A result of `0x0` means no trouble. These bits matter here:

| Bit | Meaning |
|---|---|
| `0x1` | Under-voltage now |
| `0x4` | Throttled now |
| `0x10000` | Under-voltage has occurred since boot |
| `0x40000` | Throttling has occurred since boot |

For example, `0x50005` means under-voltage and throttling both happened and are happening now.

The kernel log shows the same events:

```bash
journalctl -k | grep -iE "under-?voltage|over-current|usb .*reset"
```

Calvin's display check watches for exactly these signs. It checks the power for 10 s before it changes anything, and it never retries on its own after a fault.

## The panel keeps its level across a power cut

The panel remembers its brightness when the power goes. If the Pi crashed or lost power while the panel was at a high level, the panel comes back at that same high level and can brown out again while the Pi is booting. That can stop the Pi from booting at all.

To recover:

1. Unplug the panel's **USB cable** (the data leg) before you start the Pi, so the Pi boots without the panel's load.
2. Let the Pi finish booting.
3. Plug the USB cable back in.
4. If the panel is still bright, use its own buttons to set Brightness lower, then run the display check again.

This is why Calvin drops the screen to a low level as soon as it sees a fault, and why it starts the screen at the lowest level and brings it up after it turns on, once the ramp is saved.

## The level that works depends on load, and it can change

The highest brightness that is safe is not a fixed property of the panel. It depends on everything else drawing from the same supply: other USB devices, how warm the Pi is, a camera or Wi-Fi burst, and how old the supply and cable are. A level that passed the check last month can brown out today.

- The check proves the level worked during the check, not for ever.
- If you see power trouble in the Display check row later, run the check again and save a lower limit.
- Leave some margin. Calvin saves the highest level that passed, and the ramp never goes above it, but a supply that is only just enough has no room for a busy moment.

After Read it on the highest step, Calvin holds for about 10 s ("Checking the power at this level") before you can go on. A brownout in that time means the level isn't safe, so Calvin discards the reading and asks you to set the panel one step lower.

## The fix

Use one or both of these:

1. **Cut the 5 V on the data leg.** Put a data-only USB link between the panel and the Pi: a USB cable or adapter with the power line blocked (often sold as a "USB power blocker" or "data-only adapter"). The Pi still gets the touch data, but the panel takes all its power from its own supply.
2. **Give the panel its own power supply**, a good one, plugged into the panel's power input (not the Pi). Use a supply rated for the panel's full draw, with margin.

The power blocker is the fix that lasts. Lowering the limit only avoids the problem at one load; a blocker removes the path that lets the panel pull from the Pi at all.

Also check the Pi's own supply. A Pi 3B+ wants a good 5 V 2.5 A supply, and a thin or long cable can sag on its own. A supply that is too weak shows up as under-voltage even with nothing else attached.

## After fixing it

1. Run `vcgencmd get_throttled` while the screen is on and again after waking it. It should stay at `0x0`.
2. Run the display check again from Calvin. A check that passes the power check and steps 1 to 3 cleanly clears the power-trouble line on the screen's Display check row.
3. Remove any brightness limit you saved only to protect the supply, or run the safe-limit step again to find the new one.

Until the power is fixed, Calvin stays at or below the limit you saved, and the brightness ramp helps by changing brightness in small steps.
