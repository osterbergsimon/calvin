# How the Development Image Works - Complete Flow

## The Problem You Identified

You're absolutely right to be confused! Here's the issue:

**Current (broken) flow:**
1. Flash standard Raspberry Pi OS image to SD card
2. Cloud-init runs on first boot
3. Cloud-init tries to run `/home/calvin/calvin/first-boot/setup-dev.sh`
4. **BUT** that file doesn't exist yet because the code hasn't been cloned!
5. ❌ **FAILS** - script doesn't exist

## The Solution

We need to embed the setup script **directly in cloud-init** so it runs on first boot, THEN clones the code.

## Correct Flow

### Step 1: Flash Image
- Flash standard **Raspberry Pi OS Lite (64-bit)** to SD card
- Include cloud-init config with **embedded setup script**
- No Calvin code on the image yet!

### Step 2: First Boot (Automatic)
1. **Raspberry Pi boots** with standard OS
2. **Cloud-init runs** (built into Raspberry Pi OS)
3. **Cloud-init executes embedded setup script** (from cloud-init config)
4. **Setup script:**
   - Installs dependencies (Python, Node.js, UV, etc.)
   - **Clones Calvin from GitHub** → `/home/calvin/calvin/`
   - Installs backend dependencies (`uv sync`)
   - Installs frontend dependencies (`npm ci`)
   - Builds frontend (`npm run build`)
   - **Copies systemd service files** from cloned repo
   - **Installs systemd services** → `/etc/systemd/system/`
   - **Enables and starts services**
   - Configures display/kiosk mode
   - Reboots

### Step 3: After Reboot
- **Systemd services are now installed** and running
- You can SSH in and check: `systemctl status calvin-backend`
- Services auto-start on boot
- Auto-update timer is active

### Step 4: Auto-Update (Every 5 minutes)
- **Update timer triggers** → runs `calvin-update.service`
- **Update script:**
  - Pulls latest code from GitHub
  - Updates dependencies
  - Rebuilds frontend
  - Restarts services

## What Gets on the Image?

### On the SD Card (Before First Boot):
- ✅ Standard Raspberry Pi OS Lite
- ✅ Cloud-init config (with embedded setup script)
- ❌ **NO Calvin code yet!**

### After First Boot:
- ✅ Calvin code cloned to `/home/calvin/calvin/`
- ✅ Dependencies installed
- ✅ Systemd services installed
- ✅ Services running

## The Fix Needed

The cloud-init config needs to **embed the setup script directly**, not reference a file that doesn't exist yet.

Here's what needs to change:

**Current (broken):**
```yaml
write_files:
  - path: /home/calvin/calvin/first-boot/setup-dev.sh
    content: |
      #!/bin/bash
      /home/calvin/calvin/first-boot/setup-dev.sh  # ❌ File doesn't exist!
```

**Should be:**
```yaml
runcmd:
  - |
    #!/bin/bash
    # Embedded setup script that clones code first, then runs full setup
    # ... full setup script here ...
```

## Timeline

```
Time 0:00 - Flash SD card
  └─> Standard Raspberry Pi OS only

Time 0:01 - First boot starts
  └─> Cloud-init runs
      └─> Executes embedded setup script
          └─> Installs dependencies
          └─> Clones Calvin from GitHub
          └─> Installs dependencies
          └─> Builds frontend
          └─> Installs systemd services
          └─> Starts services
          └─> Reboots

Time 0:10 - After reboot
  └─> Systemd services running
  └─> You can SSH in
  └─> You can check: systemctl status calvin-backend ✅

Time 0:15 - Auto-update runs
  └─> Pulls latest code
  └─> Updates and restarts
```

## Summary

1. **Image contains**: Standard Raspberry Pi OS + cloud-init config
2. **First boot**: Cloud-init runs embedded script that clones code
3. **After setup**: Code is on Pi, services are running
4. **Ongoing**: Auto-update pulls latest code every 5 minutes

The key insight: **The setup script must be embedded in cloud-init**, not referenced as a file that doesn't exist yet!

