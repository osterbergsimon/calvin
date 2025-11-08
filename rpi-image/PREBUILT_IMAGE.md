# Pre-built Image - Simplified Deployment

## What is a Pre-built Image?

A pre-built image is a Raspberry Pi OS image that has Calvin Dashboard **already installed and configured**. Instead of running a setup script on first boot, everything is ready to go.

## Comparison

### Current Dev Image (First-Boot Setup)
```
Flash OS → Boot → Setup Script Runs → Clone Code → Install Dependencies → Configure → Reboot
```
- ✅ Flexible (can change GitHub repo)
- ✅ Always gets latest code
- ❌ Takes 5-10 minutes on first boot
- ❌ Requires internet connection
- ❌ Can fail if GitHub is down

### Pre-built Image (No Setup)
```
Flash Image → Boot → Ready!
```
- ✅ Fast boot (ready immediately)
- ✅ No internet required
- ✅ More reliable
- ✅ Easier to distribute
- ❌ Larger image file
- ❌ Need to rebuild for updates

## Creating a Pre-built Image

### Method 1: Using a Raspberry Pi (Easiest)

**Step 1: Flash standard OS to SD card**
```bash
# Use Raspberry Pi Imager
# Choose: Raspberry Pi OS Lite (64-bit)
# Configure WiFi and SSH
```

**Step 2: Boot Pi and setup Calvin**
```bash
# SSH into Pi
ssh pi@raspberrypi

# Clone Calvin
git clone https://github.com/osterbergsimon/calvin.git /home/pi/calvin
cd /home/pi/calvin

# Run setup (production version - no auto-update)
sudo bash rpi-image/first-boot/setup.sh
```

**Step 3: Create image from SD card**
```bash
# On Linux machine with SD card inserted
# Find SD card device (e.g., /dev/sdb)
lsblk

# Create image
sudo dd if=/dev/sdX of=calvin-prebuilt.img bs=4M status=progress
sync

# Compress (optional, saves space)
xz -9 calvin-prebuilt.img
```

**Step 4: Flash pre-built image**
```bash
# Extract if compressed
xz -d calvin-prebuilt.img.xz

# Flash to new SD card
sudo dd if=calvin-prebuilt.img of=/dev/sdX bs=4M status=progress
sync
```

### Method 2: Using pi-gen (Advanced)

Build a complete custom Raspberry Pi OS image:

```bash
# Clone pi-gen
git clone https://github.com/RPi-Distro/pi-gen.git
cd pi-gen

# Create custom stage
mkdir -p stage-calvin/00-run-chroot.d
cp ../calvin/rpi-image/first-boot/setup.sh stage-calvin/00-run-chroot.d/99-calvin-setup.sh

# Build image
sudo ./build.sh
```

### Method 3: Using Docker (Containerized)

Build in a Docker container for consistency:

```bash
# Build image builder
docker build -t calvin-image-builder -f rpi-image/Dockerfile.image-builder .

# Run build
docker run --privileged -v $(pwd):/build calvin-image-builder
```

## When to Use Pre-built Image

### Use Pre-built Image When:
- ✅ **Production deployment** - Stable, tested image
- ✅ **Multiple devices** - Same image for all devices
- ✅ **Offline deployment** - No internet required
- ✅ **Fast deployment** - Ready immediately
- ✅ **Distribution** - Share single image file

### Use Dev Image When:
- ✅ **Development** - Auto-update from GitHub
- ✅ **Testing** - Easy to update and test
- ✅ **Single device** - Personal development
- ✅ **Frequent updates** - Auto-pull latest code

## Pre-built Image Structure

```
calvin-prebuilt.img
├── Boot partition
│   ├── cloud-init config (WiFi, SSH)
│   └── Standard Raspberry Pi OS boot files
└── Root filesystem
    ├── /home/calvin/calvin/ (Calvin code)
    ├── /etc/systemd/system/calvin-*.service (Services)
    ├── Dependencies installed (Python, Node.js, UV)
    └── Services enabled and configured
```

## Advantages

1. **Fast Deployment**
   - No first-boot setup
   - Ready immediately after boot
   - No waiting for dependencies

2. **Reliability**
   - Setup done once, tested
   - No risk of setup failures
   - Consistent across devices

3. **Offline Capable**
   - No internet required
   - Works without GitHub access
   - Can deploy in isolated networks

4. **Easy Distribution**
   - Single image file
   - Share via USB, network, etc.
   - Flash to multiple devices

## Disadvantages

1. **Larger Image**
   - Includes all dependencies
   - Typically 2-4GB (vs 500MB for base OS)
   - Takes longer to flash

2. **Less Flexible**
   - Harder to customize per deployment
   - Need to rebuild for changes
   - Can't easily change GitHub repo

3. **Update Process**
   - Need to rebuild image for updates
   - Can't auto-update from GitHub
   - More work to maintain

## Recommendation

- **Development**: Use dev image (auto-update from GitHub)
- **Production**: Use pre-built image (stable, tested)
- **Testing**: Use dev image (easy updates)
- **Distribution**: Use pre-built image (single file)

## Quick Start

For the simplest pre-built image:

1. Flash standard OS to SD card
2. Boot Pi and run: `sudo bash rpi-image/first-boot/setup.sh`
3. Create image: `sudo dd if=/dev/sdX of=calvin-prebuilt.img bs=4M`
4. Flash to other devices: `sudo dd if=calvin-prebuilt.img of=/dev/sdX bs=4M`

That's it! Much simpler than the dev image setup.

