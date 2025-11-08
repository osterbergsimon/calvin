#!/bin/bash
# Build Development Raspberry Pi Image
# Creates a flashable image with Calvin Dashboard and auto-update from GitHub

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
OUTPUT_DIR="${OUTPUT_DIR:-$PROJECT_ROOT/rpi-image/output}"
IMAGE_NAME="calvin-dev-$(date +%Y%m%d-%H%M%S).img"

echo "=========================================="
echo "Calvin Dashboard - Development Image Builder"
echo "=========================================="
echo ""
echo "This script will help you create a development Raspberry Pi image"
echo "with auto-update from GitHub."
echo ""
echo "You'll need:"
echo "  - Raspberry Pi Imager installed"
echo "  - Raspberry Pi OS Lite (64-bit) image"
echo "  - SD card (8GB+ recommended)"
echo "  - GitHub repository access"
echo ""
read -p "Press Enter to continue..."

# Check if Raspberry Pi Imager is available
if ! command -v rpi-imager &> /dev/null; then
    echo "Raspberry Pi Imager not found in PATH."
    echo "Please install it from: https://www.raspberrypi.com/software/"
    exit 1
fi

# Create output directory
mkdir -p "$OUTPUT_DIR"

# Prepare cloud-init config
echo "Preparing cloud-init configuration..."
cp "$SCRIPT_DIR/cloud-init/user-data-dev.yml" "$OUTPUT_DIR/user-data-dev.yml"

# Configure GitHub repository
echo ""
echo "=========================================="
echo "GitHub Configuration"
echo "=========================================="
echo ""
read -p "GitHub repository URL [https://github.com/osterbergsimon/calvin.git]: " GIT_REPO
GIT_REPO="${GIT_REPO:-https://github.com/osterbergsimon/calvin.git}"

read -p "GitHub branch [main]: " GIT_BRANCH
GIT_BRANCH="${GIT_BRANCH:-main}"

read -p "Update interval in seconds [300 (5 minutes)]: " UPDATE_INTERVAL
UPDATE_INTERVAL="${UPDATE_INTERVAL:-300}"

# Update setup script with configuration
sed -i.bak "s|GIT_REPO=\".*\"|GIT_REPO=\"$GIT_REPO\"|" "$SCRIPT_DIR/first-boot/setup-dev.sh"
sed -i.bak "s|GIT_BRANCH=\".*\"|GIT_BRANCH=\"$GIT_BRANCH\"|" "$SCRIPT_DIR/first-boot/setup-dev.sh"
sed -i.bak "s|UPDATE_INTERVAL=\".*\"|UPDATE_INTERVAL=\"$UPDATE_INTERVAL\"|" "$SCRIPT_DIR/first-boot/setup-dev.sh"

echo ""
echo "=========================================="
echo "Configuration"
echo "=========================================="
echo ""
echo "Please edit the cloud-init configuration:"
echo "  $OUTPUT_DIR/user-data-dev.yml"
echo ""
echo "You need to configure:"
echo "  1. WiFi credentials (if using WiFi)"
echo "  2. SSH public keys (recommended)"
echo "  3. User password (or disable password login)"
echo ""
read -p "Press Enter to open the file in your editor..."

# Try to open in default editor
if command -v code &> /dev/null; then
    code "$OUTPUT_DIR/user-data-dev.yml"
elif command -v nano &> /dev/null; then
    nano "$OUTPUT_DIR/user-data-dev.yml"
elif command -v vi &> /dev/null; then
    vi "$OUTPUT_DIR/user-data-dev.yml"
else
    echo "Please edit: $OUTPUT_DIR/user-data-dev.yml"
fi

read -p "Press Enter after editing the configuration..."

# Instructions for using Raspberry Pi Imager
echo ""
echo "=========================================="
echo "Image Creation Instructions"
echo "=========================================="
echo ""
echo "1. Open Raspberry Pi Imager"
echo "2. Choose OS: Raspberry Pi OS Lite (64-bit)"
echo "3. Click the gear icon (⚙️) for advanced options"
echo "4. Enable SSH and configure:"
echo "   - Set username: calvin"
echo "   - Set password or add SSH key"
echo "5. Configure WiFi (if needed)"
echo "6. Click 'Edit custom cloud-init user-data'"
echo "7. Copy contents from: $OUTPUT_DIR/user-data-dev.yml"
echo "8. Choose SD card and click 'Write'"
echo ""
echo "After flashing:"
echo "  1. Mount the boot partition"
echo "  2. Copy first-boot/setup-dev.sh to the root filesystem"
echo "  3. Copy scripts/update-calvin.sh to /usr/local/bin/"
echo "  4. Copy systemd service files"
echo ""
echo "The image will:"
echo "  - Clone Calvin from GitHub on first boot"
echo "  - Set up auto-update (every $UPDATE_INTERVAL seconds)"
echo "  - Auto-pull latest code and restart services"
echo ""

read -p "Do you want to continue with automated image creation? (y/N) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Manual process instructions saved to: $OUTPUT_DIR/INSTRUCTIONS-DEV.txt"
    cat > "$OUTPUT_DIR/INSTRUCTIONS-DEV.txt" << EOF
Calvin Dashboard - Development Image Creation Instructions

Configuration:
  - GitHub Repository: $GIT_REPO
  - Branch: $GIT_BRANCH
  - Update Interval: $UPDATE_INTERVAL seconds

1. Download Raspberry Pi OS Lite (64-bit) from:
   https://www.raspberrypi.com/software/operating-systems/

2. Flash the image to an SD card using Raspberry Pi Imager

3. Mount the boot partition and copy:
   - cloud-init/user-data-dev.yml to /boot/user-data

4. Mount the root filesystem and:
   - Copy first-boot/setup-dev.sh to /home/calvin/calvin/first-boot/setup-dev.sh
   - Copy scripts/update-calvin.sh to /usr/local/bin/update-calvin.sh
   - Copy systemd/*.service and systemd/*.timer to /etc/systemd/system/
   - Make scripts executable: chmod +x /home/calvin/calvin/first-boot/setup-dev.sh
   - Make scripts executable: chmod +x /usr/local/bin/update-calvin.sh

5. Unmount and boot the Raspberry Pi

The first boot will:
  - Configure WiFi and SSH
  - Clone Calvin from GitHub ($GIT_REPO, branch: $GIT_BRANCH)
  - Install dependencies
  - Set up Calvin Dashboard
  - Configure auto-update (every $UPDATE_INTERVAL seconds)
  - Reboot into kiosk mode

After boot, the system will automatically:
  - Pull latest code from GitHub every $UPDATE_INTERVAL seconds
  - Update dependencies
  - Rebuild frontend
  - Restart services
EOF
    exit 0
fi

echo ""
echo "Automated image creation requires additional tools."
echo "For now, please follow the manual instructions above."
echo ""
echo "Files prepared in: $OUTPUT_DIR"
echo "Configuration:"
echo "  - GitHub Repository: $GIT_REPO"
echo "  - Branch: $GIT_BRANCH"
echo "  - Update Interval: $UPDATE_INTERVAL seconds"

