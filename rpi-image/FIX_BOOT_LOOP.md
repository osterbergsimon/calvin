# Fix Boot Loop Issue

If your Raspberry Pi is stuck in a boot loop, it's likely caused by the `calvin-x.service` trying to start X via systemd, which is unreliable and can cause system instability.

## Quick Fix (SSH into Pi)

If you can SSH into the Pi during boot (before it reboots):

```bash
# Disable the problematic X service
sudo systemctl stop calvin-x.service
sudo systemctl disable calvin-x.service

# Remove the service file
sudo rm -f /etc/systemd/system/calvin-x.service

# Reload systemd
sudo systemctl daemon-reload

# Reboot
sudo reboot
```

## Alternative: Boot into Recovery Mode

If you can't SSH in time:

1. **Power off the Pi**
2. **Remove the SD card** and mount it on another computer
3. **Edit the systemd service file** or remove it:
   ```bash
   # On your computer, mount the SD card
   # Navigate to: <mount-point>/etc/systemd/system/
   # Delete or rename: calvin-x.service
   ```
4. **Reinsert the SD card** and boot the Pi

## After Fix

After fixing the boot loop:

1. **Verify X service is disabled:**
   ```bash
   systemctl status calvin-x.service
   # Should show: "Unit calvin-x.service could not be found" or "inactive (dead)"
   ```

2. **Check other services:**
   ```bash
   systemctl status calvin-backend
   systemctl status calvin-frontend
   systemctl status calvin-update.timer
   ```

3. **X will start automatically** via `.bash_profile` when you log in on tty1 (physical console), or after reboot if auto-login is configured.

4. **Frontend will start automatically** after X is available (the frontend service waits for X with a timeout).

## Prevention

The setup script now automatically disables the X service if it exists. The X server will start via `.bash_profile` on tty1 login instead, which is more reliable.

## Verify Setup

After reboot, check:

```bash
# Check if X is running
ps aux | grep Xorg

# Check if frontend service is running
systemctl status calvin-frontend

# Check logs
sudo journalctl -u calvin-backend -n 50
sudo journalctl -u calvin-frontend -n 50
```

