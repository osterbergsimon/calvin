# Manual Setup (If Cloud-init Didn't Run)

If cloud-init didn't run or failed, you can manually set up Calvin.

## Step 1: Check Cloud-init Status

```bash
# Check if cloud-init ran
sudo cloud-init status

# Check cloud-init logs
sudo cat /var/log/cloud-init.log
sudo cat /var/log/cloud-init-output.log

# Check if setup script ran
sudo cat /var/log/calvin-setup.log
```

## Step 2: Check if Repository Was Cloned

```bash
# Check if Calvin directory exists
ls -la /home/calvin/calvin

# If it exists, check what's there
cd /home/calvin/calvin && ls -la
```

## Step 3: Manual Setup

If cloud-init didn't run, manually set up Calvin:

```bash
# Clone Calvin repository
cd /home/calvin
git clone https://github.com/osterbergsimon/calvin.git
cd calvin

# Run setup script
sudo bash rpi-image/first-boot/setup-dev.sh
```

## Step 4: Verify Services

```bash
# Check services are installed
systemctl status calvin-backend
systemctl status calvin-frontend
systemctl status calvin-update.timer

# If services don't exist, check if setup script completed
sudo cat /var/log/calvin-setup.log
```

## Step 5: If Setup Script Fails

If the setup script fails, you can run it step by step:

```bash
cd /home/calvin/calvin

# Install system dependencies
sudo apt-get update
sudo apt-get install -y python3 python3-pip python3-venv curl git build-essential xserver-xorg

# Install UV
curl -LsSf https://astral.sh/uv/install.sh | sh
export PATH="$HOME/.cargo/bin:$PATH"

# Install backend dependencies
cd backend
uv sync --extra linux

# Install frontend dependencies
cd ../frontend
npm install

# Build frontend
npm run build

# Install systemd services
sudo cp rpi-image/systemd/*.service /etc/systemd/system/
sudo cp rpi-image/systemd/*.timer /etc/systemd/system/
sudo systemctl daemon-reload

# Enable and start services
sudo systemctl enable calvin-backend
sudo systemctl enable calvin-frontend
sudo systemctl enable calvin-update.timer
sudo systemctl start calvin-backend
sudo systemctl start calvin-frontend
sudo systemctl start calvin-update.timer
```

## Troubleshooting

### Cloud-init Didn't Run

**Possible causes:**
- `user-data` file not found on boot partition
- Cloud-init not enabled on this OS image
- File format issues

**Solution:**
- Manually run setup (see Step 3 above)

### Setup Script Fails

**Check logs:**
```bash
sudo cat /var/log/calvin-setup.log
journalctl -xe
```

**Common issues:**
- Network not connected (can't clone from GitHub)
- Insufficient disk space
- Missing system dependencies

**Fix:**
- Check network: `ping github.com`
- Check disk space: `df -h`
- Install missing dependencies manually

