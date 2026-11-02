# CLV-9 — Admin auth for state-changing routes: design

Status: **approved by the owner 2026-10-29** (all section 10 calls as written). Audit sources: CLV-4 report §2.1 S2, S8.

## 1. Why

Today anyone who can reach Calvin can change it, and so can any web page a LAN user opens:

- A multipart `POST /api/plugins/install` (sent cross-site by browsers with no preflight) extracts the
  zip, pip-installs its `dependencies.packages`, then **imports `plugin.py` in the server process**,
  and only then validates it. A rejected upload has already run its code. (Checked on current
  develop: `management.py` install → `plugin_loader.load_installed_plugins()` →
  `_validate_just_installed_plugin`; same in both GitHub/local install routes in `github.py`.)
- `GET /api/backup/export?include_signing_key=true` hands the kiosk signing key and every stored
  plugin secret to any LAN client. With the key, an attacker signs manifests that kiosks apply as root.
- No Host check, so DNS rebinding lets a public web page read the family's calendar and photos.

CLV-8 (merged) fixed path traversal and secret masking; none of the above.

## 2. Goals / non-goals

Goals
- An admin secret is required for every state-changing route and every route that leaks secrets.
- Kiosks keep working with **no setup at all**: viewing, and the touch interactions people use on
  the dashboard (next photo, switch screen, calendar view, theme), stay open.
- First run stays one step: the first person to open Settings picks a password.
- Cross-site requests and DNS rebinding are rejected.
- A rejected plugin upload never runs code in the server process.
- A plan (not a build) for an asymmetric kiosk signing key whose private half isn't in the server.
- KIOSK_PROVISIONING's trust-model section brought up to date.

Non-goals
- User accounts, roles, multiple admins, OAuth/SSO.
- TLS (still a reverse-proxy job).
- Sandboxing installed plugins: an admin-installed plugin still runs in the server, as today.

Anti-goals (would be a failure even if it "works")
- A kiosk Pi that needs a password typed on it to show the dashboard.
- An upgrade that silently locks people out with no way back in.
- Docker/Unraid/reverse-proxy users getting a blank 400 page with no hint how to fix it.

## 3. The model: three tiers of route

| Tier | Who | Examples |
|---|---|---|
| **Public read** | anyone on an allowed Host | dashboard data: config, events, images, plugin data, kiosk config/manifest/installer |
| **Public "viewer" writes** | anyone, same-origin only | `images/next`, `images/previous`, `calendar/refresh`, `plugins/{id}/fetch`, `system/display/power/on|off`, `POST /api/config` **restricted to display keys** |
| **Admin** | logged-in admin session | everything else that writes, plus secret-leaking reads |

Enforcement is **default-deny for writes**: one global FastAPI dependency looks at the matched
route template and method. Every `POST/PUT/PATCH/DELETE` needs admin unless the route template is
on a short public allowlist. So a new route is protected without anyone remembering to.

Admin-only reads (explicit list, because GETs default to public):
- `/api/backup/*` (export carries secrets and optionally the signing key)
- `/api/config/git/branches` (outbound fetch)
- `/api/plugins/{id}/scan`, `/api/plugins/local/suggest` (outbound probes / filesystem listing)
- `/api/system/update/stream` (update log)

`POST /api/config` is one endpoint for both harmless and dangerous keys. Without admin, it accepts a
request only if **every** key is on a display allowlist (the keys the dashboard itself writes:
`dashboardScreens`, `regionsLocked`, `showUI`, `themeMode`, `selectedTheme`, `darkModeStart`,
`darkModeEnd`, `lastSideViewMode`, … — the builder confirms the list by tracing the non-Settings
callers of `configStore.updateConfig`). Anything else (`gitRepoUrl`, `gitBranch`, rotation,
update settings, …) → 401.

Accepted residual: someone on the LAN can still rearrange the dashboard or flip the theme. That's
the "trusted LAN for display state, never for code or secrets" line.

