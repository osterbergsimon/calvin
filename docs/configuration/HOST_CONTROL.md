# Host control (`CALVIN_HOST_CONTROL`)

Some Calvin actions act on the machine the backend runs on, not just on the
web UI: rebooting, restarting the `calvin-backend`/`calvin-frontend` systemd
units, running the update script, and driving the local display with
`vcgencmd`, `xset` and `xrandr`.

`CALVIN_HOST_CONTROL` decides whether Calvin may do that. It defaults to on
only when Calvin owns the machine; everywhere else the routes answer
`409` and never run the command.

## Default rule

| Deployment | Default |
|---|---|
| Native install on a Raspberry Pi, not a dev checkout (`backend/.dev` absent) | **on** |
| Native backend on a desktop/laptop, or any dev checkout | off |
| Docker container (compose, the Pi image, Unraid) | off |

The backend evaluates this once at startup from `CALVIN_DEPLOYMENT`,
`is_dev_mode` and a Raspberry Pi check, and reports the result as
`host_control` in `GET /api/system/environment`.

Containers never control the host. In a container these routes are refused
with the container instructions (use the Docker/Unraid update flow), even if
`CALVIN_HOST_CONTROL=1` is set.

## Overrides

```bash
CALVIN_HOST_CONTROL=1   # Calvin owns this machine: allow host actions
CALVIN_HOST_CONTROL=0   # never act on the host, on any deployment
```

An explicit value always wins. Set `1` on a Pi install that is not detected
as one (unusual kernel/device-tree), or on another single-purpose kiosk
machine you are happy to let Calvin reboot.

## What is disabled when it is off

- `POST /api/system/reboot`
- `POST /api/system/restart-backend`
- `POST /api/system/restart-frontend`
- `POST /api/system/update`
- `POST /api/system/reload-ui`
- `POST /api/system/display/power/on` and `/off`
- `POST /api/system/display/timeout/configure`
- Applying a saved display rotation / orientation to the physical display

The startup display-orientation sync and the display power scheduler are
skipped entirely, with one log line, so a dev backend never runs `xrandr` or
`xset` against the developer's desktop.

The routes answer:

```json
{
  "detail": {
    "code": "host_control_disabled",
    "message": "Rebooting is disabled on this deployment. Set CALVIN_HOST_CONTROL=1 if Calvin owns this machine."
  }
}
```

The UI shows that message instead of a generic error. Reads such as
`GET /api/system/display/power/state` still work; they only query the display.
