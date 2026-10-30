# Admin Auth (CLV-9) — Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Require an admin session for every state-changing or secret-leaking API route, block cross-site writes and DNS rebinding, and stop rejected plugin uploads from running code in the server.

**Architecture:** A new `app/security/` package holds four pure units: the admin secret store (password hash, server secret, session cookies, login rate limit), the route policy (which routes are public, viewer-write, or admin), a Host/Origin middleware, and a one-call `install_security(app)` used by both `app/main.py` and the test app in `tests/conftest.py`. The policy is a FastAPI app-level dependency that reads the matched route template, so every new write route is admin-only by default. Plugin checks run in a child interpreter (`python -I -m app.plugins.check_plugin`).

**Tech Stack:** FastAPI/Starlette, pydantic-settings, stdlib `hashlib.scrypt` / `hmac` / `secrets`, pytest + TestClient.

**Spec:** `docs/superpowers/specs/2026-10-29-admin-auth-design.md` (approved by the owner 2026-10-29, all section 10 calls as written). Read it before starting; section numbers below refer to it.

**Execution split:**
- **PR 1 (Tasks 1–7):** backend auth, policy, Host/Origin, docs and template. Ships alone; the frontend still works logged out for viewing, and Settings will show 401s until PR 3.
- **PR 2 (Task 8):** plugin check in a subprocess. Start only after CLV-13 (plugin loader R12 changes) has merged into develop.
- **PR 3 (frontend):** a separate plan, written once the design lead's spec for the lock screen, login dialog and Security tab is in.

## Global Constraints

- Password: any characters, minimum 8. No username. Stored as scrypt hash with random salt, never plaintext.
- Secret file: `admin-auth.json`, mode `0600`, default `<data_dir>/admin-auth.json`, override `ADMIN_AUTH_PATH`. Never in the DB, never in a backup, never in `GET /api/config`.
- Env: `CALVIN_ADMIN_PASSWORD` (pre-sets the password on startup and always wins), `CALVIN_ALLOWED_HOSTS` (comma list; `*` disables the Host check).
- Cookie: name `calvin_admin`, HttpOnly, SameSite=Strict, Path=/, Max-Age 400 days (34560000 s). Value `"{issued_at}.{generation}.{hex_hmac}"`, HMAC-SHA256 keyed by `server_secret`.
- Login rate limit: per peer IP; 5 failures within 60 s → 429, cooldown starts at 60 s and doubles per further lockout, capped at 900 s. In memory. `X-Forwarded-*` is never trusted.
- Error bodies: `{"detail": {"code": "<code>", "message": "<text>"}}` with codes `admin_required` (401), `setup_required` (401), `already_configured` (409), `rate_limited` (429, plus `"retry_after": <int seconds>` in `detail` and a `Retry-After` header), `bad_password` (401), `password_too_short` (422).
- Host rejection: `400`, `text/plain`, body names `CALVIN_ALLOWED_HOSTS` and `PUBLIC_URL`.
- Origin rejection: `403` with `{"detail": {"code": "cross_origin", "message": ...}}`.
- Logging via `loguru` only. Use `retry_on_db_locked` for any DB write (this plan adds none).
- Commits: conventional messages, no Co-Authored-By / AI attribution. PR base `develop`.

## Review Focus

