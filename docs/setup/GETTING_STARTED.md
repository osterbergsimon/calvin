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

If you don't have `uv`/`node` installed, the Windows setup script
(`.\setup-windows.ps1`) and the Linux dev script
(`scripts/setup-dev.sh`) install them for you. They are otherwise
unnecessary.

## Deployment

Production runs in one of two shapes — see
**[Deployment Topologies](DEPLOYMENT_TOPOLOGIES.md)** for the full
comparison and the security caveats.

**Mode A — All-in-one Pi.** One Pi runs backend, frontend, and the
kiosk browser. Easiest to set up. From the Pi:

```bash
curl -fsSL https://raw.githubusercontent.com/osterbergsimon/calvin/main/scripts/setup.sh | sudo bash
sudo reboot
```

The script installs Docker, the kiosk dependencies, the published
runtime image, and three systemd units. The dashboard comes up at
`http://localhost:8000` after reboot.

Use `GIT_BRANCH=develop` (with `sudo -E`) to track the develop branch,
or `--mode dev` for a hot-reload Pi. Details in
[SETUP_LINUX.md](SETUP_LINUX.md).

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
Kiosks, and it pulls a verified bundle from the server on its next poll. See
[Kiosk agent self-update](KIOSK_PROVISIONING.md#kiosk-agent-self-update).

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
sudo systemctl status calvin-kiosk        # Mode A
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
- [SETUP_LINUX.md](SETUP_LINUX.md) — full Pi production walkthrough.
- [SETUP_WINDOWS.md](SETUP_WINDOWS.md) — native Windows tooling setup.
- [SETUP_SCRIPTS.md](SETUP_SCRIPTS.md) — setup-script reference.
- [QUICKSTART_DEVELOP.md](QUICKSTART_DEVELOP.md) — terse dev setup.
- `docker/README.md` — Docker compose reference.
