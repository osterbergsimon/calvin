---
name: Bug Report
about: Something in Calvin is broken or behaves differently than documented
title: '[BUG] '
labels: bug
assignees: ''
---

<!--
Security problem? Stop and report it privately instead:
https://github.com/osterbergsimon/calvin/security/advisories/new
-->

## Summary

A clear, one-or-two-sentence description of what is broken.

## Steps to reproduce

1. Go to '...'
2. Click on '...'
3. Scroll down to '...'
4. See error

## Expected behaviour

What you expected to happen.

## Actual behaviour

What actually happened. Include the exact error message or status code if there
is one.

## Deployment

<!-- Tick the topology you run. See docs/setup/DEPLOYMENT_TOPOLOGIES.md -->

- [ ] **All-in-one Pi** — backend, frontend, and kiosk browser on one Pi
- [ ] **Remote backend + kiosk Pi** — server elsewhere, Pi runs the kiosk only
- [ ] **Unraid / home-server Docker** — backend in a container, Pis as kiosks
- [ ] **Native development checkout** (`make dev` or `uv`/`npm` locally)
- [ ] Other (describe below)

**Calvin version or image tag** (e.g. `stable-2026-04-26-5a53c4a`, `nightly-…`,
`:latest`, or `git rev-parse HEAD`):

**How Calvin was installed** (setup script, Docker Compose, Unraid template,
manual):

## Hardware

**Server host** — Raspberry Pi model / other:

- [ ] Pi 3B+ · [ ] Pi 4 · [ ] Pi 5 · [ ] CM4 · [ ] Other SBC / PC · [ ] Not a Pi
- RAM:
- Storage (SD card model / SSD / HDD):

**Kiosk display** (if the bug is on a kiosk):

- Pi model: <!-- Pi 3B+ / Pi 4 / Pi 5 / CM4 / other -->
- Raspberry Pi OS version and codename (`cat /etc/os-release`):
- Display connection (HDMI / DSI / other) and resolution:
- Browser/session type: <!-- Chromium kiosk via calvin-kiosk / cog/Wayland / desktop browser -->

**Client browser** (if the bug is in the web UI): <!-- e.g. Chrome 131, Safari 18, Firefox 133, and phone/desktop -->

## Logs

Please paste the relevant lines — logs are usually what makes a bug fixable.
Redact secrets (passwords, tokens, API keys, calendar URLs, hostnames, IPs).

**Backend:**

```bash
# Docker install
docker compose -f docker/docker-compose.yml logs --tail=200 backend
# systemd install (setup.sh)
sudo journalctl -u calvin-app -n 200 --no-pager
```

```
<paste backend logs here>
```

**Kiosk / display agent** (on the Pi, over SSH):

```bash
journalctl -u calvin-display-agent -n 200 --no-pager
journalctl -u calvin-kiosk -n 200 --no-pager
```

```
<paste kiosk logs here>
```

**Browser console** (web UI bugs): open DevTools → Console and Network, reload,
and paste any errors or failed requests:

```
<paste console output here>
```

**Plugin** (if a plugin is involved): name and version from `plugin.json`, plus
any lines it logged:

```
<paste plugin logs here>
```

## Screenshots or recording

If applicable, add screenshots — for a layout bug, light and dark theme both
help.

## Additional context

Anything else that narrows it down: did it work before? After which change or
update? Does it happen for one kiosk or all of them? Does a restart help?
