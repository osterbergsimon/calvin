# Getting Started with Calvin Raspberry Pi Images

> **⚠️ UNTESTED:** This documentation and image setup process has not been tested on actual hardware yet. Use at your own risk. Please report any issues you encounter.

This guide will help you get Calvin Dashboard running on your Raspberry Pi. Choose the approach that best fits your needs:

## Quick Decision Guide

**Use Dev Image if:**
- ✅ You're developing/testing
- ✅ You want auto-updates from GitHub
- ✅ You're deploying to one device
- ✅ You need frequent updates

**Use Pre-built Image if:**
- ✅ You're deploying to production
- ✅ You need multiple identical devices
- ✅ You don't have internet on the Pi
- ✅ You want fastest deployment

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Dev Image Setup](#dev-image-setup) - Auto-update from GitHub
3. [Pre-built Image Setup](#pre-built-image-setup) - Flash and go
4. [Troubleshooting](#troubleshooting)
5. [Quick Reference](#quick-reference)

---

## Prerequisites

### Hardware
- **Raspberry Pi 3B+** (or compatible)
- **SD Card**: 8GB minimum (16GB+ recommended)
- **Power Supply**: 5V, 2.5A minimum (official Pi power supply recommended)
- **Display**: HDMI monitor/TV (for kiosk mode)
- **Network**: WiFi or Ethernet connection

### Software
- **Raspberry Pi Imager**: Download from https://www.raspberrypi.com/software/
- **Git** (for cloning repository)
- **SSH Client** (built into Windows 10+, macOS, Linux)

### Accounts
- **GitHub Account** (for dev image - auto-update)
- **GitHub Repository**: https://github.com/osterbergsimon/calvin

---

## Dev Image Setup

**Best for:** Development, testing, single device

**Time:** 5-10 minutes first boot, then auto-updates

### Step 1: Download Raspberry Pi Imager

1. Go to: https://www.raspberrypi.com/software/
2. Download Raspberry Pi Imager for your operating system
3. Install it

### Step 2: Prepare Cloud-init Configuration

1. **Open the cloud-init file:**
   - Navigate to: `rpi-image/cloud-init/user-data-dev.yml`
   - Open in a text editor

2. **Configure WiFi** (if using WiFi):
   ```yaml
   wifi:
     networks:
       - name: "YourWiFiSSID"
         password: "YourWiFiPassword"
         priority: 1
   ```
   - Replace `YourWiFiSSID` with your WiFi network name
   - Replace `YourWiFiPassword` with your WiFi password
   - **Note:** Pi 3B+ only supports 2.4GHz WiFi (not 5GHz)

3. **Add SSH Public Key** (recommended):
   ```yaml
   ssh_authorized_keys:
     - ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABAQ... your-key-here
   ```
   - Get your SSH public key:
     - **Windows (Git Bash):** `cat ~/.ssh/id_rsa.pub`
     - **macOS/Linux:** `cat ~/.ssh/id_rsa.pub`
   - If you don't have an SSH key, generate one:
     - **Windows (Git Bash):** `ssh-keygen -t rsa -b 4096`
     - **macOS/Linux:** `ssh-keygen -t rsa -b 4096`

4. **OR Set Password** (if not using SSH keys):
   ```yaml
   passwd: $6$rounds=4096$salt$hashed_password_here
   ```
   - Generate password hash:
     - **Linux/WSL:** `openssl passwd -6`
     - **macOS:** `openssl passwd -6`
   - Replace the hash with your generated hash

5. **Save the file**

### Step 3: Flash SD Card

1. **Insert SD card** into your computer

2. **Open Raspberry Pi Imager**

3. **Choose OS:**
   - Click "Choose OS"
   - Select "Raspberry Pi OS (other)"
   - Select "Raspberry Pi OS Lite (64-bit)"

4. **Choose Storage:**
   - Click "Choose Storage"
   - Select your SD card
   - **Warning:** This will erase everything on the SD card!

5. **Configure Settings** (Click gear icon ⚙️):
   - **Hostname:** `calvin-dashboard-dev` (or leave default)
   - **Enable SSH:** ✓ Checked
   - **Username:** `calvin`
   - **Password:** Set a password (or leave blank if using SSH keys)
   - **Configure WiFi:** ✓ Checked (if using WiFi)
     - **SSID:** Your WiFi network name
     - **Password:** Your WiFi password
   - **Set locale settings:** ✓ Checked
     - **Timezone:** Your timezone
     - **Keyboard layout:** Your keyboard layout

6. **Edit Custom Cloud-init User-data:**
   - Click "Edit custom cloud-init user-data"
   - **Copy entire contents** from `rpi-image/cloud-init/user-data-dev.yml`
   - **Paste** into the editor
   - **Save** and close

7. **Write Image:**
   - Click "Write"
   - Confirm when prompted
   - Wait for image to be written (5-10 minutes)
   - Click "Continue" when done

### Step 4: Boot Raspberry Pi

1. **Insert SD card** into Raspberry Pi
2. **Connect display** (HDMI)
3. **Connect power** to Raspberry Pi
4. **Wait 5-10 minutes** for first boot setup:
   - Pi will connect to WiFi (if configured)
   - SSH will be enabled
   - Setup script will run:
     - Install dependencies
     - Clone Calvin from GitHub
     - Install backend/frontend dependencies
     - Build frontend
     - Configure services
     - Reboot

### Step 5: Verify Setup

1. **Find Pi IP address:**
   - Check your router's admin page
   - Or use: `ping calvin-dashboard-dev` (if hostname resolves)

2. **SSH into Pi:**
   ```bash
   ssh calvin@calvin-dashboard-dev
   # Or: ssh calvin@<pi-ip-address>
   ```

3. **Check services:**
   ```bash
   systemctl status calvin-backend
   systemctl status calvin-frontend
   systemctl status calvin-update.timer
   ```

4. **Check logs:**
   ```bash
   sudo cat /var/log/calvin-setup.log
   ```

5. **Test auto-update:**
   - Make a change to your code
   - Push to GitHub: `git push origin main`
   - Wait 5 minutes (default update interval)
   - Check update logs: `sudo cat /var/log/calvin-update.log`

### Step 6: Access Dashboard

- **On Pi display:** Chromium should open automatically in kiosk mode
- **From another device:** Open browser to `http://<pi-ip-address>:8000`

---

## Pre-built Image Setup

**Best for:** Production, multiple devices, offline deployment

**Time:** 10-15 minutes to create image, then instant deployment

### Step 1: Create Pre-built Image

#### Option A: Using a Raspberry Pi (Easiest)

1. **Flash standard OS to SD card:**
   - Use Raspberry Pi Imager
   - Choose: Raspberry Pi OS Lite (64-bit)
   - Configure WiFi and SSH
   - Flash to SD card

2. **Boot Pi and SSH in:**
   ```bash
   ssh pi@raspberrypi
   # Or: ssh pi@<pi-ip-address>
   ```

3. **Clone Calvin:**
   ```bash
   git clone https://github.com/osterbergsimon/calvin.git /home/pi/calvin
   cd /home/pi/calvin
   ```

4. **Run setup:**
   ```bash
   sudo bash /home/pi/calvin/rpi-image/first-boot/setup.sh
   ```
   - This will:
     - Install dependencies
     - Install Calvin
     - Configure services
     - Build frontend
     - Enable services

5. **Wait for setup to complete** (5-10 minutes)

6. **Shutdown Pi:**
   ```bash
   sudo shutdown -h now
   ```

7. **Remove SD card** from Pi

8. **Create image from SD card** (on Linux machine):
   ```bash
   # Find SD card device (e.g., /dev/sdb)
   lsblk
   
   # Create image (replace /dev/sdX with your SD card device)
   sudo dd if=/dev/sdX of=calvin-prebuilt.img bs=4M status=progress
   sync
   
   # Compress (optional, saves space)
   xz -9 calvin-prebuilt.img
   ```

#### Option B: Using WSL (Windows)

1. **Open WSL:**
   ```bash
   wsl
   ```

2. **Follow Option A steps** (WSL is Linux)

3. **Access SD card in WSL:**
   ```bash
   # SD card should appear as /dev/sdX
   lsblk
   ```

#### Option C: Using macOS

1. **Flash standard OS to SD card** (using Raspberry Pi Imager)

2. **Boot Pi and setup** (same as Option A)

3. **Create image:**
   ```bash
   # Find SD card device
   diskutil list
   
   # Unmount SD card
   diskutil unmountDisk /dev/diskX
   
   # Create image
   sudo dd if=/dev/rdiskX of=calvin-prebuilt.img bs=4M
   sync
   
   # Compress (optional)
   xz -9 calvin-prebuilt.img
   ```

### Step 2: Flash Pre-built Image

1. **Extract image** (if compressed):
   ```bash
   xz -d calvin-prebuilt.img.xz
   ```

2. **Flash to SD card:**
   ```bash
   # Linux
   sudo dd if=calvin-prebuilt.img of=/dev/sdX bs=4M status=progress
   sync
   
   # macOS
   diskutil unmountDisk /dev/diskX
   sudo dd if=calvin-prebuilt.img of=/dev/rdiskX bs=4M
   sync
   
   # Windows (use Raspberry Pi Imager)
   # Or use Win32DiskImager
   ```

3. **Insert SD card** into Raspberry Pi

4. **Boot Pi:**
   - Connect power
   - Dashboard should appear immediately!

### Step 3: Configure (Optional)

If you need to change WiFi or SSH settings:

1. **Mount SD card** (before booting):
   - **Linux:** SD card should auto-mount
   - **macOS:** SD card should auto-mount
   - **Windows:** Use WSL or Linux tools

2. **Edit cloud-init config:**
   - Navigate to boot partition
   - Edit `user-data` file
   - Change WiFi/SSH settings

3. **Boot Pi** with new settings

---

## Troubleshooting

### Pi Won't Boot

**Symptoms:** No display, no lights, nothing happens

**Solutions:**
- Check SD card is properly inserted
- Check power supply (5V, 2.5A minimum)
- Try different SD card
- Check SD card is properly formatted
- Try reflashing image

### WiFi Not Connecting

**Symptoms:** Pi boots but no network connection

**Solutions:**
- Check WiFi credentials in cloud-init config
- Verify Pi 3B+ only supports 2.4GHz WiFi (not 5GHz)
- Check router is broadcasting 2.4GHz network
- Check WiFi password is correct
- Try Ethernet cable instead
- Check logs: `journalctl -u cloud-init`

### SSH Not Working

**Symptoms:** Can't SSH into Pi

**Solutions:**
- Check SSH is enabled in cloud-init config
- Check Pi is on same network
- Try: `ssh calvin@<pi-ip-address>`
- Check SSH keys are correctly formatted
- Try password login (if configured)
- Check firewall settings

### Services Not Starting

**Symptoms:** Dashboard not appearing, services not running

**Solutions:**
- Check service status: `systemctl status calvin-backend`
- Check logs: `journalctl -u calvin-backend -f`
- Check dependencies: `uv --version && node --version`
- Check permissions: `ls -la /home/calvin/calvin`
- Restart services: `sudo systemctl restart calvin-backend`

### Auto-Update Not Working (Dev Image)

**Symptoms:** Code not updating automatically

**Solutions:**
- Check timer: `systemctl status calvin-update.timer`
- Check update logs: `sudo cat /var/log/calvin-update.log`
- Check GitHub access: `git ls-remote https://github.com/osterbergsimon/calvin.git`
- Manually trigger: `sudo systemctl start calvin-update.service`
- Check network connection

### Display Not Working

**Symptoms:** No display, blank screen

**Solutions:**
- Check HDMI cable is connected
- Try different HDMI port
- Check display is powered on
- Check X server: `systemctl status display-manager`
- Check Chromium: `systemctl status calvin-frontend`
- Check backend: `curl http://localhost:8000/api/health`

---

## Quick Reference

### Useful Commands

```bash
# Check service status
systemctl status calvin-backend
systemctl status calvin-frontend
systemctl status calvin-update.timer

# View logs
journalctl -u calvin-backend -f
journalctl -u calvin-frontend -f
journalctl -u calvin-update.service -f

# Restart services
sudo systemctl restart calvin-backend
sudo systemctl restart calvin-frontend

# Manually trigger update (dev image)
sudo systemctl start calvin-update.service

# Check update timer
systemctl list-timers calvin-update.timer

# Check setup logs
sudo cat /var/log/calvin-setup.log

# Check update logs
sudo cat /var/log/calvin-update.log

# Test backend
curl http://localhost:8000/api/health
```

### File Locations

```
Calvin code:        /home/calvin/calvin/
Backend data:       /home/calvin/calvin/backend/data/
Backend logs:       /home/calvin/calvin/backend/logs/
Service files:      /etc/systemd/system/calvin-*.service
Update script:     /usr/local/bin/update-calvin.sh
Update config:      /etc/default/calvin-update
Setup logs:         /var/log/calvin-setup.log
Update logs:        /var/log/calvin-update.log
```

### Network Access

- **SSH:** `ssh calvin@calvin-dashboard-dev` or `ssh calvin@<pi-ip>`
- **Dashboard:** `http://<pi-ip-address>:8000`
- **API Docs:** `http://<pi-ip-address>:8000/docs`

---

## Next Steps

- **Configure WiFi/SSH:** Edit cloud-init config before flashing
- **Add Images:** Copy images to `/home/calvin/calvin/backend/data/images/`
- **Configure Calendar:** Use Settings page in dashboard
- **Customize:** Edit code and push to GitHub (dev image auto-updates)

---

## Support

- **Documentation:** See `rpi-image/README.md` for more details
- **Issues:** Report on GitHub: https://github.com/osterbergsimon/calvin/issues
- **Questions:** Check troubleshooting section above

