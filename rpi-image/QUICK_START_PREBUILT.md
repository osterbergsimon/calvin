# Quick Start: Pre-built Image (Flash and Go)

> **⚠️ UNTESTED:** This process has not been tested on actual hardware yet. Use at your own risk.

**Time:** 10-15 minutes to create image, then instant deployment

## Step 1: Create Pre-built Image

### On Raspberry Pi:

1. **Flash standard OS** to SD card (Raspberry Pi Imager)
2. **Boot Pi and SSH in:**
   ```bash
   ssh pi@raspberrypi
   ```

3. **Clone and setup:**
   ```bash
   git clone https://github.com/osterbergsimon/calvin.git /home/pi/calvin
   cd /home/pi/calvin
   sudo bash rpi-image/first-boot/setup.sh
   ```

4. **Wait for setup** (5-10 minutes)

5. **Shutdown:**
   ```bash
   sudo shutdown -h now
   ```

### On Linux Machine:

6. **Create image from SD card:**
   ```bash
   # Find SD card (e.g., /dev/sdb)
   lsblk
   
   # Create image
   sudo dd if=/dev/sdX of=calvin-prebuilt.img bs=4M status=progress
   sync
   
   # Compress (optional)
   xz -9 calvin-prebuilt.img
   ```

## Step 2: Flash Pre-built Image

1. **Extract** (if compressed):
   ```bash
   xz -d calvin-prebuilt.img.xz
   ```

2. **Flash to SD card:**
   ```bash
   # Linux
   sudo dd if=calvin-prebuilt.img of=/dev/sdX bs=4M status=progress
   sync
   
   # Or use Raspberry Pi Imager
   ```

3. **Insert SD card** into Pi

4. **Boot Pi** → Dashboard appears immediately!

## Done!

- No setup needed
- Ready immediately
- Works offline
- Flash to multiple devices

---

**For detailed instructions and troubleshooting, see:** [GETTING_STARTED.md](GETTING_STARTED.md)

