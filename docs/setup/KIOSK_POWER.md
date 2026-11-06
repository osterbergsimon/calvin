# Kiosk power: fixing under-voltage with a USB touch panel

Calvin's display check stops and shows **power trouble** when the kiosk's power supply sags while the screen's brightness changes. This page explains what that means and how to fix it.

## Why it happens

Many touch panels are powered over USB and also send their touch data over USB. If the panel's USB cable plugs into a Raspberry Pi, the panel can draw part of its 5 V from the Pi's USB port as well as from its own power supply. The Pi's USB ports can't supply that much current. The backlight is the biggest load, and it surges when the screen wakes from standby or when its brightness rises.

When the supply sags:

- the Pi reports **under-voltage** (and may log USB over-current);
- the panel's touch controller resets (a "USB reset" in the kernel log);
- in the worst case the Pi resets.

A panel that works at boot and at low brightness, but fails when it wakes or gets brighter, is the typical pattern.

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

## The fix

Use one or both of these:

1. **Cut the 5 V on the data leg.** Put a data-only USB link between the panel and the Pi: a USB cable or adapter with the power line blocked (often sold as a "USB power blocker" or "data-only adapter"). The Pi still gets the touch data, but the panel takes all its power from its own supply.
2. **Give the panel its own power supply**, a good one, plugged into the panel's power input (not the Pi). Use a supply rated for the panel's full draw, with margin.

Also check the Pi's own supply. A Pi 3B+ wants a good 5 V 2.5 A supply, and a thin or long cable can sag on its own. A supply that is too weak shows up as under-voltage even with nothing else attached.

## After fixing it

1. Run `vcgencmd get_throttled` while the screen is on and again after waking it. It should stay at `0x0`.
2. Run the display check again from Calvin. A check that passes the power check and steps 1 to 3 cleanly clears the power-trouble line on the screen's Display check row.
3. Remove any brightness limit you saved only to protect the supply, or run the safe-limit step again to find the new one.

Until the power is fixed, Calvin stays at or below the limit you saved, and the brightness ramp helps by changing brightness in small steps.
