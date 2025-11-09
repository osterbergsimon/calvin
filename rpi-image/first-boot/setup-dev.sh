#!/bin/bash
# Calvin Dashboard - Development Image First-Boot Setup Script
# This script runs once on first boot to set up the Calvin application with auto-update

set -e

LOG_FILE="/var/log/calvin-setup.log"
CALVIN_DIR="/home/calvin/calvin"
GIT_REPO="${GIT_REPO:-https://github.com/osterbergsimon/calvin.git}"
GIT_BRANCH="${GIT_BRANCH:-main}"
UPDATE_INTERVAL="${UPDATE_INTERVAL:-300}"  # 5 minutes default

echo "[$(date)] Starting Calvin development setup..." | tee -a "$LOG_FILE"

# Update system
echo "[$(date)] Updating system packages..." | tee -a "$LOG_FILE"
apt-get update -qq
apt-get upgrade -y -qq

# Add swap space to prevent OOM (Pi 3B+ only has 1GB RAM)
echo "[$(date)] Adding swap space to prevent OOM..." | tee -a "$LOG_FILE"
if [ ! -f /swapfile ]; then
    # Create 4GB swap (aggressive to handle full sync with all dependencies)
    echo "[$(date)] Creating 4GB swap file (this may take a few minutes)..." | tee -a "$LOG_FILE"
    fallocate -l 4G /swapfile 2>/dev/null || dd if=/dev/zero of=/swapfile bs=1M count=4096 status=progress
    chmod 600 /swapfile
    mkswap /swapfile
    swapon /swapfile
    echo '/swapfile none swap sw 0 0' >> /etc/fstab
    echo "Swap file created and activated" | tee -a "$LOG_FILE"
    free -h | tee -a "$LOG_FILE"
else
    echo "Swap file already exists" | tee -a "$LOG_FILE"
    # Check swap size and enlarge if needed
    SWAP_SIZE=$(stat -f%z /swapfile 2>/dev/null || stat -c%s /swapfile 2>/dev/null || echo "0")
    SWAP_SIZE_GB=$((SWAP_SIZE / 1024 / 1024 / 1024))
    if [ "$SWAP_SIZE_GB" -lt 4 ]; then
        echo "[$(date)] Swap file is only ${SWAP_SIZE_GB}GB, enlarging to 4GB..." | tee -a "$LOG_FILE"
        swapoff /swapfile 2>/dev/null || true
        rm -f /swapfile
        fallocate -l 4G /swapfile 2>/dev/null || dd if=/dev/zero of=/swapfile bs=1M count=4096 status=progress
        chmod 600 /swapfile
        mkswap /swapfile
        swapon /swapfile
        echo "Swap enlarged to 4GB" | tee -a "$LOG_FILE"
    fi
    # Ensure swap is active
    if ! swapon --show | grep -q swapfile; then
        swapon /swapfile
        echo "Swap activated" | tee -a "$LOG_FILE"
    else
        echo "Swap already active" | tee -a "$LOG_FILE"
    fi
    free -h | tee -a "$LOG_FILE"
fi

# Install system dependencies
echo "[$(date)] Installing system dependencies..." | tee -a "$LOG_FILE"
apt-get install -y -qq \
    python3 \
    python3-dev \
    python3-venv \
    python3-pip \
    build-essential \
    curl \
    git \
    xserver-xorg \
    xinit \
    openbox \
    chromium-browser \
    unclutter \
    xdotool \
    x11-xserver-utils \
    cron \
    || echo "Some packages may already be installed" | tee -a "$LOG_FILE"

# Install UV (Python package manager)
echo "[$(date)] Installing UV..." | tee -a "$LOG_FILE"
if ! command -v uv &> /dev/null; then
    curl -LsSf https://astral.sh/uv/install.sh | sh
    # Add to PATH permanently
    echo 'export PATH="$HOME/.local/bin:$PATH"' >> /home/calvin/.bashrc
    echo 'export PATH="$HOME/.local/bin:$PATH"' >> /home/calvin/.profile
