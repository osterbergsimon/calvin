# Admin authentication

Calvin asks for one admin password before anything that changes the server or
reveals a secret. Viewing the dashboard, and the touch interactions people use
on a kiosk (next photo, switch screen, calendar view, theme), stay open.

## First run

On a fresh install — or after upgrading from a version without admin auth — open
**Settings**. Calvin shows one card: a **setup code** and an admin password to
choose. The password can be any characters, at least 8. Whoever does this first
claims the install, and is signed in immediately; the browser keeps that session
for up to 400 days.

The setup code is what stops someone else on the network from claiming the
install before you do. Calvin generates an 8-character code (shown as
`XXXX-XXXX`) the first time it starts without an admin password and:

- logs it at startup as `Calvin setup code: XXXX-XXXX`, and
- writes it to `setup-code.txt` (mode `0600`) next to `admin-auth.json` in the
  [data directory](DATA_DIR.md).

Enter that code with the new password. The code is single-use: once a password
exists Calvin deletes the file and the code stops working. A restart keeps the
same code until it is used. A wrong code is rate limited like a wrong password
(5 within 60 seconds → `429`, then a cooldown).

Where to read it:

| How Calvin runs | Read the code |
|---|---|
| Docker / Compose | `docker logs calvin` — look for `Calvin setup code:` |
| Unraid | Docker tab → Calvin → Logs, or `docker logs calvin` |
| Pi all-in-one | `sudo journalctl -u calvin-app -n 100` |
| Native / development | the server's terminal output, or `<data dir>/setup-code.txt` |
| Kiosk on the same server | the kiosk's setup screen shows it when the browser reaches Calvin over loopback (`http://localhost:8000`). Through Docker's port mapping the request no longer looks like loopback, so use `docker logs calvin`. |

Kiosks do not open Settings, so the card appears on the server's own screen or a
phone/laptop. The setup code is never returned to a public request.

