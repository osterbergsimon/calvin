# Quick Start: Flash Dev Image to SD Card

## Fastest Method (5 Steps)

### 1. Install Raspberry Pi Imager
Download from: https://www.raspberrypi.com/software/

### 2. Configure Cloud-init
Edit `rpi-image/cloud-init/user-data-dev.yml`:
- Uncomment and configure WiFi
- Add your SSH public key

### 3. Flash SD Card
1. Open Raspberry Pi Imager
2. Choose OS: **Raspberry Pi OS Lite (64-bit)**
3. Choose Storage: **Your SD card**
4. Click gear icon ⚙️:
   - Enable SSH
   - Username: `calvin`
   - Configure WiFi
   - Click "Edit custom cloud-init user-data"
   - Copy/paste contents from `rpi-image/cloud-init/user-data-dev.yml`
5. Click **Write**

### 4. Boot Raspberry Pi
1. Insert SD card
2. Power on Pi
3. Wait 5-10 minutes for first boot

### 5. Verify
```bash
ssh calvin@calvin-dashboard-dev
# Or: ssh calvin@<pi-ip-address>

# Check status
systemctl status calvin-backend
systemctl status calvin-frontend
systemctl status calvin-update.timer

# View logs
sudo cat /var/log/calvin-setup.log
```

## That's It!

The dev image will:
- ✅ Clone Calvin from GitHub on first boot
- ✅ Auto-update every 5 minutes (configurable)
- ✅ Auto-restart services after updates
- ✅ Run in kiosk mode

**No manual file copying needed!** The Pi clones from GitHub automatically.

## Troubleshooting

**Can't SSH?**
- Check WiFi is connected
- Try: `ssh calvin@<pi-ip-address>`
- Check: `ping calvin-dashboard-dev`

**Services not running?**
```bash
sudo journalctl -u calvin-backend -f
sudo journalctl -u calvin-frontend -f
```

**Auto-update not working?**
```bash
sudo systemctl status calvin-update.timer
sudo cat /var/log/calvin-update.log
```

See `FLASH_DEV_IMAGE.md` for detailed instructions.

