# Screen power from home automation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Home automation switches a screen on, off or back to its schedule with an API key that can do that and nothing else, and the choice holds until changed.

**Architecture:** API keys gain an optional `permissions` list; a key with the field is *limited* (rank `read`, no MCP) and passes only the `(method, path)` pairs in a new `PERMISSION_ROUTES` table. A new route stores the hold in its own `kiosks.power_hold` column, and the kiosk config response projects it as `screenHold` (new agents) and `screenNow` (old agents). The agent obeys `screenHold` first and reports `kfeat=hold`.

**Tech Stack:** FastAPI, Ormar + Alembic (SQLite), pytest; stdlib-only Python agent; Vue 3 + Pinia + vitest + Playwright; MkDocs.

**Spec:** [docs/superpowers/specs/2026-11-18-screen-power-design.md](../specs/2026-11-18-screen-power-design.md), evidence in [the research](../../research/2026-11-18-screen-power-and-scoped-keys.md).

## Global Constraints

- Permission name `screens.power`, label "Turn screens on and off". Nothing else is a known permission.
- A limited key is stored `"scope": "read"` + `"permissions": [...]`; `_FILE_VERSION` stays `1`.
- Route: `PUT`/`GET /api/kiosks/{kiosk_id}/screen-power`, body `{"power": "on" | "off" | "schedule"}`.
- Answer: `{"id", "power", "held", "setAt", "by", "desiredOn", "online", "agentHolds"}`; 404 unknown screen (no row created), 422 bad body.
- Change limit: 30 changes per minute per caller, then 429 `rate_limited` with `Retry-After`.
- Column `kiosks.power_hold` (JSON, nullable) = `{"power": "on"|"off", "setAt": ISO-UTC "...Z", "by": "automation"|"settings"}`; column `kiosks.agent_features` (String 64, nullable).
- Config projection: `screenHold`, `screen_hold`, `screenNow`, `screen_now` = `{power, setAt}`.
- Poll flag: `kfeat=hold`.
- Never a secret or a key name in a response; the change log line carries the key's name only.
- Don't touch `backend/app/api/routes/plugins/management.py`, `backend/app/plugins/utils/secrets.py` or plugin frontend files (PR #368). New route-policy tests go in their own functions.
- Copy: plain words, passes `tests/unit/copy/noDevWords.spec.js`; Settings built from the doctrine blocks, no new `<style>`.

## Review Focus

1. A key file entry with `permissions` that is not a list, or holds non-strings: the file still loads, that key is limited with no permissions (test in Task 1).
2. A limited key hand-edited to `"scope": "admin"`: still gets no admin (policy treats limited as `read`) (test in Task 2).
3. A stale Settings page saving any screen setting while a hold is set must not bring back `screenNow` (test in Task 4).
4. `"schedule"` on a screen with no hold and no `screenNow` is a no-op: 200, nothing written, not counted by the limiter (test in Task 4).
5. The browser kiosk's own config poll (`khost` only, no `kagent`) must not reset `agent_features` (test in Task 3).

## High-risk tasks

⚠ Task 1 (key loader), ⚠ Task 2 (policy table, MCP), ⚠ Task 3 (migration), ⚠ Task 4 (the route), ⚠ Task 6 (agent precedence).

## File map

| File | Responsibility |
|---|---|
| `backend/app/security/api_keys.py` | `PERMISSIONS`, permissive loader, `create(..., permissions=)`, `is_limited` |
| `backend/app/security/route_policy.py` | `PERMISSION_ROUTES`, limited-key branch, `is_admin` refuses limited |
| `backend/app/mcp_server/gateway.py` | refuse limited keys |
| `backend/app/api/routes/auth.py` | `CreateKeyBody.permissions` |
| `backend/alembic/versions/<rev>_kiosk_power_hold.py`, `backend/app/models/db_models.py` | the two columns |
| `backend/app/services/kiosk_registry.py` | hold get/set/clear, `kfeat` recording, list fields |
| `backend/app/services/screen_power.py` (new) | pure: precedence + `desired_on`, the config projection, the change limiter |
| `backend/app/api/routes/kiosks.py` | the route, projection, hold-aware overrides PUT |
| `deploy/kiosk-agent/calvin_display_agent.py` | `screen_hold`, precedence, `kfeat=hold` |
| `frontend/src/stores/apiKeys.js`, `ApiKeysSection.vue` | fourth card, permission chip |
| `frontend/src/stores/kiosks.js`, `ScreensSettings.vue`, `utils/screenPower.js` | held row |
| docs | `ADMIN_AUTH.md`, `integrations/HOME_AUTOMATION.md` (new, nav), `KIOSK_INSTALL.md`, `BACKUP_RESTORE.md` |

