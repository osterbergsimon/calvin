# Setup Scripts Documentation

Calvin provides automated setup scripts for different environments. These scripts have been refactored for better maintainability and robustness.

## Script Structure

The setup scripts use a shared utility library (`scripts/setup-common.sh`) that provides common functions for:
- Logging and error handling
- User management
- Package installation
- Service configuration
- Verification steps

This shared approach reduces code duplication and makes the scripts more maintainable.

## Available Scripts

### Production Setup (`scripts/setup.sh`)

**Purpose:** Complete production setup for Raspberry Pi or Linux systems.

**Features:**
- Creates `calvin` user if it doesn't exist
- Installs kiosk dependencies, Docker, and the Docker Compose plugin
- Clones/configures Git repository
- Creates runtime data directories under `/var/lib/calvin`
- Installs `/etc/calvin/docker-compose.yml` and `/etc/calvin/.env` (compose auto-loads the latter)
- Configures `calvin-app.service`, `calvin-x.service`, and `calvin-kiosk.service`
- Sets up display and kiosk mode
- Configures auto-start on boot

**Usage:**

```bash
# Standard installation (develop branch)
wget -O- https://raw.githubusercontent.com/osterbergsimon/calvin/develop/scripts/setup.sh | sudo bash

# Or using curl
curl -fsSL https://raw.githubusercontent.com/osterbergsimon/calvin/develop/scripts/setup.sh | sudo bash
```

**Using another branch or a fork:** put the variables *after* `sudo` so they
reach the script (`sudo` drops your environment, and `VAR=x curl ...` only sets
them for `curl`):

```bash
curl -fsSL https://raw.githubusercontent.com/<you>/calvin/<branch>/scripts/setup.sh \
  | sudo GIT_REPO=https://github.com/<you>/calvin.git GIT_BRANCH=<branch> bash
```

The default branch is `develop` (`main` is release-only). The Docker image tag
follows the branch: `main` runs `:latest`, any other branch `:develop`. Pin a
specific image the same way with `CALVIN_IMAGE_TAG=<tag>`.

**What Happens:**
1. System packages are updated
2. Kiosk packages are installed, plus Docker CE and the compose plugin from
   download.docker.com (the Debian/Raspberry Pi OS `docker.io` has no compose v2;
   an existing working `docker compose` is left alone). Any apt failure stops setup.
3. Repository is cloned/updated to `/home/calvin/calvin`
4. Compose configuration is installed under `/etc/calvin`
5. Runtime data directories are created under `/var/lib/calvin`
6. Systemd services are installed and enabled
7. Display is configured for kiosk mode
8. System is ready - **reboot required** to start services

**After Setup:**
```bash
sudo reboot
```

After reboot, the dashboard will automatically start and be available at `http://localhost:8000`.

### Development Setup (`scripts/setup.sh --mode dev`)

**Purpose:** Development setup with hot reload for Raspberry Pi.

**Features:**
- Installs the same kiosk and Docker runtime
- Uses `docker/docker-compose.dev.yml`
- Bind-mounts `/home/calvin/calvin` into the app container
- Sets up hot reload for backend and frontend
- Keeps the kiosk pointed at `http://localhost:8000`

**Usage:**

```bash
# Standard development installation
wget -O- https://raw.githubusercontent.com/osterbergsimon/calvin/develop/scripts/setup.sh | sudo bash -s -- --mode dev

# Or using curl
curl -fsSL https://raw.githubusercontent.com/osterbergsimon/calvin/develop/scripts/setup.sh | sudo bash -s -- --mode dev
```

**Using another branch or a fork:** as for production, pass the variables
after `sudo`: `... | sudo GIT_BRANCH=<branch> bash -s -- --mode dev`.

**What Happens:**
1. Same base setup as production
2. The dev compose file is installed to `/etc/calvin/docker-compose.yml`
3. The checkout is bind-mounted into the app container
4. Hot reload is enabled for backend and frontend

**After Setup:**
```bash
sudo reboot
```

After reboot:
- Docker Compose runs the hot-reload dev stack
- Dashboard available at `http://localhost:8000`

**Development Workflow:**
- Make code changes in `/home/calvin/calvin`
- Backend and frontend reload through the dev compose stack

### Windows Development Setup (`setup-windows.ps1`)

**Purpose:** Development setup for Windows.

**Features:**
- Checks and installs prerequisites (Python, Node.js, UV)
- Handles Git repository (switches to develop branch)
- Installs backend dependencies (dev extras)
- Installs frontend dependencies
- Improved error handling and validation
- Better user feedback

**Usage:**

```powershell
# Run from project root
.\setup-windows.ps1
```

