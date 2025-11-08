# Testing Raspberry Pi Image Configuration

## Quick Test

Run the comprehensive test suite:

```powershell
.\rpi-image\test-all.ps1
```

This will:
1. Validate file structure and basic syntax
2. Test bash script syntax using Git Bash
3. Check YAML and systemd service files

## Individual Tests

### 1. Validation Tests
Basic validation of file structure and syntax:

```powershell
.\rpi-image\validate.ps1
```

**What it checks:**
- All required files exist
- Bash scripts have proper shebang and `set -e`
- YAML files have required fields
- Systemd service files have required sections

### 2. Bash Syntax Tests
Thorough bash syntax checking using Git Bash:

```powershell
.\rpi-image\test-bash-syntax.ps1
```

**What it checks:**
- Valid bash syntax (using `bash -n`)
- No syntax errors
- Proper script structure

**Requirements:**
- Git for Windows (includes Git Bash)
- Or WSL (Windows Subsystem for Linux)

## Test Results

If all tests pass, you should see:
```
✓ All tests passed!
```

## Manual Testing

### On Windows (Development)

1. **Validate Configuration:**
   ```powershell
   .\rpi-image\test-all.ps1
   ```

2. **Review Configuration Files:**
   - Edit `rpi-image/cloud-init/user-data.yml` (WiFi, SSH keys)
   - Edit `rpi-image/cloud-init/user-data-dev.yml` (WiFi, SSH keys)
   - Check paths in systemd service files

3. **Test Bash Scripts (if Git Bash available):**
   ```bash
   # In Git Bash
   bash -n rpi-image/first-boot/setup.sh
   bash -n rpi-image/first-boot/setup-dev.sh
   bash -n scripts/update-calvin.sh
   ```

### On Raspberry Pi (Full Testing)

1. **Flash Image:**
   - Use Raspberry Pi Imager
   - Configure cloud-init
   - Flash to SD card

2. **First Boot:**
   - Monitor logs: `journalctl -u calvin-backend -f`
   - Check setup: `cat /var/log/calvin-setup.log`
   - Verify services: `systemctl status calvin-backend`

3. **Test Auto-Update (Dev Image):**
   - Push code to GitHub
   - Wait for update interval
   - Check logs: `journalctl -u calvin-update.service -f`
   - Verify update: `cat /var/log/calvin-update.log`

## Troubleshooting

### Git Bash Not Found

If you don't have Git Bash:
- Install Git for Windows (includes Git Bash)
- Or use WSL: `wsl bash -n <script>`
- Or test on actual Raspberry Pi

### WSL Performance Issues

If WSL slows down your machine:
- Use Git Bash instead (lighter weight)
- Or test directly on Raspberry Pi
- Or use Docker for isolated testing

### Test Failures

If tests fail:
1. Check error messages
2. Review the specific file mentioned
3. Fix syntax issues
4. Re-run tests

## Advanced Testing

### Using Shellcheck (Linux/WSL)

For advanced bash linting:

```bash
# Install shellcheck
sudo apt-get install shellcheck

# Test scripts
shellcheck rpi-image/first-boot/setup.sh
shellcheck rpi-image/first-boot/setup-dev.sh
shellcheck scripts/update-calvin.sh
```

### Using Docker (Optional)

Test in a containerized environment:

```bash
# Build test image
docker build -t calvin-test -f Dockerfile.test .

# Run tests
docker run --rm calvin-test
```

## Continuous Integration

These tests can be integrated into CI/CD:

```yaml
# .github/workflows/test-rpi-image.yml
- name: Test RPi Image Configuration
  run: |
    pwsh -File rpi-image/test-all.ps1
```