---

### Task 1: ⚠ Permissions on API keys (loader and store)

**Files:** Modify `backend/app/security/api_keys.py`. Test `backend/tests/unit/security/test_api_keys.py`.

**Interfaces — Produces:**
- `PERMISSIONS: dict[str, str] = {"screens.power": "Turn screens on and off"}`
- `ApiKeyStore.create(name, scope, now=None, permissions: list[str] | None = None)`; permissions given → must be non-empty, all known, scope must be `"read"`, else `ValueError`.
- `_public(entry)` adds `"permissions": list[str]` (known names only, file order) and `"limited": bool` (field present in the stored entry).
- `is_limited(key: dict) -> bool` (on a public record).

- [ ] **Step 1: failing tests**
  - `test_old_file_loads_unchanged`: write an old-shape file by hand; `list()` returns it with `permissions == []`, `limited is False`; the file bytes are unchanged after `list()` and `authenticate()` with `last_used_at` already fresh.
  - `test_create_limited_key`: `create("Homey", "read", permissions=["screens.power"])` → record `limited True`, `permissions ["screens.power"]`, stored entry `scope == "read"`.
  - `test_create_limited_refuses_other_scope_and_unknown`: `scope="admin"` with permissions, `[]`, `["photos.upload"]` → `ValueError`.
  - `test_unknown_permission_is_ignored_not_fatal`: file entry `permissions: ["screens.power", "future.thing"]` beside a normal key → both load; record `permissions == ["screens.power"]`; file still holds `"future.thing"` after an `authenticate` that rewrites `last_used_at`.
  - `test_malformed_permissions_fail_closed`: `permissions: "screens.power"` and `[1]` → the file loads, that key `limited True`, `permissions []`, other keys unaffected.
  - `test_new_file_loads_with_released_validation`: create a limited key and a normal one with the new store; run a copy of the released `_load` checks (fields present, `scope in ("read","admin","host")`, `float(created_at)`) on the raw JSON → no exception, 2 keys.
- [ ] **Step 2:** `cd backend && lane-heavy uv run pytest tests/unit/security/test_api_keys.py -q` → new tests FAIL.
- [ ] **Step 3:** Implement. `_load` keeps raw entries untouched (never filter in place); `_public` filters. Warn once per unknown name (module-level set).
- [ ] **Step 4:** same command → PASS.
- [ ] **Step 5:** commit `feat(backend): optional permissions on API keys (calvin-2ifv)`.

### Task 2: ⚠ Policy: PERMISSION_ROUTES, limited keys, MCP, key creation

**Files:** Modify `route_policy.py`, `mcp_server/gateway.py`, `api/routes/auth.py`. Tests: `tests/unit/security/test_api_key_policy.py`, `tests/unit/mcp/test_mcp_auth.py`, `tests/integration/test_route_policy.py` (new functions only).

**Interfaces — Consumes:** Task 1 `is_limited`, record `permissions`. **Produces:**
`PERMISSION_ROUTES: dict[str, frozenset[tuple[str, str]]] = {"screens.power": frozenset({("PUT", "/api/kiosks/{kiosk_id}/screen-power"), ("GET", "/api/kiosks/{kiosk_id}/screen-power")})}`; `CreateKeyBody.permissions: list[Literal["screens.power"]] | None = None`.

The route itself lands in Task 4; here the stub app in `test_api_key_policy.py` mounts a stand-in `PUT`/`GET /api/kiosks/{kiosk_id}/screen-power`.

