# Quick Start: Dev Image (Auto-Update)

> **⚠️ UNTESTED:** This process has not been tested on actual hardware yet. Use at your own risk.

**Time:** 5-10 minutes first boot, then auto-updates every 5 minutes

## Step 1: Configure Cloud-init

Edit `rpi-image/cloud-init/user-data-dev.yml`:

1. **WiFi** (uncomment and fill in):
   ```yaml
   wifi:
     networks:
       - name: "YourWiFiSSID"
         password: "YourWiFiPassword"
         priority: 1
   ```

2. **SSH Key** (add your public key):
   ```yaml
   ssh_authorized_keys:
     - ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABAQ... your-key-here
   ```
   Get your key: `cat ~/.ssh/id_rsa.pub`

## Step 2: Flash SD Card

1. Open **Raspberry Pi Imager**
2. Choose OS: **Raspberry Pi OS Lite (64-bit)**
3. Choose Storage: **Your SD card**
4. Click gear icon ⚙️:
   - Enable SSH
   - Username: `calvin`
   - Configure WiFi
   - **If available:** Click "Edit custom cloud-init user-data" and paste contents from `rpi-image/cloud-init/user-data-dev.yml`
   - **If not available:** Flash first, then manually add `user-data` file to boot partition (see [FLASH_ALTERNATIVE.md](FLASH_ALTERNATIVE.md))
5. Click **Write**

## Step 3: Boot Pi

1. Insert SD card
2. Power on Pi
3. Wait 5-10 minutes for first boot

## Step 4: Verify

```bash
# SSH into Pi
ssh calvin@calvin-dashboard-dev

# Check services
systemctl status calvin-backend
systemctl status calvin-frontend

# View logs
sudo cat /var/log/calvin-setup.log
```

## Done!

- Dashboard appears on Pi display
- Auto-updates every 5 minutes from GitHub
- Push code: `git push origin main` → Pi updates automatically

---

**For detailed instructions and troubleshooting, see:** [GETTING_STARTED.md](GETTING_STARTED.md)

