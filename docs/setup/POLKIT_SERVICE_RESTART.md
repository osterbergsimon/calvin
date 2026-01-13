# Polkit Rules for Service Restart

## Overview

Polkit (PolicyKit) rules have been added to the installation scripts to allow the `calvin` user to restart the `calvin-backend` and `calvin-frontend` services without requiring sudo or password authentication.

## What Was Added

### Polkit Rule File: `50-calvin-restart.rules`

This rule file is automatically created during installation in `/etc/polkit-1/rules.d/50-calvin-restart.rules` and grants the `calvin` user permission to manage (start, stop, restart) the Calvin services.

**Rule Content:**
```javascript
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
```

## Installation

The polkit rules are automatically configured during first-boot setup in both:
- `rpi-image/first-boot/setup.sh` (production setup)
- `rpi-image/first-boot/setup-dev.sh` (development setup)

## Manual Setup (For Existing Installations)

If you have an existing installation that doesn't have these rules, you can add them manually:

```bash
sudo mkdir -p /etc/polkit-1/rules.d
sudo tee /etc/polkit-1/rules.d/50-calvin-restart.rules > /dev/null << 'EOF'
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
EOF
sudo chmod 644 /etc/polkit-1/rules.d/50-calvin-restart.rules
```

After creating the file, the polkit daemon should automatically pick up the new rules. If needed, you can restart polkit:

```bash
sudo systemctl restart polkit
```

## Verification

To verify the rules are working, try restarting a service as the calvin user:

```bash
su - calvin
systemctl restart calvin-backend
systemctl restart calvin-frontend
```

If the rules are working correctly, these commands should succeed without prompting for a password.

## Security Considerations

- The rules are **scoped** to only allow management of `calvin-backend.service` and `calvin-frontend.service`
- Only the `calvin` user is granted these permissions
- The rules do not grant permission to manage other systemd units or perform other privileged operations

## Related Files

- `/etc/polkit-1/rules.d/50-calvin-reboot.rules` - Allows calvin user to reboot the system
- `/etc/polkit-1/rules.d/50-calvin-restart.rules` - Allows calvin user to restart services

## Troubleshooting

If service restarts still fail:

1. **Check if the rule file exists:**
   ```bash
   ls -l /etc/polkit-1/rules.d/50-calvin-restart.rules
   ```

2. **Check polkit logs:**
   ```bash
   journalctl -u polkit -n 50
   ```

3. **Verify the rule syntax:**
   ```bash
   pkaction --version  # Should be 0.106+ for JavaScript rules
   ```

4. **Test with pkcheck:**
   ```bash
   pkcheck --action-id org.freedesktop.systemd1.manage-units --allow-user-interaction
   ```

5. **Restart polkit:**
   ```bash
   sudo systemctl restart polkit
   ```

