# Raspberry Pi Image Configuration Review

## Issues Found and Fixes Needed

### 1. Build Scripts - Windows Compatibility
**Issue**: Build scripts use bash-specific features (`read -p`, `sed -i.bak`) that won't work on Windows PowerShell.

**Fix**: Create PowerShell versions or document that these scripts need to run on Linux/WSL.

### 2. Cloud-init Password Hash
**Issue**: `user-data.yml` has placeholder password hash that won't work.

**Fix**: Need to generate proper password hash or document how to set it.

### 3. Python Version Detection
**Issue**: Setup scripts check for Python 3.11 specifically, but Raspberry Pi OS might have different version.

**Fix**: Make version check more flexible or use `python3` instead.

### 4. UV Installation Path
**Issue**: UV installs to `~/.local/bin` but might need to be in PATH for systemd.

**Fix**: Ensure PATH is set correctly in systemd service.

### 5. Systemd Timer Configuration
**Issue**: Timer uses `OnCalendar=*:0/5` which might not work correctly for arbitrary intervals.

**Fix**: Use proper systemd timer syntax or use `OnUnitActiveSec`.

### 6. Production Setup - Missing Directory
**Issue**: Production setup expects `/home/calvin/calvin` to exist but doesn't create it.

**Fix**: Need to either create it or document that it must be pre-populated in image.

### 7. Update Script Environment
**Issue**: Update script doesn't source `/etc/default/calvin-update` environment file.

**Fix**: Add `source /etc/default/calvin-update` or use `EnvironmentFile` in systemd.

### 8. Frontend Service Dependencies
**Issue**: Frontend service depends on graphical.target but might start before X is ready.

**Fix**: Add proper dependencies or wait for X server.

### 9. Error Handling
**Issue**: Some scripts don't handle errors gracefully.

**Fix**: Add better error handling and logging.

### 10. Raspberry Pi OS Lite vs Desktop
**Issue**: Scripts assume desktop environment (openbox, X) but we're using Lite.

**Fix**: Need to install X server and window manager, or use different approach.

