# How to Flash Development Image to SD Card

This guide walks you through creating and flashing the Calvin development image to your SD card for Raspberry Pi.

## Prerequisites

- **SD Card**: 8GB+ recommended (16GB+ preferred)
- **Raspberry Pi Imager**: Download from https://www.raspberrypi.com/software/
- **GitHub Repository Access**: The dev image will auto-pull from GitHub
- **WiFi Network**: For auto-update to work (or use Ethernet)

## Step 1: Download Raspberry Pi Imager

1. Download from: https://www.raspberrypi.com/software/
2. Install on your Windows machine
3. Launch Raspberry Pi Imager

## Step 2: Prepare Configuration

### Option A: Use Build Script (Recommended)

1. Open PowerShell in the project directory:
   ```powershell
   cd C:\Users\oster\code\calvin
   .\rpi-image\build-dev-image.sh
   ```

2. Follow the prompts:
   - Enter GitHub repository URL (default: `https://github.com/osterbergsimon/calvin.git`)
   - Enter branch name (default: `main`)
   - Enter update interval in seconds (default: `300` = 5 minutes)

3. Edit the cloud-init configuration when prompted:
   - Configure WiFi credentials
   - Add your SSH public key
   - Set password (or leave commented to disable password login)

### Option B: Manual Configuration

1. Edit `rpi-image/cloud-init/user-data-dev.yml`:
   ```yaml
   # Configure WiFi (uncomment and fill in)
   wifi:
     networks:
       - name: "YourWiFiSSID"
         password: "YourWiFiPassword"
         priority: 1
   
   # Add your SSH public key
   ssh_authorized_keys:
     - ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABAQ... your-key-here
   ```

2. Edit `rpi-image/first-boot/setup-dev.sh` if needed:
   - Change `GIT_REPO` (line 9)
   - Change `GIT_BRANCH` (line 10)
   - Change `UPDATE_INTERVAL` (line 11)

## Step 3: Flash SD Card with Raspberry Pi Imager

### Using Raspberry Pi Imager (Easiest Method)

1. **Insert SD card** into your computer

2. **Open Raspberry Pi Imager**

3. **Choose OS**:
   - Click "Choose OS"
   - Select "Raspberry Pi OS (other)"
   - Select "Raspberry Pi OS Lite (64-bit)" (recommended for Pi 3B+)

4. **Choose Storage**:
   - Click "Choose Storage"
   - Select your SD card

5. **Configure Settings** (Click gear icon ⚙️):
   - **Hostname**: `calvin-dashboard-dev` (or leave default)
   - **Enable SSH**: ✓ Checked
   - **Username**: `calvin`
   - **Password**: Set a password (or leave blank to use SSH keys only)
   - **Configure WiFi**: ✓ Checked (if using WiFi)
     - SSID: Your WiFi network name
     - Password: Your WiFi password
   - **Set locale settings**: ✓ Checked
     - Timezone: Your timezone
     - Keyboard layout: Your keyboard layout

6. **Edit Custom Cloud-init User-data**:
   - Click "Edit custom cloud-init user-data"
   - Copy contents from `rpi-image/cloud-init/user-data-dev.yml`
   - Paste into the editor
   - Save and close

7. **Write Image**:
   - Click "Write"
   - Confirm when prompted
   - Wait for image to be written (5-10 minutes)

## Step 4: Post-Flash Configuration

After flashing, you need to add the Calvin application files to the SD card:

### Option A: Mount SD Card and Copy Files

1. **Mount the root filesystem** (second partition on SD card):
   - Windows: May need to use WSL or Linux tools
   - Or use a Linux VM/computer

2. **Copy files to SD card**:
   ```bash
   # Mount point (adjust as needed)
   SD_ROOT=/mnt/sd-root
   
   # Create directory structure
   mkdir -p $SD_ROOT/home/calvin/calvin
   
   # Copy Calvin project
   cp -r /path/to/calvin/* $SD_ROOT/home/calvin/calvin/
   
   # Make scripts executable
   chmod +x $SD_ROOT/home/calvin/calvin/first-boot/setup-dev.sh
   chmod +x $SD_ROOT/home/calvin/calvin/scripts/update-calvin.sh
   ```

### Option B: Let First Boot Clone from GitHub (Easier!)

The dev image is designed to clone from GitHub on first boot, so you can skip manual file copying if:

1. **GitHub repository is accessible** from the Pi
2. **Repository is public** (or you configure SSH keys)

The `setup-dev.sh` script will automatically clone the repository on first boot.

## Step 5: Boot Raspberry Pi

