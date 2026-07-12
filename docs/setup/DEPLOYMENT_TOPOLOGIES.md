# Deployment Topologies

Calvin's backend serves both the API (`/api/*`) and the built frontend
(`/`) from a single FastAPI process. That gives you flexibility in how
you split the work across hosts. Two shapes are officially supported.

## Mode A — All-in-one Pi (default)

The Pi runs everything: backend, frontend, and the kiosk browser.

```
┌─────────────────────────── Raspberry Pi ───────────────────────────┐
│                                                                    │
│   Chromium (kiosk) ──> http://localhost:8000  ──> Calvin backend   │
│                                                  │                 │
│                                                  └── SQLite, data  │
└────────────────────────────────────────────────────────────────────┘
```

Use when:
- One Pi, simple setup.
- You want the SD card / SSD to be the single source of truth.

Setup:

```bash
sudo bash scripts/setup.sh --mode prod
```

See [SETUP_LINUX.md](SETUP_LINUX.md) for the full walkthrough.

## Mode B — Remote backend + kiosk Pi

The backend (and its data) live on a home server. One or more Pis run
**only** Chromium, pointed at the server's URL.

```
┌─────── Home server ───────┐         ┌──── Raspberry Pi ────┐
│                           │         │                      │
│   Calvin backend          │ <─────  │   Chromium (kiosk)   │
│   ├── SQLite, photos      │   LAN   │                      │
│   └── plugin data         │         │                      │
└───────────────────────────┘         └──────────────────────┘
```

Use when:
- You already run a 24/7 server and don't want SQLite / photos / plugin
  data on the Pi's SD card.
- You want multiple kiosk Pis sharing one backend (each just runs
  Chromium against the same URL).
- Plugin syncs are heavy and you want them on a beefier host.

### Why no proxy on the Pi?

The kiosk Pi opens the server's URL directly in Chromium. From the
browser's view it's same-origin: the server hosts both `/` and
`/api/*`. No CORS, no reverse proxy on the Pi, no env vars baked into
the frontend. The Pi is genuinely "dumb."

### What stays on the Pi

- X server, openbox, Chromium — installed by `setup-kiosk.sh`.
- Display / cursor / screensaver tweaks.
- Anything OS-level you've added (e.g. a hardware reboot button script
  driven by `evdev`). Calvin's app code does not handle hardware input
  in the browser path; physical buttons are wired up at the OS level.

### What moves to the server

- The backend Docker container (or whatever you use to run it).
- `/var/lib/calvin/` — SQLite database, photos, plugin install dirs.
- The frontend rebuild that runs after a plugin install (the server
  has more headroom than a Pi 3).

### Setup

**1. Server.** Run the standard backend deployment, but bind the port
to a LAN-reachable interface. On Unraid, use the Docker template in
[UNRAID.md](UNRAID.md). On a regular Linux server, the simplest path is
the same Docker compose used in Mode A:

```bash
# On the server (any Linux box with Docker):
git clone https://github.com/osterbergsimon/calvin.git
cd calvin
cp deploy/calvin.env.example docker/.env
# Edit docker/.env — set CALVIN_PORT, DATABASE_URL, etc. as needed.
docker compose -f docker/docker-compose.yml up -d
```

Verify it answers from another host on the LAN:

```bash
curl http://<server-host>:8000/api/health
```

Pin the server to a stable hostname (mDNS `homeserver.local`, a static
DHCP lease, or a DNS entry) so the kiosk URL doesn't drift.

**2. Pi.** Run the kiosk-only setup:

```bash
sudo bash scripts/setup-kiosk.sh --backend-url http://homeserver.local:8000
```

The script installs `xserver-xorg`, `openbox`, `chromium`, and friends;
writes `/etc/default/calvin-kiosk` with the backend URL; and enables
two systemd units:

- `calvin-x.service` — starts the X server on tty1.
- `calvin-kiosk-remote.service` — waits for the backend to answer,
  then launches Chromium in kiosk mode against `CALVIN_BACKEND_URL`.

Reboot. Chromium opens to the dashboard.

### Screen scheduling on a Mode-B kiosk

Calvin's screen on/off schedule is authored in the dashboard UI, but the
backend cannot reach a remote kiosk's display. `setup-kiosk.sh` therefore
installs **`calvin-display-agent.service`**, a small local agent that reads the
schedule from `${CALVIN_BACKEND_URL}/api/config` and powers the panel with
`vcgencmd`/`xset`. It computes on/off boundaries locally (no per-minute
polling) and re-checks the schedule every `CALVIN_DISPLAY_REFRESH_SECONDS`
(default 900) to pick up edits. Set the schedule in the UI as usual; the kiosk
follows it. Logs: `journalctl -u calvin-display-agent.service`.

