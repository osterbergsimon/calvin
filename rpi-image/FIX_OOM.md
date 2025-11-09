# Fix OOM (Out of Memory) Reboots

## Problem

The Raspberry Pi 3B+ reboots during `uv sync` because it runs out of memory (OOM killer).

## Immediate Fix

Run these commands on your Pi:

```bash
# 1. Check if swap is active
free -h

# 2. If swap is not active or too small, create/enlarge it
sudo swapoff /swapfile 2>/dev/null || true
sudo rm -f /swapfile
sudo fallocate -l 2G /swapfile || sudo dd if=/dev/zero of=/swapfile bs=1M count=2048
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile

# 3. Make it permanent
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab

# 4. Verify swap is active (should show ~2GB swap)
free -h

# 5. Now try uv sync with lower concurrency
cd /home/calvin/calvin/backend
export PATH="/home/calvin/.local/bin:/home/calvin/.cargo/bin:$PATH"
export UV_CONCURRENCY=1

# 6. Install in stages to reduce memory pressure
# Stage 1: Production dependencies only
uv sync

# Stage 2: Linux extras
uv sync --extra linux

# Stage 3: Dev extras (if needed)
uv sync --extra dev --extra linux
```

## Alternative: Install Without Dev Dependencies

If it still reboots, skip dev dependencies for now:

```bash
cd /home/calvin/calvin/backend
export PATH="/home/calvin/.local/bin:/home/calvin/.cargo/bin:$PATH"
export UV_CONCURRENCY=1

# Install production + linux only (no dev tools)
uv sync --extra linux

# Continue with frontend
cd /home/calvin/calvin/frontend
npm ci
npm run build
```

## Monitor Memory During Sync

In one terminal, monitor memory:
```bash
watch -n 1 free -h
```

In another terminal, run uv sync:
```bash
cd /home/calvin/calvin/backend
export UV_CONCURRENCY=1
uv sync --extra dev --extra linux
```

Watch the memory usage - if it gets close to 0 free, the OOM killer will trigger.

## Check OOM Logs

After a reboot, check what caused it:
```bash
# Check OOM killer logs
sudo dmesg | grep -i "out of memory\|oom\|killed"

# Check system logs from previous boot
sudo journalctl -b -1 | tail -50
```

## Why This Happens

- **Pi 3B+ has only 1GB RAM**
- `uv sync` compiles Python packages in parallel
- Each package compilation can use 100-200MB
- With multiple packages, memory runs out quickly
- OOM killer reboots the system to prevent corruption

## Solutions

1. **Add swap space** (2GB recommended) - provides virtual memory
2. **Reduce concurrency** (`UV_CONCURRENCY=1`) - installs one package at a time
3. **Install in stages** - reduces peak memory usage
4. **Skip dev dependencies** - if not needed for production

