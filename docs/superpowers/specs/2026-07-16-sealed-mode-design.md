# Sealed Mode — Design

**Status:** Design / approved for planning
**Date:** 2026-07-16
**Branch:** `feature/sealed-mode` (off `develop`, which includes offline-kiosks Phase 1 #99 + Phase 2 #102)
**Tracks:** the sealed-mode half of `calvin-bns` (Phase 3 of the offline-kiosks CSP design, `docs/superpowers/specs/2026-07-15-offline-kiosks-csp-design.md`). The Phase-3 CI contract test is explicitly deferred (see Non-goals).

## Goal

Give the operator an opt-in lockdown switch that collapses the kiosk
Content-Security-Policy to **self-only** — no web-service embeds, no admin
allowlist, no plugin `browser_origins`. A sealed kiosk talks to nothing but its
Calvin server. This is a deliberate, honest trade: a sealed kiosk shows only
calendars / photos / local-data plugins, and cannot show external web-service
embeds or any plugin that declares `browser_origins`.

## Guiding principle

Sealed mode is enforced in two layers, in priority order:

1. **Browser-enforced (the backstop):** the CSP served to the kiosk collapses to
   the baseline self-only policy. This is the property that actually holds
   regardless of plugin-author discipline or UI state.
2. **Honest UX (defense against foot-guns):** the operator cannot *enable* a
   plugin that declares `browser_origins` while sealed, so they don't end up
   with a silently browser-blocked widget.

## Scope

**In scope:** a global `sealed_mode` config flag; middleware CSP suppression when
sealed; a `GET/PUT /api/security/sealed-mode` API; an enable-time guard that
refuses to enable a `browser_origins` plugin while sealed; a sealed-mode toggle
in the existing Security settings category.

**Out of scope (Non-goals):**
- **Per-kiosk sealed mode.** The `SecurityHeadersMiddleware` has no per-request
  kiosk context today (CSP is stamped on every response with no `kiosk_id`).
  Per-kiosk lockdown needs `?kiosk=<id>` → `KioskDB.overrides` plumbing that does
  not exist yet — deferred to epic `calvin-dd9`. This phase is **global-only**.
- **Force-disabling already-enabled plugins** when sealed mode is switched on.
  Their external content is already neutered by the CSP backstop; we do not flip
  their `enabled` state. (The Security UI notes they exist — see Frontend.)
- **The CI contract test** ("a plugin's built bundle + sample payload references
  no origin outside its declared `browser_origins`"). Deferred: `dist.js` is
  minified (URL scanning is false-positive-prone against vendored code and
  comments), no plugin ships a sample payload, and no shipping plugin declares
  `browser_origins` yet — so there is nothing to catch today. The existing AST
  validator already enforces that declared `browser_origins` are well-formed
  host-sources. Filed as a scoped follow-up.

## Background (current state, post-#102)

- `SecurityHeadersMiddleware` (`backend/app/middleware/security_headers.py`)
  stamps a CSP on every non-exempt response, built by
  `build_csp(frame_origins, allowed_origins)` in `backend/app/services/csp.py`.
- The middleware currently unions three origin sources inside a never-500
  `try/except` (falling back to `[], [], []` on any error):
  `get_web_service_origins()` (auto-derived iframe embeds) → `frame_origins`;
  `get_allowed_origins()` (admin allowlist) + `get_plugin_browser_origins()`
  (enabled plugins' declared origins) → `allowed`.
- `build_csp([], [])` is exactly the baseline self-only policy (Phase 1 output).
- `ConfigService` (`backend/app/services/config_service.py`) is the global
  key-value store: `get_value(key, default)` / `set_value(key, value, value_type)`,
  with `value_type` auto-detected (`"bool"` for booleans).
- Plugin enable/disable flows through `plugins/management.py` (the plugin-type
  update path that sets `enabled`); a plugin's declared origins are on its
  class `metadata.browser_origins` (reachable via the plugin loader/manager).

## Design

### 1. The flag

- Config key **`sealed_mode`**, boolean, default `False`.
- Read: `await config_service.get_value("sealed_mode", False)`.
- Write: `await config_service.set_value("sealed_mode", value, value_type="bool")`.
- Helper `get_sealed_mode() -> bool` (in `csp.py`, next to `get_allowed_origins`):
  reads the config value and coerces to a plain `bool` (a stored non-bool → treat
  truthiness defensively; but persisted values are always bool via the API).

### 2. CSP suppression (middleware)

```python
async def dispatch(self, request, call_next):
    response = await call_next(request)
    if _is_csp_exempt(request.url.path):
        return response
    try:
        if await get_sealed_mode():
            # Sealed: collapse to baseline self-only — no embeds, allowlist, or
            # plugin origins reach the kiosk browser.
            frame_origins, allowed, plugin_origins = [], [], []
        else:
            frame_origins = await get_web_service_origins()
            allowed = await get_allowed_origins()
            plugin_origins = await get_plugin_browser_origins()
    except Exception:
        # Never 500. Note the fallback is already the sealed/self-only shape, so
        # a config/DB hiccup fails toward locked-down, not open.
        logger.warning("CSP origins lookup failed; falling back to baseline self-only policy")
        frame_origins, allowed, plugin_origins = [], [], []
    response.headers["Content-Security-Policy"] = build_csp(
        frame_origins, [*allowed, *plugin_origins]
    )
    return response
```

- When sealed, `build_csp([], [])` emits the baseline self-only policy —
  byte-identical to the unsealed empty-config output.
- The exception fallback is unchanged in shape (`[], [], []`), so it now doubles
  as the fail-safe: any error → self-only, the safe direction.

### 3. Block-enable guard (plugin management)

- In the plugin enable path (`backend/app/api/routes/plugins/management.py`),
  before a request sets a plugin `enabled = True`:
  - If `await get_sealed_mode()` is `True` **and** the target plugin's
    `metadata.browser_origins` is non-empty → raise `HTTPException(status_code=403,
    detail="Cannot enable a plugin that declares browser_origins while sealed mode
    is on. Disable sealed mode first (Settings → Security).")` and change nothing.
- Only the enable→True transition is guarded. Disabling, or updating an
  already-enabled plugin's config without changing `enabled`, is unaffected.
- The plugin's declared origins are read from its class metadata via the loader
  (`plugin_loader.get_plugin_class(type_id).metadata.browser_origins`) — the same
  source `get_plugin_browser_origins` reads. A plugin with no metadata or empty
  `browser_origins` is never blocked.

### 4. API (`backend/app/api/routes/security.py`)

Add to the existing security router:

- `GET /api/security/sealed-mode` → `{ "sealed_mode": <bool> }`
- `PUT /api/security/sealed-mode` — body `{ "sealed_mode": <bool> }`; persists via
  `set_value("sealed_mode", value, value_type="bool")`; returns the stored value.
- `SealedModeBody(BaseModel)` with a single `sealed_mode: bool` field. Follows the
  existing `AllowedOriginsBody` conventions.

### 5. Frontend (`SecuritySettings.vue` + `stores/security.js`)

- **Store:** add `fetchSealedMode() -> Promise<bool>` (`GET`, returns
  `response.data?.sealed_mode ?? false`) and `saveSealedMode(value)` (`PUT`
  `{ sealed_mode }`).
- **Component:** a sealed-mode toggle at the **top** of the Security category
  (it is the master switch), with `data-test="sealed-mode-toggle"`:
  - Loads via `fetchSealedMode` on mount alongside the allowlist.
  - Explainer: "Sealed mode locks the kiosk to your Calvin server only — no
    external embeds, allowed origins, or plugins that reach outside. Calendars,
    photos, and local-data plugins keep working."
  - When on, the allowlist editor below is visibly marked inactive (dimmed +
    "Ignored while sealed mode is on") — the allowlist is preserved (not cleared),
    just not applied. Toggling sealed off restores it.
- No change to the plugin-enable UI is required beyond surfacing the API error:
  the 403 from §3 is rendered by the existing plugin-action error handling. (Verify
  during implementation; if the existing handler swallows the detail, surface it.)

## Data flow

Operator flips the sealed toggle → `PUT /api/security/sealed-mode` → `sealed_mode`
in `ConfigDB` → on the next response `SecurityHeadersMiddleware` reads it and emits
the self-only CSP → the kiosk is locked down on its next page load. Independently,
while sealed, an attempt to enable a `browser_origins` plugin is refused at the API.

## Error handling

- `PUT` with a non-bool body → FastAPI/Pydantic 422 (typed `bool` field).
- Config-read failure in the middleware → caught by the existing never-500 guard →
  self-only policy (which is also the sealed output) — fail-safe.
- Enable guard: 403 with an actionable message; nothing persisted.
- `get_sealed_mode` treats a missing/corrupt config value as `False` only via the
  `default`; a stored bool is authoritative.

## Testing

**Backend unit (`test_csp.py`):**
- `get_sealed_mode()` returns the stored bool; missing key → `False`.

**Backend integration (`test_security_headers.py`):**
- With `sealed_mode` config `True`, the CSP on `/api/health` is baseline self-only
  (`frame-src 'self'` with no origins) **even when** an enabled iframe web-service,
  an admin allowlist entry, and a plugin `browser_origins` are all present.
- With `sealed_mode` `False`/absent, those origins appear (regression guard —
  proves sealed mode is what suppressed them).

**Backend integration (sealed-mode API + enable guard):**
- `GET` defaults to `{"sealed_mode": false}`; `PUT true` persists and `GET`
  returns it; `PUT false` restores.
- With sealed on, enabling a plugin whose metadata declares `browser_origins` →
  403, nothing changed; enabling a plugin with empty `browser_origins` → allowed;
  with sealed off, the `browser_origins` plugin enables normally.

**Frontend (`SecuritySettings.spec.js`):**
- Toggle renders current state from `GET`, saves via `PUT` on change.
- When sealed on, the allowlist editor is marked inactive.

## File map

| Area | Path | Change |
|---|---|---|
| Flag helper | `backend/app/services/csp.py` | add `get_sealed_mode()` |
| Middleware | `backend/app/middleware/security_headers.py` | sealed branch → self-only |
| Enable guard | `backend/app/api/routes/plugins/management.py` | 403 on enabling a `browser_origins` plugin while sealed |
| API | `backend/app/api/routes/security.py` | `GET/PUT /api/security/sealed-mode` + `SealedModeBody` |
| Store | `frontend/src/stores/security.js` | `fetchSealedMode` / `saveSealedMode` |
| Settings UI | `frontend/src/components/settings/categories/SecuritySettings.vue` | toggle + dim allowlist when sealed |
| OpenAPI/types | `backend/tests/contract/openapi.json`, `frontend/src/api/types.ts` | regenerate for the new route |
| Tests | as listed above | unit + integration + component |
| Follow-up issue | (beads) | file the deferred CI bundle-scan; annotate `calvin-bns` |
