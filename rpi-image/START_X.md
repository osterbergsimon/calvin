# Starting X Server on Raspberry Pi

The X server can only be started from a console session (not SSH). Here are the options:

## Option 1: Reboot (Recommended)

The easiest way is to reboot the Pi. X will start automatically via the `.bash_profile` configuration:

```bash
sudo reboot
```

After reboot, X will start automatically on tty1, and the dashboard will appear.

## Option 2: Start X from Physical Console

If you have physical access to the Pi (keyboard and monitor connected):

1. Press `Ctrl+Alt+F1` to switch to tty1 (if you're on a different TTY)
2. Log in as `calvin` user
3. Run:
   ```bash
   startx
   ```

## Option 3: Use systemd Service (After Setup)

If the `calvin-x.service` is installed and enabled:

```bash
# Check if X service is running
systemctl status calvin-x

# If not running, start it
sudo systemctl start calvin-x

# Enable it to start on boot
sudo systemctl enable calvin-x
```

Note: The X service may not work perfectly via systemd due to TTY restrictions. Option 1 (reboot) is the most reliable.

## Troubleshooting

### Check if X is running:
```bash
ps aux | grep Xorg
```

### Check if DISPLAY is set:
```bash
echo $DISPLAY
# Should output: :0
```

### Check X server logs:
```bash
cat ~/.xsession-errors
```

### Manually start X (from console only):
```bash
# Switch to tty1 (physical console)
sudo chvt 1
# Then log in and run:
startx
```

