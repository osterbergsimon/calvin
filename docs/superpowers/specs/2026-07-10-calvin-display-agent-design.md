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

A small **local agent** on the kiosk Pi, run periodically by a systemd timer:

```
┌────────── central server ──────────┐        ┌──────────── kiosk Pi ────────────┐
│ Calvin backend                     │  HTTPS │ calvin-display-agent.timer (60s)  │
│  - schedule authored in UI         │ <──────│   └─ .service (oneshot)           │
│  - GET /api/config exposes it      │        │       └─ calvin_display_agent.py  │
│  (display_power_service inert here;│        │            GET /api/config        │
│   no local display)                │        │            compute desired on/off │
└────────────────────────────────────┘        │            vcgencmd / xset local  │
                                               └───────────────────────────────────┘
```

**Data flow (every ~60s):**
1. Timer fires the oneshot service.
2. Agent reads `CALVIN_BACKEND_URL` from `/etc/default/calvin-kiosk` (the same env file the kiosk
   browser uses — one source of truth for the backend location).
3. Agent `GET ${CALVIN_BACKEND_URL}/api/config` (no auth; endpoint is already public and consumed
   by the kiosk browser).
4. Agent computes desired state, mirroring `display_power_service`:
   - `display_schedule_enabled` false → **on** (schedule disabled ⇒ keep display on).
   - Else find today's entry by `now.weekday()` (0=Mon … 6=Sun — same as backend).
   - Entry missing or `enabled` false → **on**.
   - Else `on`/`off` from `onTime`/`offTime`, with midnight-spanning via the backend's exact rule:
     `off < on ⇒ (now ≥ on or now < off)`, else `on ≤ now < off`.
   - Timezone from config `timezone` (via `zoneinfo`); null → system local time.
5. Agent applies the state: `vcgencmd display_power 0|1` first; if that isn't effective, fall back
   to `xset dpms force off|on` (DISPLAY=:0). On config-fetch failure it logs and exits 0 without
   touching the display.

## Components (all new)

| Path | Purpose |
|---|---|
| `deploy/kiosk-agent/calvin_display_agent.py` | The agent (pure Python 3 stdlib). |
| `deploy/kiosk-agent/test_display_agent.py` | pytest unit tests for the decision logic. |
| `deploy/systemd/calvin-display-agent.service` | `Type=oneshot`; runs the agent as `calvin` with `EnvironmentFile=/etc/default/calvin-kiosk` and `DISPLAY=:0`. |
| `deploy/systemd/calvin-display-agent.timer` | `OnBootSec=20`, `OnUnitActiveSec=60`; `WantedBy=timers.target`. |

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

- Config fetch fails / times out → log, exit 0, **leave display unchanged** (never blank on a blip).
- `vcgencmd` absent or ineffective → fall through to `xset`.
- Malformed schedule/time values → treat as "keep on" (matches backend's defensive fallbacks).
- Agent runs as `oneshot`; a crash affects only that tick. The next timer fire retries.

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