**What Happens:**
1. Checks for Python 3.11+, Node.js 20+, Git
2. Installs UV if not present
3. Switches to develop branch (if Git available)
4. Installs backend dependencies with dev extras
5. Installs frontend dependencies
6. Provides instructions for starting development

**After Setup:**

Start development servers:

```powershell
# Terminal 1 - Backend
cd backend
uv run uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

# Terminal 2 - Frontend
cd frontend
npm run dev
```

**Note:** Keyboard input uses a mock handler on Windows. Full keyboard support is available on Linux/Raspberry Pi.

### Zero-touch Kiosk Provisioning (`scripts/bake-kiosk-firstrun.sh`)

**Purpose:** Bake a first-boot bundle onto a freshly-flashed card so a Pi
self-provisions into a Mode-B kiosk with no SSH and no per-Pi typing.

**Usage:**

```bash
sudo bash scripts/bake-kiosk-firstrun.sh \
  --backend-url http://homeserver.local:8000 \
  --wifi-ssid HomeNet --wifi-psk 's3cret' --wifi-country SE \
  --hostname kitchen \
  --signing-key-file calvin.key \
  --boot-dir /media/$USER/bootfs
```

The card gets the kiosk installer (`deploy/kiosk-agent/install-kiosk.sh`); on boot 2
it pulls the rest from the Calvin server. Without a card, the same installer runs as
`curl -fsSL http://<server>:8000/api/kiosks/install.sh | sudo bash`.

Full walkthrough: [KIOSK_INSTALL.md](KIOSK_INSTALL.md) and
[KIOSK_PROVISIONING.md](KIOSK_PROVISIONING.md).

## Script Configuration

All scripts support environment variables for customization:

| Variable | Description | Default |
|----------|-------------|---------|
| `GIT_REPO` | Git repository URL | `https://github.com/osterbergsimon/calvin.git` |
| `GIT_BRANCH` | Git branch to use | `develop` (`main` is release-only) |
| `CALVIN_DIR` | Installation directory | `/home/calvin/calvin` (Linux) |
| `CALVIN_DATA_DIR` | Data volume on the host | `/var/lib/calvin` |
| `CALVIN_IMAGE_TAG` | Pin the runtime image (otherwise follows the branch: `main` → `latest`, else `develop`; a pin already in `/etc/calvin/.env` is kept) | — |
| `LOG_FILE` | Log file path | `/var/log/calvin-setup.log` (Linux) |

Pass them after `sudo` (`sudo GIT_BRANCH=x bash setup.sh`). The service user is
always `calvin`: the systemd units, sudoers rules and kiosk bundle hard-code it,
so setup refuses a different `CALVIN_USER`.

Baked kiosk cards (`bake-kiosk-firstrun.sh --ssh-pubkey`) get a separate admin
user for recovery (`calvin-admin` by default, `--admin-user` to rename it):
key-only SSH login and passwordless sudo. `calvin` itself has no password, no
sudo, and is not in the `docker` group.

## Testing the Scripts

The setup scripts have test suites to ensure they work correctly:

### Bash Script Tests (bats)

**Install bats:**
```bash
# macOS
brew install bats-core

# Ubuntu/Debian
sudo apt-get install bats

# Or via npm
npm install -g bats
```

**Run tests:**
```bash
cd scripts
bats tests/
for t in tests/test_*.sh; do bash "$t" || echo "FAILED: $t"; done
```

CI also runs shellcheck on every script and a Docker-CE install smoke test in
`debian:bookworm` and `debian:trixie` arm64 containers
(`scripts/ci/pi-os-smoke.sh`).

Or use the Makefile:
```bash
make test-scripts
```

### PowerShell Script Tests (Pester)

**Install Pester:**
```powershell
Install-Module -Name Pester -Force -SkipPublisherCheck
```

**Run tests:**
```powershell
.\Makefile.ps1 test-scripts
```

Or directly:
```powershell
Invoke-Pester scripts\tests\setup-windows.Tests.ps1
```

## Script Improvements

The scripts have been refactored with the following improvements:

### Maintainability
- **Shared utilities**: Common functions in `setup-common.sh`
- **Modular structure**: Clear separation of concerns
- **Consistent error handling**: Standardized error messages and exit codes

### Robustness
- **Strict error handling**: `set -euo pipefail` in bash scripts
- **Validation**: Checks for prerequisites and verifies installations
- **Logging**: Comprehensive logging to track setup progress
- **Verification**: Post-setup verification steps

### User Experience
- **Clear progress messages**: Color-coded output
- **Error messages**: Helpful error messages with suggestions
- **Documentation**: Clear instructions and next steps

## Troubleshooting

### Script Fails During Installation

