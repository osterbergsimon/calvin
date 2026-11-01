# Getting Started with Calvin

Calvin is a self-hosted Raspberry Pi dashboard — calendars, photos, web
services — with a Vue 3 frontend and a FastAPI backend. This page gets
you running in development and points you at the right deployment doc
for production.

## Two things you might want to do

- **Run Calvin in development** to hack on it. → [Development](#development)
- **Deploy Calvin to a Raspberry Pi** to actually use it. →
  [Deployment](#deployment)

## Prerequisites

- **Docker** (with Compose v2) — required for the dev workflow.
- **Git**.
- **`uv`** and **Node.js 20+** — only needed if you want to run native
  tests, linters, or formatters in your editor. Not needed to run the
  app.

The backend targets Python 3.12+, but you don't install Python locally
unless you're running native tooling — the dev container ships with
the right interpreter.

## Development

The dev workflow is Docker Compose. One stack runs the backend with
hot-reload (`uvicorn --reload`) and the frontend with the Vite dev
server, both bind-mounting your checkout.

```bash
git clone https://github.com/osterbergsimon/calvin.git
cd calvin

make install   # creates docker/.env from the example, one-time
make dev       # starts the dev stack, streams logs
```

Windows uses the same targets through a PowerShell wrapper:

```powershell
.\make.ps1 install
.\make.ps1 dev
```

**Access points:**
- Backend + API: <http://localhost:8000>
- Frontend dev server (with HMR): <http://localhost:5173>
- API docs: <http://localhost:8000/docs>

`make dev-down` stops the stack. `make doctor` checks your Docker
install and shows what ports are in use. `make clean` tears the stack
down and removes dev data.

### VS Code Dev Containers

The repo ships a `.devcontainer/` config. Open the folder in VS Code,
run **Dev Containers: Reopen in Container**, and you get the same dev
stack with extensions pre-installed.

### Running tests, lint, format, type-check natively

These targets shell out to `uv` and `npm` directly (faster than
round-tripping through Docker, and they integrate with editors):

```bash
make test          # backend pytest + frontend vitest
make lint          # ruff + eslint
make format        # ruff format + prettier
make type-check    # mypy + vue-tsc
```

`make type-check` type-checks the backend with mypy and the frontend with
`vue-tsc`, but the frontend scope is deliberately narrow: only `src/api/`
(including the generated `types.ts`) is checked. The rest of the frontend is
JavaScript, so `.vue` and `.js` files are not type-checked yet.

If you don't have `uv`/`node` installed, the Windows setup script
(`.\setup-windows.ps1`) and the Linux dev script
(`scripts/setup-dev.sh`) install them for you. They are otherwise
unnecessary.

### Sample data

Calvin can fill itself with realistic sample content — a calendar, photos and
two dashboard pages — so you can try it, take screenshots, or run a demo
before connecting any accounts. No accounts or internet access are needed,
and nothing you created is touched:

```bash
# Dev stack: the compose stack keeps its data in docker/.calvin-dev-data.
make demo-seed DATA_DIR=$PWD/docker/.calvin-dev-data

# Native install: the same data dir the service uses (CALVIN_DATA_DIR, or
# backend/data when unset).
cd backend && uv run python -m app.demo seed

# Remove exactly the seeded items again.
make demo-clear DATA_DIR=$PWD/docker/.calvin-dev-data
```

For a Docker install, point `--data-dir` at the directory bind-mounted as
`/var/lib/calvin`, or run the command inside the container.

`seed` adds:

- a sample calendar with events anchored to today (served by the backend at
  `/api/demo/calendar.ics`, so it also works in Docker),
- twelve small CC0 sample photos in the local photos source,
- two pages — “calendar + photos” and “photo frame” — and the room name
  “Demo Room”, but **only when you have no pages of your own** (Calvin's
  untouched default “Home” page is replaced),
- a manifest at `<data-dir>/demo/manifest.json` marking every seeded item.

`clear` reads that manifest and removes only those items, so your own
calendars, photos, pages and room name survive both commands. Plugin
instances load at startup, so restart Calvin after seeding or clearing to
see the change.

The two sample pages (and the room name) are only added when you have no
pages of your own. Calvin's untouched default “Home” page is replaced; as
soon as you rename, edit or add a page, seeding leaves your pages alone.
The calendar and photos are added either way.

The equivalent commands are `uv run python -m app.demo seed|clear` from
`backend/`; add `--data-dir DIR` to point at another data directory and
`--calendar-url URL` if the backend is not reachable at
`http://127.0.0.1:<API_PORT>`.


## Deployment

Production runs in one of two shapes — see
**[Deployment Topologies](DEPLOYMENT_TOPOLOGIES.md)** for the full
comparison and the security caveats.

**Mode A — All-in-one Pi.** One Pi runs backend, frontend, and the
kiosk browser. Easiest to set up. From the Pi:

```bash
# Stable release (replace v0.1.0 with the latest tag from
# https://github.com/osterbergsimon/calvin/releases)
curl -fsSL https://raw.githubusercontent.com/osterbergsimon/calvin/v0.1.0/scripts/setup.sh \
  | sudo GIT_BRANCH=v0.1.0 bash
sudo reboot
```

The script installs Docker, the kiosk dependencies, the published runtime
image for that release, and the systemd units. The dashboard comes up at
`http://localhost:8000` after reboot.

The kiosk browser is **cog** (WPE WebKit) by default, the same as on a kiosk Pi.
Add `--display-stack x11` for X11 + Chromium instead
(`... | sudo GIT_BRANCH=v0.1.0 bash -s -- --display-stack x11`). A re-run keeps
the stack the Pi already has; an older all-in-one Pi stays on X11 until you
re-run setup with `--display-stack cog`. See
[Display stack](KIOSK_INSTALL.md#display-stack-cog-default-everywhere-wayland-opt-in).

When the kiosk runs Chromium (X11 or Wayland), on Pi 3-class boards (Pi 3/3B+, Zero 2 W, CM3) the kiosk runs Chromium without
its GPU path, because that path crashes the dashboard renderer on their VC4
graphics; Pi 4/5 keep it. The flags live in
`/etc/default/calvin-kiosk-display`; see
[Pi 3 and GPU](KIOSK_INSTALL.md#pi-3-and-gpu) for the override.

Testers can track the integration branch instead. It runs the `:develop` image
and moves with every push:

```bash
curl -fsSL https://raw.githubusercontent.com/osterbergsimon/calvin/develop/scripts/setup.sh | sudo bash
```

`main` is release-only and is never installed directly — releases are installed
by tag. Pass `GIT_BRANCH=<branch-or-tag>` after `sudo`
(`... | sudo GIT_BRANCH=v0.1.0 bash`) to pin another ref, or `--mode dev` for
a hot-reload Pi. Details in
[SETUP_LINUX.md](SETUP_LINUX.md) and
[SETUP_SCRIPTS.md](SETUP_SCRIPTS.md#installing-a-release-versus-develop).
Before the first release exists, use the `develop` command.

**Mode B — Remote backend + kiosk Pi.** A home server runs the
backend; one or more Pis run only Chromium pointed at the server's
URL. Move SQLite and photos off the SD card, share one backend across
multiple displays.

For Unraid, use the Docker template in [UNRAID.md](UNRAID.md).

```bash
# Server: same Docker compose as Mode A.
docker compose -f docker/docker-compose.yml up -d

# Pi (kiosk only):
sudo bash scripts/setup-kiosk.sh --backend-url http://homeserver.local:8000
sudo reboot
```

Details and the picker table live in
[DEPLOYMENT_TOPOLOGIES.md](DEPLOYMENT_TOPOLOGIES.md).

The Pi's display-agent (rotation, resolution, on/off schedule) can be updated
later without SSH or re-flashing: click **Update** on the kiosk in Settings →
Screens, and it pulls a verified bundle from the server on its next poll. See
[Kiosk agent self-update](KIOSK_PROVISIONING.md#kiosk-agent-self-update).

## First sign-in

A fresh install has no admin password. Open **Settings** and Calvin asks for a
one-time **setup code** together with the password you want. The code is in the
server log, and in `setup-code.txt` in the data directory:

```bash
# Docker / Compose
docker logs calvin | grep "Calvin setup code"

# Unraid (Docker tab → Calvin → Logs works too)
docker logs calvin | grep "Calvin setup code"

# Pi all-in-one
sudo journalctl -u calvin-app -n 100 | grep "Calvin setup code"
```

A kiosk that reaches Calvin over loopback (`http://localhost:8000`) shows the
code on its own setup screen. Once a password exists the code stops working.
For a headless install you can choose the code up front with
`CALVIN_SETUP_CODE`; see [Admin authentication](../configuration/ADMIN_AUTH.md#first-run).

## Verifying it works

After `make dev` (or after a Pi reboot), check:

- `http://localhost:8000/api/health` returns `{"status":"healthy"}`.
- `http://localhost:8000/` shows the dashboard.
- `http://localhost:8000/docs` shows the API.

In dev, `http://localhost:5173/` is the Vite-served frontend with HMR;
it proxies API calls to the backend on `:8000`.

## Troubleshooting

**Port already in use** (`8000` or `5173`):

```bash
make dev-down       # stop the dev stack first
lsof -i :8000       # Linux/macOS — find the holdout
# Windows: netstat -ano | findstr :8000  ;  taskkill /PID <pid> /F
```

**Docker permission denied (Linux)**: add yourself to the `docker`
group, then re-login.

```bash
sudo usermod -aG docker $USER
newgrp docker
```

**Pi services not starting**:

```bash
sudo systemctl status calvin-app
sudo journalctl -u calvin-app -n 50
sudo systemctl status calvin-cog          # Mode A, cog (default)
sudo systemctl status calvin-kiosk        # Mode A, X11/Wayland (Chromium)
sudo systemctl status calvin-kiosk-remote # Mode B
```

**Native tooling missing** (only matters if you run `make test` /
`lint` / etc.): re-run `.\setup-windows.ps1` or
`scripts/setup-dev.sh`, or install `uv` and Node 20+ manually.

## Next steps

- [Plugin Development Guide](../plugins/PLUGIN_DEVELOPMENT_GUIDE.md) —
  write your own plugin.
- [Deployment Topologies](DEPLOYMENT_TOPOLOGIES.md) — pick a runtime
  shape.
- [Documentation index](../index.md) — everything else.

## Related docs

- [Deployment Topologies](DEPLOYMENT_TOPOLOGIES.md) — Mode A vs Mode B.
- [SETUP_LINUX.md](SETUP_LINUX.md) — native Linux development guide, plus the Pi production quick start.
- [SETUP_WINDOWS.md](SETUP_WINDOWS.md) — native Windows tooling setup.
- [SETUP_SCRIPTS.md](SETUP_SCRIPTS.md) — setup-script reference.
- [QUICKSTART_DEVELOP.md](QUICKSTART_DEVELOP.md) — terse dev setup.
- `docker/README.md` — Docker compose reference.
