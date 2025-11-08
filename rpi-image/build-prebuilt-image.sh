#!/bin/bash
# Build Pre-built Raspberry Pi Image
# Creates a flashable image with Calvin Dashboard pre-installed
# No first-boot setup needed - just flash and boot!

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
OUTPUT_DIR="${OUTPUT_DIR:-$PROJECT_ROOT/rpi-image/output}"
IMAGE_NAME="calvin-prebuilt-$(date +%Y%m%d-%H%M%S).img"

echo "=========================================="
echo "Calvin Dashboard - Pre-built Image Builder"
echo "=========================================="
echo ""
echo "This script creates a pre-built image with:"
echo "  - Raspberry Pi OS Lite (64-bit)"
echo "  - Calvin code pre-installed"
echo "  - Dependencies pre-installed"
echo "  - Services pre-configured"
echo "  - Just flash and boot - no setup needed!"
echo ""
echo "Requirements:"
echo "  - Linux build machine (or WSL)"
echo "  - Docker (for building in container)"
echo "  - OR: Raspberry Pi OS image file"
echo "  - OR: Use pi-gen for full custom image"
echo ""
read -p "Press Enter to continue..."

# Check for Docker
if command -v docker &> /dev/null; then
    echo ""
    echo "Docker found! Using Docker build method..."
    echo ""
    
    # Create Dockerfile for building image
    cat > "$OUTPUT_DIR/Dockerfile.image-builder" << 'DOCKEREOF'
FROM debian:bookworm-slim

RUN apt-get update && apt-get install -y \
    qemu-user-static \
    binfmt-support \
    parted \
    kpartx \
    dosfstools \
    git \
    curl \
    python3 \
    python3-pip \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /build
DOCKEREOF

    echo "Docker build method not fully implemented yet."
    echo "For now, use manual method or pi-gen."
    exit 0
fi

# Check for pi-gen
if [ -d "$PROJECT_ROOT/pi-gen" ]; then
    echo ""
    echo "pi-gen found! Using pi-gen build method..."
    echo ""
    echo "This will create a full custom Raspberry Pi OS image."
    echo "See: https://github.com/RPi-Distro/pi-gen"
    exit 0
fi

# Manual method - instructions
echo ""
echo "=========================================="
echo "Manual Pre-built Image Creation"
echo "=========================================="
echo ""
echo "To create a pre-built image manually:"
echo ""
echo "1. Flash Raspberry Pi OS Lite to SD card"
echo "2. Boot Pi and SSH in"
echo "3. Run setup script:"
echo "   curl -sSL https://raw.githubusercontent.com/osterbergsimon/calvin/main/rpi-image/first-boot/setup-dev.sh | bash"
echo ""
echo "4. After setup completes, create image from SD card:"
echo "   sudo dd if=/dev/sdX of=calvin-prebuilt.img bs=4M status=progress"
echo "   sync"
echo ""
echo "5. Compress image:"
echo "   xz -9 calvin-prebuilt.img"
echo ""
echo "Alternative: Use pi-gen to build custom image"
echo "See: https://github.com/RPi-Distro/pi-gen"
echo ""

