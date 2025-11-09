# Mounting Raspberry Pi SD Card on Windows

To fix the boot loop by removing the problematic `calvin-x.service` file, you need to mount the SD card on Windows.

## Step 1: Insert SD Card

1. **Power off the Raspberry Pi** (if it's running)
2. **Remove the SD card** from the Pi
3. **Insert the SD card** into your Windows computer (using a card reader or adapter)

## Step 2: Access the SD Card

Windows will typically show the SD card as a removable drive. However, Raspberry Pi OS uses **Linux filesystems** (ext4), which Windows cannot read natively.

### Option A: Use WSL (Windows Subsystem for Linux) - Recommended

If you have WSL installed:

1. **Open PowerShell or Command Prompt**
2. **Access WSL:**
   ```powershell
   wsl
   ```

3. **Find the SD card device:**
   ```bash
   # List all disks
   lsblk
   # Or
   sudo fdisk -l
   ```

4. **Create mount points and mount:**
   ```bash
   # Create mount directories
   sudo mkdir -p /mnt/sd-boot
   sudo mkdir -p /mnt/sd-root
   
   # Mount the boot partition (FAT32, Windows can read this)
   # Usually /dev/sdb1 or /dev/sdc1 - check with lsblk
   sudo mount /dev/sdb1 /mnt/sd-boot
   
   # Mount the root partition (ext4)
   # Usually /dev/sdb2 or /dev/sdc2
   sudo mount /dev/sdb2 /mnt/sd-root
   ```

5. **Access the files:**
   ```bash
   # Navigate to systemd directory
   cd /mnt/sd-root/etc/systemd/system
   
   # List files
   ls -la
   
   # Remove the problematic X service
   sudo rm -f calvin-x.service
   
   # Verify it's gone
   ls -la | grep calvin-x
   ```

6. **Unmount when done:**
   ```bash
   sudo umount /mnt/sd-boot
   sudo umount /mnt/sd-root
   ```

### Option B: Use Third-Party Software

If you don't have WSL, you can use software that can read ext4 filesystems on Windows:

#### Option B1: DiskInternals Linux Reader (Free)

1. **Download and install:** [DiskInternals Linux Reader](https://www.diskinternals.com/linux-reader/)
2. **Open the application**
3. **Select your SD card** from the list
4. **Browse to:** `/etc/systemd/system/`
5. **Right-click on `calvin-x.service`** and select "Save" to copy it to your Windows drive
6. **Then delete it** (or just note the path for manual deletion via WSL)

#### Option B2: Ext2Fsd (Free, but older)

1. **Download:** [Ext2Fsd](http://www.ext2fsd.com/)
2. **Install** (may require driver installation)
3. **Assign a drive letter** to the ext4 partition
4. **Browse to:** `X:\etc\systemd\system\` (where X is the assigned drive)
5. **Delete `calvin-x.service`**

### Option C: Use Linux Live USB

If you have a Linux Live USB (Ubuntu, etc.):

1. **Boot from the Live USB**
2. **Insert the SD card**
3. **Mount the SD card** (usually auto-mounted)
4. **Navigate to:** `/media/username/.../etc/systemd/system/`
5. **Delete `calvin-x.service`**

## Step 3: Remove the Problematic Service File

Once you have access to the SD card filesystem:

**Path to remove:**
```
/etc/systemd/system/calvin-x.service
```

**In WSL:**
```bash
sudo rm -f /mnt/sd-root/etc/systemd/system/calvin-x.service
```

**In Windows (if using Ext2Fsd):**
- Navigate to: `X:\etc\systemd\system\`
- Delete: `calvin-x.service`

## Step 4: Verify and Reinsert

1. **Verify the file is gone:**
   ```bash
   # In WSL
   ls -la /mnt/sd-root/etc/systemd/system/ | grep calvin-x
   # Should return nothing
   ```

2. **Unmount the SD card** (if using WSL):
   ```bash
   sudo umount /mnt/sd-boot
   sudo umount /mnt/sd-root
   ```

3. **Safely eject** the SD card from Windows

4. **Reinsert the SD card** into the Raspberry Pi

5. **Boot the Pi** - it should boot normally now

## Step 5: After Boot (SSH into Pi)

Once the Pi boots successfully:

```bash
# Pull latest fixes
cd /home/calvin/calvin
git pull origin main

# Re-run setup to apply all fixes
sudo bash rpi-image/first-boot/setup-dev.sh --use-pip

# Reboot
sudo reboot
```

## Troubleshooting

### Can't find the SD card in WSL?

1. **Check if it's mounted in Windows first:**
   - Open Disk Management (`diskmgmt.msc`)
   - Look for the SD card partitions

2. **In WSL, list all devices:**
   ```bash
   lsblk
   # Look for devices like /dev/sdb, /dev/sdc, etc.
   ```

3. **Mount manually:**
   ```bash
   sudo mount /dev/sdb1 /mnt/sd-boot
   sudo mount /dev/sdb2 /mnt/sd-root
   ```

### Permission Denied?

Make sure you're using `sudo` for mount/unmount operations:
```bash
sudo mount ...
sudo rm -f ...
sudo umount ...
```

### SD Card Not Showing Up?

1. **Check if the SD card is properly inserted**
2. **Try a different card reader**
3. **Check Disk Management** in Windows to see if it's recognized at all
4. **The boot partition (FAT32) should be visible in Windows** - if not, the card might be corrupted

## Quick Reference

**WSL Commands:**
```bash
# List devices
lsblk

# Mount
sudo mount /dev/sdb1 /mnt/sd-boot
sudo mount /dev/sdb2 /mnt/sd-root

# Remove service
sudo rm -f /mnt/sd-root/etc/systemd/system/calvin-x.service

# Unmount
sudo umount /mnt/sd-boot
sudo umount /mnt/sd-root
```

**File to remove:**
- `/etc/systemd/system/calvin-x.service`