1. **Check logs:**
   ```bash
   # Linux
   sudo cat /var/log/calvin-setup.log
   
   # Or check the repository log
   cat /home/calvin/calvin/backend/logs/calvin-update.log
   ```

2. **Verify prerequisites:**
   - Python 3.11+ installed
   - Node.js 20+ installed
   - Git installed
   - Root/sudo access (for Linux scripts)

3. **Check disk space:**
   ```bash
   df -h
   ```

4. **Verify network connectivity:**
   ```bash
   ping github.com
   curl -I https://github.com
   ```

### Scripts Not Found When Downloaded

When downloading scripts via `wget/curl`, the scripts rely on `setup-common.sh` being in the same directory. The scripts will:
1. Try to find `setup-common.sh` in the same directory
2. Fall back to current directory
3. Show an error if not found

For repository-based usage (most common), the scripts work correctly as they're all in the `scripts/` directory.

### Services Not Starting

1. **Check service status:**
   ```bash
   sudo systemctl status calvin-app
   sudo systemctl status calvin-kiosk
   ```

2. **Check logs:**
   ```bash
   sudo journalctl -u calvin-app -n 50
   sudo journalctl -u calvin-kiosk -n 50
   ```

3. **Verify permissions:**
   ```bash
   ls -la /home/calvin/calvin
   sudo chown -R calvin:calvin /home/calvin/calvin
   ```

### Development Mode Issues

1. **Hot reload not working:**
   - Verify `/etc/calvin/docker-compose.yml` came from `docker-compose.dev.yml`
   - Check compose logs: `sudo docker compose -f /etc/calvin/docker-compose.yml logs`
   - Restart the stack: `sudo systemctl restart calvin-app`

## Updating After Setup

```bash
sudo update-calvin.sh
```

In production mode it:

1. fast-forwards `/home/calvin/calvin` to `origin/<GIT_BRANCH>` (a checkout with
   local changes or local commits is left as it is, with a warning);
2. re-installs the host files with `setup.sh --refresh` (compose file, systemd
   units, helper scripts and sudoers, X/openbox config, display agent, and
   `update-calvin.sh` itself) — no apt or Docker. They come from a fresh clone of
   `GIT_REPO`/`GIT_BRANCH` in the root-only `/var/lib/calvin-update`, never from
   the checkout in calvin's home: that runs as root, and the app user can edit
   the checkout. Local edits there are not installed as root;
3. records the running image, pulls the configured tag and restarts Compose;
4. waits for `http://localhost:$CALVIN_PORT/api/health`. If the new image does
   not come up (failed restart or health check) it puts back the previous image
   and the previous `/etc/calvin/docker-compose.yml` and `.env`, restarts on them,
   and exits with an error. A failed refresh or pull restores the host files and
   restarts nothing. The state (including `previous_image`) is in
   `calvin-update-state.json` next to the update log.

Root does that clone, so `GIT_REPO` must be readable without the calvin user's
credentials (an `https://` URL). Hosts set up before this behaviour existed run
an older `update-calvin.sh` that does not refresh anything: re-run setup once
(`curl -fsSL https://raw.githubusercontent.com/osterbergsimon/calvin/develop/scripts/setup.sh | sudo bash`),
and later updates refresh themselves.

Development installs pull the configured git branch into `/home/calvin/calvin`
with `--autostash`, refresh the host files the same way, then recreate the dev
Compose containers so dependency changes are picked up.

OS and Chromium security updates are installed by `unattended-upgrades`, which
setup enables (Debian, Debian-Security and the Raspberry Pi archive).

### Kiosk Pis (Mode B)

A remote kiosk Pi runs only the display-agent, not the full stack, so it does
not use `update-calvin.sh` and does not carry a repo checkout. Update its agent
from the server instead: **Settings → Kiosks → Update**. The kiosk pulls a
verified file bundle from the backend on its next poll, swaps only what changed,
restarts only the affected services, and auto-rolls-back if the agent does not
come up healthy — no SSH or re-provisioning needed. See
[Kiosk agent self-update](KIOSK_PROVISIONING.md#kiosk-agent-self-update).

## Contributing

When modifying setup scripts:

1. **Test changes:** Run the test suites
2. **Test on clean system:** Verify on a fresh install
3. **Update documentation:** Keep this doc up to date
4. **Follow patterns:** Use functions from `setup-common.sh`
5. **Add tests:** Add tests for new functionality

## Related Documentation

- [Linux Setup Guide](SETUP_LINUX.md) - Manual Linux setup
- [Windows Setup Guide](SETUP_WINDOWS.md) - Manual Windows setup
- [Quick Start - Development](QUICKSTART_DEVELOP.md) - Fast development setup
- [Quick Start - Windows](QUICKSTART_WINDOWS.md) - Fast Windows setup
