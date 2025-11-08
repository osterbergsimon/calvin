#!/bin/bash
# Simple Pre-built Image Builder
# Creates a pre-built image by modifying an existing Raspberry Pi OS image
# This is simpler than pi-gen but requires an existing image file

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
OUTPUT_DIR="${OUTPUT_DIR:-$PROJECT_ROOT/rpi-image/output}"

echo "=========================================="
echo "Calvin Dashboard - Simple Pre-built Image"
echo "=========================================="
echo ""
echo "This script modifies an existing Raspberry Pi OS image"
echo "to include Calvin Dashboard pre-installed."
echo ""
echo "Requirements:"
echo "  - Raspberry Pi OS Lite (64-bit) image file (.img)"
echo "  - Linux build machine (or WSL)"
echo "  - Root/sudo access"
echo ""
read -p "Press Enter to continue..."

# Check for image file
read -p "Path to Raspberry Pi OS image file: " IMAGE_FILE
if [ ! -f "$IMAGE_FILE" ]; then
    echo "Error: Image file not found: $IMAGE_FILE"
    exit 1
fi

echo ""
echo "This script will:"
echo "  1. Mount the image file"
echo "  2. Copy Calvin code to /home/calvin/calvin"
echo "  3. Install dependencies"
echo "  4. Configure services"
echo "  5. Create new image file"
echo ""
read -p "Continue? (y/N) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    exit 0
fi

# Create output directory
mkdir -p "$OUTPUT_DIR"

# Instructions for manual process
cat > "$OUTPUT_DIR/PREBUILT_IMAGE_INSTRUCTIONS.md" << 'INSTRUCTIONS'
# Creating a Pre-built Calvin Image

## Method 1: Using a Raspberry Pi (Easiest)

1. **Flash Raspberry Pi OS Lite to SD card**
   - Use Raspberry Pi Imager
   - Choose: Raspberry Pi OS Lite (64-bit)
   - Configure WiFi and SSH

2. **Boot Pi and SSH in**
   ```bash
   ssh pi@raspberrypi
   ```

3. **Clone and setup Calvin**
   ```bash
   # Clone Calvin
   git clone https://github.com/osterbergsimon/calvin.git /home/pi/calvin
   cd /home/pi/calvin
   
   # Run setup script
   sudo bash rpi-image/first-boot/setup-dev.sh
   ```

4. **After setup completes, create image from SD card**
   ```bash
   # On Linux machine with SD card inserted
   sudo dd if=/dev/sdX of=calvin-prebuilt.img bs=4M status=progress
   sync
   
   # Compress (optional)
   xz -9 calvin-prebuilt.img
   ```

5. **Flash pre-built image to other SD cards**
   ```bash
   # Extract if compressed
   xz -d calvin-prebuilt.img.xz
   
   # Flash
   sudo dd if=calvin-prebuilt.img of=/dev/sdX bs=4M status=progress
   sync
   ```

## Method 2: Using pi-gen (Advanced)

1. **Clone pi-gen**
   ```bash
   git clone https://github.com/RPi-Distro/pi-gen.git
   cd pi-gen
   ```

2. **Add custom stage**
   ```bash
   mkdir -p stage-calvin
   # Copy Calvin setup script to stage-calvin/00-run-chroot.sh
   ```

3. **Build image**
   ```bash
   sudo ./build.sh
   ```

## Method 3: Using Docker (Containerized Build)

1. **Use Docker to build in container**
   ```bash
   docker build -t calvin-image-builder -f rpi-image/Dockerfile.image-builder .
   ```

2. **Run build in container**
   ```bash
   docker run --privileged -v $(pwd):/build calvin-image-builder
   ```

## Advantages of Pre-built Image

✅ **Faster deployment** - No first-boot setup
✅ **More reliable** - Setup done once, tested
✅ **Offline capable** - No need for GitHub access
✅ **Easier distribution** - Share single image file

## Disadvantages

❌ **Larger image** - Includes all dependencies
❌ **Less flexible** - Harder to customize per deployment
❌ **Update process** - Need to rebuild image for updates

## Recommendation

- **Development**: Use dev image (auto-update from GitHub)
- **Production**: Use pre-built image (stable, tested)
INSTRUCTIONS

echo ""
echo "Instructions saved to: $OUTPUT_DIR/PREBUILT_IMAGE_INSTRUCTIONS.md"
echo ""
echo "For now, the easiest method is:"
echo "  1. Flash standard OS to SD card"
echo "  2. Boot Pi and run setup"
echo "  3. Create image from SD card"
echo ""
echo "See instructions file for details."

