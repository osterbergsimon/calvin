# Calvin display-power agent for remote-backend kiosks — Design

**Date:** 2026-07-10
**Status:** Approved (design), pending implementation
**Branch:** `develop`

## Problem

Calvin's screen scheduling lives in the backend (`backend/app/services/display_power_service.py`).
Its scheduler loop reads the display schedule from config and calls local `vcgencmd
display_power` / `xset dpms` commands to power the panel on and off. This works only when the
backend runs on the **same machine as the display**.

In the **Mode B** topology (`docs/setup/DEPLOYMENT_TOPOLOGIES.md`) — one central backend, one or
more dumb kiosk Pis pointed at it — the backend runs on a server. Its `display_power_service`
therefore executes `vcgencmd`/`xset` on the *server*, which has no attached kiosk display. Result:
**a Mode-B kiosk has no working screen scheduling at all.** `scripts/setup-kiosk.sh` installs no
screen-control mechanism, so this is a genuine gap in the Mode-B path, not just a one-off.

## Goals

- A Mode-B kiosk powers its screen on/off on the schedule **authored in Calvin's UI** (single
  source of truth stays on the central backend; the Pi holds no schedule state).
- No new runtime dependencies on the kiosk (Raspberry Pi OS ships Python 3 stdlib).
- Robust to network blips: a failed config fetch must **never** blank a working display.
- Matches the backend's scheduling semantics exactly (per-day windows, midnight-spanning,
  timezone-aware) so behaviour is identical whether the backend is local or remote.
- Ship it as a first-class part of `setup-kiosk.sh` so future Mode-B kiosks get it automatically.

## Non-goals

- Idle/inactivity timeout (`display_timeout`). Out of scope for v1; the schedule (time-of-day
  windows) is what "auto screen turn off" means here. May follow later.
- Changing the backend's own local scheduler (Mode A is unaffected).
- Motion/keyboard wake. Scheduled windows only, matching backend behaviour.

## Architecture

A small **long-running local agent** on the kiosk Pi. It does **not poll every minute**. The
scheduled on/off boundaries are computed locally, so the agent sleeps until the *exact* next
boundary and flips the panel precisely then. The only reason to contact the server is to notice
**UI edits** to the schedule, which it does on a slow safety refresh (default 15 min, tunable).

```
┌────────── central server ──────────┐        ┌──────────── kiosk Pi ────────────────┐
│ Calvin backend                     │  HTTPS │ calvin-display-agent.service          │
│  - schedule authored in UI         │ <──────│   calvin_display_agent.py (Type=simple)│
│  - GET /api/config exposes it      │  every │     loop:                             │
│  (display_power_service inert here;│  ~15m  │       fetch /api/config               │
│   no local display)                │  +edits│       apply desired state (on change) │
└────────────────────────────────────┘        │       sleep → min(next boundary, 15m) │
                                               │       vcgencmd / xset local           │
                                               └───────────────────────────────────────┘
```

**Traffic:** ~1 config fetch per refresh interval (≈96/day at 15 min) plus one at each boundary —
versus 1440/day for naive 60s polling. Panel flips happen *at* the boundary, not up to a minute
late.

**Control loop:**
1. Agent reads `CALVIN_BACKEND_URL` (and optional `CALVIN_DISPLAY_REFRESH_SECONDS`, default 900)
   from `/etc/default/calvin-kiosk` — the same env file the kiosk browser uses.
2. `GET ${CALVIN_BACKEND_URL}/api/config` (no auth; already public, consumed by the kiosk browser).
   On failure: keep the last applied state, sleep a short backoff (60s), retry — **never blank on a
   network blip**.
3. Compute desired state for "now", mirroring `display_power_service`:
   - `display_schedule_enabled` false → **on** (schedule disabled ⇒ keep display on).
   - Else find today's entry by `now.weekday()` (0=Mon … 6=Sun — same as backend).
   - Entry missing or `enabled` false → **on**.
   - Else `on`/`off` from `onTime`/`offTime`, midnight-spanning via the backend's exact rule:
     `off < on ⇒ (now ≥ on or now < off)`, else `on ≤ now < off`.
   - Timezone from config `timezone` (via `zoneinfo`); null → system local time.
4. Apply **only when the desired state differs from the last applied state** (plus once at startup),
   to avoid needless HDMI toggling: `vcgencmd display_power 0|1` first; if ineffective, fall back to
   `xset dpms force off|on` (DISPLAY=:0).
5. Compute seconds to the **next boundary**: enumerate each enabled day's on/off datetimes across
   the next ~8 days, take the earliest strictly after "now". Sleep `min(that, refresh_interval)` so
   boundaries are exact *and* edits are still picked up within the refresh window. Loop.

## Components (all new)

