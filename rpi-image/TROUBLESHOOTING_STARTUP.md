# Troubleshooting Calvin Startup Issues

This guide helps you diagnose and fix issues with Calvin not starting automatically after a Raspberry Pi reboot.

## 1. How to Start Calvin Manually

### Start Backend Service

```bash
# Check status
sudo systemctl status calvin-backend

# Start the service
sudo systemctl start calvin-backend

# Check if it's running
curl http://localhost:8000/api/health
```

**Or start backend manually (for debugging):**

```bash
cd /home/calvin/calvin/backend

# If using pip (venv exists)
source .venv/bin/activate
uvicorn app.main:app --host 0.0.0.0 --port 8000

# If using UV
export PATH="/home/calvin/.local/bin:/home/calvin/.cargo/bin:$PATH"
uv run uvicorn app.main:app --host 0.0.0.0 --port 8000
```

### Start X Server and Frontend

**Important:** X server can only be started from a physical console (not SSH).

**Option A: Reboot (Easiest)**
```bash
sudo reboot
```

**Option B: Start from Physical Console**
1. Connect a keyboard and monitor to your Pi
2. Press `Ctrl+Alt+F1` to switch to tty1
3. Log in as `calvin` user
4. Run:
   ```bash
   startx
   ```

**Option C: Start Frontend Service (if X is already running)**
```bash
# Check if X is running
ps aux | grep Xorg

# If X is running, start frontend service
sudo systemctl start calvin-frontend

# Check status
sudo systemctl status calvin-frontend
```

### Start Everything at Once

```bash
# Start backend
sudo systemctl start calvin-backend

# Wait for backend to be ready
sleep 5

# Start frontend (only works if X server is already running)
sudo systemctl start calvin-frontend
```

## 2. Why Calvin Doesn't Start Automatically

### Common Causes

#### A. Auto-Login Not Configured

The X server starts when the `calvin` user logs into tty1. If auto-login isn't configured, X won't start.

**Check:**
```bash
cat /etc/systemd/system/getty@tty1.service.d/autologin.conf
```

**Fix:**
```bash
sudo mkdir -p /etc/systemd/system/getty@tty1.service.d
sudo tee /etc/systemd/system/getty@tty1.service.d/autologin.conf > /dev/null << EOF
[Service]
ExecStart=
ExecStart=-/sbin/agetty --autologin calvin --noclear %I \$TERM
EOF
sudo systemctl daemon-reload
```

#### B. .bash_profile Missing or Incorrect

The `.bash_profile` file should automatically start X when logging into tty1.

**Check:**
```bash
cat /home/calvin/.bash_profile
```

**Should contain:**
```bash
if [ -z "$DISPLAY" ] && [ -n "$XDG_VTNR" ] && [ "$XDG_VTNR" -eq 1 ]; then
    exec startx
fi
```

**Fix:**
```bash
cat > /home/calvin/.bash_profile << 'EOF'
if [ -z "$DISPLAY" ] && [ -n "$XDG_VTNR" ] && [ "$XDG_VTNR" -eq 1 ]; then
    exec startx
fi
EOF
chown calvin:calvin /home/calvin/.bash_profile
```

#### C. Services Not Enabled

The systemd services must be enabled to start on boot.

**Check:**
```bash
systemctl is-enabled calvin-backend
systemctl is-enabled calvin-frontend
```

**Fix:**
```bash
sudo systemctl enable calvin-backend
sudo systemctl enable calvin-frontend
```

#### D. Backend Service Failing

The backend might be failing to start due to:
- Missing dependencies
- Permission issues
- Database path issues
- Missing environment variables

**Check logs:**
```bash
sudo journalctl -u calvin-backend -n 50
sudo journalctl -u calvin-backend -f  # Follow logs
```

**Common fixes:**
```bash
# Check permissions
sudo chown -R calvin:calvin /home/calvin/calvin

# Check data directories exist
mkdir -p /home/calvin/calvin/backend/data/db
mkdir -p /home/calvin/calvin/backend/data/images
sudo chown -R calvin:calvin /home/calvin/calvin/backend/data

# Reinstall dependencies
cd /home/calvin/calvin/backend
source .venv/bin/activate
pip install .[linux]  # or pip install -e .[linux]
```

#### E. Frontend Service Waiting for X Server

The frontend service waits for the X server to be available. If X doesn't start, the frontend will timeout.

**Check:**
```bash
# Check if X is running
ps aux | grep Xorg

# Check frontend service logs
sudo journalctl -u calvin-frontend -n 50
```

**The frontend service has a 60-second timeout** for both:
- Backend to be ready (`http://localhost:8000/api/health`)
- X server to be available (`/tmp/.X11-unix/X0` or `Xorg` process)

If either times out, the service will fail.

#### F. Network Not Ready

The backend service waits for `network-online.target`, but if the network takes too long, it might fail.

**Check:**
```bash
systemctl status NetworkManager  # or networkd
ip addr show
```

## 3. Diagnostic Commands

Run these to diagnose the issue:

```bash
# Check all service statuses
sudo systemctl status calvin-backend
sudo systemctl status calvin-frontend

# Check if services are enabled
systemctl list-unit-files | grep calvin

# Check service logs
sudo journalctl -u calvin-backend -n 100
sudo journalctl -u calvin-frontend -n 100

# Check if X is running
ps aux | grep Xorg
echo $DISPLAY  # Should be :0 if X is running

# Check if backend is responding
curl http://localhost:8000/api/health

# Check if ports are in use
sudo netstat -tlnp | grep -E '8000|5173'

# Check auto-login configuration
cat /etc/systemd/system/getty@tty1.service.d/autologin.conf

# Check .bash_profile
cat /home/calvin/.bash_profile

# Check .xinitrc
cat /home/calvin/.xinitrc

# Check permissions
ls -la /home/calvin/calvin/backend/data
ls -la /home/calvin/calvin/backend/.venv
```

## 4. Quick Fix: Re-run Setup Script

If everything seems broken, you can re-run the setup script:

```bash
cd /home/calvin/calvin
sudo bash scripts/setup.sh
```

Or for development mode:
```bash
cd /home/calvin/calvin
sudo bash scripts/setup-dev.sh
```

## 5. Manual Startup Sequence

If you need to start everything manually after a reboot:

```bash
# 1. Start backend
sudo systemctl start calvin-backend

# 2. Wait for backend (check health)
curl http://localhost:8000/api/health

# 3. If you have physical access, start X from console:
#    - Switch to tty1: sudo chvt 1
#    - Log in as calvin
#    - Run: startx

# 4. Once X is running, start frontend
sudo systemctl start calvin-frontend
```

## 6. Verify Everything is Working

After starting manually or after a reboot:

```bash
# Backend should be running
curl http://localhost:8000/api/health
# Should return: {"status":"ok"}

# Check services
sudo systemctl status calvin-backend
sudo systemctl status calvin-frontend

# Check X server
ps aux | grep Xorg

# Check Chromium
ps aux | grep chromium
```

## 7. Enable Services for Next Boot

After fixing issues, make sure services are enabled:

```bash
sudo systemctl enable calvin-backend
sudo systemctl enable calvin-frontend
```

Then reboot:
```bash
sudo reboot
```