fi
# Ensure UV is in PATH for this script
export PATH="/home/calvin/.local/bin:$PATH"
# Also check ~/.cargo/bin (alternative install location)
if [ -d "/home/calvin/.cargo/bin" ]; then
    export PATH="/home/calvin/.cargo/bin:$PATH"
fi

# Install Node.js 20+
echo "[$(date)] Installing Node.js..." | tee -a "$LOG_FILE"
if ! command -v node &> /dev/null || [ "$(node --version | cut -d'v' -f2 | cut -d'.' -f1)" -lt 20 ]; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt-get install -y -qq nodejs
fi

# Clone Calvin repository if not exists
echo "[$(date)] Setting up Calvin application..." | tee -a "$LOG_FILE"
if [ ! -d "$CALVIN_DIR" ]; then
    echo "Cloning Calvin repository..." | tee -a "$LOG_FILE"
    git clone "$GIT_REPO" "$CALVIN_DIR"
    cd "$CALVIN_DIR"
    git checkout "$GIT_BRANCH"
else
    echo "Calvin directory exists. Updating..." | tee -a "$LOG_FILE"
    cd "$CALVIN_DIR"
    git fetch origin
    git reset --hard "origin/$GIT_BRANCH"
fi

# Install backend dependencies
echo "[$(date)] Installing backend dependencies..." | tee -a "$LOG_FILE"
cd "$CALVIN_DIR/backend"
# Ensure UV is in PATH
export PATH="/home/calvin/.local/bin:/home/calvin/.cargo/bin:$PATH"
# Verify UV is available
if ! command -v uv &> /dev/null; then
    echo "ERROR: UV not found in PATH. Trying to locate..." | tee -a "$LOG_FILE"
    if [ -f "/home/calvin/.local/bin/uv" ]; then
        export PATH="/home/calvin/.local/bin:$PATH"
    elif [ -f "/home/calvin/.cargo/bin/uv" ]; then
        export PATH="/home/calvin/.cargo/bin:$PATH"
    else
        echo "ERROR: UV not found. Reinstalling..." | tee -a "$LOG_FILE"
        curl -LsSf https://astral.sh/uv/install.sh | sh
        export PATH="/home/calvin/.local/bin:/home/calvin/.cargo/bin:$PATH"
    fi
fi
# Fix ownership of Calvin directory (in case script was run as root)
chown -R calvin:calvin "$CALVIN_DIR"
# Clear UV cache to fix corrupted wheels
echo "[$(date)] Clearing UV cache to fix corrupted wheels..." | tee -a "$LOG_FILE"
sudo -u calvin bash -c "export PATH='/home/calvin/.local/bin:/home/calvin/.cargo/bin:\$PATH' && uv cache clean" || true

# Install backend dependencies
# Run UV as calvin user to ensure proper permissions
# Use lower concurrency to reduce memory usage on Pi 3B+
echo "[$(date)] Installing backend dependencies (production + linux + dev)..." | tee -a "$LOG_FILE"
echo "[$(date)] Using aggressive memory management: 4GB swap + single package installs..." | tee -a "$LOG_FILE"

# Try full sync first (fastest if it works)
echo "[$(date)] Attempting full sync (production + linux + dev)..." | tee -a "$LOG_FILE"
sudo -u calvin bash << 'UV_SYNC_EOF'
    export PATH="/home/calvin/.local/bin:/home/calvin/.cargo/bin:$PATH"
    export UV_CONCURRENCY=1
    cd /home/calvin/calvin/backend
    uv sync --extra dev --extra linux
UV_SYNC_EOF

# Check if it succeeded
if [ $? -ne 0 ]; then
    echo "[$(date)] Full sync failed, trying production + linux only..." | tee -a "$LOG_FILE"
    sudo -u calvin bash << 'UV_SYNC_EOF'
        export PATH="/home/calvin/.local/bin:/home/calvin/.cargo/bin:$PATH"
        export UV_CONCURRENCY=1
        cd /home/calvin/calvin/backend
        uv sync --extra linux
