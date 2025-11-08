#!/bin/bash
# Build Production Raspberry Pi Image
# Creates a flashable image with Calvin Dashboard pre-installed

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
OUTPUT_DIR="${OUTPUT_DIR:-$PROJECT_ROOT/rpi-image/output}"
IMAGE_NAME="calvin-prod-$(date +%Y%m%d-%H%M%S).img"

echo "=========================================="
echo "Calvin Dashboard - Production Image Builder"
echo "=========================================="
echo ""
echo "This script will help you create a production Raspberry Pi image."
echo "You'll need:"
echo "  - Raspberry Pi Imager installed"
echo "  - Raspberry Pi OS Lite (64-bit) image"
echo "  - SD card (8GB+ recommended)"
echo ""
read -p "Press Enter to continue..."

# Check if Raspberry Pi Imager is available
if ! command -v rpi-imager &> /dev/null; then
    echo "Raspberry Pi Imager not found in PATH."
    echo "Please install it from: https://www.raspberrypi.com/software/"
    echo ""
    echo "Alternatively, you can:"
    echo "  1. Download Raspberry Pi OS Lite (64-bit)"
    echo "  2. Flash it to an SD card"
    echo "  3. Mount the boot partition"
    echo "  4. Copy cloud-init/user-data.yml to /boot/user-data"
    echo "  5. Copy first-boot/setup.sh to the root filesystem"
    exit 1
fi

# Create output directory
mkdir -p "$OUTPUT_DIR"

# Prepare cloud-init config
echo "Preparing cloud-init configuration..."
cp "$SCRIPT_DIR/cloud-init/user-data.yml" "$OUTPUT_DIR/user-data.yml"

echo ""
echo "=========================================="
echo "Configuration"
echo "=========================================="
echo ""
echo "Please edit the cloud-init configuration:"
echo "  $OUTPUT_DIR/user-data.yml"
echo ""
echo "You need to configure:"
echo "  1. WiFi credentials (if using WiFi)"
echo "  2. SSH public keys (recommended)"
echo "  3. User password (or disable password login)"
echo ""
read -p "Press Enter to open the file in your editor..."

# Try to open in default editor
if command -v code &> /dev/null; then
    code "$OUTPUT_DIR/user-data.yml"
elif command -v nano &> /dev/null; then
    nano "$OUTPUT_DIR/user-data.yml"
elif command -v vi &> /dev/null; then
    vi "$OUTPUT_DIR/user-data.yml"
else
    echo "Please edit: $OUTPUT_DIR/user-data.yml"
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
echo "7. Copy contents from: $OUTPUT_DIR/user-data.yml"
echo "8. Choose SD card and click 'Write'"
echo ""
echo "After flashing:"
echo "  1. Mount the boot partition"
echo "  2. Copy first-boot/setup.sh to the root filesystem"
echo "  3. Copy the entire calvin directory to /home/calvin/calvin"
echo ""
echo "Alternatively, you can use this script to automate the process"
echo "if you have a Raspberry Pi OS image file."
echo ""

read -p "Do you want to continue with automated image creation? (y/N) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Manual process instructions saved to: $OUTPUT_DIR/INSTRUCTIONS.txt"
    cat > "$OUTPUT_DIR/INSTRUCTIONS.txt" << EOF
Calvin Dashboard - Production Image Creation Instructions

1. Download Raspberry Pi OS Lite (64-bit) from:
   https://www.raspberrypi.com/software/operating-systems/

2. Flash the image to an SD card using Raspberry Pi Imager

3. Mount the boot partition and copy:
   - cloud-init/user-data.yml to /boot/user-data

4. Mount the root filesystem and:
   - Copy first-boot/setup.sh to /home/calvin/calvin/first-boot/setup.sh
   - Copy the entire calvin project to /home/calvin/calvin/
   - Make setup.sh executable: chmod +x /home/calvin/calvin/first-boot/setup.sh

5. Unmount and boot the Raspberry Pi

The first boot will:
  - Configure WiFi and SSH
  - Install dependencies
  - Set up Calvin Dashboard
  - Reboot into kiosk mode
EOF
    exit 0
fi

echo ""
echo "Automated image creation requires additional tools."
echo "For now, please follow the manual instructions above."
echo ""
echo "Files prepared in: $OUTPUT_DIR"

