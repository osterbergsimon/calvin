# Security policy

Calvin is a self-hosted dashboard: a FastAPI backend, a Vue frontend, a plugin
system, and a kiosk agent that runs as root on Raspberry Pi displays. It is
built for a home network you control, and it assumes that network — and the
plugin sources you install — are trusted. Bugs that break that assumption are
security issues, and we want to hear about them privately.

## Supported versions

| Version | Supported |
| --- | --- |
| `develop` branch (integration branch, fixes land here first) | ✅ |
| Latest stable release (newest non-prerelease tag in [Releases](https://github.com/osterbergsimon/calvin/releases)) | ✅ |
| Nightly / pre-release builds | ❌ |
| Any release older than the latest stable one | ❌ — upgrade first |

If a report only reproduces on an older release, check the latest stable
release or `develop` before sending it. If it still reproduces there, it is in
scope.

## Report a vulnerability privately

**Do not open a public issue, discussion, or pull request for a security
problem.**

Use GitHub's private vulnerability reporting:

1. Open <https://github.com/osterbergsimon/calvin/security/advisories/new>
   (or **Security → Advisories → Report a vulnerability** on the repository).
2. Describe the problem in the advisory form. Only you and the maintainers can
   see it.

Please include, as far as you can:

- **What** the issue is and **why** it matters (impact, who is exposed).
- **Reproduction** — exact requests, URLs, plugin package, or kiosk commands.
- **Version** — the release tag, image tag, or `git rev-parse HEAD`.
- **Deployment topology** — all-in-one Pi, remote backend + kiosk Pi, Unraid,
  or a native dev checkout.
- Any proof-of-concept output, logs, or screenshots (redact secrets and
  personal data).

If you cannot use GitHub advisories, reply on any existing maintainer contact
and ask for a private channel rather than posting details publicly.

## What happens next

- We aim to acknowledge a report within **3 business days**.
- We confirm (or reject) the issue, agree an impact and a fix, and keep you
  updated until a release containing the fix ships.
- Fixes go to `develop` and are released from the stable release line.
- We publish a GitHub security advisory once a fix is available and will credit
  you unless you ask us not to.
- Please give us **90 days** from the fix release before public disclosure, or
  less if we agree on a date together.

## Scope

### In scope

- **Backend API** (`backend/app/`) — anything reachable over HTTP at `/api/*`:
  authentication and session handling (`routes/auth.py`, admin auth, lockout),
  authorization gaps on admin-only actions, injection (SQL, command, path
  traversal), SSRF through calendars/images/web services, host and `Origin`
  validation, secret or credential disclosure through API responses or logs.
- **Kiosk agent and installer** (`deploy/kiosk-agent/`, `deploy/systemd/`,
  `scripts/setup-kiosk.sh`, `scripts/bake-kiosk-firstrun.sh`) — privilege
  escalation from the unprivileged `calvin` kiosk user, command injection via
  server-supplied data, install/update signature verification bypass, writing
  outside the pinned bundle paths, or a kiosk being made to execute arbitrary
  code by a compromised backend. (Manifest signing is the control that is meant
  to stop that last one; bypassing it is in scope.)
- **Plugin loader and plugin install path** (`backend/app/plugins/`,
  `backend/app/services/plugin_installer.py`) — installing a package that
  escapes its plugin directory, manifest validation gaps that break isolation,
  path traversal in `/api/plugins/{id}/static/*`, dependency install outside
  the plugin's own environment.
- **Frontend** — XSS or CSP bypass in first-party code, leaking admin secrets
  to the browser, authentication bypass in the UI that maps to a backend
  authorization bug.

### Out of scope

- Anything that needs physical access to the device, or a shell as `root` /
  `calvin-admin` on the kiosk (that user has passwordless sudo by design).
- Misconfiguration we document as unsafe: exposing the backend directly to the
  internet without a TLS reverse proxy, `CORS_ALLOW_ALL`, `CALVIN_ALLOWED_HOSTS=*`,
  running with an empty or shared admin password, or installing plugins from
  untrusted sources.
- Vulnerabilities in **third-party plugins** — report those to that plugin's
  own repository. (A plugin loader flaw that lets any plugin break out of its
  sandbox *is* in scope here.)
- Dependency vulnerabilities with no exploitable path in Calvin (a CVE in a
  library whose vulnerable code path Calvin never reaches).
- Denial of service by flooding your own LAN, self-XSS, or clickjacking on a
  page you would have to frame yourself.
- Issues that only reproduce on an unsupported version.
- Kiosk screen/browser escape that requires the kiosk's own keyboard and an
  unlocked admin session.

## Testing rules

Please test only on **your own** Calvin instance:

- Do not access, modify, or exfiltrate another person's data or device.
- Do not run destructive or host-changing actions on someone else's instance —
  in particular `POST /api/system/reboot`, `/restart-backend`,
  `/restart-frontend`, `/update`, `/reload-ui` and `/api/system/display/*`
  restart or power off the machine Calvin runs on. On your own test box, mock
  them instead of firing them.
- No social engineering, no physical intrusion, no spam or resource-exhaustion
  testing against shared infrastructure.

Good-faith research that follows these rules is authorised, and we will not
pursue legal action for it.

## Related

- Admin authentication and lockout: [docs/configuration/ADMIN_AUTH.md](docs/configuration/ADMIN_AUTH.md)
- Host control and its deliberate risks: [docs/configuration/HOST_CONTROL.md](docs/configuration/HOST_CONTROL.md)
- Kiosk install and signed manifests: [docs/setup/KIOSK_INSTALL.md](docs/setup/KIOSK_INSTALL.md), [docs/setup/KIOSK_PROVISIONING.md](docs/setup/KIOSK_PROVISIONING.md)
