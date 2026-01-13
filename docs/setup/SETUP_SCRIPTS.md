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
- Installs all system dependencies
- Installs UV (Python package manager)
- Installs Node.js 20+
- Clones/configures Git repository
- Installs backend dependencies (production + linux extras)
- Installs frontend dependencies (production)
- Builds frontend for production
- Creates data directories
- Configures systemd services
- Sets up display and kiosk mode
- Configures auto-start on boot

**Usage:**

```bash
# Standard installation (main branch)
wget -O- https://raw.githubusercontent.com/osterbergsimon/calvin/main/scripts/setup.sh | sudo sh

# Or using curl
curl -fsSL https://raw.githubusercontent.com/osterbergsimon/calvin/main/scripts/setup.sh | sudo sh
```

**Using a Different Branch:**

```bash
GIT_BRANCH=develop wget -O- https://raw.githubusercontent.com/osterbergsimon/calvin/main/scripts/setup.sh | sudo sh
```

**Using a Fork or Custom Repository:**

```bash
GIT_REPO=https://github.com/yourusername/calvin.git GIT_BRANCH=your-branch \
  wget -O- https://raw.githubusercontent.com/osterbergsimon/calvin/main/scripts/setup.sh | sudo sh
```

**What Happens:**
1. System packages are updated
2. All dependencies are installed
3. Repository is cloned/updated to `/home/calvin/calvin`
4. Backend and frontend are built and configured
5. Systemd services are installed and enabled
6. Display is configured for kiosk mode
7. System is ready - **reboot required** to start services

**After Setup:**
```bash
sudo reboot
```

After reboot, the dashboard will automatically start and be available at `http://localhost:8000`.

### Development Setup (`scripts/setup-dev.sh`)

**Purpose:** Development setup with hot reload for Raspberry Pi.

**Features:**
- Everything from production setup, plus:
- Creates 4GB swap file (for Pi 3B+ with limited RAM)
- Uses venv for backend (more stable on Pi 3B+)
- Installs dev dependencies
- Creates `.dev` marker file for hot reload
- Configures dev-specific frontend service (Vite dev server)
- Sets up hot reload for both backend and frontend
- Connects to dev server on port 5173

**Usage:**

```bash
# Standard development installation
wget -O- https://raw.githubusercontent.com/osterbergsimon/calvin/main/scripts/setup-dev.sh | sudo sh

# Or using curl
curl -fsSL https://raw.githubusercontent.com/osterbergsimon/calvin/main/scripts/setup-dev.sh | sudo sh
```

**Using a Different Branch:**

```bash
GIT_BRANCH=develop curl -fsSL https://raw.githubusercontent.com/osterbergsimon/calvin/main/scripts/setup-dev.sh | sudo sh
```

**What Happens:**
1. Same as production setup, but with development features
2. Swap file is created for better performance
3. Backend uses venv (more stable than UV on Pi 3B+)
4. Dev dependencies are installed
5. Hot reload is enabled for both backend and frontend
6. Frontend dev server runs on port 5173

**After Setup:**
```bash
sudo reboot
```

After reboot:
- Backend runs with hot reload (code changes auto-reload)
- Frontend runs with hot reload (Vite dev server on port 5173)
- Dashboard available at `http://localhost:5173`

**Development Workflow:**
- Make code changes in `/home/calvin/calvin`
- Backend automatically reloads on file changes
- Frontend automatically reloads via Vite HMR
- No manual restart needed

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

## Script Configuration

All scripts support environment variables for customization:

| Variable | Description | Default |
|----------|-------------|---------|
| `GIT_REPO` | Git repository URL | `https://github.com/osterbergsimon/calvin.git` |
| `GIT_BRANCH` | Git branch to use | `main` |
| `CALVIN_DIR` | Installation directory | `/home/calvin/calvin` (Linux) |
| `CALVIN_USER` | User to run services | `calvin` (Linux) |
| `LOG_FILE` | Log file path | `/var/log/calvin-setup.log` (Linux) |

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
```

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
   sudo systemctl status calvin-backend
   sudo systemctl status calvin-frontend
   # Or for dev mode:
   sudo systemctl status calvin-frontend-dev
   ```

2. **Check logs:**
   ```bash
   sudo journalctl -u calvin-backend -n 50
   sudo journalctl -u calvin-frontend -n 50
   ```

3. **Verify permissions:**
   ```bash
   ls -la /home/calvin/calvin
   sudo chown -R calvin:calvin /home/calvin/calvin
   ```

### Development Mode Issues

1. **Hot reload not working:**
   - Verify `.dev` file exists: `ls -la /home/calvin/calvin/backend/.dev`
   - Check backend service logs for `--reload` flag
   - Verify frontend dev service is running

2. **Swap file issues:**
   - Check swap: `free -h`
   - Verify swap file: `ls -lh /swapfile`
   - If needed, recreate: `sudo swapoff /swapfile && sudo rm /swapfile`

## Updating After Setup

After initial setup, use the update script:

```bash
update-calvin.sh
```

Or with force flag to rebuild dependencies:
```bash
update-calvin.sh --force
```

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