- [ ] **Step 1: failing tests**
  - `test_api_key_policy.py`: `_make_limited_key(client)` helper posting `{"name","scope":"read","permissions":["screens.power"]}`; `LIMITED_MATRIX`: public GET 200, ADMIN_READ 403, backup export 403, `POST /api/calendar/sources` 403, `POST /api/images/next` 200, DISPLAY_PATH 200 (as anonymous), HOST_PATH 403, `PUT .../kitchen/screen-power` 200, `GET` same 200; a plain read key on the `PUT` → 403 `insufficient_scope`; anonymous `PUT` → 401 `admin_required`; `test_limited_key_never_admin` (entry hand-edited to `scope: admin` → `POST /api/calendar/sources` 403); `test_limited_key_cannot_manage_keys` (403 `session_required`); `test_screen_power_cookie_cross_site_refused` (session cookie + `Origin: https://evil.example` → 403); `test_screen_power_foreign_host_refused` (bearer + `Host: evil.example` → 400/403 as `HostOriginMiddleware` answers).
  - `POST /api/auth/keys` with permissions and `scope: "admin"` → 422; with `[]` → 422; with `["nope"]` → 422.
  - `test_mcp_auth.py`: `test_limited_key_refused_at_gateway` → 403, `error.code == "insufficient_scope"`, message contains "Turn screens on and off".
  - `test_route_policy.py` (new functions): `test_permission_routes_reference_real_routes`, `test_permission_routes_not_public_or_host`, `test_screens_power_opens_exactly` (pin: equals the two pairs above), `test_limited_key_refused_on_every_other_unsafe_route` (parametrised over `app.routes` like `test_every_unsafe_route_needs_admin`: every unsafe route not in `PUBLIC_WRITES`, `GUEST_ROUTES` or `PERMISSION_ROUTES["screens.power"]` → 403 with a limited key).
- [ ] **Step 2:** run the three files → FAIL.
- [ ] **Step 3:** Implement. In the bearer branch compute `rank = SCOPE_RANK["read"] if is_limited(key) else SCOPE_RANK[key["scope"]]`; before `HOST_ROUTES`/unsafe checks: `if is_limited(key) and route_id in _opened(key): return`. `is_admin` returns False for a limited key. Gateway: after authentication, a limited key → `_error(403, "insufficient_scope", "This API key is limited to: Turn screens on and off.")` (labels joined). `create_api_key` passes permissions and logs them; scope check is a `model_validator`.
- [ ] **Step 4:** run → PASS.
- [ ] **Step 5:** commit `feat(backend): limited API keys open only their permission routes (calvin-2ifv)`.

### Task 3: ⚠ Registry columns: power_hold and agent_features

**Files:** Create `backend/alembic/versions/a9e3c5b7d1f2_kiosk_power_hold.py` (down_revision = current head, find with `uv run alembic heads`). Modify `db_models.py` (`KioskDB`), `kiosk_registry.py`. Test `backend/tests/unit/test_kiosk_power_hold.py` (new) and the existing migration test pattern (`tests/integration/test_kiosk_viewport_migration.py`).

**Interfaces — Produces (kiosk_registry):**
- `HOLD_FEATURE = "hold"`
- `async get_power_hold(kiosk_id) -> dict | None`
- `async set_power_hold(kiosk_id, power: str, by: str, now: datetime | None = None) -> dict | None` — None for unknown kiosk; writes `power_hold` and removes `screenNow`/`screen_now` from `overrides`, column-scoped (`_columns=["power_hold", "overrides"]`), `retry_on_db_locked`.
- `async clear_power_hold(kiosk_id) -> bool | None` — clears both; returns whether anything changed; None unknown.
- `record_kiosk(..., agent_features: str | None = None)`; normalised to the known set (`{"hold"}`), comma-separated; stored only when `agent_version` is given (an agent poll); an agent poll without `kfeat` stores `""`.
- `list_kiosks()` rows gain `"powerHold": {power, setAt, by} | None` and `"agentHolds": True | False | None`.
- `agent_holds(row) -> bool | None` helper.

- [ ] **Step 1: failing tests** — set/get/clear round trip; set removes `screenNow` but keeps other override keys; unknown kiosk → None and no row; `set_overrides` afterwards leaves `power_hold` intact; `record_kiosk(kagent="v", agent_features="hold")` → `agentHolds True`; then `record_kiosk(kagent="v")` → `False`; `record_kiosk(hostname="h")` only (browser) leaves it unchanged; never polled → `None`; `list_kiosks` never contains a key name (hold set with by "automation"); migration upgrade/downgrade adds and drops both columns.
- [ ] **Step 2:** run → FAIL. **Step 3:** implement (`_HEARTBEAT_COLUMNS` gains `agent_features`, never `power_hold`). **Step 4:** PASS.
- [ ] **Step 5:** commit `feat(backend): kiosk power hold and agent feature columns (calvin-2ifv)`.