If you want no window in which another LAN device could claim the install, set
[`CALVIN_ADMIN_PASSWORD`](#calvin_admin_password) before the first start.

## `CALVIN_ADMIN_PASSWORD`

Set this environment variable (Unraid field, Docker Compose, systemd
`Environment=`, or `.env`) to the password you want. On every start Calvin
compares it with the stored password:

- **different** → it replaces the stored password and signs every other session
  out;
- **same** → nothing changes, so a restart does not log anyone out.

An empty or unset value leaves the stored password alone. The value must be at
least 8 characters.

## `CALVIN_SETUP_CODE`

Set this to pre-seed the [one-time setup code](#first-run) instead of letting
Calvin generate one — useful for headless installs where you would rather hand
the owner a known code. Case does not matter and `-`/spaces are ignored, so
`abcd-efgh` matches `ABCD-EFGH`. It is ignored once an admin password exists.
Leave it unset to use the generated code in the log and
`setup-code.txt`.

## Forgot the password

Either:

- delete `<data dir>/admin-auth.json` (override the path with `ADMIN_AUTH_PATH`)
  and restart, then choose a new password in Settings with the new setup code
  from the log; or
- set `CALVIN_ADMIN_PASSWORD` to a new value and restart.

Deleting the file also discards the session-signing secret, so every old cookie
becomes invalid. The file is never in the database, a backup, or
`GET /api/config`; see [Data directory](DATA_DIR.md).

## Sessions

- Cookie `calvin_admin`: `HttpOnly`, `SameSite=Strict`, `Path=/`,
  `Max-Age=34560000` (400 days, the browser cap).
- Stateless value `issued_at.generation.HMAC`, signed with a server secret kept
  in `admin-auth.json` (mode `0600`, next to the kiosk signing key).
- Changing the password bumps the generation, so every other browser is signed
  out. Sign out just clears the cookie.
- Login failures are limited per peer IP: 5 within 60 seconds → `429`, then a
  60-second cooldown that doubles on each further lockout, capped at 15 minutes.
  The counter is in memory and resets on restart. `X-Forwarded-*` is not trusted;
  behind a proxy everyone shares one bucket.

## Host and Origin checks

**Host (DNS rebinding).** Calvin accepts the normal LAN ways of reaching it:

- IP literals (IPv4 and IPv6), `localhost`, `*.localhost`
- single-label names such as `calvin` or `raspberrypi`
- `.local`, `.lan`, `.home`, `.home.arpa`, `.internal`, `.localdomain`
- the host in `PUBLIC_URL`
- anything listed in `CALVIN_ALLOWED_HOSTS` (comma-separated, case-insensitive;
  `*` turns the check off)

Anything else — `evil.example`, or a name that merely ends in an allowed suffix
like `calvin.local.evil.example` — gets `400` with a plain-text message naming
`CALVIN_ALLOWED_HOSTS` and `PUBLIC_URL`. Set `PUBLIC_URL` when you reach Calvin
through a real domain, or list the name in `CALVIN_ALLOWED_HOSTS`.

**Origin (cross-site writes).** Every unsafe request (`POST`/`PUT`/`PATCH`/
`DELETE`) under `/api` must come from the same host and port as the request's
`Host` header, or from an origin listed in `CORS_ORIGINS`. The scheme is
ignored, so a TLS proxy in front still matches. Requests with no `Origin` (curl,
the kiosk agent) pass; `Sec-Fetch-Site: cross-site` without an `Origin` is
rejected. A refusal is `403 {"detail":{"code":"cross_origin"}}`.
`CORS_ALLOW_ALL` (development only) skips this check.

## What needs the admin password

| Tier | Routes |
|---|---|
| **Public read** | dashboard data and kiosk delivery — `GET /api/config`, `/api/calendar/*`, `/api/images/*`, `/api/plugins*` (except the two admin reads below), `/api/kiosks/*`, `/api/keyboard/*`, `/api/security/*`, `/api/system/*` (except `update/stream`) |
| **Viewer write** (same-origin, no login) | `POST /api/images/next`, `POST /api/images/previous`, `POST /api/calendar/refresh`, `POST /api/plugins/{id}/fetch`, `POST /api/system/display/power/on`, `POST /api/system/display/power/off`, `POST /api/config` (display keys only) |
| **Admin** | every other write, plus `GET /api/backup/*`, `GET /api/config/git/branches`, `GET /api/plugins/{id}/scan`, `GET /api/plugins/local/suggest`, `GET /api/system/update/stream` |

The write policy is default-deny: every `POST`/`PUT`/`PATCH`/`DELETE` needs
admin unless its route is on the short viewer-write list above, so new routes are
protected without anyone remembering to add them. Plugins cannot add routes.

`POST /api/config` accepts these keys without admin, because the dashboard itself
writes them: `dashboardScreens`, `regionsLocked`, `showUI`, `themeMode`,
`selectedTheme`, `darkModeStart`, `darkModeEnd`, `lastSideViewMode`. A request
that mixes one of them with anything else (for example `gitBranch`) is rejected
as a whole.

An unauthenticated admin request answers
`401 {"detail":{"code":"admin_required"}}`. Before a password exists it answers
`401 {"detail":{"code":"setup_required"}}`. Kiosk dashboards should never see
either.

## API keys

Apps and scripts (Home Assistant, a cron job) can use Calvin without the admin
password by sending a key. Create, list and revoke keys in **Settings › Security
› API keys**, or through the API below.

```bash
curl -H "Authorization: Bearer clv_YOUR_KEY_HERE" http://calvin.local:8000/api/backup/files
curl -X POST -H "Authorization: Bearer clv_YOUR_KEY_HERE" \
     -H "Content-Type: application/json" -d '{"showUI": true}' \
     http://calvin.local:8000/api/config
```

Scopes form a ladder, `host` ⊇ `admin` ⊇ `read`:

| Scope | May do |
|---|---|
| `read` | Every public `GET`, but not the admin-only reads (backup export and files, scans, git branches, update stream): those need `admin`. The viewer writes anonymous callers have (next/previous photo, calendar refresh, display power, display settings in `POST /api/config`) work too. Every other unsafe method (`POST`/`PUT`/`PATCH`/`DELETE`) is refused. |
| `admin` | Everything a signed-in admin may do, except the host-acting routes below. |
| `host` | `admin`, plus the host-acting routes that anonymous viewers can't call: `POST /api/system/update`, `/reboot`, `/restart-backend`, `/restart-frontend`, `/reload-ui`, `/display/timeout/configure`. |

A `host` key does not bypass `CALVIN_HOST_CONTROL`: with it off, host routes
answer `409 host_control_disabled` for everyone, keys included, and creating a
`host` key is refused with `403 host_control_disabled`. A key never gets less than an anonymous caller (display power on/off stay open
to every key, subject to `CALVIN_HOST_CONTROL`). A key of too low a scope
gets `403 insufficient_scope`.

Rules:

- The key goes in the `Authorization: Bearer` header only, never in the URL. A
  bearer request ignores any cookie. A malformed, unknown or revoked key answers
  `401 invalid_api_key`, even on public routes: it never falls back to anonymous.
- Keys cannot manage keys. `GET`/`POST /api/auth/keys` and
  `DELETE /api/auth/keys/{id}` need an admin **session** (the cookie); a key of
  any scope gets `403 session_required`. Changing the admin password needs the
  session too.
- `POST /api/auth/keys {"name", "scope"}` returns `201 {"key": {...}, "secret"}`.
  The secret (`clv_` + 43 URL-safe characters) is shown only in that response.
  `409` for a duplicate name (case-insensitive), `422` for an unknown scope or a
  name that is empty or over 40 characters. `GET` returns
  `{"keys": [{id, name, scope, prefix, createdAt, lastUsedAt}]}`, never the secret.
- Revoking (`DELETE`, `204`) takes effect on the very next request.
- **Changing the admin password does not revoke keys.** Revoke them one by one.
- Bearer requests skip the cookie Origin/CSRF check (a header can't be forged
  cross-site) but still get the Host check. Failed bearer attempts are rate
  limited per IP like logins (5 in a minute, then `429` with `Retry-After`), in
  their own counter, so a stale script can't lock you out of the password form.
- Only a SHA-256 of each secret is stored, in `api-keys.json` next to
  `admin-auth.json` (mode 0600). `last_used_at` is updated at most once a minute
  per key. Key-shaped strings are redacted from the logs.
- Deleting `api-keys.json` revokes every key.

## Limits

- Calvin is normally served over plain HTTP on the LAN; TLS remains a reverse
  proxy job.
- Anyone on the LAN can still rearrange the dashboard, switch screens and change
  the theme. That is deliberate: display state is writable without a password,
  but code, secrets and backups are not.
- One password, no usernames or multiple admins. API keys are the only other credential.
- Installed plugins run in the server process, as before. An upload is first
  imported once in a short-lived child interpreter
  (`python -I -m app.plugins.check_plugin`), so a plugin that crashes, calls
  `sys.exit()` or hangs at import is rejected without the server importing it.
  The child runs as the same user: that is a "don't load rejected code into the
  server" guard, not a sandbox.
