# Manual Installation Instructions

If cloud-init didn't run, follow these simple steps to manually set up Calvin on your Raspberry Pi.

## Prerequisites

- Raspberry Pi is booted and accessible via SSH
- You can SSH into the Pi as `calvin` user (or any user with sudo access)

## Step 1: SSH into Pi

```bash
ssh calvin@<pi-ip-address>
# Or if you set a hostname:
ssh calvin@calvin-dashboard-dev
```

## Step 2: Clone or Update Calvin Repository

If you haven't cloned it yet:
```bash
cd /home/calvin
git clone https://github.com/osterbergsimon/calvin.git
cd calvin
```

If you already have it cloned:
```bash
cd /home/calvin/calvin
git pull origin main
```

## Step 3: Run the Setup Script

**Option A: Use UV (default, faster but may cause OOM on Pi 3B+)**
```bash
cd /home/calvin/calvin
sudo bash rpi-image/first-boot/setup-dev.sh
```

**Option B: Use pip instead (slower but more stable on Pi 3B+)**
```bash
cd /home/calvin/calvin
sudo bash rpi-image/first-boot/setup-dev.sh --use-pip
```

> **Note:** If UV causes reboots due to OOM, use the `--use-pip` flag. Pip uses less memory during installation.

That's it! The setup script will:
- Install all system dependencies
- Create 4GB swap space
- Install UV and Node.js
- Install backend and frontend dependencies
- Set up systemd services
- Configure display and kiosk mode

## Step 4: Verify Installation

```bash
# Check services are running
systemctl status calvin-backend
systemctl status calvin-frontend
systemctl status calvin-update.timer

# Check backend health
curl http://localhost:8000/api/health

# View logs if needed
sudo journalctl -u calvin-backend -f
```

## Step 5: Reboot (Optional)

```bash
# Reboot to start X and kiosk mode
sudo reboot
```

After reboot, the dashboard should appear automatically on the display.

---

## Troubleshooting

### If Setup Script Fails

Check the setup log:
```bash
sudo cat /var/log/calvin-setup.log
```

### Services Not Starting

```bash
# Check service status
systemctl status calvin-backend
systemctl status calvin-frontend

# View logs
sudo journalctl -u calvin-backend -n 50
sudo journalctl -u calvin-frontend -n 50

# Restart services
sudo systemctl restart calvin-backend
sudo systemctl restart calvin-frontend
```

### Backend Not Responding

```bash
# Check if backend is running
ps aux | grep uvicorn

# Check if port 8000 is in use
sudo netstat -tlnp | grep 8000

# Try starting backend manually
cd /home/calvin/calvin/backend
export PATH="/home/calvin/.local/bin:/home/calvin/.cargo/bin:$PATH"
uv run python -m app.main
```

### Memory Issues (OOM)

```bash
# Check swap is active
free -h

# If swap is not active or too small, recreate it
sudo swapoff /swapfile
sudo rm -f /swapfile
sudo fallocate -l 4G /swapfile || sudo dd if=/dev/zero of=/swapfile bs=1M count=4096
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
free -h
```

### Manual Dependency Installation (If Setup Script Fails)

If the setup script fails at dependency installation, you can install manually:

## Step 7: Install Backend Dependencies (Manual - Only if Setup Script Fails)

```bash
cd /home/calvin/calvin/backend

# Ensure UV is in PATH
export PATH="/home/calvin/.local/bin:/home/calvin/.cargo/bin:$PATH"

# Clear UV cache (fixes corrupted wheels)
uv cache clean

# Set low concurrency to reduce memory usage
export UV_CONCURRENCY=1

# Try full sync first (production + linux + dev)
uv sync --extra dev --extra linux
```

### If Full Sync Fails (Reboots or Errors)

Try installing in stages:

```bash
cd /home/calvin/calvin/backend
export PATH="/home/calvin/.local/bin:/home/calvin/.cargo/bin:$PATH"
export UV_CONCURRENCY=1

# Stage 1: Production dependencies only
uv sync

# Stage 2: Add linux extras
uv sync --extra linux

# Stage 3: Add dev dependencies
uv sync --extra dev --extra linux
```

### If It Still Fails

Install dev packages individually:

```bash
cd /home/calvin/calvin/backend
export PATH="/home/calvin/.local/bin:/home/calvin/.cargo/bin:$PATH"
export UV_CONCURRENCY=1

# Install production + linux first
uv sync --extra linux

# Then install dev packages one at a time
uv pip install pytest
uv pip install pytest-asyncio
uv pip install pytest-cov
uv pip install pytest-mock
uv pip install ruff
uv pip install mypy
uv pip install bandit
uv pip install pre-commit
uv pip install faker
uv pip install factory-boy
```

## Quick Reference

```bash
# Check services
systemctl status calvin-backend
systemctl status calvin-frontend

# View logs
sudo journalctl -u calvin-backend -f
sudo journalctl -u calvin-frontend -f

# Restart services
sudo systemctl restart calvin-backend
sudo systemctl restart calvin-frontend

# Manual update (pull latest code and restart)
cd /home/calvin/calvin
git pull origin main
sudo systemctl restart calvin-backend
sudo systemctl restart calvin-frontend
```