`GET /api/kiosks/{id}/config` keeps registering kiosks on first poll (it's a GET; unchanged).

## 4. The admin secret and sessions

- **One admin password**, any characters, minimum 8. Stored as an scrypt hash (stdlib
  `hashlib.scrypt`, random salt) in a file, `admin-auth.json` (mode 0600), next to the signing key:
  `$CALVIN_DATA_DIR/admin-auth.json` in Docker, `./data/admin-auth.json` from source; override with
  `ADMIN_AUTH_PATH`. A file, not the DB, so it is never in a backup or a `GET /api/config`, and so
  recovery is "delete one file".
- **Session = cookie** `calvin_admin`, HttpOnly, SameSite=Strict, Path=/, Max-Age 400 days (browser
  cap). Value is stateless: `issued_at.generation.HMAC(server_secret, …)`. `server_secret` and
  `generation` live in the same file. A cookie (not a bearer header) because EventSource, file
  downloads (`/api/backup/export`) and plain `fetch` calls can't add headers.
- Changing the password bumps `generation` → every other session is signed out. "Sign out" just
  clears the cookie.
- **Login rate limit**: per client IP, 5 failures per minute, then 429 with a doubling cooldown
  (in memory; resets on restart).
- **Endpoints** (all public, all same-origin-checked):
  - `GET /api/auth/status` → `{configured: bool, authenticated: bool}`
  - `POST /api/auth/setup {password}` → only while not configured; sets the password, logs you in
  - `POST /api/auth/login {password}` / `POST /api/auth/logout`
  - `POST /api/auth/password {current, new}` (admin) → change + sign out others

### First run and upgrade

- **Not configured** (fresh install or upgrade from today): admin routes answer
  `401 {"code": "setup_required"}`. Opening Settings shows a single card: *"Choose an admin
  password — anyone on your network who knows it can change Calvin."* Two fields, one button, and
  you're in. Kiosks never see it (they don't open Settings).
- Whoever reaches Settings first claims it. Cross-site pages and rebinding can't (§5), but another
  LAN device could, in that window. For people who care: **`CALVIN_ADMIN_PASSWORD`** (env var, Docker /
  Unraid template field) pre-sets it on first start, so there's no open window at all.
- **Forgot it**: delete `admin-auth.json` (or set `CALVIN_ADMIN_PASSWORD`, which always wins on
  startup) and restart; Settings asks for a new one. Documented in the Settings card and the docs.

### Frontend

- An `auth` Pinia store (`status`, `login`, `logout`, `setup`).
- `/settings` renders a lock screen (setup or login) until authenticated; everything else in
  Settings is unchanged.
- A global axios response interceptor (the default instance **and** `services/api.js`): on
  `401 admin_required` it opens the login dialog in place; after login the user retries the action.
  Covers the dashboard ⋯ menu (reboot, update, hide-controls if it ever needs admin).
- On a touch kiosk the lock screen also shows the existing "set up from your phone" URL + QR
  (CLV-11's `serverUrl.js`), since typing on a kiosk is hard anyway (audit F2).
- Settings gets a "Sign out" and a "Change password" control (Security tab).

## 5. Host and Origin checks

**Host (DNS rebinding)** — a middleware on every request (not only `/api`, since rebinding can read
the page too). Allowed without config:
- IP literals (v4/v6), `localhost`, `*.localhost`
- single-label names (`calvin`, `raspberrypi`)
- `.local`, `.lan`, `.home`, `.home.arpa`, `.internal`, `.localdomain`
- the host of `PUBLIC_URL`
- anything in **`CALVIN_ALLOWED_HOSTS`** (comma list; `*` turns the check off)

Anything else → `400` with a plain-text body naming the env var to set. This blocks rebinding,
which always arrives with the attacker's public domain as Host, while every normal LAN way of
reaching Calvin (IP, mDNS, router names) keeps working. Reverse-proxy users with a real domain set
`PUBLIC_URL` (they already should) or `CALVIN_ALLOWED_HOSTS`.

**Origin (cross-site writes)** — for every unsafe method under `/api`:
- `Origin` present → its host:port must equal the request's `Host` (scheme ignored, so a TLS proxy
  in front still matches), or be in the existing `CORS_ORIGINS` setting (keeps the Vite dev server
  on :5173 working). Otherwise `403`.