### Screen rotation on a Mode-B kiosk

Screen rotation is **physical to each Pi**, so it lives in the device-local
`/etc/default/calvin-kiosk`, not in the (global) server config. Set
`CALVIN_DISPLAY_ROTATION` to an `xrandr` value — `normal`, `left`, `right`, or
`inverted` — and the display-agent applies it once on startup (auto-detecting
the connected output, or use `CALVIN_DISPLAY_OUTPUT` to name it):

```
CALVIN_DISPLAY_ROTATION=left
# CALVIN_DISPLAY_OUTPUT=HDMI-1   # optional; auto-detected if unset
```

Then `sudo systemctl restart calvin-display-agent.service`. This replaces the
old backend-side `display_orientation_service`, which cannot reach a remote
kiosk's display. (Per-device settings are tracked under epic `calvin-dd9`.)

### Kiosk identity

Each kiosk Pi has a stable **`CALVIN_KIOSK_ID`** in `/etc/default/calvin-kiosk`,
generated by `setup-kiosk.sh` as `<hostname>-<machine-id suffix>` (a stock Pi
image defaults its hostname to `raspberrypi`, so the machine-id suffix keeps
multiple Pis unique). Rename it to something friendly (`kitchen`, `hallway`) and
`sudo systemctl restart calvin-kiosk-remote.service`.

The kiosk's Chromium opens `${CALVIN_BACKEND_URL}/?kiosk=<id>`, so the server
learns which kiosk is talking to it: every `/api/config?kiosk=<id>` request
registers the kiosk (id, hostname, last-seen). List known kiosks with
`curl http://<server>:8000/api/kiosks`. A request with **no** id behaves exactly
as before — this is the foundation the per-kiosk config model builds on.

### Per-kiosk configuration

Each kiosk reads its **effective config** from `GET /api/kiosks/<id>/config` — the
global config with that kiosk's overrides applied (device-physical values like
rotation included; the browser ignores what it can't act on, the display-agent
applies them). The response carries an `ETag`/`deviceConfigVersion` so a client can
cheaply detect device-physical changes (`If-None-Match` → `304`).

Per-kiosk overrides are edited via `GET/PUT /api/kiosks/<id>/overrides` (a sparse
layer that replaces on PUT). `GET /api/config` is now **global-only** (Mode-A Pis and
the template new kiosks inherit). List known kiosks with `curl http://<server>:8000/api/kiosks`.

**Assigning content to a kiosk.** Two override keys control which screens a kiosk shows:
`availableScreens` (a list of screen ids the kiosk may switch between — omit for all) and
`defaultScreenId` (the screen it boots into). Set them via
`PUT /api/kiosks/<id>/overrides`. In this mode the active screen is **local to each kiosk** —
switching screens on one kiosk (keyboard or on-screen dots) no longer changes the others, and
a kiosk boots to its `defaultScreenId`. The screen catalog itself is authored once, globally.

### Changing the backend URL later

```bash
sudo nano /etc/default/calvin-kiosk
sudo systemctl restart calvin-kiosk-remote.service
```

### CORS

Mode B does **not** require any CORS configuration: the browser hits
the server's URL directly, so requests to `/api/*` are same-origin.

CORS only matters if you run `npm run dev` on a different host than
the backend (e.g. hacking on the frontend from a laptop while pointing
at the home server). For that case the backend already exposes
`CORS_ORIGINS` and `CORS_ALLOW_ALL` env vars — see
[backend/app/config.py](../../backend/app/config.py).

### Security note

Calvin's backend has no built-in authentication. Mode B exposes it on
your LAN, so:

- Bind to the LAN interface, not `0.0.0.0` on a host that's reachable
  from the internet.
- Don't port-forward it. If you need remote access, put it behind a
  VPN or reverse proxy with auth.

## Picking a mode

| Question                                           | Mode A  | Mode B   |
| -------------------------------------------------- | ------- | -------- |
| Single Pi, no other hardware                       | ✅      |          |
| Already run a 24/7 home server                     |         | ✅       |
| Multiple displays sharing one dashboard            |         | ✅       |
| Want SQLite + photos off the SD card               |         | ✅       |
| Want everything reachable on first boot, no LAN    | ✅      |          |
| Plugin installs are heavy (image processing)       |         | ✅       |

You can switch later — both modes use the same backend image and the
same `/var/lib/calvin/` data layout. Migrating is mostly: stop the
backend on the Pi, copy `/var/lib/calvin/` to the server, start it
there, and reflash the Pi with `setup-kiosk.sh`.