### Task 4: ⚠ The screen-power route, projection and hold-aware layer writes

**Files:** Create `backend/app/services/screen_power.py`. Modify `api/routes/kiosks.py`. Tests: `backend/tests/unit/test_screen_power.py` (new, pure), `backend/tests/integration/test_api_screen_power.py` (new). Regenerate `backend/tests/contract/openapi.json` and `frontend/src/api/types.ts`.

**Interfaces — Produces (`screen_power.py`):**
- `desired_on(cfg: dict, now: datetime) -> bool` — same precedence and boundary rules as the agent (hold → `screenNow` until the first boundary after `setAt` → schedule; no schedule → on).
- `now_in(cfg) -> datetime` (config `timezone`, else local).
- `project_hold(merged: dict, hold: dict | None) -> None` — mutates the response dict per Global Constraints.
- `ChangeLimiter(limit=30, window=60.0)` with `check(caller: str, now: float | None = None) -> int` (seconds to wait, 0 when allowed) and `record(caller, now=None)`; module instance `change_limiter`.
- Route answer built by `screen_power_view(kiosk_id) -> dict` in `kiosks.py`.

- [ ] **Step 1: failing tests**
  - Pure: `desired_on` cases mirroring the agent (held off across an "on" boundary → False; `screenNow` off expires at the boundary; no schedule → on; schedule off window → off); `project_hold` sets all four keys and leaves the input layer untouched when `hold is None`; limiter: 30 allowed, 31st returns > 0, window slides.
  - Integration (admin client + a registered kiosk via `record_kiosk`): `PUT off` → 200 `{"power": "off", "held": true, "by": "settings", "desiredOn": false, ...}`; `GET` returns the same; `GET /api/kiosks/{id}/config` has `screenHold` and `screen_now == {"power": "off", "setAt": ...}`; the layer (`GET .../overrides`) has no `screenNow`; `PUT schedule` → `held false`, config has no `screenHold`; unknown id → 404 and `kiosk_exists` false; `{"power": "dim"}` → 422; no-op PUT doesn't write (patch `set_power_hold` to count calls) and isn't limited; 31 alternating changes in a minute → 429 with `Retry-After`; `PUT /overrides` with a `screenNow` while held → stored layer has no `screenNow`; log line contains the key name and not the secret (`caplog`/loguru sink); `agentHolds` reflects Task 3; no response contains the key name.
- [ ] **Step 2:** run → FAIL. **Step 3:** implement. Caller id for the limiter: `"key:" + key["id"]` or `"session"`. `by`: `"automation"` for any key, `"settings"` for a session. `online`: `last_seen` younger than 120 s. **Step 4:** PASS.
- [ ] **Step 5:** `cd backend && UPDATE_OPENAPI_SNAPSHOT=1 lane-heavy uv run pytest tests/contract/test_openapi_snapshot.py -q`, then `cd frontend && npm run gen:api`.
- [ ] **Step 6:** commit `feat(backend): screen-power route with a held on/off (calvin-2ifv)`.

### Task 5: Agent feature report in the config poll

Folded into Task 4's route file: `get_kiosk_config(..., kfeat: str | None = None)` passes `agent_features=kfeat` to `record_kiosk`. Test in `test_api_screen_power.py`: a poll with `kagent=v&kfeat=hold` → `agentHolds true` in `GET /api/kiosks`.

### Task 6: ⚠ Display agent obeys the hold

**Files:** Modify `deploy/kiosk-agent/calvin_display_agent.py`. Test `deploy/kiosk-agent/test_display_agent.py`.

**Interfaces — Produces:** `screen_hold(cfg) -> bool | None` (on/off from `screen_hold`/`screenHold`, None when absent or malformed); `desired_on` checks it first; `AGENT_FEATURES = ("hold",)`; `_config_url(..., kfeat=None)`; `fetch_config` passes `kfeat=",".join(AGENT_FEATURES)`.

