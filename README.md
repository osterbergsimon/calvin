# Calvin - Lightweight DAKBoard Alternative

A lightweight, self-hosted home dashboard for Raspberry Pi that displays
calendars, photos, and external web services. It ships a Vue 3 frontend, a
FastAPI backend, and a plugin system — and it runs happily on a single Pi or as
a backend serving several kiosk displays.

## ✨ Features

- **📅 Calendar Integration** — Google Calendar, ICS/CalDAV sources, and plugins
- **🖼️ Photo Slideshow** — Local folders, Immich, Unsplash, and more
- **🌐 Web Services** — Embed dashboards, maps, home-automation UIs
- **⌨️ Keyboard Navigation** — Compact 7-button keypads and full keyboards,
  handled in the browser (no kernel input devices needed)
- **🔌 Plugin System** — Calendar, image, service, and backend plugins
- **📱 Kiosk Mode** — One server, many displays; per-kiosk content and rotation
- **🐧 Cross-Platform** — Develop on Windows/Linux, deploy on Raspberry Pi

## 🚀 Prerequisites

Running Calvin (any topology below) needs:

- **Docker Engine + Compose v2** — on Raspberry Pi OS Bookworm/Trixie the setup
  script installs both; it is the only runtime dependency for the server.
- **Git** — to clone the repository.
- A **Raspberry Pi 3B+ or newer** (or any always-on Linux host) for deployment.

For **native development** (tests, linters, formatting) you also need:

- **Python 3.12+**
- **Node.js 20+**
- **uv** (installed by the dev setup scripts if missing)

## 🧭 Pick a topology

Calvin supports three deployment shapes. The full comparison, including
security caveats, is in
[docs/setup/DEPLOYMENT_TOPOLOGIES.md](docs/setup/DEPLOYMENT_TOPOLOGIES.md);
the guided tour is
[docs/setup/GETTING_STARTED.md](docs/setup/GETTING_STARTED.md).

### 1. All-in-one Pi (default)

One Pi runs the backend, the frontend, and the kiosk browser. Simplest option,
and the one to pick for a single display.

```bash
# Stable release: pin the latest tag from
# https://github.com/osterbergsimon/calvin/releases
curl -fsSL https://raw.githubusercontent.com/osterbergsimon/calvin/v0.1.0/scripts/setup.sh \
  | sudo GIT_BRANCH=v0.1.0 bash
sudo reboot
```