UV_SYNC_EOF
    
    if [ $? -ne 0 ]; then
        echo "[$(date)] Production + linux failed, trying production only..." | tee -a "$LOG_FILE"
        sudo -u calvin bash << 'UV_SYNC_EOF'
            export PATH="/home/calvin/.local/bin:/home/calvin/.cargo/bin:$PATH"
            export UV_CONCURRENCY=1
            cd /home/calvin/calvin/backend
            uv sync
UV_SYNC_EOF
        
        if [ $? -ne 0 ]; then
            echo "[$(date)] ERROR: All installation attempts failed. Check logs and memory." | tee -a "$LOG_FILE"
            echo "[$(date)] Current memory status:" | tee -a "$LOG_FILE"
            free -h | tee -a "$LOG_FILE"
            echo "[$(date)] UV location check:" | tee -a "$LOG_FILE"
            which uv || echo "UV not found in PATH" | tee -a "$LOG_FILE"
            ls -la /home/calvin/.local/bin/uv || echo "UV not in .local/bin" | tee -a "$LOG_FILE"
            exit 1
        else
            # If production worked, try adding dev dependencies
            echo "[$(date)] Production installed. Now adding dev dependencies..." | tee -a "$LOG_FILE"
            sudo -u calvin bash << 'UV_SYNC_EOF'
                export PATH="/home/calvin/.local/bin:/home/calvin/.cargo/bin:$PATH"
                export UV_CONCURRENCY=1
                cd /home/calvin/calvin/backend
                uv sync --extra dev --extra linux || echo "Dev dependencies failed, but production should work"
UV_SYNC_EOF
        fi
    else
        # If production + linux worked, try adding dev dependencies
        echo "[$(date)] Production + linux installed. Now adding dev dependencies..." | tee -a "$LOG_FILE"
        sudo -u calvin bash << 'UV_SYNC_EOF'
            export PATH="/home/calvin/.local/bin:/home/calvin/.cargo/bin:$PATH"
            export UV_CONCURRENCY=1
            cd /home/calvin/calvin/backend
            uv sync --extra dev --extra linux || echo "Dev dependencies failed, but production should work"
UV_SYNC_EOF
    fi
fi

echo "[$(date)] Backend dependencies installation complete" | tee -a "$LOG_FILE"
free -h | tee -a "$LOG_FILE"

# Install frontend dependencies
echo "[$(date)] Installing frontend dependencies..." | tee -a "$LOG_FILE"
cd "$CALVIN_DIR/frontend"
# Fix ownership before npm install
chown -R calvin:calvin "$CALVIN_DIR/frontend"
# Run npm as calvin user
sudo -u calvin bash -c "cd '$CALVIN_DIR/frontend' && npm ci"

# Build frontend
echo "[$(date)] Building frontend..." | tee -a "$LOG_FILE"
npm run build

# Create data directories
echo "[$(date)] Creating data directories..." | tee -a "$LOG_FILE"
mkdir -p "$CALVIN_DIR/backend/data/db"
mkdir -p "$CALVIN_DIR/backend/data/images"
mkdir -p "$CALVIN_DIR/backend/data/cache/images"
mkdir -p "$CALVIN_DIR/backend/logs"
chown -R calvin:calvin "$CALVIN_DIR/backend/data"
chown -R calvin:calvin "$CALVIN_DIR/backend/logs"

# Install update script
echo "[$(date)] Installing update script..." | tee -a "$LOG_FILE"
cp "$CALVIN_DIR/scripts/update-calvin.sh" /usr/local/bin/update-calvin.sh
chmod +x /usr/local/bin/update-calvin.sh
chown calvin:calvin /usr/local/bin/update-calvin.sh

