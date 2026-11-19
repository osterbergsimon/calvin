# Kiosk authentication Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Each wall screen proves which screen it is with its own paired secret, so only that screen can report for itself and see its presence fields, while an unpaired screen always keeps its dashboard.

**Architecture:**
- **Server side.** A `clv_kiosk_` bearer, or a signed `calvin_kiosk` cookie, resolves to a *kiosk principal* for the kiosk id in the path. The hash it is checked against sits in `kiosks.credential_hash`. Pending pairings and one-time install codes live in memory.
- **Gated screens.** A screen is gated when it is paired, or when the household mode is `required`. One viewer-aware projection and one write gate decide what a caller may read and write for a gated screen. `KIOSK_ROUTES` names the agent-only writes.
- **On the Pi.** The agent makes the secret, sends it as a bearer and pairs. The kiosk units hand the secret to the browser in the URL fragment, and the browser swaps it for the cookie.

**Tech Stack:** FastAPI, Ormar + Alembic (SQLite), pytest; stdlib-only Python agent; bash + bats; Vue 3 + Pinia + vitest + Playwright; MkDocs.

**Spec:** [docs/superpowers/specs/2026-11-19-kiosk-auth-design.md](../specs/2026-11-19-kiosk-auth-design.md). Evidence is in [the research](../../research/2026-11-18-kiosk-authentication.md).

## Parts and pull requests

Each part is one reviewable PR into `develop`, in this order. Optional mode is the default, so every part can ship on its own without changing what an unpaired screen does.

| Part | PR | Tasks | Size | Risk |
|---|---|---|---|---|
| A | `feat(backend): kiosk pairing and the kiosk principal (calvin-0xns)` | 1-4 | ~1.5 days | **HIGH** (`security/`, `kiosks.py`, Alembic) |
| B | `feat(backend): gate paired screens' writes and presence fields (calvin-0xns)` | 5-8 | ~1.5 days | **HIGH** (policy, registry writes, backup) |
| C | `feat(kiosk): display agent pairs and hands its secret to the browser (calvin-0xns)` | 9-11 | ~1.5 days | **HIGH** (agent, root scripts, units) |
| D | `docs(design): kiosk pairing UI spec` (by the design lead) | 12 | design lead's estimate | design gate |
| E | `feat(frontend): kiosk browser pairing hand-off and code card (calvin-0xns)` | 13 | ~1 day | **HIGH** (secret handling in the page) |
| F | `feat(frontend): pair and unpair screens in Settings (calvin-0xns)` + docs | 14-15 | ~1.5 days | medium |

Total: about 7 days, including reviews. The design lead's part D is not in that total.

Dependencies:
- B needs A.
- C needs A (it can be built in parallel with B).
- D can start as soon as the design is approved.
- E needs A, C and **D merged**.
- F needs A, B and **D merged**.

## Global Constraints

- Secret: `clv_kiosk_` + `secrets.token_urlsafe(32)` (43 characters). The format check is `^clv_kiosk_[A-Za-z0-9_-]{43}$`.
- Install code: `clv_pair_` + `secrets.token_urlsafe(24)`. The format check is `^clv_pair_[A-Za-z0-9_-]{22,64}$`. It is single use, lives 30 minutes, and at most 5 are live.
- Pairing code: 6 characters from the 30-character alphabet `23456789ABCDEFGHJKMNPQRSTVWXYZ` (no 0/O, 1/I/L or U; 30^6 ≈ 7×10^8). It is shown as `XXX-XXX`, matched case-insensitively with the dash ignored, and lives 600 s. At most 3 pending pairings per kiosk id, and a new one drops the oldest.
- Pairing limits:
  - at most 20 *new* pending pairings per address per 10 minutes, then 429 `rate_limited` with `Retry-After`;
  - after 5 wrong approval codes per address per minute, a doubling cooldown in its own `LoginRateLimiter` bucket.
- Columns: `kiosks.credential_hash` String(64), nullable; `kiosks.paired_at` UTCDateTime, nullable. Only the SHA-256 hex of the secret is stored, and it is compared with `hmac.compare_digest`.
- Household mode: config key `kioskPairing`, `"optional"` (also when absent or any other value) or `"required"`. It is admin-only and never added to `CONFIG_DISPLAY_KEYS`.
- Cookie `calvin_kiosk` = `k1.<hex kiosk id>.<16 hex fingerprint>.<issued epoch>.<hmac>`, with HMAC-SHA256 under the admin store's `server_secret`. Attributes: `HttpOnly`, `SameSite=Strict`, `Path=/`, `Max-Age=34560000`. It is re-signed when older than 30 days.
- Config answer field: `kioskAuth = {"state": "paired"|"unpaired", "mode": "optional"|"required", "hasAgent": bool, "browser": "paired"|"unpaired"|"unknown"}`. `browser` goes only to the screen itself.
- Presence fields: `screenHold`, `screen_hold`, `screenNow`, `screen_now`, `displayCheck`, `display_check`, and the list's `powerHold`.
- Agent feature flag: `kfeat=hold,pair`.
- Agent files: `/var/lib/calvin/agent/kiosk-credential` and `/var/lib/calvin/agent/install-pair-code`, both mode 0600, owner `calvin`.
- Error codes: the design's section 14 table, verbatim: `pairing_code_invalid` (404), `rate_limited` (429), `install_code_invalid` (409), `screen_has_agent` (409), `setup_required` (409 on `pair`/`browser-session`), `kiosk_unpaired` (401, "This screen isn't paired."), `session_required` (403).
- Agent marker file: `/var/lib/calvin/agent/kiosk-paired`. The browser is restarted by signal (`restart_kiosk_unit`) for Chromium and cog alike: no new sudo rule.
- Never a 401 on `GET /api/kiosks/{id}/config`.
- No secret, install code or pairing code in a log line, in a backup, or in any response except to its own holder.
- UI: every Settings and kiosk screen follows the design lead's merged `docs(design)` spec (Task 12). The plan fixes behaviour and API, not layout or copy. Copy passes `tests/unit/copy/noDevWords.spec.js`.
- Don't touch the screen-power semantics (`power_hold`, `project_hold`, `kfeat=hold`). Only who receives them changes.
- Every check runs through `lane-heavy`, one heavy job at a time.

