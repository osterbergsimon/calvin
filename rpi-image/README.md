# Raspberry Pi Image Building

> **⚠️ UNTESTED:** This image building process has not been tested on actual hardware yet. Use at your own risk. Please report any issues you encounter.

This directory contains scripts and configurations for building flashable Raspberry Pi images for Calvin Dashboard.

## 🚀 Quick Start

**New to this?** Start here:

1. **[GETTING_STARTED.md](GETTING_STARTED.md)** - **Main guide** with complete step-by-step instructions
   - Choose dev image or pre-built image
   - Follow detailed instructions
   - Includes troubleshooting

2. **Quick Start Guides** (condensed versions):
   - **[QUICK_START_DEV.md](QUICK_START_DEV.md)** - Dev image quick start
   - **[QUICK_START_PREBUILT.md](QUICK_START_PREBUILT.md)** - Pre-built image quick start

## Image Types

### 1. Development Image (Auto-Update)
- **Purpose**: Development/testing on Raspberry Pi
- **Features**:
  - Auto-pulls latest code from GitHub
  - Auto-updates dependencies
  - Auto-rebuilds frontend
  - Auto-restarts services
  - Configurable update interval (default: 5 minutes)
- **Use case**: Testing on RPi without reflashing
- **Setup time**: 5-10 minutes first boot
- **Quick start**: See [QUICK_START_DEV.md](QUICK_START_DEV.md)

### 2. Pre-built Image (Flash and Go)
- **Purpose**: Production deployment, multiple devices
- **Features**: 
  - Pre-installed Calvin application
  - Pre-installed dependencies
  - Pre-configured services
  - Optimized for Pi 3B+
  - No auto-update
- **Use case**: Final deployment, stable releases, offline deployment
- **Setup time**: 10-15 minutes to create, then instant deployment
- **Quick start**: See [QUICK_START_PREBUILT.md](QUICK_START_PREBUILT.md)

## Quick Start

### Production Setup
```bash
wget -O- https://raw.githubusercontent.com/osterbergsimon/calvin/main/scripts/setup.sh | sudo sh
```

### Development Setup (with hot reload)
```bash
wget -O- https://raw.githubusercontent.com/osterbergsimon/calvin/main/scripts/setup-dev.sh | sudo sh
```

Or using curl:
```bash
curl -fsSL https://raw.githubusercontent.com/osterbergsimon/calvin/main/scripts/setup.sh | sudo sh
curl -fsSL https://raw.githubusercontent.com/osterbergsimon/calvin/main/scripts/setup-dev.sh | sudo sh
```

## Setup Process

The setup scripts will:
1. **Install System Dependencies**:
   - Python 3.11+
   - Node.js 20+
   - Chromium browser
   - UV (Python package manager)
   - Git
   - X server and window manager
2. **Clone Calvin Repository**:
   - Clones from GitHub (or updates if already exists)
3. **Install Application Dependencies**:
   - Backend dependencies (production or dev)
   - Frontend dependencies
   - Build frontend (production only)
4. **Configure Services**:
   - Install systemd services
   - Configure display and kiosk mode
   - Set up auto-start on boot
5. **Development Mode** (setup-dev.sh only):
   - Enable hot reload for backend (uvicorn --reload)
   - Enable hot reload for frontend (vite dev server)
   - Frontend dev server runs on port 5173

## Development Image Auto-Update

The dev image includes an auto-update service that:
- Pulls latest code from GitHub (configurable branch)
- Updates dependencies
- Rebuilds frontend
- Restarts services
- Runs on a configurable schedule (default: every 5 minutes)

**Configuration:**
- Edit `rpi-image/first-boot/setup-dev.sh` to configure:
  - `GIT_REPO`: GitHub repository URL
  - `GIT_BRANCH`: Branch to pull from (default: `main`)
  - `UPDATE_INTERVAL`: Update frequency in seconds (default: 300)

## Manual Update

You can also manually trigger an update on the Pi:

```bash
# SSH into the Pi
ssh calvin@calvin-dashboard

# Run update script
sudo systemctl start calvin-update.service
# Or manually:
/home/calvin/calvin/scripts/update-calvin.sh
```

## Flashing the Image

### Using Raspberry Pi Imager (Recommended)

1. **Download Raspberry Pi Imager**: https://www.raspberrypi.com/software/
2. **Run build script**: `./rpi-image/build-prod-image.sh` or `./rpi-image/build-dev-image.sh`
3. **Flash SD card**: Use Raspberry Pi Imager to flash the generated image
4. **Configure WiFi**: Edit `rpi-image/cloud-init/user-data.yml` with your WiFi credentials
5. **Insert SD card** into Raspberry Pi and boot

### Using dd (Linux/macOS)

```bash
# Find SD card device (e.g., /dev/sdb or /dev/disk2)
lsblk  # Linux
diskutil list  # macOS

# Flash image
sudo dd if=calvin-prod.img of=/dev/sdX bs=4M status=progress
sync
```

## First Boot

On first boot:
1. cloud-init configures WiFi and SSH
2. First-boot script runs:
   - Installs UV and Node.js (if not in image)
   - Installs Python dependencies via UV
   - Installs frontend dependencies
   - Builds frontend for production
   - Configures systemd services
   - Sets up auto-start
3. System reboots into kiosk mode

## Post-Flash Configuration

After flashing, you can configure:

1. **WiFi**: Edit `rpi-image/cloud-init/user-data.yml` before flashing
2. **SSH Keys**: Add your public key to `rpi-image/cloud-init/user-data.yml`
3. **GitHub Repository**: Edit `rpi-image/first-boot/setup-dev.sh` for dev image
4. **Update Interval**: Edit `rpi-image/first-boot/setup-dev.sh` for dev image

## Troubleshooting

### Image won't boot
- Check SD card is properly formatted
- Verify image was flashed correctly
- Check Raspberry Pi power supply (needs 5V, 2.5A minimum)

### WiFi not connecting
- Verify WiFi credentials in `user-data.yml`
- Check WiFi is 2.4GHz (Pi 3B+ doesn't support 5GHz)
- Check router settings

### Services not starting
- SSH into Pi and check logs: `journalctl -u calvin-backend -f`
- Check service status: `systemctl status calvin-backend`
- Verify dependencies installed: `uv --version && node --version`

### Auto-update not working (dev image)
- Check update service: `systemctl status calvin-update.timer`
- Check update logs: `journalctl -u calvin-update.service`
- Verify GitHub access: `git ls-remote https://github.com/osterbergsimon/calvin.git`

