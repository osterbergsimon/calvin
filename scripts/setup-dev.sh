#!/bin/bash
# Calvin Dashboard - Development Setup Script
# This script can be run via: wget -O- https://raw.githubusercontent.com/osterbergsimon/calvin/main/scripts/setup-dev.sh | sh
# Or: curl -fsSL https://raw.githubusercontent.com/osterbergsimon/calvin/main/scripts/setup-dev.sh | sh
#
# To use a different branch, set GIT_BRANCH environment variable:
#   GIT_BRANCH=develop wget -O- https://raw.githubusercontent.com/osterbergsimon/calvin/main/scripts/setup-dev.sh | sudo sh
#   GIT_BRANCH=develop curl -fsSL https://raw.githubusercontent.com/osterbergsimon/calvin/main/scripts/setup-dev.sh | sudo sh
#
# To use a different repository:
#   GIT_REPO=https://github.com/yourusername/calvin.git GIT_BRANCH=develop wget -O- ... | sudo sh
#
# The selected branch will be saved and used by the update script automatically.

set -e

# Configuration
GIT_REPO="${GIT_REPO:-https://github.com/osterbergsimon/calvin.git}"
GIT_BRANCH="${GIT_BRANCH:-main}"
CALVIN_DIR="${CALVIN_DIR:-/home/calvin/calvin}"
LOG_FILE="/var/log/calvin-setup.log"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1" | tee -a "$LOG_FILE"
}

error() {
    echo -e "${RED}[$(date +'%Y-%m-%d %H:%M:%S')] ERROR:${NC} $1" | tee -a "$LOG_FILE"
    exit 1
}

warn() {
    echo -e "${YELLOW}[$(date +'%Y-%m-%d %H:%M:%S')] WARNING:${NC} $1" | tee -a "$LOG_FILE"
}

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    error "This script must be run as root (use sudo)"
fi

log "Starting Calvin development setup..."
log "Repository: $GIT_REPO"
log "Branch: $GIT_BRANCH"

# Update system
log "Updating system packages..."
apt-get update -qq
apt-get upgrade -y -qq

# Add swap space to prevent OOM (Pi 3B+ only has 1GB RAM)
log "Adding swap space to prevent OOM..."
if [ ! -f /swapfile ]; then
    log "Creating 4GB swap file (this may take a few minutes)..."
    fallocate -l 4G /swapfile 2>/dev/null || dd if=/dev/zero of=/swapfile bs=1M count=4096 status=progress
    chmod 600 /swapfile
    mkswap /swapfile
    swapon /swapfile
    echo '/swapfile none swap sw 0 0' >> /etc/fstab
    log "Swap file created and activated"
    free -h | tee -a "$LOG_FILE"
else
    log "Swap file already exists"
    # Check swap size and enlarge if needed
    SWAP_SIZE=$(stat -f%z /swapfile 2>/dev/null || stat -c%s /swapfile 2>/dev/null || echo "0")
    SWAP_SIZE_GB=$((SWAP_SIZE / 1024 / 1024 / 1024))
    if [ "$SWAP_SIZE_GB" -lt 4 ]; then
        log "Swap file is only ${SWAP_SIZE_GB}GB, enlarging to 4GB..."
        swapoff /swapfile 2>/dev/null || true
        rm -f /swapfile
        fallocate -l 4G /swapfile 2>/dev/null || dd if=/dev/zero of=/swapfile bs=1M count=4096 status=progress
        chmod 600 /swapfile
        mkswap /swapfile
        swapon /swapfile
        log "Swap enlarged to 4GB"
    fi
    # Ensure swap is active
    if ! swapon --show | grep -q swapfile; then
        swapon /swapfile
        log "Swap activated"
    else
        log "Swap already active"
    fi
    free -h | tee -a "$LOG_FILE"
fi

# Install system dependencies
log "Installing system dependencies..."
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
    chromium \
    unclutter \
    xdotool \
    x11-xserver-utils \
    cron \
    || warn "Some packages may already be installed"

# Install UV (Python package manager) as calvin user
log "Installing UV..."
if ! sudo -u calvin bash -c 'command -v uv &> /dev/null'; then
    sudo -u calvin bash << 'UV_INSTALL_EOF'
        curl -LsSf https://astral.sh/uv/install.sh | sh
        echo 'export PATH="$HOME/.local/bin:$HOME/.cargo/bin:$PATH"' >> ~/.bashrc
        echo 'export PATH="$HOME/.local/bin:$HOME/.cargo/bin:$PATH"' >> ~/.profile
UV_INSTALL_EOF
fi

