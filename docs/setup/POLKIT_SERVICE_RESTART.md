# Privileged Restart Helpers

## Overview

Calvin installs root-owned helper scripts so the `calvin` user can restart the compose runtime or reboot the device without receiving broad sudo access.

## Restart Helper

The backend may run `/usr/local/bin/restart-calvin-services.sh` with `sudo` under a narrow sudoers rule:

```bash
calvin ALL=(root) NOPASSWD: /usr/local/bin/restart-calvin-services.sh
```

The helper restarts the compose app, X, and kiosk units:

```bash
sudo /usr/local/bin/restart-calvin-services.sh
sudo /usr/local/bin/restart-calvin-services.sh app
sudo /usr/local/bin/restart-calvin-services.sh kiosk
sudo /usr/local/bin/restart-calvin-services.sh x
```

## Service Units

The current Raspberry Pi runtime units are:

- `calvin-app.service` - runs `docker compose -f /etc/calvin/docker-compose.yml up -d`
- `calvin-x.service` - starts the X session
- `calvin-kiosk.service` - starts Chromium at `http://localhost:8000`

Legacy native units such as `calvin-backend.service`, `calvin-frontend.service`, and `calvin-frontend-dev.service` are removed by setup.

## Security

Helpers listed in sudoers must be immutable from the app's perspective:

- Owner/group: `root:root`
- Mode: `0755` or stricter
- `/usr/local/bin` should remain root-owned and not writable by `calvin`

If a helper were owned by `calvin`, code running as `calvin` could replace it and gain root the next time sudo executed that path.

Fix existing installs once:

```bash
sudo chown root:root /usr/local/bin/restart-calvin-services.sh /usr/local/bin/reboot-calvin.sh
sudo chmod 0755 /usr/local/bin/restart-calvin-services.sh /usr/local/bin/reboot-calvin.sh
```

## Reboot

Reboot permission still uses the existing polkit rule:

- `/etc/polkit-1/rules.d/50-calvin-reboot.rules`

Setup also installs `/usr/local/bin/reboot-calvin.sh` with a narrow sudoers rule.