## Review Focus

1. **A screen paired while its old agent still polls without a bearer.** The poll keeps its dashboard (200), writes nothing, and the Settings line explains it. Test in Task 6: `test_paired_screen_old_agent_poll_is_read_only`.
2. **Unpair while the screen is offline, then the screen comes back with the old secret.** It is treated as unpaired. The agent makes a new secret and never keeps retrying the old one. Test in Task 9: `test_unpaired_answer_rotates_secret_once`.
3. **The admin password file is reset.** Every kiosk cookie dies, the agent restarts the browser at most once per 10 minutes, and the screen is paired again with no person involved. Test in Task 9: `test_browser_unpaired_twice_restarts_once_per_cooldown`. Test in Task 4: `test_cookie_dies_on_server_secret_change`.
4. **Two tabs of Settings approve the same code at once.** One wins and the other gets 404 `pairing_code_invalid`. No second row is created and no hash is overwritten. Test in Task 3: `test_concurrent_approval_single_winner`.
5. **A restore onto a server where the screen was re-paired since the backup.** The current pairing is kept and the screen keeps working. Test in Task 8: `test_restore_keeps_current_pairing`.

## High-risk tasks

⚠ Task 1 (migration), ⚠ Task 2 (pairing store), ⚠ Task 3 (pairing routes), ⚠ Task 4 (principal in the route policy, cookie), ⚠ Task 5 (projection), ⚠ Task 6 (write gate and `KIOSK_ROUTES`), ⚠ Task 8 (backup), ⚠ Task 9 (agent), ⚠ Task 10 (units and root scripts), ⚠ Task 13 (browser hand-off).

Each part ends with a **dedicated review step**: superpowers:requesting-code-review on that PR's diff, with that part's high-risk tasks and the Review Focus lines as the checklist. Fix each finding with a test first, before the PR leaves draft. Parts A, B and C also get a security pass against the design's "Rules the tests pin" list.

## File map