# Install Node.js 20+
log "Installing Node.js..."
if ! command -v node &> /dev/null || [ "$(node --version | cut -d'v' -f2 | cut -d'.' -f1)" -lt 20 ]; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt-get install -y -qq nodejs
fi

# Clone or update Calvin repository
log "Setting up Calvin application..."
if [ ! -d "$CALVIN_DIR" ]; then
    log "Cloning Calvin repository..."
    sudo -u calvin git clone "$GIT_REPO" "$CALVIN_DIR"
    cd "$CALVIN_DIR"
    sudo -u calvin git checkout "$GIT_BRANCH"
else
    log "Calvin directory exists. Updating..."
    cd "$CALVIN_DIR"
    sudo -u calvin git fetch origin
    sudo -u calvin git reset --hard "origin/$GIT_BRANCH"
fi

# Install backend dependencies (with dev dependencies for hot reload)
log "Installing backend dependencies (production + linux + dev)..."
cd "$CALVIN_DIR/backend"
chown -R calvin:calvin "$CALVIN_DIR"

# Use pip for development (more stable on Pi 3B+, UV can segfault)
log "Using pip for backend installation (more stable on Pi 3B+)"
sudo -u calvin bash << 'BACKEND_INSTALL_EOF'
    cd /home/calvin/calvin/backend
    python3 -m venv .venv
    source .venv/bin/activate
    pip install --upgrade pip
    # Install all dependencies including dev (for hot reload)
    pip install .[linux,dev]
BACKEND_INSTALL_EOF

# Install frontend dependencies (all dependencies for dev server)
log "Installing frontend dependencies..."
cd "$CALVIN_DIR/frontend"
chown -R calvin:calvin "$CALVIN_DIR/frontend"
# Remove dist directory if it exists and has wrong permissions
if [ -d "$CALVIN_DIR/frontend/dist" ]; then
    rm -rf "$CALVIN_DIR/frontend/dist"
fi
# Clean and reinstall dependencies to ensure all transitive dependencies are installed
log "Cleaning and installing frontend dependencies..."
sudo -u calvin bash -c "cd '$CALVIN_DIR/frontend' && rm -rf node_modules package-lock.json && npm install" || {
    log "npm install failed. Retrying..."
    sudo -u calvin bash -c "cd '$CALVIN_DIR/frontend' && npm cache clean --force && npm install"
}
# Verify axios is installed - if not, install it explicitly
if [ ! -d "$CALVIN_DIR/frontend/node_modules/axios" ]; then
    warn "axios not found in node_modules after npm install. Installing explicitly..."
    sudo -u calvin bash -c "cd '$CALVIN_DIR/frontend' && npm install axios" || {
        log "Failed to install axios. Retrying with cache clean..."
        sudo -u calvin bash -c "cd '$CALVIN_DIR/frontend' && npm cache clean --force && npm install axios"
    }
fi
# Verify axios is now installed
if [ ! -d "$CALVIN_DIR/frontend/node_modules/axios" ]; then
    error "axios still not found after explicit install. Check package.json and node_modules."
fi
log "Verified axios is installed"

# Create data directories
log "Creating data directories..."
mkdir -p "$CALVIN_DIR/backend/data/db"
mkdir -p "$CALVIN_DIR/backend/data/images"
mkdir -p "$CALVIN_DIR/backend/data/cache/images"
mkdir -p "$CALVIN_DIR/backend/logs"
chown -R calvin:calvin "$CALVIN_DIR/backend/data"
chown -R calvin:calvin "$CALVIN_DIR/backend/logs"
chmod -R 755 "$CALVIN_DIR/backend/data"
chmod -R 755 "$CALVIN_DIR/backend/logs"
# Verify directories exist
if [ ! -d "$CALVIN_DIR/backend/data/db" ]; then
    error "Failed to create data directories!"
fi

# Install update script
log "Installing update script..."
cp "$CALVIN_DIR/scripts/update-calvin.sh" /usr/local/bin/update-calvin.sh
chmod +x /usr/local/bin/update-calvin.sh
chown calvin:calvin /usr/local/bin/update-calvin.sh

# Install reboot script if it exists
if [ -f "$CALVIN_DIR/scripts/reboot-calvin.sh" ]; then
    log "Installing reboot script..."
    cp "$CALVIN_DIR/scripts/reboot-calvin.sh" /usr/local/bin/reboot-calvin.sh
    chmod +x /usr/local/bin/reboot-calvin.sh
    chown calvin:calvin /usr/local/bin/reboot-calvin.sh
    echo "calvin ALL=(ALL) NOPASSWD: /usr/local/bin/reboot-calvin.sh" > /etc/sudoers.d/calvin-reboot
    chmod 0440 /etc/sudoers.d/calvin-reboot