- `Origin` absent → reject only if `Sec-Fetch-Site: cross-site`. Non-browser clients (curl, the
  kiosk agent) send neither, and they still need the cookie for admin routes.
- `CORS_ALLOW_ALL` (dev only) skips the Origin check.

SameSite=Strict on the cookie already stops cross-site requests from carrying the session; the
Origin check additionally protects the public writes and the setup endpoint.

## 6. Plugin import in a subprocess

New install order for zip upload, GitHub install and local install:

1. Extract to `plugins/{id}/` (unchanged, already traversal-safe).
2. `pip install` declared packages (already a subprocess; unchanged).
3. **New:** run `python -I -m app.plugins.check_plugin <plugin_dir>` (the server's own interpreter,
   cwd = backend dir, minimal env, 60 s timeout). The child imports `plugin.py`, runs the same
   `register_module` discovery + metadata validation, and prints `{"errors": [...], "type_ids": [...]}`.
4. Errors, non-zero exit, timeout or garbage output → roll back (remove dir, undo pip) → `400` with
   the errors. The server process never imports it.
5. Only a clean result → `plugin_loader.load_installed_plugins()` in-process, as today.

`POST /api/plugins/inspect` stays manifest-only (it never imported code).

Honest limits, written into the docs: the child runs as the same user, so it is a "don't load
rejected code into the server" guard, not a sandbox. The real gate is §3: only the admin can upload.

## 7. Asymmetric kiosk signing — plan only (extends calvin-580)

Today: HMAC with a shared secret in `kiosk-signing.key`, readable by the server process (and by any
code an admin installs). Plan:

- **Ed25519**. Kiosks pin the **public** key (`/etc/default/calvin-kiosk-signing` holds it instead of
  the secret). The `alg` field in the manifest already exists; add `ed25519`, keep `hmac-sha256`
  accepted during a transition.
- **Where the private key lives:** the kiosk bundle is shipped with the server (image / checkout),
  so its manifest is static per release. **Sign it at release time in CI** (private key in a GitHub
  Actions secret) and ship `kiosk-manifest.sig` inside the image. The server only serves the
  signature; it holds no signing key at all, so a compromised server or plugin can't forge an update.
  For source/Pi installs that build their own bundle: an offline `calvin-sign-bundle` CLI run by the
  owner, with the key off the box.
- This makes calvin-580's per-kiosk HMAC KDF unnecessary (a stolen public key forges nothing); close
  580 in favour of a new "Ed25519 release-signed kiosk manifests" bead.
- Checked: `kiosk_bundle.build_manifest()` is content-only (version + per-file sha256, no server URL),
  so it is identical for every server running the same release and can be signed at release time.