1. **Insert SD card** into Raspberry Pi
2. **Connect power** to Raspberry Pi
3. **Wait for first boot** (5-10 minutes):
   - WiFi will connect (if configured)
   - SSH will be enabled
   - First-boot script will run:
     - Clone Calvin from GitHub
     - Install dependencies
     - Build frontend
     - Configure services
     - Reboot into kiosk mode

## Step 6: Verify Setup

### Check First Boot Logs

SSH into the Pi:
```bash
ssh calvin@calvin-dashboard-dev
# Or use IP address if hostname doesn't resolve:
ssh calvin@<pi-ip-address>
```

Check setup logs:
```bash
sudo cat /var/log/calvin-setup.log
```

Check service status:
```bash
systemctl status calvin-backend
systemctl status calvin-frontend
systemctl status calvin-update.timer
```

### Check Auto-Update

Verify update timer is active:
```bash
systemctl status calvin-update.timer
```

Check update logs:
```bash
sudo cat /var/log/calvin-update.log
```

### Test Auto-Update

1. **Make a change** to your code
2. **Push to GitHub**:
   ```bash
   git add .
   git commit -m "Test auto-update"
   git push origin main
   ```

3. **Wait for update interval** (default: 5 minutes)

4. **Check update logs**:
   ```bash
   sudo tail -f /var/log/calvin-update.log
   ```

5. **Verify changes** are pulled and services restarted

## Troubleshooting

### Pi Won't Boot

- **Check SD card**: Ensure it's properly inserted
- **Check power supply**: Pi 3B+ needs 5V, 2.5A minimum
- **Check HDMI**: Connect display to see boot messages
- **Check logs**: Use serial console if available

### WiFi Not Connecting

- **Check credentials**: Verify SSID and password in cloud-init
- **Check frequency**: Pi 3B+ only supports 2.4GHz WiFi (not 5GHz)
- **Check router**: Ensure router is broadcasting 2.4GHz network
- **Check logs**: `journalctl -u cloud-init`

### SSH Not Working

- **Check SSH is enabled**: Verify in cloud-init config
- **Check SSH keys**: Ensure public key is correctly formatted
- **Check network**: Ensure Pi is on same network
- **Try password login**: If SSH keys don't work, try password

### Services Not Starting

- **Check logs**:
  ```bash
  journalctl -u calvin-backend -f
  journalctl -u calvin-frontend -f
  ```

- **Check dependencies**:
  ```bash
  uv --version
  node --version
  ```

- **Check permissions**:
  ```bash
  ls -la /home/calvin/calvin
  ```

### Auto-Update Not Working

- **Check timer**:
  ```bash
  systemctl status calvin-update.timer
  systemctl list-timers calvin-update.timer
  ```

- **Check GitHub access**:
  ```bash
  git ls-remote https://github.com/osterbergsimon/calvin.git
  ```

- **Check update logs**:
  ```bash
  sudo cat /var/log/calvin-update.log
  ```

- **Manually trigger update**:
  ```bash
  sudo systemctl start calvin-update.service
  ```

### Display Not Working

- **Check X server**:
  ```bash
  systemctl status display-manager
  ```

- **Check Chromium**:
  ```bash
  systemctl status calvin-frontend
  ```

- **Check backend**:
  ```bash
  curl http://localhost:8000/api/health
  ```

## Quick Reference

### Important Files

- **Cloud-init config**: `/boot/user-data` (on SD card boot partition)
- **Setup script**: `/home/calvin/calvin/first-boot/setup-dev.sh`
- **Update script**: `/usr/local/bin/update-calvin.sh`
- **Service files**: `/etc/systemd/system/calvin-*.service`

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

# Manually trigger update
sudo systemctl start calvin-update.service

# Check update timer
systemctl list-timers calvin-update.timer
```

## Next Steps

Once the dev image is running:

1. **Develop on your machine**: Make changes to code
2. **Push to GitHub**: `git push origin main`
3. **Auto-update on Pi**: Pi will automatically pull and update (every 5 minutes by default)
4. **Test on Pi**: Changes appear automatically without reflashing!

## Configuration

### Change Update Interval

Edit `/etc/systemd/system/calvin-update.timer`:
```ini
[Timer]
OnUnitActiveSec=300s  # Change to desired interval
```

Then reload:
```bash
sudo systemctl daemon-reload
sudo systemctl restart calvin-update.timer
```

### Change GitHub Repository/Branch

Edit `/etc/default/calvin-update`:
```bash
GIT_REPO=https://github.com/your-username/calvin.git
GIT_BRANCH=main
REPO_DIR=/home/calvin/calvin
```

Then restart update service:
```bash
sudo systemctl restart calvin-update.timer
```

