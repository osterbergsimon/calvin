# Troubleshooting: Pi Reboots During Setup

## Problem

The Raspberry Pi reboots when running `uv sync` or during package installation.

## Likely Causes

### 1. Out of Memory (OOM) - Most Common
- **Pi 3B+ has only 1GB RAM**
- `uv sync` and `npm install` can use a lot of memory
- When memory runs out, the OOM killer reboots the system

### 2. Power Supply Issues
- Insufficient power (need 5V, 2.5A minimum)
- Poor quality power supply
- Long USB cable causing voltage drop

### 3. Overheating
- CPU throttling or thermal shutdown
- Poor ventilation

## Solutions

### Solution 1: Add Swap Space (Recommended)

Add swap space to prevent OOM:

```bash
# Check current swap
free -h

# Create 1GB swap file
sudo fallocate -l 1G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile

# Make permanent
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab

# Verify
free -h
```

### Solution 2: Install Dependencies in Smaller Batches

Instead of running `uv sync` all at once, install packages in smaller groups:

```bash
cd /home/calvin/calvin/backend

# Use UV with lower concurrency
UV_CONCURRENCY=1 uv sync --extra dev --extra linux

# Or install packages one at a time (slower but uses less memory)
```

### Solution 3: Check System Logs

After reboot, check what caused it:

```bash
# Check OOM killer logs
sudo dmesg | grep -i "out of memory\|oom\|killed"

# Check system logs
sudo journalctl -b -1 | tail -50  # Previous boot logs

# Check memory usage
free -h
```

### Solution 4: Monitor Memory During Setup

Run setup with monitoring:

```bash
# In one terminal, monitor memory
watch -n 1 free -h

# In another terminal, run setup
cd /home/calvin/calvin
sudo bash rpi-image/first-boot/setup-dev.sh
```

### Solution 5: Install Without Dev Dependencies First

Install production dependencies first (less memory), then dev:

```bash
cd /home/calvin/calvin/backend

# Install production dependencies only
uv sync --extra linux

# Then install dev dependencies separately
uv sync --extra dev --extra linux
```

## Quick Fix: Add Swap and Retry

```bash
# Add swap
sudo fallocate -l 1G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab

# Verify swap is active
free -h

# Now retry uv sync
cd /home/calvin/calvin/backend
sudo /root/.local/bin/uv sync --extra dev --extra linux
```

## Prevention: Update Setup Script

The setup script should add swap automatically. This will be fixed in the next update.