- Kiosk side: `update-kiosk.sh` verifies with `python3 -c` + `cryptography` or `openssl pkeyutl`
  (Bookworm's openssl 3 supports Ed25519 raw verify); pick at build time.

## 8. Docs

- KIOSK_PROVISIONING "Trust model": rewrite — signing is implemented (not "future work
  calvin-5vw"); state what admin auth now protects (the key is no longer downloadable without the
  admin password); remaining residuals (unsigned kiosks trust the LAN; the server process holds the
  HMAC key until §7 lands).
- New `docs/configuration/ADMIN_AUTH.md`: first run, `CALVIN_ADMIN_PASSWORD`, forgotten password,
  `CALVIN_ALLOWED_HOSTS`, what's public vs admin.
- Docker/Unraid template: add `CALVIN_ADMIN_PASSWORD` and `CALVIN_ALLOWED_HOSTS` (optional fields).

## 9. Tests (definition of done)

Backend (pytest, TestClient):
- Every non-allowlisted unsafe route → 401 without a session (parametrised over `app.routes`, so a
  future route without protection fails the test). Same for the admin-only GETs.
- Allowlisted viewer writes work without a session; `POST /api/config` with a display key works,
  with `gitBranch` → 401.
- Cross-origin `Origin` → 403 on a viewer write and on login; same-origin → OK; `Sec-Fetch-Site:
  cross-site` without Origin → 403.
- Foreign Host (`evil.example`) → 400; IP / `calvin.local` / single-label / `CALVIN_ALLOWED_HOSTS` → OK.
- First run: status `configured=false` → setup → logged in → admin route OK; second setup → 409;
  `CALVIN_ADMIN_PASSWORD` pre-sets; password change invalidates old cookie; rate limit → 429.
- Kiosk path: `GET /api/kiosks/{id}/config`, manifest, install.sh, agent files all work with no session.
- A plugin zip whose `plugin.py` writes a marker file at import and fails validation → 400, and the
  server process's `sys.modules` never contains it (and a "good" zip still installs).
- Existing tests: a conftest fixture logs the test client in by default, so the 1000+ existing tests
  keep their meaning; auth tests opt out.

Frontend (vitest): auth store; lock screen renders setup vs login; 401 interceptor opens login.

## 10. Calls I made (please check)

1. Password, not a generated token — easier to type on a phone, and survives "I lost the token".
2. Unconfigured = admin routes closed (not open-with-a-nag). Upgrading users hit the setup card once.
3. First visitor to Settings claims it; `CALVIN_ADMIN_PASSWORD` for those who want zero window.
4. Dashboard interactions stay public (§3), so no kiosk pairing is needed in this task.
5. Host allowlist by name shape (+ `PUBLIC_URL`, + env) rather than a strict configured list.
6. Kiosk-screen login: no on-screen keyboard here; the lock screen points to the phone URL/QR.
7. Asymmetric signing: plan only, release-time CI signing; recommend replacing calvin-580.

## 11. Reviewer questions, settled

A fresh reviewer read this as a builder. Their points, and how they're settled:

- **Non-browser writers?** None that matter. The kiosk agent (`calvin_display_agent.py`) and the
  installer and updater scripts only GET. `PUT /kiosks/{id}/overrides` and `POST /kiosks/{id}/update`
  are called only from the Settings › Kiosks tab, so they become admin. The dev script
  `scripts/seed_test_calendar.py` writes calendar sources and will need a login (my call: it reads
  `CALVIN_ADMIN_PASSWORD` and logs in first).
- **Plugin-defined routes?** Plugins can't add routes: the host's route set is fixed, and plugin data
  comes from `GET /plugins/{id}/data`. So the allowlist is keyed on the host route template. *Answered.*
- **Mixed `POST /api/config`.** Settings always runs logged in, so its whole-config saves are fine.
  The dashboard callers only send display keys. A mixed request without admin is rejected as a whole.
  *My call.*
- **Kiosk ⋯ menu (reboot/update).** These need admin. On a 401 they open the same login dialog, and
  that dialog shows the phone URL and a QR code. *My call.*
- **Proxies.** Host and Origin are compared against the `Host` header as received. Reverse proxies
  normally preserve it; if one doesn't, set `CALVIN_ALLOWED_HOSTS` or `PUBLIC_URL`. `X-Forwarded-*` is
  not trusted. The rate limit is keyed on the peer IP. Behind a proxy everyone shares one bucket, and
  the cooldown stays short (doubling from 60 s, capped at 15 min). *My call.*
- **Subprocess context.** The child imports `app.plugins.*` and `app.config` settings, but no DB init.
  Built-in plugins import the same way at load. A failed check rolls back pip through the existing
  `_uninstall_pip_requirements`. *My call.*
- **Unraid template.** It lives in this repo (`deploy/unraid/calvin.xml`). The two optional env fields
  go there.
- **Forgot password.** Deleting `admin-auth.json` also rotates `server_secret`, so every old cookie
  dies. *Answered.*