| Path | Purpose |
|---|---|
| `deploy/kiosk-agent/calvin_display_agent.py` | The agent (pure Python 3 stdlib), long-running control loop. |
| `deploy/kiosk-agent/test_display_agent.py` | pytest unit tests for decision + next-boundary logic. |
| `deploy/systemd/calvin-display-agent.service` | `Type=simple`, `Restart=always`, `RestartSec=10`; runs the agent as `calvin` with `EnvironmentFile=/etc/default/calvin-kiosk` and `DISPLAY=:0`; `After=calvin-frontend.service`. No timer — the agent sleeps internally. |

**Modified:**
- `scripts/setup-kiosk.sh` — install the script to `/usr/local/bin/`, install+enable the
  service/timer, and write the anti-blank openbox autostart (below).
- `scripts/setup-common.sh` — `configure_openbox_autostart` emits the corrected `xset` block.
- `docs/setup/DEPLOYMENT_TOPOLOGIES.md` — document Mode-B screen scheduling.

## Screen-blanking / DPMS configuration (the subtle part)

The kiosk runs **X11/Xorg**. Two independent concerns must not conflict:

- **Prevent *automatic* blanking** (the original black-screen bug): screensaver + DPMS idle timers
  must be off.
- **Preserve *on-demand* power-off**: the agent's `xset dpms force off` fallback requires DPMS to
  be *enabled* (capability present), just with no idle timers.

Correct openbox `autostart` block (replaces any `xset -dpms`, which would disable the capability
and break scheduled off):

```sh
xset s off        # no screensaver
xset s noblank
xset +dpms        # DPMS capability ON …
xset dpms 0 0 0   # … but no automatic standby/suspend/off timers
```

`vcgencmd display_power` is independent of X DPMS state and is tried first; `xset` is the fallback
for hosts where `vcgencmd` is a no-op under the KMS driver.

## Failure handling

- Config fetch fails / times out → log, **keep the last applied state**, short backoff (60s), retry.
  Never blank a working display on a blip.
- `vcgencmd` absent or ineffective → fall through to `xset`.
- Malformed schedule/time values → treat as "keep on" (matches backend's defensive fallbacks).
- Agent crash → `Restart=always` brings it back; it re-reads config and re-establishes state on
  startup (startup always applies once, regardless of last-state tracking).

## Testing

Pure-logic unit tests (no hardware, no network) over the decision core, pinned from validation
already run against the live server:
- Standard window `06:00–22:00`: off before 06:00, on 06:00–21:59, off from 22:00, off overnight.
- Midnight-spanning `20:00–07:00`: on 20:00→06:59 across midnight, off 07:00–19:59.
- `display_schedule_enabled` false ⇒ always on.
- Day not in schedule / entry disabled ⇒ on.
- Malformed `onTime` ⇒ on (defensive).
- Config-fetch failure path ⇒ no state change (mock the fetch to raise; assert apply not called).

`vcgencmd`/`xset` invocation is covered by asserting the correct command is chosen for on vs off
(subprocess mocked); no real hardware in CI.

**Next-boundary logic** (drives the sleep): with a `06:00–22:00` schedule and injected "now",
`seconds_to_next_boundary` returns the correct next transition — e.g. at 09:00 → next is 22:00
today; at 23:00 → next is 06:00 tomorrow; midnight-spanning `20:00–07:00` at 23:00 → next is 07:00.
Result is always capped by the refresh interval by the caller. "Apply only on change" is verified by
asserting no command is issued when desired state equals last-applied (except the forced startup
apply).

## Integration into `setup-kiosk.sh`

New Mode-B installs get the agent automatically: install the script, install+enable
`calvin-display-agent.timer`, and the corrected autostart block. `CALVIN_BACKEND_URL` already
exists in `/etc/default/calvin-kiosk`, so the agent needs no extra config.

## Deploying to the existing (old-dev) Pi

This session's Pi is an older native install (units `calvin-backend`/`calvin-frontend`, no
`/etc/default/calvin-kiosk`). Manual deploy of the same artifact:
1. Create `/etc/default/calvin-kiosk` with `CALVIN_BACKEND_URL=https://calvin.wholab.xyz`.
2. Install `calvin_display_agent.py` to `/usr/local/bin/`, install+enable the timer.
3. Update the openbox autostart to the corrected `xset` block.
4. Files transferred via `base64 -d | sudo tee` one-liners (the Pi's terminal truncates
   multi-line pastes).

## Verification (live)

1. Deploy; confirm `systemctl list-timers calvin-display-agent.timer` shows it scheduled.
2. Manually confirm which power method works on this panel (`vcgencmd display_power 0` vs
   `xset dpms force off`) and record it.
3. In Calvin's UI, enable the schedule with an off-window covering "now"; within ~60s the panel
   powers down. `journalctl -u calvin-display-agent.service` shows `display -> OFF via <method>`.
4. Move the window so "now" is inside on-hours; panel powers back up.
5. Restore the desired real schedule.
```