fi

# Configure polkit for reboot
log "Configuring polkit for reboot..."
mkdir -p /etc/polkit-1/rules.d
cat > /etc/polkit-1/rules.d/50-calvin-reboot.rules << 'POLKIT_EOF'
polkit.addRule(function(action, subject) {
    if (action.id == "org.freedesktop.login1.reboot" ||
        action.id == "org.freedesktop.login1.reboot-multiple-sessions" ||
        action.id == "org.freedesktop.login1.power-off" ||
        action.id == "org.freedesktop.login1.power-off-multiple-sessions") {
        if (subject.user == "calvin") {
            return polkit.Result.YES;
        }
    }
});
POLKIT_EOF
chmod 644 /etc/polkit-1/rules.d/50-calvin-reboot.rules

# Configure update script environment
cat > /etc/default/calvin-update << EOF
GIT_REPO=$GIT_REPO
GIT_BRANCH=$GIT_BRANCH
REPO_DIR=$CALVIN_DIR
EOF

# Create .dev marker file for dev mode
log "Creating .dev marker file for hot reload..."
touch "$CALVIN_DIR/backend/.dev"
chown calvin:calvin "$CALVIN_DIR/backend/.dev"

# Install systemd services (dev mode - with hot reload)
log "Installing systemd services (development mode)..."
cp "$CALVIN_DIR/rpi-image/systemd/calvin-backend.service" /etc/systemd/system/

# Create dev-specific frontend service that runs dev server
cat > /etc/systemd/system/calvin-frontend-dev.service << 'EOF'
[Unit]
Description=Calvin Dashboard Frontend (Development - Hot Reload)
After=network.target calvin-backend.service
Requires=calvin-backend.service

[Service]
Type=simple
User=calvin
WorkingDirectory=/home/calvin/calvin/frontend
Environment="PATH=/usr/local/bin:/usr/bin:/bin:/home/calvin/.local/bin"
Environment="NODE_ENV=development"
ExecStart=/usr/bin/npm run dev
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload

# Disable and stop X service if it exists (it causes boot loops)
if systemctl list-unit-files | grep -q calvin-x.service; then
    systemctl stop calvin-x.service 2>/dev/null || true
    systemctl disable calvin-x.service 2>/dev/null || true
    log "Disabled problematic calvin-x.service"
fi

# Enable services
systemctl enable calvin-backend.service
systemctl enable calvin-frontend-dev.service

# Start services
log "Starting services..."
systemctl start calvin-backend.service
# Frontend dev server will start automatically after backend is ready

# Configure display
log "Configuring display..."
cat > /home/calvin/.xprofile << 'XPROFILE_EOF'
#!/bin/bash
xset s off
xset -dpms
xset s noblank

# Start frontend dev service when X is ready
sleep 2
if ! systemctl is-active --quiet calvin-frontend-dev.service; then
    systemctl start calvin-frontend-dev.service 2>/dev/null || true
fi
XPROFILE_EOF
chmod +x /home/calvin/.xprofile
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

# Configure autostart (dev mode - connect to dev server on port 5173)
mkdir -p /home/calvin/.config/openbox
cat > /home/calvin/.config/openbox/autostart << 'EOF'
#!/bin/bash
# Wait for backend to be ready
while ! curl -s http://localhost:8000/api/health > /dev/null; do
    sleep 1
done

# Wait for frontend dev server to be ready
while ! curl -s http://localhost:5173 > /dev/null; do
    sleep 1
done

# Start Chromium in kiosk mode (connect to dev server)
chromium \
    --kiosk \
    --noerrdialogs \
    --disable-infobars \
    --autoplay-policy=no-user-gesture-required \
    --disable-features=TranslateUI \
    --disable-ipc-flooding-protection \
    http://localhost:5173 &

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

log "Calvin development setup complete!"
log "Repository: $GIT_REPO"
log "Branch: $GIT_BRANCH (saved to /etc/default/calvin-update)"
log "Backend runs with hot reload (uvicorn --reload)"
log "Frontend runs with hot reload (vite dev server on port 5173)"
log "To update: git pull in $CALVIN_DIR (services will auto-reload)"
log "Updates from GitHub will use branch: $GIT_BRANCH"
log "IMPORTANT: Reboot to start X and the dashboard: sudo reboot"
log "After reboot, X will start automatically on tty1, and the dashboard will appear."