| File | Responsibility |
|---|---|
| `backend/alembic/versions/<rev>_kiosk_pairing.py`, `backend/app/models/db_models.py` | two columns (down_revision `b8e2f4a6c9d1`, check with `uv run alembic heads`) |
| `backend/app/services/kiosk_pairing.py` (new) | pure, in memory: secrets, codes, pending pairings, install codes, limits |
| `backend/app/services/kiosk_registry.py` | credential read/write, gated `record_kiosk`, `pairing_mode()`, list fields |
| `backend/app/security/kiosk_auth.py` (new) | `kiosk_principal`, cookie sign/verify, `require_screen_itself`, `is_gated` |
| `backend/app/security/route_policy.py` | prefix dispatch, `KIOSK_ROUTES`, new public writes |
| `backend/app/security/api_keys.py` | reserved prefixes |
| `backend/app/mcp_server/gateway.py` | refuse kiosk bearer |
| `backend/app/api/routes/kiosks.py` | pairing routes, gated config/list/overrides/screen-power, `kioskAuth` |
| `backend/app/api/routes/kiosk_pairing.py` (new, optional split) | the pairing routes, if `kiosks.py` grows past ~800 lines |
| `backend/app/services/kiosk_view.py` (new) | `strip_presence(merged)`, `can_see_presence(...)` |
| `backend/app/services/backup/{exporter,restorer,format}.py` | `pairing` on kiosk rows |
| `backend/app/services/kiosk_bundle.py` | `render_install_script(..., pair_code=)` |
| `deploy/kiosk-agent/calvin_display_agent.py` | credential, bearer, pairing loop, browser restart, `kfeat=pair` |
| `deploy/systemd/calvin-kiosk-remote.service`, `calvin-cog.service` | `#pair=` fragment |
| `deploy/kiosk-agent/install-kiosk.sh`, `scripts/setup-kiosk.sh`, `scripts/bake-kiosk-firstrun.sh` | `--pair-code`; keep `/var/lib/calvin/agent` |
| `frontend/src/utils/kioskId.js`, `frontend/src/stores/kioskPairing.js` (new), the kiosk card component (per the design lead's spec), `frontend/public/sw.js` | browser hand-off and card |
| `frontend/src/stores/kiosks.js`, `ScreensSettings.vue`, `AddKioskPanel.vue` | Settings per the design lead's spec |
| docs | `KIOSK_INSTALL.md`, `KIOSK_PROVISIONING.md`, `ADMIN_AUTH.md`, `BACKUP_RESTORE.md`, `integrations/HOME_AUTOMATION.md` |

---

## Part A: pairing and the kiosk principal (PR 1)

### Task 1: ⚠ Registry columns for the credential

**Files:**
- Create `backend/alembic/versions/c3f7a9d2e8b1_kiosk_pairing.py`.
- Modify `db_models.py` (`KioskDB`) and `kiosk_registry.py`.
- Test `backend/tests/integration/test_kiosk_pairing_migration.py` (new, in the pattern of `test_kiosk_power_hold_migration.py`) and `backend/tests/unit/test_kiosk_credential.py` (new).

**Interfaces — Produces (kiosk_registry):**
- `async get_credential_hash(kiosk_id) -> str | None`
- `async set_credential(kiosk_id, secret_hash: str, hostname: str | None = None, now=None) -> None`. Creates the row when it is missing. Column-scoped: `credential_hash`, `paired_at`, and `hostname` only on create. Uses `retry_on_db_locked`.
- `async clear_credential(kiosk_id) -> bool | None`. None for an unknown kiosk, otherwise whether anything changed.
- `list_kiosks()` rows gain `"paired": bool`, `"pairedAt": iso | None` and `"agentPairs": bool | None` (from `agent_features`, the same way `agentHolds` is computed). They never carry the hash.
- `AGENT_FEATURES` becomes `("hold", "pair")`, with `PAIR_FEATURE = "pair"` and `agent_pairs(agent_features) -> bool | None`.

- [ ] **Step 1: failing tests**
  - Upgrade adds both columns, downgrade drops them, and existing rows read as unpaired.
  - Set/get/clear round trip; clearing an unknown id returns None and creates no row.
  - `set_credential` on a missing id creates the row with the given hostname.
  - `_HEARTBEAT_COLUMNS` never contains `credential_hash` or `paired_at`. Test: `record_kiosk` after `set_credential` leaves the hash.
  - No key containing `hash` appears in any `list_kiosks()` row.
  - `record_kiosk(..., agent_version="v", agent_features="hold,pair")` → `agentPairs True`.
- [ ] **Step 2:** `cd backend && lane-heavy uv run pytest tests/unit/test_kiosk_credential.py tests/integration/test_kiosk_pairing_migration.py -q` → FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Same command → PASS.
- [ ] **Step 5:** Commit `feat(backend): kiosk credential columns (calvin-0xns)`.

### Task 2: ⚠ The pairing store (pure, in memory)

**Files:**
- Create `backend/app/services/kiosk_pairing.py`.
- Test `backend/tests/unit/test_kiosk_pairing.py`.

**Interfaces — Produces:**
- `SECRET_PREFIX = "clv_kiosk_"`, `INSTALL_PREFIX = "clv_pair_"`, `CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTVWXYZ"`, `CODE_TTL_S = 600`, `INSTALL_TTL_S = 1800`.
- `new_secret() -> str`, `is_secret(value) -> bool`, `hash_secret(secret) -> str` (SHA-256 hex), `normalize_code(typed: str) -> str | None`, `format_code(code) -> str` (`"K7Q-4MD"`).
- `@dataclass Pending(kiosk_id, secret_hash, code, created, expires, peer, hostname, by_agent, last_asked)`.
- `class PairingStore` with these methods:
  - `start(kiosk_id, secret_hash, peer, hostname=None, by_agent=True, now=None) -> Pending`. It returns the live entry for the same hash, with `last_asked` refreshed. When a new entry would exceed the per-address limit, the per-id cap (every entry was asked about in the last 120 s) or the global cap of 200, it raises `RateLimited(wait)`.
  - `pending_for(kiosk_id, secret_hash, now=None) -> Pending | None` (refreshes `last_asked`).
  - `live(now=None) -> list[Pending]` and `has_agent_pending(kiosk_id, now=None) -> bool`.
  - `take_by_code(code, now=None) -> Pending | None`. It removes every pending entry of that kiosk id, and is atomic: one `threading.Lock`.
  - `drop_kiosk(kiosk_id)`.
  - `mint_install_code(now=None) -> tuple[str, float]`, which keeps only the hash.
  - `use_install_code(code, now=None) -> bool`, which works once.
- Module instance `pairing_store`, plus `approve_limiter = LoginRateLimiter()`.

- [ ] **Step 1: failing tests**
  - A secret matches the regex in Global Constraints. `hash_secret` is stable.
  - Codes use only `CODE_ALPHABET` and are unique among live entries (seeded `secrets` stub forcing a collision → re-rolled).
  - `normalize_code("k7q-4md") == normalize_code("K7Q4MD")`, and a character outside the alphabet → None.
  - The same hash twice returns the same code.
  - A fourth pending entry for one id drops the oldest entry not asked about in 120 s. When all three were asked about lately → `RateLimited` (`test_live_code_is_never_evicted`).
  - The 201st live entry overall → `RateLimited`.
  - The 21st new entry from one address in 10 minutes raises `RateLimited`, but repeats of an existing entry don't count.
  - An entry expires at 600 s.
  - `take_by_code` is single-winner when two threads race (`test_concurrent_approval_single_winner` at the store level), and it drops the other pending entries for that id.
  - An install code works once, expires at 1800 s, and at most 5 are live (a sixth drops the oldest).
  - Pin the alphabet in the test (30 characters, none of `0O1ILU`).
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement. **Step 4:** PASS.
- [ ] **Step 5:** Commit `feat(backend): in-memory kiosk pairing store (calvin-0xns)`.

### Task 3: ⚠ Pairing routes

**Files:**
- Modify `kiosks.py` (or create `kiosk_pairing.py` routes and register it in `main.py`), `route_policy.py` (`PUBLIC_WRITES` gains `POST /api/kiosks/{kiosk_id}/pair` and `POST /api/kiosks/{kiosk_id}/browser-session`), and `kiosk_bundle.py`.
- Tests: `backend/tests/integration/test_api_kiosk_pairing.py` (new) and `tests/unit/test_kiosk_bundle.py` (new functions). Regenerate `backend/tests/contract/openapi.json` and `frontend/src/api/types.ts`.

**Interfaces — Consumes:** Task 1 and Task 2; Task 4's `issue_kiosk_cookie` (build Task 4 first if you prefer; the order inside Part A is free). **Produces:** the routes in the design's section 4 table, with these bodies:
- `PairBody{installCode: str | None, browser: bool = False}`
- `PairState{state: Literal["paired","pending","none"], code: str | None, expiresAt: str | None}`
- `ApproveBody{code: str}` → `{id, displayName, pairedAt, replaced: bool}`
- `GET /api/kiosks/pairings` (admin) → `{"pending": [{kioskId, hostname, createdAt, byAgent}]}`, with no code and no hash
- `InstallCode{code, expiresAt, command}`

`render_install_script(server_url, root=None, pair_code: str | None = None)`.

- [ ] **Step 1: failing tests**
  - Agent start: a bearer secret → `pending` with a formatted code; the same again → the same code; the server never creates a registry row (`kiosk_exists` false).
  - `GET .../pair` with that bearer → the code. With another pending secret for the same id → that one's own code. Anonymous → `none`, with no code.
  - Approve: an admin session posts the code → 200, the hash is stored, and the row is created with the pending hostname and the household settings adopted (`_adopt_global_settings` called). Approving for an already paired id → 200 `replaced: true`. A second approve with the same code → 404 `pairing_code_invalid`. Anonymous → 401 `admin_required`. An admin key → 403 `session_required`.
  - Error table from the design's section 14, one test per row: `screen_has_agent`, `setup_required` (no admin password), unpair of an unpaired screen → 200 `changed: false`, unknown id → 404.
  - `GET /api/kiosks/pairings` lists the live pending entries without code or hash; anonymous → 401.
  - Removing a screen drops its pending entries.
  - Pairing routes answer `Cache-Control: no-store`.
  - Six wrong codes in a minute → 429 with `Retry-After`.
  - Approving drops the other pending entries for that id.
  - `test_concurrent_approval_single_winner`: two `asyncio.gather` approvals → one 200, one 404, and one hash.
  - Install code: admin mints one; the `pair` body with `installCode` → `paired` immediately; reuse → 409 `install_code_invalid`. Minting is refused for a limited key and for anonymous callers.
  - Unpair: `DELETE .../pairing` (admin) → the hash is cleared; then `GET .../pair` with the old bearer → `none`.
  - Browser-only: `{"browser": true}` with no bearer → a `Set-Cookie: calvin_kiosk=…; HttpOnly; SameSite=Strict`, and the body holds no secret.
  - `render_install_script(..., pair_code="clv_pair_" + "a"*22)` embeds it. A code with `'`, `$(`, a space or a newline is not embedded (the output equals the no-code render). The route ignores a malformed `?pair=`.
  - Log redaction: a request to `install.sh?pair=clv_pair_…` and one with a kiosk bearer leave no `clv_kiosk_`/`clv_pair_` substring in captured loguru output.
- [ ] **Step 2:** `cd backend && lane-heavy uv run pytest tests/integration/test_api_kiosk_pairing.py tests/unit/test_kiosk_bundle.py -q` → FAIL.
- [ ] **Step 3:** Implement. `GET /api/kiosks/install.sh` reads `pair` from the query. `command` in `InstallCode` is built from `public_base_url(request)`.
- [ ] **Step 4:** PASS.
- [ ] **Step 5:** `cd backend && UPDATE_OPENAPI_SNAPSHOT=1 lane-heavy uv run pytest tests/contract/test_openapi_snapshot.py -q`, then `cd frontend && npm run gen:api`.
- [ ] **Step 6:** Commit `feat(backend): pair, approve and unpair kiosks (calvin-0xns)`.

### Task 4: ⚠ The kiosk principal, the cookie, and the policy

**Files:**
- Create `backend/app/security/kiosk_auth.py`.
- Modify `route_policy.py`, `api_keys.py` and `mcp_server/gateway.py`.
- Tests: `tests/unit/security/test_kiosk_auth.py` (new), `tests/unit/security/test_api_key_policy.py` and `tests/integration/test_route_policy.py` (new functions only), and `tests/unit/mcp/test_mcp_auth.py`.

**Interfaces — Produces (`kiosk_auth.py`):**
- `KIOSK_COOKIE = "calvin_kiosk"`
- `issue_kiosk_cookie(kiosk_id, secret_hash, now=None) -> str` and `set_kiosk_cookie(response, value)`
- `read_kiosk_cookie(value) -> tuple[str, str, int] | None`, giving `(kiosk_id, fingerprint, issued)`
- `async kiosk_principal(request) -> str | None`: the path's kiosk id when the bearer or cookie matches the active hash, cached on `request.state.kiosk_principal`
- `async kiosk_holder(request) -> tuple[str, str] | None`: `(kiosk_id, secret_hash)` for an active **or** pending secret (used by `GET .../pair` and `browser-session`)
- `kiosk_secret_limiter = LoginRateLimiter()`

**Interfaces — Produces (`route_policy.py`):**
- `KIOSK_ROUTES: frozenset[tuple[str, str]]` = the two pairs in the design's section 3.
- `bearer_secret` is unchanged. `_authenticate_bearer` returns `None` for a bearer with `SECRET_PREFIX`, before the limiter or the store, so both `enforce_route_policy` and the MCP gateway see "no key". An admin cookie next to a kiosk bearer is honoured.

`ApiKeyStore.create` re-rolls a secret that starts with `clv_kiosk_` or `clv_pair_`.

- [ ] **Step 1: failing tests**
  - The cookie round-trips. A tampered MAC, a fingerprint of another hash, or a changed `server_secret` → None (`test_cookie_dies_on_server_secret_change`).
  - A cookie older than 30 days is re-signed on use (freeze time).
  - `kiosk_principal`:
    - a bearer of the active secret on `/api/kiosks/kitchen/...` → `"kitchen"`;
    - the same bearer on `/api/kiosks/hall/...` → None;
    - a revoked or pending secret → None;
    - a cookie works like the bearer.
  - A kiosk bearer on `POST /api/calendar/sources` → 401 `admin_required` (anonymous), **not** `invalid_api_key`, and `api_key_limiter` has no failure recorded.
  - A kiosk bearer on a public GET → 200.
  - `is_admin()` is false with a kiosk bearer, and with a kiosk cookie and no admin cookie.
  - The MCP gateway refuses a kiosk bearer: 401, as for no key, and `api_key_limiter` records nothing (`test_kiosk_bearer_at_mcp_not_counted`).
  - A kiosk bearer plus a valid admin cookie on an admin route → 200.
  - `test_kiosk_routes_reference_real_routes`, `test_kiosk_routes_not_host_or_permission`.
  - `ApiKeyStore.create` with `secrets.token_urlsafe` stubbed to return `"kiosk_…"` first re-rolls.
- [ ] **Step 2:** Run the four files → FAIL. **Step 3:** Implement. **Step 4:** PASS.
- [ ] **Step 5:** Commit `feat(backend): kiosk principal from a paired secret or cookie (calvin-0xns)`.

### Part A review

- [ ] Full backend checks: `uv run ruff check .`, `uv run ruff format --check .`, `lane-heavy uv run mypy app --ignore-missing-imports`, `lane-heavy uv run pytest -q`.
- [ ] superpowers:requesting-code-review on the Part A diff. Checklist: Tasks 1-4, the anti-goals "a pairing approved without an admin", "a screen showing a code that someone else chose" and "a kiosk secret treated as an API key", and Review Focus line 4.
- [ ] Open PR 1 as a draft into `develop`.

## Part B: gates (PR 2)

### Task 5: ⚠ Viewer-aware presence projection

**Files:**
- Create `backend/app/services/kiosk_view.py`.
- Modify `kiosks.py` (`get_kiosk_config`, `get_kiosks`, `get_kiosk_overrides`, `get_screen_power`, `_screen_power_view`), `kiosk_registry.py` (`pairing_mode()`) and `screen_power.py` (`agent_view` takes `receives_hold`).
- Tests: `backend/tests/unit/test_kiosk_view.py` (new), `backend/tests/integration/test_api_kiosk_presence.py` (new). Regenerate the OpenAPI snapshot and types.

**Interfaces — Produces:**
- `PRESENCE_KEYS` (the Global Constraints list)
- `strip_presence(d: dict) -> None`
- `async pairing_mode() -> Literal["optional","required"]`, read from the household config table
- `is_gated(paired: bool, mode) -> bool`
- `can_see_presence(*, admin: bool, principal: str | None, kiosk_id: str, paired: bool, mode) -> bool`: true when the caller is admin, or is that screen, or the screen is not gated
- `ScreenPowerView.paired: bool`
- `presenceHidden: true` on any answer or list row whose presence fields were removed
- The `kioskAuth` object in the config answer

- [ ] **Step 1: failing tests**
  - Pure: the `can_see_presence` truth table over admin × principal (self, other, None) × paired × mode.
  - `strip_presence` removes exactly `PRESENCE_KEYS`.
  - Integration, parametrised over mode × paired × caller (anonymous, bad bearer, pending bearer, the screen's own bearer, its cookie, admin session):
    - the config answer is always 200 with `rotation` and the layout key;
    - presence keys appear exactly when `can_see_presence` says so;
    - the same holds for `GET /api/kiosks` (per row `powerHold`, and `screenNow` in `overrides`) and for `GET .../overrides`.
  - `GET .../screen-power` on a gated screen: anonymous → 401 `admin_required`; a `screens.power` limited key → 200; the screen itself → 200.
  - `desiredOn` for a gated, unpaired screen with a hold off and a schedule that says on → true; `paired` is false.
  - `kioskAuth.state` is `"paired"` only for the screen itself. `hasAgent` follows `agent_version`. `browser` is absent for anyone but the screen itself.
  - The config ETag differs between the anonymous and the paired answer. The config and list answers carry `Cache-Control: private, no-cache` and `Vary: Cookie, Authorization`.
  - `presenceHidden: true` exactly when something was removed. In the list, a `calvin_kiosk` cookie unlocks only its own row.
  - The list keeps `lastSeen`, findings, `agentHolds` and `agentPairs` for anonymous callers, and hides `powerHold`, `overrides.screenNow` and `displayCheckActive` on gated rows.
  - `GET .../screen-power` on a gated screen with a plain read key → 403 `insufficient_scope`. `PUT` on a gated, unpaired screen → 200 with `paired: false`.
  - Setting `kioskPairing` through a kiosk's overrides layer does not change `pairing_mode()`.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement. Project first, then strip, so `project_hold` stays as is. **Step 4:** PASS. **Step 5:** Snapshot and `gen:api`.
- [ ] **Step 6:** Commit `feat(backend): show presence only to the screen itself once gated (calvin-0xns)`.

### Task 6: ⚠ Write gate: polls, screen-sleep, display-check report

**Files:**
- Modify `kiosks.py` (`get_kiosk_config` record branch, `kiosk_screen_sleep`, `post_display_check_report`), `kiosk_auth.py` (`require_screen_itself`) and `kiosk_registry.py`.
- Tests: `backend/tests/integration/test_api_kiosk_gate.py` (new), and new functions in `tests/integration/test_route_policy.py`.

**Interfaces — Produces:**
- `async require_screen_itself(request, kiosk_id) -> None`. It raises 401 `kiosk_unpaired` when the screen is gated and the principal is not `kiosk_id`.
- `record_kiosk` is called only when the screen is not gated, or the caller is the screen itself.
- `browser_seen: dict[str, tuple[float, bool]]`, filled only from browser polls (`khost` set, `kagent` unset) whose peer is in the row's `peer_ips`, and read into `kioskAuth.browser` (`"unknown"` after 180 s without a browser poll).

- [ ] **Step 1: failing tests**
  - `test_forged_poll_on_gated_screen_writes_nothing`: snapshot the row, send `?khost=x&kagent=y&kstat=error&kmsg=forged&kfeat=&vw=1&vh=1` from another address, and the row is equal afterwards (`peer_ips`, `agent_features`, `last_seen` included). Run it in required mode for an unknown id too → no row.
  - `test_paired_screen_old_agent_poll_is_read_only`: a poll with no bearer → 200, nothing written.
  - The screen's own poll writes as today, including `kfeat`.
  - `screen-sleep` on a gated screen:
    - no credential → 401;
    - another screen's bearer → 401;
    - an admin session → 401;
    - the screen's bearer → 200 and its sessions locked.
  - `screen-sleep` on an ungated screen keeps today's peer check (the existing tests pass unchanged).
  - The display-check report on a gated screen: without the screen's bearer → 401, even with the right run id; with it and the right id → 200; with it and a wrong id → 409.
  - `test_every_kiosk_route_calls_require_screen_itself` (patch the function and assert it is called for each `KIOSK_ROUTES` entry).
  - `browser_seen`: a cookie-less browser poll from a recorded peer → `kioskAuth.browser == "unpaired"` in the screen's answer; from a foreign address → stays `"unknown"`.
  - `kiosk_for_peer` never returns a gated screen for an address only a forged poll used.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement. **Step 4:** PASS.
- [ ] **Step 5:** Commit `feat(backend): only a paired screen reports for itself (calvin-0xns)`.

### Task 7: Household mode setting

**Files:**
- Modify `backend/app/api/routes/config.py` (accept `kioskPairing` in `ConfigUpdate` as `Literal["optional","required"]`).
- Test: new functions in an existing config test.

- [ ] **Step 1: failing tests**
  - Anonymous `POST /api/config {"kioskPairing": "required"}` → 401.
  - Admin → 200, and `pairing_mode()` is `"required"`.
  - `"sometimes"` → 422.
  - The key is absent from `CONFIG_DISPLAY_KEYS` (pin).
- [ ] **Step 2-4:** FAIL → implement → PASS.
- [ ] **Step 5:** Commit `feat(backend): household choice to accept only paired screens (calvin-0xns)`.

### Task 8: ⚠ Backup carries pairings

**Files:**
- Modify `backup/format.py` (`KioskRow.pairing: dict | None = None`), `exporter.py` and `restorer.py` (`_restore_kiosks`).
- Tests: `tests/unit/test_backup_format.py`, `tests/integration/test_backup_restore.py` (new functions).

- [ ] **Step 1: failing tests**
  - Export: a paired row has `pairing == {"credentialHash", "pairedAt"}`, and an unpaired row has no `pairing`.
  - Nothing in memory is exported: pending pairings and install codes.
  - A round trip onto an empty DB → the screen is paired, and its old bearer passes `kiosk_principal`.
  - `test_restore_keeps_current_pairing`: the row is paired with hash B and the backup holds hash A → B stays.
  - The row is unpaired and the backup holds A → it stays unpaired.
  - An older backup (no `pairing`) → the screens are unpaired, with no error.
  - An existing row is updated with `_columns=["hostname", "overrides"]` only (spy on `update`).
  - A `replace` restore of a backup without `kioskPairing` keeps the current `"required"`; a backup with `"optional"` sets it.
  - A malformed `credentialHash` (not 64 hex) → ignored with a warning.
  - The restore summary reports `pairedScreens: N`.
- [ ] **Step 2-4:** FAIL → implement → PASS.
- [ ] **Step 5:** Commit `feat(backend): backups keep screens paired (calvin-0xns)`.

### Part B review

- [ ] Full backend checks, as in Part A.
- [ ] superpowers:requesting-code-review on the Part B diff. Checklist: Tasks 5, 6 and 8, the design's section 7 table row by row, section 8, and Review Focus lines 1 and 5.
- [ ] Open PR 2 as a draft.

## Part C: agent, units, installer (PR 3)

### Task 9: ⚠ Display agent: secret, bearer, pairing, browser restart

**Files:**
- Modify `deploy/kiosk-agent/calvin_display_agent.py`.
- Test `deploy/kiosk-agent/test_display_agent.py`.

**Interfaces — Produces:**
- `CREDENTIAL_FILE = os.path.join(RUNTIME_STATE_DIR, "kiosk-credential")`
- `INSTALL_CODE_FILE = os.path.join(RUNTIME_STATE_DIR, "install-pair-code")`
- `AGENT_FEATURES = ("hold", "pair")`
- `load_or_create_secret(path=CREDENTIAL_FILE) -> str | None`. It writes atomically with mode 0600, and returns None when the directory is not writable (the agent then runs as an old agent would).
- `rotate_secret(path) -> str | None`
- `PAIRED_MARKER = os.path.join(RUNTIME_STATE_DIR, "kiosk-paired")`
- `class Pairing` with `on_config(cfg, now)` and `step(backend_url, opener, now)`. `state` is one of `"unknown"`, `"pairing"`, `"paired"` or `"unsupported"`.
- `auth_headers() -> dict`: empty while the bearer is suspended.
- `post_pair(backend_url, secret, install_code=None, opener=None) -> dict | None`
- `BrowserRestart(cooldown=600)` with `observe(browser_state, paired, now) -> bool` ("restart now").

- [ ] **Step 1: failing tests**
  - The secret is created once, has mode 0600 and matches the regex. A garbled file is replaced.
  - An unwritable directory → None, and polls go out with no bearer.
  - `fetch_config`, `post_screen_sleep` and `post_display_check` send `Authorization: Bearer <secret>` (stub opener records the headers). `kfeat=hold,pair` is on the URL.
  - A 401 with `invalid_api_key` on any of them → the bearer is suspended for 3600 s and the request is repeated once without it.
  - Pairing starts only after a config answer with `kioskAuth`.
  - `state == "unpaired"` → `post_pair` at most once per poll. With the install-code file → it is sent once, then the file is removed after `paired` or `install_code_invalid`.
  - `test_unpaired_answer_rotates_secret_once`: an agent that had seen `paired` (marker written) gets `unpaired` → `rotate_secret` is called once, the marker is removed, and pairing restarts. A second `unpaired` → no second rotation until it is paired again. A pending agent (no marker) never rotates.
  - Creating or rotating the secret restarts the browser once (`test_new_secret_restarts_browser_once`). A stopped unit is not restarted.
  - `409 setup_required` and `409 screen_has_agent` → try again on the next poll, with no rotation.
  - An answer it doesn't understand, or a network error → no change, try again next poll.
  - `test_browser_unpaired_twice_restarts_once_per_cooldown`: `browser: "unpaired"` on two polls in a row while paired → a restart. Two more within 600 s → no restart. `unknown` never restarts.
  - The restart uses `restart_kiosk_unit` for both browsers. `KIOSK_UNITS` gains `calvin-cog.service`, and an inactive unit is skipped (stubbed `kiosk_unit_state`). No `sudo` is called.
  - No log line contains the secret (capture `log`).
- [ ] **Step 2:** `lane-heavy python3 -m pytest -q deploy/kiosk-agent/test_display_agent.py` → FAIL. **Step 3:** Implement. **Step 4:** PASS.
- [ ] **Step 5:** Commit `feat(kiosk): display agent pairs with its own secret (calvin-0xns)`.

### Task 10: ⚠ Units, cog helper, installer and bake

**Files:**
- Modify `deploy/systemd/calvin-kiosk-remote.service`, `deploy/systemd/calvin-cog.service`, `deploy/kiosk-agent/install-kiosk.sh` (`--pair-code`, and the baked `__PAIR_CODE__` placeholder), `scripts/setup-kiosk.sh` (`--pair-code` writes `install-pair-code` 0600 `calvin`; never deletes `/var/lib/calvin/agent`) and `scripts/bake-kiosk-firstrun.sh` (`--pair-code`).
- Tests: `scripts/tests/test_kiosk_units.sh`, `test_install_kiosk.sh`, `test_kiosk_id_persists.sh`, `test_bake_kiosk_firstrun_args.sh` and `test_update_kiosk_cog.sh` (new cases).

- [ ] **Step 1: failing tests (bats)**
  - Each unit's start URL ends with `#pair=<secret>` when the credential file holds a valid secret. With a missing file, or one holding `clv_kiosk_x' ; rm -rf /` or a newline, it has no fragment.
  - The secret appears only after `#`, never in the query.
  - `setup-kiosk.sh --pair-code clv_pair_…` writes the file with mode 0600 and owner `calvin`. A malformed code → exit non-zero, nothing written.
  - A reinstall keeps an existing `kiosk-credential` byte for byte.
  - `install-kiosk.sh` passes `--pair-code` through. The baked placeholder is replaced only with a valid code.
  - `setup-kiosk.sh` writes `install-pair-code` only after `bootstrap_kiosk` (order test with stubbed steps).
  - No sudoers file changes (pin: the installed sudoers fragments are byte-identical to `develop`).
  - The bake script accepts `--pair-code` and refuses a malformed one.
- [ ] **Step 2:** `cd scripts && lane-heavy bats tests/` → the new cases FAIL. **Step 3:** Implement. **Step 4:** PASS.
- [ ] **Step 5:** Commit `feat(kiosk): hand the pairing secret to the kiosk browser (calvin-0xns)`.

### Task 11: Bundle and manifest

**Files:**
- Modify `backend/app/services/kiosk_bundle.py` (only if a new file joins the bundle; the units and the helper are already in it).
- Test `tests/unit/test_kiosk_bundle.py`.

- [ ] **Step 1:** A test that the bundle manifest lists `calvin-kiosk-remote.service` and `calvin-cog.service` (pin). The agent's one-time browser restart, not the Update, applies the cog unit's new start URL (design section 6).
- [ ] **Step 2-4:** FAIL or already PASS → implement any gap → PASS.
- [ ] **Step 5:** Commit if anything changed.

### Part C review

- [ ] `cd scripts && lane-heavy bats tests/`, the agent tests, and the backend bundle tests.
- [ ] superpowers:requesting-code-review on the Part C diff. Checklist: Tasks 9 and 10, shell quoting of every value read from a file, that no sudo rule changed, and Review Focus lines 2 and 3. The review checks that nothing runs `scripts/setup*.sh` or `update-kiosk.sh` for real.
- [ ] Open PR 3 as a draft.

## Part D: UI spec by the design lead (design gate)

### Task 12: Design lead's `docs(design)` PR

**Owner:** the standing design lead lane, not the builder.

- [ ] **Step 1:** Hand the design lead the design's section 13 ("What people must be able to do"), the section 7 table, and the API from Parts A and B (`kioskAuth`, `GET/POST .../pair`, `POST /api/kiosks/pairings`, `DELETE .../pairing`, `POST /api/kiosks/install-codes`, the list fields `paired`/`pairedAt`/`agentPairs`, and the `kioskPairing` setting).
- [ ] **Step 2:** The design lead ships a `docs(design)` PR with the spec and mocks for:
  - the kiosk pairing card;
  - the Screens states and banner;
  - Pair a screen;
  - Unpair;
  - Only paired screens;
  - the install command in Add a screen.

  The PR gives the copy, the states, 800×480 and phone layouts, and both themes.
- [ ] **Step 3:** **That PR is merged before Task 13 or Task 14 starts.** Questions the spec leaves open go to the design lead.

## Part E: kiosk browser (PR 4)

### Task 13: ⚠ Fragment hand-off and the pairing card

**Files:**
- Modify `frontend/src/utils/kioskId.js`, `frontend/src/main.js` and `frontend/public/sw.js`.
- Create `frontend/src/stores/kioskPairing.js` and the card component that Task 12's spec names.
- Tests: vitest `frontend/tests/unit/utils/kioskId.pairing.spec.js` (new) and `frontend/tests/unit/stores/kioskPairing.spec.js` (new); Playwright `frontend/tests/e2e/kiosk-pairing.spec.js` (new, chromium project, `E2E_PORT` set).

**Interfaces — Consumes:** Task 3's routes and Task 5's `kioskAuth`. **Produces:** `takePairFragment() -> string | null` (reads and removes the fragment synchronously), `usePairingStore()` with `state`, `code`, `expiresAt`, `start()` and `poll()`.

- [ ] **Step 1: failing tests**
  - Vitest:
    - after `captureKioskIdentity()`, `location.hash` is empty and `history.replaceState` was called before any `api` request (spy order);
    - the secret is posted once, as a bearer, to `browser-session`;
    - it is absent from `sessionStorage`, `localStorage` and the Pinia state (serialize every store).
  - A malformed fragment is removed and never posted.
  - The store polls `GET .../pair` every 10 s while `pending`, and stops when `paired`.
  - A browser-only screen (`hasAgent: false`, `state: "unpaired"`) calls `POST .../pair {"browser": true}` once. With `hasAgent: true` it never does.
  - With no `?kiosk=`, nothing happens.
  - Against an old server (`browser-session` 401/404), it fails quietly: the dashboard renders and the fragment is still gone.
  - Browser-only pairing starts only after three config answers in a row, at least 3 minutes apart in total, with `hasAgent: false`. Inside an iframe (`window.top !== window`) nothing happens.
  - `sw.js` does not cache `/pair`, `/browser-session` or `/pairings` (unit test on `isUncachedApi`).
  - Playwright: open `/?kiosk=kitchen&khost=k#pair=clv_kiosk_<43>` with routes intercepted. Then:
    - no request URL and no `Referer` header contains `clv_kiosk_`;
    - `page.url()` has no `#pair`;
    - the card appears with the mocked code, and disappears after the mocked approval.
- [ ] **Step 2:** `cd frontend && lane-heavy npx vitest run tests/unit/utils/kioskId.pairing.spec.js tests/unit/stores/kioskPairing.spec.js` → FAIL.
- [ ] **Step 3:** Implement per Task 12's spec.
- [ ] **Step 4:** PASS, then `E2E_PORT=5197 lane-heavy npx playwright test tests/e2e/kiosk-pairing.spec.js --project=chromium` → PASS.
- [ ] **Step 5:** Commit `feat(frontend): kiosk browser swaps its pairing secret for a cookie (calvin-0xns)`.

### Part E review

- [ ] Frontend checks: `npm run lint`, prettier, `lane-heavy npm run type-check`, `lane-heavy npx vitest run`, `lane-heavy npm run build`, `lane-heavy npm run test:e2e:a11y`.
- [ ] superpowers:requesting-code-review with Task 13 and the anti-goals on secrets and blank screens as the checklist.
- [ ] **The design lead reviews the UI PR before merge.**
- [ ] Open PR 4 as a draft.

## Part F: Settings and docs (PR 5)

### Task 14: Settings › Screens

**Files:**
- Modify `frontend/src/stores/kiosks.js` (`pairScreen(code)`, `unpairScreen(id)`, `newInstallCode()`, `setPairingMode(mode)`), `ScreensSettings.vue` and `AddKioskPanel.vue`, plus the parts Task 12's spec names.
- Tests: `frontend/tests/unit/components/ScreensSettings.pairing.spec.js` (new), `frontend/tests/unit/stores/kiosks.spec.js`, and the phone e2e mock (`tests/e2e/phone/fixtures/api-mock.js`) for the new routes.

- [ ] **Step 1: failing tests**
  - Each state from the design's section 7 renders the spec's copy for: paired, not paired, needs update, required-and-unpaired, and waiting to be paired (from `GET /api/kiosks/pairings`).
  - A row with `presenceHidden: true` is never shown as "no hold".
  - The banner counts only screens seen in the last 7 days.
  - Pair a screen posts the normalized code and shows the returned `displayName`. 404 and 429 show the spec's two messages.
  - Unpair asks for confirmation, then calls `DELETE`.
  - Turning on Only paired screens with an unpaired recent screen asks first and names it. Turning it off does not ask.
  - Add a screen shows `command` from `POST /api/kiosks/install-codes`, and **New code** mints another.
  - `noDevWords.spec.js` passes.
- [ ] **Step 2:** Run the specs → FAIL. **Step 3:** Implement per Task 12's spec. **Step 4:** PASS.
- [ ] **Step 5:** Commit `feat(frontend): pair and unpair screens in Settings (calvin-0xns)`.

### Task 15: Docs

**Files:**
- `docs/setup/KIOSK_INSTALL.md`: pairing, the install command with its code, signed installs recommended, reinstall, card swap, unpair a stolen screen, and what optional mode leaves open.
- `docs/setup/KIOSK_PROVISIONING.md`: the files on the Pi and `--pair-code`.
- `docs/configuration/ADMIN_AUTH.md`: the trust model, the new routes in "What needs the admin password", and the kiosk secret not being an API key.
- `docs/configuration/BACKUP_RESTORE.md`: the pairing fingerprints and the restore rule.
- `docs/integrations/HOME_AUTOMATION.md`: a gated, unpaired screen doesn't follow holds.

- [ ] **Step 1:** Write.
- [ ] **Step 2:** `lane-heavy uv run --directory backend -- mkdocs build --strict --config-file "$PWD/mkdocs.yml" --site-dir "$TMPDIR/site"` → no warnings.
- [ ] **Step 3:** Commit `docs: paired screens (calvin-0xns)`.

### Part F review

- [ ] Frontend checks as in Part E, plus mkdocs.
- [ ] superpowers:requesting-code-review. **The design lead reviews the UI PR before merge.**
- [ ] `scripts/check-commit-attribution.sh origin/develop..HEAD` before each PR.
- [ ] Open PR 5 as a draft.