# Configure update script with environment variables
cat > /etc/default/calvin-update << EOF
GIT_REPO=$GIT_REPO
GIT_BRANCH=$GIT_BRANCH
REPO_DIR=$CALVIN_DIR
EOF

# Install systemd services
echo "[$(date)] Installing systemd services..." | tee -a "$LOG_FILE"
cp "$CALVIN_DIR/rpi-image/systemd/calvin-backend.service" /etc/systemd/system/
cp "$CALVIN_DIR/rpi-image/systemd/calvin-frontend.service" /etc/systemd/system/
cp "$CALVIN_DIR/rpi-image/systemd/calvin-update.service" /etc/systemd/system/
cp "$CALVIN_DIR/rpi-image/systemd/calvin-update.timer" /etc/systemd/system/

# Configure update timer - use OnUnitActiveSec for arbitrary intervals
# Convert seconds to minutes for OnUnitActiveSec
UPDATE_MINUTES=$((UPDATE_INTERVAL / 60))
if [ "$UPDATE_MINUTES" -lt 1 ]; then
    UPDATE_MINUTES=1
fi
sed -i "s|OnUnitActiveSec=.*|OnUnitActiveSec=${UPDATE_INTERVAL}s|" /etc/systemd/system/calvin-update.timer

systemctl daemon-reload
systemctl enable calvin-backend.service
systemctl enable calvin-frontend.service
systemctl enable calvin-update.timer

# Start services
echo "[$(date)] Starting services..." | tee -a "$LOG_FILE"
systemctl start calvin-backend.service
systemctl start calvin-update.timer
sleep 5  # Wait for backend to start
systemctl start calvin-frontend.service

# Configure display (same as production)
echo "[$(date)] Configuring display..." | tee -a "$LOG_FILE"
echo "xset s off" >> /home/calvin/.xprofile
echo "xset -dpms" >> /home/calvin/.xprofile
echo "xset s noblank" >> /home/calvin/.xprofile
chown calvin:calvin /home/calvin/.xprofile

# Configure auto-login
mkdir -p /etc/systemd/system/getty@tty1.service.d
cat > /etc/systemd/system/getty@tty1.service.d/autologin.conf << EOF
[Service]
ExecStart=
ExecStart=-/sbin/agetty --autologin calvin --noclear %I \$TERM
EOF

# Configure X to start automatically
cat > /home/calvin/.xinitrc << 'EOF'
#!/bin/sh
exec openbox-session
EOF
chmod +x /home/calvin/.xinitrc
chown calvin:calvin /home/calvin/.xinitrc

# Configure autostart
mkdir -p /home/calvin/.config/openbox
cat > /home/calvin/.config/openbox/autostart << 'EOF'
#!/bin/bash
# Wait for backend to be ready
while ! curl -s http://localhost:8000/api/health > /dev/null; do
    sleep 1
done

# Start Chromium in kiosk mode
chromium-browser \
    --kiosk \
    --noerrdialogs \
    --disable-infobars \
    --autoplay-policy=no-user-gesture-required \
    --disable-features=TranslateUI \
    --disable-ipc-flooding-protection \
    http://localhost:8000 &

# Hide cursor after 3 seconds
unclutter -idle 3 -root &
EOF
chmod +x /home/calvin/.config/openbox/autostart
chown -R calvin:calvin /home/calvin/.config

# Enable auto-start X on boot
cat > /home/calvin/.bash_profile << 'EOF'
if [ -z "$DISPLAY" ] && [ -n "$XDG_VTNR" ] && [ "$XDG_VTNR" -eq 1 ]; then
    exec startx
fi
EOF
chown calvin:calvin /home/calvin/.bash_profile

echo "[$(date)] Calvin development setup complete!" | tee -a "$LOG_FILE"
echo "[$(date)] Auto-update enabled (every $UPDATE_INTERVAL seconds)" | tee -a "$LOG_FILE"
echo "[$(date)] System will reboot in 30 seconds..." | tee -a "$LOG_FILE"