- [ ] **Step 1: failing tests** — held off with a schedule that says on → False, also one minute after the next "on" boundary; held on during an off window → True; malformed hold (`{"power": "dim"}`, not a dict) → falls through to `screenNow`/schedule; hold wins over a conflicting `screenNow`; `_config_url(..., kfeat="hold")` contains `kfeat=hold`; existing `screenNow` tests unchanged.
- [ ] **Step 2:** `lane-heavy python3 -m pytest -q deploy/kiosk-agent/test_display_agent.py` → FAIL. **Step 3:** implement. **Step 4:** PASS.
- [ ] **Step 5:** commit `feat(kiosk): display agent holds a screen-power choice (calvin-2ifv)`.

### Task 7: Settings: the home automation key

**Files:** Modify `frontend/src/stores/apiKeys.js` (`createKey(name, scope, permissions)` sends `permissions` only when given), `ApiKeysSection.vue`. Test `frontend/tests/unit/components/settings/ApiKeysSection.spec.js`.

- [ ] **Step 1: failing tests** — a fourth option `scope-card-screens` labelled "Turn screens on and off", description "Lets home automation switch screens on and off. Can't see or change anything else."; submitting it posts `{name, scope: "read", permissions: ["screens.power"]}`; a key with `permissions: ["screens.power"]` shows the chip "Turn screens on and off", not "Read".
- [ ] **Step 2:** `cd frontend && lane-heavy npx vitest run tests/unit/components/settings/ApiKeysSection.spec.js` → FAIL. **Step 3:** implement (option value `screens`, mapped to scope `read` + permissions on submit). **Step 4:** PASS.
- [ ] **Step 5:** commit `feat(frontend): home automation key in API keys (calvin-2ifv)`.

### Task 8: Settings: the held power row

**Files:** Modify `frontend/src/stores/kiosks.js` (`setScreenPower(id, power) -> view`), `ScreensSettings.vue`. Tests `frontend/tests/unit/components/ScreensSettings.spec.js`, the phone e2e mock (`tests/e2e/phone/fixtures/api-mock.js`) for the new route.

**Interfaces — Consumes:** `selectedKiosk.powerHold`, `selectedKiosk.agentHolds` (Task 3); `PUT /kiosks/{id}/screen-power` (Task 4).

- [ ] **Step 1: failing tests** — a kiosk with `powerHold {power: "off", by: "automation"}`: `screen-now-state` reads "Off, held by home automation"; `screen-now-follow` reads "Back to schedule" and calls `PUT .../screen-power {"power":"schedule"}`, then the row follows the schedule; `by: "settings"` → "Off, held until someone changes it"; `agentHolds false` → note `screen-now-old-agent` "This screen needs a software update to hold. Until then it follows the next scheduled change."; "Turn on now" on a held screen calls the route with `schedule` first, then writes `screenNow` as today; no hold → today's copy unchanged.
- [ ] **Step 2:** run the spec → FAIL. **Step 3:** implement with `InlineNote`/`Button` only. **Step 4:** PASS.
- [ ] **Step 5:** commit `feat(frontend): show and end a held screen in Settings (calvin-2ifv)`.

### Task 9: Docs

**Files:** `docs/configuration/ADMIN_AUTH.md` (limited keys, what they open, MCP refused, rollback behaviour), `docs/integrations/HOME_AUTOMATION.md` (new; Homey "Make a web request" card with method, URL, header lines, body; reading state; leaked key; replay over plain HTTP; presence on the LAN; key not in backups) + `mkdocs.yml` nav, `docs/setup/KIOSK_INSTALL.md` (hold, `kfeat`, agent compatibility both ways, update a screen to hold), `docs/configuration/BACKUP_RESTORE.md` ("Not included": Calvin's API keys and admin password, screen holds).

- [ ] **Step 1:** write. **Step 2:** `lane-heavy uv run --directory backend -- mkdocs build --strict --config-file "$PWD/mkdocs.yml" --site-dir "$TMPDIR/site"` → no warnings.
- [ ] **Step 3:** commit `docs: screen power from home automation (calvin-2ifv)`.

### Task 10: Full checks and self-review

- [ ] Every check in the task brief, one heavy job at a time; `scripts/check-commit-attribution.sh origin/develop..HEAD`.
- [ ] superpowers:requesting-code-review on the diff with the high-risk list above as checklist; fix findings with a test first.
