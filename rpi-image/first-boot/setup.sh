#!/bin/bash
# Calvin Dashboard - Production Image First-Boot Setup Script
# This script runs once on first boot to set up the Calvin application

set -e

LOG_FILE="/var/log/calvin-setup.log"
CALVIN_DIR="/home/calvin/calvin"

echo "[$(date)] Starting Calvin production setup..." | tee -a "$LOG_FILE"

# Update system
echo "[$(date)] Updating system packages..." | tee -a "$LOG_FILE"
apt-get update -qq
apt-get upgrade -y -qq

# Install system dependencies
echo "[$(date)] Installing system dependencies..." | tee -a "$LOG_FILE"
apt-get install -y -qq \
    python3 \
    python3-venv \
    python3-pip \
    curl \
    git \
    xserver-xorg \
    xinit \
    openbox \
    chromium-browser \
    unclutter \
    xdotool \
    x11-xserver-utils \
    || echo "Some packages may already be installed" | tee -a "$LOG_FILE"

# Install UV (Python package manager)
echo "[$(date)] Installing UV..." | tee -a "$LOG_FILE"
if ! command -v uv &> /dev/null; then
    curl -LsSf https://astral.sh/uv/install.sh | sh
    export PATH="/home/calvin/.local/bin:$PATH"
    # Add to PATH permanently
    echo 'export PATH="$HOME/.local/bin:$PATH"' >> /home/calvin/.bashrc
    echo 'export PATH="$HOME/.local/bin:$PATH"' >> /home/calvin/.profile
fi

# Install Node.js 20+
echo "[$(date)] Installing Node.js..." | tee -a "$LOG_FILE"
if ! command -v node &> /dev/null || [ "$(node --version | cut -d'v' -f2 | cut -d'.' -f1)" -lt 20 ]; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt-get install -y -qq nodejs
fi

# Clone or update Calvin repository
echo "[$(date)] Setting up Calvin application..." | tee -a "$LOG_FILE"
if [ ! -d "$CALVIN_DIR" ]; then
    echo "Calvin directory not found. Creating directory structure..." | tee -a "$LOG_FILE"
    mkdir -p "$CALVIN_DIR"
    chown -R calvin:calvin "$CALVIN_DIR"
    echo "WARNING: Calvin application code must be copied to $CALVIN_DIR before first boot" | tee -a "$LOG_FILE"
    echo "This should be done during image creation." | tee -a "$LOG_FILE"
    exit 1
fi

cd "$CALVIN_DIR"

# Install backend dependencies
echo "[$(date)] Installing backend dependencies..." | tee -a "$LOG_FILE"
cd "$CALVIN_DIR/backend"
export PATH="/home/calvin/.local/bin:$PATH"
uv sync --frozen --extra linux

# Install frontend dependencies
echo "[$(date)] Installing frontend dependencies..." | tee -a "$LOG_FILE"
cd "$CALVIN_DIR/frontend"
npm ci --production

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

# Install systemd services
echo "[$(date)] Installing systemd services..." | tee -a "$LOG_FILE"
cp "$CALVIN_DIR/rpi-image/systemd/calvin-backend.service" /etc/systemd/system/
cp "$CALVIN_DIR/rpi-image/systemd/calvin-frontend.service" /etc/systemd/system/
systemctl daemon-reload
systemctl enable calvin-backend.service
systemctl enable calvin-frontend.service

# Start services
echo "[$(date)] Starting services..." | tee -a "$LOG_FILE"
systemctl start calvin-backend.service
sleep 5  # Wait for backend to start
systemctl start calvin-frontend.service

# Configure display
echo "[$(date)] Configuring display..." | tee -a "$LOG_FILE"
# Disable screen blanking
echo "xset s off" >> /home/calvin/.xprofile
echo "xset -dpms" >> /home/calvin/.xprofile
echo "xset s noblank" >> /home/calvin/.xprofile
chown calvin:calvin /home/calvin/.xprofile

# Configure auto-login (for kiosk mode)
mkdir -p /etc/systemd/system/getty@tty1.service.d
cat > /etc/systemd/system/getty@tty1.service.d/autologin.conf << EOF
[Service]
ExecStart=
ExecStart=-/sbin/agetty --autologin calvin --noclear %I \$TERM
EOF

# Configure X to start automatically
cat > /home/calvin/.xinitrc << 'EOF'
#!/bin/sh
# Start Openbox window manager
exec openbox-session
EOF
chmod +x /home/calvin/.xinitrc
chown calvin:calvin /home/calvin/.xinitrc

# Configure autostart
# Note: Chromium is managed by systemd service (calvin-frontend.service)
# so we don't start it here to avoid conflicts
mkdir -p /home/calvin/.config/openbox
cat > /home/calvin/.config/openbox/autostart << 'EOF'
#!/bin/bash
# Chromium is managed by systemd service (calvin-frontend.service)
# No need to start it here

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

# Install restart services script
echo "[$(date)] Installing restart services script..." | tee -a "$LOG_FILE"
if [ -f "$CALVIN_DIR/scripts/restart-calvin-services.sh" ]; then
    cp "$CALVIN_DIR/scripts/restart-calvin-services.sh" /usr/local/bin/restart-calvin-services.sh
    chown root:root /usr/local/bin/restart-calvin-services.sh
    chmod 0755 /usr/local/bin/restart-calvin-services.sh
    # Allow calvin user to run restart script with sudo without password (script not writable by calvin)
    echo "calvin ALL=(root) NOPASSWD: /usr/local/bin/restart-calvin-services.sh" > /etc/sudoers.d/calvin-restart
    chmod 0440 /etc/sudoers.d/calvin-restart
    echo "[$(date)] Restart services script installed with sudo permissions" | tee -a "$LOG_FILE"
else
    echo "[$(date)] WARNING: Restart services script not found at $CALVIN_DIR/scripts/restart-calvin-services.sh" | tee -a "$LOG_FILE"
fi

# Configure polkit to allow calvin user to reboot without password
echo "[$(date)] Configuring polkit for reboot..." | tee -a "$LOG_FILE"
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
echo "[$(date)] Polkit configured to allow calvin user to reboot" | tee -a "$LOG_FILE"

# Configure polkit to allow calvin user to restart services
echo "[$(date)] Configuring polkit for service restarts..." | tee -a "$LOG_FILE"
cat > /etc/polkit-1/rules.d/50-calvin-restart.rules << 'POLKIT_EOF'
polkit.addRule(function(action, subject) {
    if (action.id == "org.freedesktop.systemd1.manage-units" &&
        subject.user == "calvin") {
        // Allow managing calvin-backend and calvin-frontend services
        var unit = action.lookup("unit");
        if (unit == "calvin-backend.service" || unit == "calvin-frontend.service") {
            return polkit.Result.YES;
        }
    }
});
POLKIT_EOF
chmod 644 /etc/polkit-1/rules.d/50-calvin-restart.rules
echo "[$(date)] Polkit configured to allow calvin user to restart services" | tee -a "$LOG_FILE"

echo "[$(date)] Calvin production setup complete!" | tee -a "$LOG_FILE"
echo "[$(date)] System will reboot in 30 seconds..." | tee -a "$LOG_FILE"