The script installs Docker, the published runtime image for that release, the
kiosk dependencies, and the systemd units. The dashboard comes up at
`http://<pi>:8000` after reboot. Details:
[docs/setup/SETUP_LINUX.md](docs/setup/SETUP_LINUX.md) and
[docs/setup/SETUP_SCRIPTS.md](docs/setup/SETUP_SCRIPTS.md#installing-a-release-versus-develop).

Testers can track `develop` instead (the `:develop` image, rebuilt on every
push). It is also the only installable ref until the first release is cut — use
this command until `vX.Y.Z` shows up on the releases page:

```bash
curl -fsSL https://raw.githubusercontent.com/osterbergsimon/calvin/develop/scripts/setup.sh | sudo bash
sudo reboot
```

### 2. Remote backend + kiosk Pi

A home server runs the backend (SQLite, photos, plugins); one or more Pis run
only Chromium pointed at the server URL. Use this to keep data off the SD card
or to drive several displays from one backend.

```bash
# Server: same Docker image as Mode A
docker compose -f docker/docker-compose.yml up -d

# Pi (kiosk only)
sudo bash scripts/setup-kiosk.sh --backend-url http://homeserver.local:8000
sudo reboot
```

Or install the kiosk straight from the running server:
`curl -fsSL http://homeserver.local:8000/api/kiosks/install.sh | sudo bash`.
See [KIOSK_INSTALL.md](docs/setup/KIOSK_INSTALL.md) and
[KIOSK_PROVISIONING.md](docs/setup/KIOSK_PROVISIONING.md).

### 3. Unraid / home-server Docker

Run the backend as a Docker container on Unraid (or any home server) and point
kiosk Pis at it. Follow the template and volume layout in
[docs/setup/UNRAID.md](docs/setup/UNRAID.md).

## 🛠️ Development

The dev workflow runs the whole stack in Docker: the backend with
`uvicorn --reload` and the frontend with Vite HMR, both bind-mounting your
checkout.

```bash
git clone https://github.com/osterbergsimon/calvin.git
cd calvin

make install   # one-time: creates docker/.env from docker/dev.env.example
make dev       # starts the dev stack and streams logs
```

- Frontend (HMR): <http://localhost:5173>
- Backend / API docs: <http://localhost:8000> · <http://localhost:8000/docs>

`make dev-down` stops the stack, `make doctor` checks Docker and ports, and
`make clean` removes the stack and its dev data. Windows uses the same targets
through `.\make.ps1`.

Each checkout gets its own compose project, so several worktrees can run at
once; give a second one different `CALVIN_PORT` / `CALVIN_FRONTEND_PORT`
values in its `docker/.env`. The dev data lives in `docker/.calvin-dev-data/`,
never in the host's `/var/lib/calvin`.

VS Code users can open the folder and run **Dev Containers: Reopen in
Container** to get the same stack with extensions pre-installed.

### Native toolchain (optional)

Tests, linting, formatting, and type checks run natively:

```bash
cd backend
uv sync --extra dev
uv run pytest

cd ../frontend
npm install
npm test          # vitest run (one shot)
npm run test:watch
```

`make test`, `make lint`, `make format`, and `make type-check` wrap these.
Linux contributors have the same targets; NixOS users can `nix-shell` for a
pinned toolchain.

**Keyboard support** is browser-side: `KeyboardHandler.vue` listens for DOM
`keydown` events; there is no backend hardware-keyboard (`evdev`) path, so no
kernel headers or `--extra linux` install are needed.

## 📁 Project Structure

```
calvin/
├── backend/          # FastAPI backend
│   ├── app/
│   │   ├── api/      # API routes
│   │   ├── models/   # Data models
│   │   ├── plugins/  # Plugin system
│   │   ├── services/ # Business logic
│   │   └── utils/    # Utilities
│   └── tests/        # Test suite
├── frontend/         # Vue 3 frontend
│   └── src/
│       ├── components/  # Vue components
│       ├── stores/      # Pinia stores
│       └── services/    # API services
├── docker/           # Dockerfile + compose files (prod and dev)
├── deploy/           # systemd units, kiosk agent, production env example
├── scripts/          # Setup scripts and CI helpers
└── docs/             # Documentation
```

Runtime data (`CALVIN_DATA_DIR`: SQLite, images, plugins) lives outside the
checkout — `/var/lib/calvin` in production, `docker/.calvin-dev-data/` in dev.

## 🔌 Plugin System

Plugins are self-contained directories with a `plugin.json`, a `plugin.py`,
and optional pre-built frontend assets. They install live — no restart and no
host-side rebuild.

- [Plugin Development Guide](docs/plugins/PLUGIN_DEVELOPMENT_GUIDE.md)
- [Plugin Installation](docs/plugins/PLUGIN_INSTALLATION.md)
- [Plugin Package Format](docs/plugins/PLUGIN_PACKAGE_FORMAT.md)

The reference plugins live in
[osterbergsimon/calvin-plugins](https://github.com/osterbergsimon/calvin-plugins).

## 📚 Documentation

- **Online documentation**: <https://osterbergsimon.github.io/calvin/>
- **Releases**: <https://github.com/osterbergsimon/calvin/releases> · process in [docs/RELEASING.md](docs/RELEASING.md)
- **Getting started**: [docs/setup/GETTING_STARTED.md](docs/setup/GETTING_STARTED.md)
- **Deployment topologies**: [docs/setup/DEPLOYMENT_TOPOLOGIES.md](docs/setup/DEPLOYMENT_TOPOLOGIES.md)
- **Documentation index**: [docs/index.md](docs/index.md)
- **Locally**: `mkdocs serve` from the project root

## 📄 License

GPLv3 — see [LICENSE](LICENSE).