1. **Reverse proxy / Docker port mapping:** a request with `Host: 192.0.2.10:8080` and `Origin: http://192.0.2.10:8080` (port differs from the container's 8000) must pass. Compare Origin's host:port with the Host header *as received*. Test in Task 5.
2. **Vite dev server:** `Origin: http://localhost:5173` against `Host: localhost:8000` must pass when `http://localhost:5173` is in `CORS_ORIGINS`. Test in Task 5.
3. **Restart with `CALVIN_ADMIN_PASSWORD` unchanged:** it must NOT bump `generation` (or every restart would sign everyone out). Only a different password rewrites the hash. Test in Task 1.
4. **Corrupt or empty `admin-auth.json`:** treat it as not configured and log an error. No crash at startup, no 500 on every request. Test in Task 1.
5. **IPv6 Host header** `[fe80::1]:8000` and bare `[::1]` are IP literals and allowed. Test in Task 5.

---

### Task 1: Admin secret store

**Files:**
- Create: `backend/app/security/__init__.py` (empty)
- Create: `backend/app/security/admin_auth.py`
- Modify: `backend/app/config.py`: add `admin_auth_path: Path = Path("admin-auth.json")` and append `"admin_auth_path"` to `_DATA_PATHS`; add `admin_password: str = Field(default="", validation_alias=AliasChoices("calvin_admin_password", "admin_password"))` and `allowed_hosts: str = Field(default="", validation_alias=AliasChoices("calvin_allowed_hosts", "allowed_hosts"))`, following the `data_dir` pattern.
- Test: `backend/tests/unit/security/test_admin_auth.py`

**Interfaces (Produces):**
```python
class AdminAuthStore:
    def __init__(self, path: Path): ...
    def is_configured(self) -> bool
    def set_password(self, password: str) -> None          # raises PasswordTooShort; bumps generation
    def verify_password(self, password: str) -> bool        # constant-time
    def issue_cookie(self, now: int | None = None) -> str   # "{issued_at}.{generation}.{hmac}"
    def verify_cookie(self, value: str | None, now: int | None = None) -> bool
    def apply_env_password(self, password: str) -> None     # set only if not configured or verify fails
    def reset(self) -> None                                 # delete the file (tests, recovery)
class PasswordTooShort(ValueError): ...
COOKIE_NAME = "calvin_admin"; COOKIE_MAX_AGE = 34560000; MIN_PASSWORD_LEN = 8
def get_admin_store() -> AdminAuthStore   # module singleton bound to settings.admin_auth_path; re-reads the file on each call to is_configured/verify (cheap; lets "delete the file" work without a restart)
```
File JSON: `{"version": 1, "scrypt": {"salt": hex, "n": 16384, "r": 8, "p": 1, "hash": hex}, "server_secret": hex(32 bytes), "generation": int}`. Write atomically (temp file in the same dir + `os.replace`), then `os.chmod(path, 0o600)`. Deleting the file (recovery) also discards `server_secret`, so old cookies die.

- [ ] **Step 1: Write failing tests** in `test_admin_auth.py` using `tmp_path`:
  - `test_not_configured_when_file_missing`: `AdminAuthStore(tmp_path/"a.json").is_configured() is False`
  - `test_set_and_verify_password`: after `set_password("correct horse")`, `verify_password("correct horse")` is True and `verify_password("wrong pass")` is False
  - `test_short_password_rejected`: `set_password("1234567")` raises `PasswordTooShort`
  - `test_file_mode_is_0600`: `stat.S_IMODE(path.stat().st_mode) == 0o600`
  - `test_file_has_no_plaintext`: `"correct horse" not in path.read_text()`
  - `test_cookie_roundtrip`: `verify_cookie(issue_cookie())` is True; tampered last char → False; `None` → False; `"garbage"` → False
  - `test_cookie_expires_after_400_days`: `verify_cookie(issue_cookie(now=1000), now=1000+34560000+1)` is False
  - `test_password_change_invalidates_old_cookies`: cookie issued, `set_password("another pass")`, old cookie → False
  - `test_env_password_same_does_not_bump_generation`: `set_password("pw-123456")`; c = `issue_cookie()`; `apply_env_password("pw-123456")`; `verify_cookie(c)` still True
  - `test_env_password_different_wins`: `apply_env_password("new-pass-99")` → `verify_password("new-pass-99")` True
  - `test_corrupt_file_counts_as_not_configured`: write `"{not json"` → `is_configured()` False, no exception
  - `test_reset_deletes_file_and_kills_cookies`: after `reset()`, the file is gone, `is_configured()` False, an old cookie → False
- [ ] **Step 2: Run** `cd backend && uv run pytest tests/unit/security/test_admin_auth.py -q`. Expected: FAIL (module missing).
- [ ] **Step 3: Implement** `admin_auth.py` and the three settings fields. Use `hashlib.scrypt(password.encode(), salt=..., n=16384, r=8, p=1, dklen=32)`, `hmac.compare_digest`, `secrets.token_bytes(32)`.
- [ ] **Step 4: Run** the same command. Expected: PASS.
- [ ] **Step 5: Commit** `feat(security): admin secret store with scrypt hash and signed session cookies (CLV-9)`

### Task 2: Login rate limiter

**Files:**
- Modify: `backend/app/security/admin_auth.py`
- Test: `backend/tests/unit/security/test_rate_limit.py`

**Interfaces (Produces):**
```python
class LoginRateLimiter:
    def __init__(self, max_failures: int = 5, window: int = 60, base_cooldown: int = 60, max_cooldown: int = 900): ...
    def check(self, ip: str, now: float | None = None) -> int     # 0 = allowed, else seconds to wait
    def record_failure(self, ip: str, now: float | None = None) -> None
    def record_success(self, ip: str) -> None                     # clears the failure history, keeps the lockout count
login_limiter: LoginRateLimiter   # module singleton
```

- [ ] **Step 1: Write failing tests:**
  - `test_five_failures_then_locked`: 5× `record_failure("1.2.3.4", now=0)` → `check("1.2.3.4", now=1) == 59` (60 − elapsed, rounded up)
  - `test_other_ip_unaffected`: `check("5.6.7.8", now=1) == 0`
  - `test_cooldown_doubles`: lock out, wait until `now=61`, 5 more failures → `check(...)` ≈ 120; a third time ≈ 240; never more than 900
  - `test_failures_outside_window_forgotten`: 4 failures at now=0, 1 at now=61 → `check == 0`
- [ ] **Step 2: Run** `uv run pytest tests/unit/security/test_rate_limit.py -q`. Expected: FAIL.
- [ ] **Step 3: Implement** with a `dict[str, deque[float]]` of failure times and a `dict[str, tuple[locked_until, lockouts]]`.
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** `feat(security): per-IP login rate limit with doubling cooldown (CLV-9)`

### Task 3: Route policy dependency and `install_security`

**Files:**
- Create: `backend/app/security/route_policy.py`
- Create: `backend/app/security/install.py`
- Modify: `backend/app/main.py`: `app = FastAPI(..., dependencies=[Depends(enforce_route_policy)])` and call `install_security(app)` right after the existing middleware is added. At startup in `lifespan`, before plugins load: if `settings.admin_password`, call `get_admin_store().apply_env_password(settings.admin_password)` (log "admin password set from CALVIN_ADMIN_PASSWORD", never the value).
- Modify: `backend/tests/conftest.py`: build `test_app` the same way (`dependencies=[Depends(enforce_route_policy)]` + `install_security(test_app)`), point `settings.admin_auth_path` at a tmp file, and log the client in by default (see Step 3).
- Test: `backend/tests/integration/test_route_policy.py`

**Interfaces (Produces):**
```python
UNSAFE_METHODS = frozenset({"POST", "PUT", "PATCH", "DELETE"})
PUBLIC_WRITES: frozenset[tuple[str, str]]   # (method, path_format)
ADMIN_READS: frozenset[str]                 # path_format values that need admin on GET
CONFIG_DISPLAY_KEYS: frozenset[str]         # keys POST /api/config accepts without admin
def is_admin(request: Request) -> bool      # verifies the calvin_admin cookie via get_admin_store()
def admin_error(store_configured: bool) -> HTTPException   # 401 setup_required or admin_required
async def enforce_route_policy(request: Request) -> None     # the app-level dependency
def install_security(app: FastAPI) -> None  # adds HostOriginMiddleware (Task 5) and includes the auth router (Task 4) at prefix /api
```
`enforce_route_policy` reads `request.scope["route"].path_format`. Unsafe method and `(method, path)` not in `PUBLIC_WRITES` → admin required. GET/HEAD with `path` in `ADMIN_READS` → admin required. Otherwise allowed. Not-configured stores answer `setup_required`.

Initial values (spec §3; the system router is mounted at `/api/system`):
```python
PUBLIC_WRITES = {
  ("POST", "/api/images/next"), ("POST", "/api/images/previous"),
  ("POST", "/api/calendar/refresh"), ("POST", "/api/plugins/{plugin_id}/fetch"),
  ("POST", "/api/system/display/power/on"), ("POST", "/api/system/display/power/off"),
  ("POST", "/api/config"),   # body is further restricted in the route (Task 3 Step 5)
  ("POST", "/api/auth/setup"), ("POST", "/api/auth/login"), ("POST", "/api/auth/logout"),
}
ADMIN_READS = {
  "/api/backup/export", "/api/backup/files", "/api/backup/files/{name}", "/api/backup/schedule",
  "/api/config/git/branches", "/api/plugins/{plugin_id}/scan", "/api/plugins/local/suggest",
  "/api/system/update/stream",
}
```
`CONFIG_DISPLAY_KEYS`: start from `dashboardScreens, regionsLocked, showUI, themeMode, selectedTheme, darkModeStart, darkModeEnd, lastSideViewMode`, then confirm the list by grepping the frontend for `updateConfig(` callers outside `frontend/src/views/Settings*`/`components/settings/`. List each extra key you find in the PR body with the caller's file:line.

- [ ] **Step 1: Write failing tests** in `test_route_policy.py`. Use a `client` fixture that is NOT logged in (marker `@pytest.mark.no_admin_login`, see Step 3):
  - `test_every_unsafe_route_needs_admin`: one test that loops over `client.app.routes` (the test app, which has the same routers as `app.main.app`): every `APIRoute` × each of its methods in `UNSAFE_METHODS`, minus `PUBLIC_WRITES`. Request each with path params filled with `"x"` and no body. Collect every route that does not answer 401 with `detail.code in {"admin_required", "setup_required"}`, and assert the collected list is empty, so one run names all the unprotected routes. A 422 or 404 means the policy let the request through.
  - `test_admin_reads_need_admin` (parametrised over `ADMIN_READS`) → 401
  - `test_public_writes_allowed_logged_out`: `POST /api/images/next` is not 401
  - `test_dashboard_reads_public`: `GET /api/config`, `GET /api/health`, `GET /api/kiosks/{id}/config` are not 401
  - `test_unconfigured_says_setup_required`: with the store reset, `POST /api/calendar/sources` → `detail.code == "setup_required"`
  - `test_policy_tables_reference_real_routes`: every entry in `PUBLIC_WRITES` and `ADMIN_READS` matches a real route template/method in `app.main.app` (catches typos and renamed routes)
- [ ] **Step 2: Run** `uv run pytest tests/integration/test_route_policy.py -q`. Expected: FAIL.
- [ ] **Step 3: Implement** `route_policy.py` and `install.py`, then wire `main.py` and `conftest.py`. In `conftest.test_client`: set `app.config.settings.admin_auth_path = tmp_path / "admin-auth.json"`, `get_admin_store().set_password("test-admin-password")`, and unless `request.node.get_closest_marker("no_admin_login")`, `client.post("/api/auth/login", json={"password": "test-admin-password"})` and assert 200. Register the marker in `pytest.ini`/`pyproject` `[tool.pytest.ini_options] markers`. Restore the settings path in teardown. (Login needs Task 4's router. If you do Task 3 before Task 4, set the cookie directly with `client.cookies.set(COOKIE_NAME, store.issue_cookie())`, and switch to the real login once Task 4 is done.)
- [ ] **Step 4: Run** the new test file, then the WHOLE backend suite `uv run pytest -q`. Expected: all pass. Existing tests keep their meaning because the client is logged in by default. Tests that build their own app or client must get the same login; fix each one you find.
- [ ] **Step 5: Config body restriction.** In `backend/app/api/routes/config.py` `update_config`, add a `request: Request` parameter. `keys = config_update.model_dump(exclude_unset=True).keys()`. If `not is_admin(request)` and `not keys <= CONFIG_DISPLAY_KEYS`, raise `admin_error(...)`. Tests (`no_admin_login`): `POST /api/config {"themeMode": "dark"}` → 200; `{"gitBranch": "main"}` → 401; `{"themeMode": "dark", "gitBranch": "x"}` → 401 (a mixed request is rejected as a whole).
- [ ] **Step 6: Run** the full suite plus ruff/mypy. Commit: `feat(security): default-deny admin policy for state-changing routes (CLV-9)`

### Task 4: Auth endpoints

**Files:**
- Create: `backend/app/api/routes/auth.py` (router included by `install_security`)
- Test: `backend/tests/integration/test_auth_routes.py`

**Interfaces:**
- Consumes: `get_admin_store()`, `login_limiter`, `is_admin`, `COOKIE_NAME`, `COOKIE_MAX_AGE` (Tasks 1–3).
- Produces (all under `/api`):
  - `GET /auth/status` → `{"configured": bool, "authenticated": bool}`
  - `POST /auth/setup {password}` → 200 `{"ok": true}` + cookie; 409 `already_configured` if configured; 422 `password_too_short`
  - `POST /auth/login {password}` → 200 + cookie; 401 `bad_password`; 429 `rate_limited` (checked BEFORE verifying); 401 `setup_required` if not configured
  - `POST /auth/logout` → 200, clears the cookie (`Max-Age=0`)
  - `POST /auth/password {current, new}` → admin only, else 401 `admin_required`; wrong `current` → 401 `bad_password` (counts toward the rate limit); success → new cookie for this client (generation bumped, so other sessions die)
  - Rate limit on all three password-taking endpoints: `setup`, `login` and `password` call `login_limiter.check(ip)` first and answer 429 `rate_limited` with the `Retry-After` header and `detail.retry_after` (the frontend countdown reads them; design spec `docs/design/2026-10-29-clv-9-admin-auth-ui.md`). Only wrong passwords count as failures.
  - Set cookies with `response.set_cookie(COOKIE_NAME, value, max_age=COOKIE_MAX_AGE, httponly=True, samesite="strict", path="/", secure=False)`. Calvin is commonly served over plain HTTP on the LAN; TLS is a proxy job (spec non-goal).
  - Peer IP: `request.client.host`.

- [ ] **Step 1: Write failing tests** (`no_admin_login` marker; the store is reset per test):
  - `test_status_unconfigured`: `{"configured": False, "authenticated": False}`
  - `test_setup_logs_in`: setup → 200 and the cookie is set; then `GET /auth/status` → `authenticated: True`; then `POST /api/calendar/sources` is not 401
  - `test_second_setup_409`
  - `test_setup_short_password_422`
  - `test_login_wrong_then_right`: wrong → 401 `bad_password`; right → 200
  - `test_login_rate_limited`: 5 wrong → 6th (even with the right password) → 429 with `Retry-After` header and `detail.retry_after > 0`
  - `test_password_change_rate_limited`: 5 wrong `current` → 429 with `Retry-After`; and while that IP is locked out, `POST /auth/setup` (on a reset store) also answers 429 with `Retry-After`
  - `test_logout_clears`: after logout, an admin route → 401
  - `test_password_change_signs_out_others`: clients A and B both logged in; A changes the password → A's admin route OK, B's → 401
  - `test_env_password_presets` (unit-level: call the startup hook with `settings.admin_password="preset-pass-1"`) → configured, and login with it works
  - `test_cookie_attributes`: the `set-cookie` header contains `HttpOnly`, `SameSite=strict` (case-insensitive), `Path=/`, `Max-Age=34560000`
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement** `auth.py`. Pydantic bodies: `PasswordBody(password: str)`, `ChangePasswordBody(current: str, new: str)`. Return errors via `HTTPException(status_code, detail={"code":..., "message":...})`; for 429 also `headers={"Retry-After": str(wait)}`.
- [ ] **Step 4: Run** this file and the full suite. Expected: PASS.
- [ ] **Step 5: Commit** `feat(security): admin setup, login, logout and password change endpoints (CLV-9)`

### Task 5: Host and Origin middleware

**Files:**
- Create: `backend/app/security/host_origin.py`
- Modify: `backend/app/security/install.py` (add the middleware)
- Test: `backend/tests/unit/security/test_host_origin.py`

**Interfaces (Produces):**
```python
def is_allowed_host(host_header: str, public_url: str, allowed_hosts: str) -> bool
def origin_allowed(origin: str | None, sec_fetch_site: str | None, host_header: str, cors_origins: list[str]) -> bool
class HostOriginMiddleware:   # pure ASGI (no BaseHTTPMiddleware), so SSE/streaming is untouched
    def __init__(self, app: ASGIApp): ...  # reads settings at call time, so tests can monkeypatch
```
Rules (spec §5):
- Host: strip the port; `[v6]` brackets → IP literal. Allowed: any IP literal (`ipaddress.ip_address`), `localhost`, `*.localhost`, single-label names (no dot), suffixes `.local .lan .home .home.arpa .internal .localdomain`, the hostname of `settings.public_url`, and entries in `settings.allowed_hosts` (comma list, case-insensitive; `*` → allow all). A missing Host header is allowed (HTTP/1.0 clients on the LAN). Applies to every HTTP request, not only `/api`. Rejection: 400 text/plain `"Calvin refused this request: the host name '<host>' is not allowed. If you reach Calvin through a domain name, add it to CALVIN_ALLOWED_HOSTS or set PUBLIC_URL."`
- Origin: only for unsafe methods on paths starting with `/api`. If `settings.cors_allow_all`, skip. If Origin is present: its `host[:port]` (from `urlsplit`, with default ports made explicit on both sides: http 80, https 443) must equal the Host header's `host[:port]`, OR the origin must be in `cors_origins`. Scheme is ignored. Origin `null` is rejected. If Origin is absent: reject only if `Sec-Fetch-Site == "cross-site"`. Rejection: 403 JSON `cross_origin`.

- [ ] **Step 1: Write failing tests** (pure functions plus a tiny Starlette app with the middleware for the ASGI path):
  - Hosts allowed: `"192.0.2.10:8000"`, `"[fe80::1]:8000"`, `"[::1]"`, `"localhost:5173"`, `"app.localhost"`, `"calvin"`, `"raspberrypi:8000"`, `"calvin.local"`, `"pi.home.arpa"`, `"x.lan"`, `"testserver"`, the host of `public_url="https://dash.example.com"`, and `"foo.example.org"` with `allowed_hosts="foo.example.org"`; anything with `allowed_hosts="*"`
  - Hosts rejected: `"evil.example"`, `"calvin.local.evil.example"`, `"1.2.3.4.nip.io"`
  - Origin allowed: same host:port (`http://192.0.2.10:8080` vs Host `192.0.2.10:8080`); `https://dash.example.com` vs Host `dash.example.com` (default ports); `http://localhost:5173` with that value in `cors_origins`; no Origin and no Sec-Fetch-Site (curl)
  - Origin rejected: `http://evil.example` vs Host `192.0.2.10:8000`; Origin `null`; no Origin + `Sec-Fetch-Site: cross-site`
  - ASGI: a GET with Host `evil.example` → 400 plain text containing `CALVIN_ALLOWED_HOSTS`; a POST `/api/x` with a foreign Origin → 403; the same POST to a non-`/api` path → passes the Origin check
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement** and add to `install_security`.
- [ ] **Step 4: Run** this file and the full suite (TestClient uses Host `testserver` and sends no Origin, so existing tests must still pass).
- [ ] **Step 5: Commit** `feat(security): reject foreign Host and cross-site Origin (CLV-9)`

### Task 6: Kiosk path stays open (regression guard)

**Files:**
- Test: `backend/tests/integration/test_kiosk_no_session.py`

- [ ] **Step 1: Write tests** (`no_admin_login`): with no cookie and the store unconfigured, `GET /api/kiosks/<new-id>/config` (registers on first poll), the kiosk manifest route, `GET /api/kiosks/install.sh` and the agent-file routes all answer 2xx. Find the exact paths in `backend/app/api/routes/kiosks.py`. `PUT /api/kiosks/{id}/overrides` → 401.
- [ ] **Step 2: Run.** Expected: PASS if Tasks 3–5 are correct. If one fails, fix the policy, not the test.
- [ ] **Step 3: Update** `scripts/seed_test_calendar.py`: read `CALVIN_ADMIN_PASSWORD`, `POST /api/auth/login` first, and reuse the cookie (`requests.Session` or `httpx.Client`). Print a clear message if the variable is unset.
- [ ] **Step 4: Commit** `test(security): kiosk endpoints stay public without a session (CLV-9)`

### Task 7: Docs and Unraid template

**Files:**
- Create: `docs/configuration/ADMIN_AUTH.md`: first run, `CALVIN_ADMIN_PASSWORD`, forgotten password (delete `admin-auth.json` or set the env var, then restart), `CALVIN_ALLOWED_HOSTS` and `PUBLIC_URL`, a table of what is public, viewer-write and admin (from `route_policy.py`), and the limits (plain HTTP on the LAN; anyone on the LAN can still change display state).
- Modify: the kiosk provisioning doc's "Trust model" section (find it with `grep -rl "Trust model" docs`): signing is implemented; the signing key and backups now need the admin password; residuals: unsigned kiosks trust the LAN, and the server process still holds the HMAC key until Ed25519 lands.
- Modify: `deploy/unraid/calvin.xml`: two optional `Type="Variable"` entries. `CALVIN_ADMIN_PASSWORD` uses `Display="always" Mask="true"`; `CALVIN_ALLOWED_HOSTS` uses `Display="advanced"`. Write descriptions in the style of the existing `PUBLIC_URL` entry.
- Modify: `mkdocs.yml` nav to include `configuration/ADMIN_AUTH.md`.
- Beads: `bd create --title "Ed25519 release-signed kiosk manifests" --description "<spec §7 summary>"`, then close calvin-580 as superseded: `bd close calvin-580 --reason "superseded by <new id> (CLV-9 design §7)"`.

- [ ] **Step 1: Write** the docs and template entries.
- [ ] **Step 2: Verify** `uvx --with mkdocs-material mkdocs build --strict` passes (or the repo's mkdocs requirements) and `xmllint --noout deploy/unraid/calvin.xml` passes.
- [ ] **Step 3: Commit** `docs(security): admin auth guide, trust model, Unraid fields (CLV-9)`. Then push and open **PR 1** to `develop`.

### Task 8 (PR 2, after CLV-13 merges): plugin check in a subprocess

**Files:**
- Create: `backend/app/plugins/check_plugin.py`: `python -I -m app.plugins.check_plugin <plugin_dir>`. It imports `plugin.py` the same way the loader does for installed plugins (same module name `installed_plugin_{id}`, same `register_module` + metadata validation), prints exactly one JSON line `{"errors": [...], "type_ids": [...]}` and exits 0. It catches `SystemExit` and `BaseException` from the plugin and reports them as errors. No DB init.
- Create: `backend/app/plugins/isolated_check.py` with `def run_isolated_plugin_check(plugin_id: str, timeout: float = 60.0) -> list[str]`. It runs the child with `sys.executable`, cwd = the backend dir, and a minimal env (`PATH`, `HOME`, `CALVIN_DATA_DIR`, `PLUGIN_DIR`, `PYTHONPATH` = backend dir), all via `asyncio.to_thread`-safe `subprocess.run`. Non-zero exit, timeout, unparseable output or a non-empty `errors` list → returns the error strings.
- Modify: the three install paths (`management.py` install, both installs in `github.py`). Insert the check after `plugin_installer.install_plugin(...)` and BEFORE `plugin_loader.load_installed_plugins()`. On errors: `plugin_installer.uninstall_plugin(installed_id)` (it already rolls back pip via `_installed_packages`) → 400 with the errors. Keep `_validate_just_installed_plugin` after the in-process load as a second guard.
- Test: `backend/tests/integration/test_plugin_install_isolated.py`

- [ ] **Step 1: Write failing tests:**
  - `test_bad_plugin_never_imported_in_server`: a zip whose `plugin.py` writes a marker file at import and then declares invalid metadata → 400. The marker file WAS written (by the child), but `"installed_plugin_<id>" not in sys.modules` in the test process, and the plugin dir is gone.
  - `test_plugin_calling_sys_exit` → 400 with an error mentioning SystemExit; the server is still up
  - `test_hanging_plugin_times_out` (`timeout=2`, `plugin.py` does `time.sleep(10)`) → 400 timeout error
  - `test_good_plugin_still_installs` → 200, and it appears in the plugin list
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the full backend suite and gates.
- [ ] **Step 5: Commit** `feat(plugins): validate uploaded plugins in a child process before loading (CLV-9)`. Open **PR 2** to `develop`.
