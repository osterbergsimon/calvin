# CSP Allowed-Origins Allowlist — Design

**Status:** Design / approved for planning
**Date:** 2026-07-15
**Branch:** `feature/csp-allowlist` (based on `develop`, which includes offline-kiosks Phase 1, PR #99)
**Tracks:** the admin-allowlist half of `calvin-qqx` (Phase 2 of the CSP single-attack-surface design, `docs/superpowers/specs/2026-07-15-offline-kiosks-csp-design.md`).

## Goal

Give the operator a Settings UI to declare **trusted origins** (domains / IPs) that
the kiosk browser is allowed to reach, and have those origins extend the
browser-enforced Content-Security-Policy that Phase 1 installed. This is the
admin-controlled escape hatch for the cases Phase 1's auto-derivation misses —
self-hosted services, asset hosts, or connections that aren't a first-class
configured web-service instance.

## Scope

**In scope:** a shared origin validator, a global config-backed allowlist store, CSP
integration (allowlist origins extend `frame-src` + `img-src` + `connect-src`), a
`GET/PUT /api/security/allowed-origins` API, and a new **Security** settings category
with an add/remove list editor.

**Out of scope (separate work):**
- The plugin-manifest `browser_origins` field — the *other* half of `calvin-qqx`; its
  own spec.
- Sealed mode (`calvin-bns`, Phase 3) — but the new Security settings category is the
  intended home for its future toggle.
- Per-kiosk allowlists — deferred; the config key is designed so a per-kiosk override
  layer can be added later without reworking the global list (see Per-kiosk-later).
- CIDR / IP-range support — not expressible in CSP; explicitly rejected.

## Background (Phase 1 recap)

- `SecurityHeadersMiddleware` (`backend/app/middleware/security_headers.py`) stamps a CSP
  on every non-exempt response, built by `build_csp(frame_origins)` in
  `backend/app/services/csp.py`.
- `frame-src` is already auto-derived from enabled built-in `iframe` web-service
  instances via `get_web_service_origins()`. So a configured web-service's origin is
  *already* allowed for framing — the manual allowlist is for everything auto-derivation
  does not cover.
- `origin_from_url` reduces a URL to a `scheme://host[:port]` origin (http/https only).
- `_BASELINE` holds the fixed self-only directives.

## What an allowlist entry is

A trusted **origin** the kiosk browser may reach, in any CSP host-source form:

| Form | Example | Accepted |
|---|---|---|
| bare host | `grafana.lab` | ✅ |
| host + port | `192.168.1.50:3000` | ✅ |
| subdomain wildcard | `*.lab.example.com` | ✅ |
| scheme + host [+ port] | `https://grafana.lab:3000` | ✅ |
| CIDR / IP range | `10.0.0.0/24` | ❌ (message: use a wildcard domain) |
| path / query / space / garbage | `grafana.lab/d/home`, `a b` | ❌ |

One **shared validator** is the authority. The frontend mirrors it for instant
feedback, but the API re-validates on save.

### Validator contract

`validate_origin(value: str) -> str` (new, in `csp.py` or a small `csp_origins.py`):
- Returns the **normalized** origin string to store, or raises `ValueError(reason)`.
- Normalization: trim whitespace; lowercase the host; preserve an explicit scheme and
  port; leave a scheme-less entry scheme-less (CSP allows `host[:port]` and
  `*.domain`); leave a wildcard prefix intact.
- Rejects: CIDR (`/` present with a numeric suffix, or any `/`), paths/query/fragment,
  spaces, empty, a bare `*`, and anything `urlsplit` can't resolve to a host.
- `is_valid_origin(value) -> bool` convenience wrapper for callers that only need a
  boolean.

## Storage

A single global config value via the existing `ConfigService`:
- Key: **`security_allowed_origins`**
- Value: JSON list of normalized origin strings (deduped, order preserved).
- Read: `await config_service.get_value("security_allowed_origins", [])`.
- Write: `await config_service.set_value("security_allowed_origins", origins, value_type="json")`.

## CSP integration

`build_csp` generalizes to accept the allowlist and apply it to the three
browser-reachable fetch/embed directives:

```python
def build_csp(frame_origins: list[str], allowed_origins: list[str] | None = None) -> str:
    # allowed_origins (admin allowlist) extend frame-src, img-src, connect-src.
    # frame_origins (auto-derived web-services) extend frame-src only.
```

- `frame-src` = `'self'` + `frame_origins` + `allowed_origins`
- `img-src`   = `'self' data:` + `allowed_origins`
- `connect-src` = `'self'` + `allowed_origins`
- All other `_BASELINE` directives unchanged. Each directive dedupes.

The `allowed_origins` default of `None`/`[]` means existing `build_csp(frame_origins)`
call sites and Phase-1 unit tests keep passing (baseline unchanged when the allowlist is
empty).

**Middleware** reads the allowlist alongside the web-service origins, both inside the
existing never-500 `try/except` (a config-read failure falls back to an empty allowlist
→ baseline-plus-web-services policy, never a 500):

```python
async def dispatch(self, request, call_next):
    response = await call_next(request)
    if _is_csp_exempt(request.url.path):
        return response
    try:
        frame_origins = await get_web_service_origins()
        allowed = await get_allowed_origins()   # reads security_allowed_origins
    except Exception:
        frame_origins, allowed = [], []
    response.headers["Content-Security-Policy"] = build_csp(frame_origins, allowed)
    return response
```

`get_allowed_origins() -> list[str]` (new, in `csp.py`): reads the config value, filters
each through the validator (defensively dropping anything malformed rather than emitting
an invalid CSP token), returns the clean list.

## API

New router `backend/app/api/routes/security.py`, mounted under `/api`:

- `GET /api/security/allowed-origins` → `{ "origins": ["grafana.lab", ...] }`
- `PUT /api/security/allowed-origins` — body `{ "origins": [...] }`; validates and
  normalizes every entry via the shared validator; on any invalid entry returns **422**
  with the offending value and reason and persists nothing (all-or-nothing); on success
  stores the normalized+deduped list and returns it.

Follows the existing route/error conventions (`ErrorResponse`, Pydantic request model).

## Frontend

New **Security** settings category:

- **Registry:** add `{ id: "security", label: "Security", icon: "🔒", subtitle: "Allowed
  domains · network access" }` to `settingsCategories` in
  `frontend/src/components/settings/settingsRegistry.js`, plus a `settingsDestinations`
  entry, wired to the component the same way existing categories are.
- **Component:** `frontend/src/components/settings/categories/SecuritySettings.vue` — an
  add/remove list editor for allowed origins:
  - Loads via `GET /api/security/allowed-origins`, saves via `PUT`.
  - Add field with **inline client-side validation** mirroring the server validator:
    accept the four valid forms; reject CIDR with the guidance message ("IP ranges aren't
    supported — use a wildcard domain like `*.lab.example.com`"), reject paths/garbage.
  - Each row shows the origin with a remove control. Save is explicit (PUT replaces the
    list); surface server 422s inline against the offending entry.
  - Brief explainer text: "Origins the kiosk may embed, load images from, or connect to.
    Everything else is blocked."
- **Data access:** follow the existing settings-category pattern for fetch/save (a small
  composable or the config store — match how sibling categories do it; do not hand-roll a
  new pattern).

## Data flow

Admin edits list in Security settings → validated `PUT /api/security/allowed-origins` →
`security_allowed_origins` in `ConfigDB` → `SecurityHeadersMiddleware` reads it on the
next response → effective CSP includes those origins in `frame-src`/`img-src`/`connect-src`
→ the kiosk may reach them on its next page load.

## Per-kiosk-later

The global key `security_allowed_origins` stays as-is. A future per-kiosk layer adds a
per-kiosk override store (keyed by `CALVIN_KIOSK_ID`, alongside the `calvin-dd9` per-kiosk
config model) and the middleware merges `global + per-kiosk` based on the `?kiosk=<id>`
already present on kiosk requests. No change to the global list's shape is required.

## Error handling

- Invalid entry on PUT → 422 with the offending value + reason; nothing persisted.
- CIDR explicitly rejected (validator) with the wildcard-domain guidance.
- Config-read failure in the middleware → caught by the existing never-500 guard →
  falls back to an empty allowlist (baseline + web-services), never a 500.
- `get_allowed_origins` defensively drops any stored value that fails validation, so a
  hand-edited/corrupt config can never produce a malformed CSP token.

## Testing

**Backend unit (`test_csp.py` / new `test_csp_origins.py`):**
- Validator accepts `grafana.lab`, `*.lab.example.com`, `https://grafana.lab:3000`,
  `192.168.1.50:3000`; rejects `10.0.0.0/24`, `grafana.lab/d/home`, `a b`, ``, `*`.
- `build_csp(frame_origins, allowed)` puts each allowlist origin in `frame-src`,
  `img-src`, and `connect-src`, and dedupes; `build_csp(frame_origins)` (no allowlist)
  is byte-identical to the Phase-1 output.

**Backend integration (`test_security_allowlist.py`):**
- `PUT` with valid origins persists and `GET` returns them.
- `PUT` with a CIDR / malformed entry → 422, nothing persisted.
- After setting an allowlist, a response's CSP header contains the origin in `frame-src`,
  `img-src`, and `connect-src`.
- A stored-but-corrupt config value does not break the header (defensive filter).

**Frontend (`SecuritySettings.spec.js`):**
- Renders existing origins from `GET`; add/remove updates the list; save issues `PUT`
  with the current list.
- Client-side validation blocks CIDR and malformed input with the guidance message.
- A server 422 surfaces inline.

## File map

| Area | Path | Change |
|---|---|---|
| Validator + CSP | `backend/app/services/csp.py` | add `validate_origin`/`is_valid_origin`, `get_allowed_origins`; generalize `build_csp` |
| Middleware | `backend/app/middleware/security_headers.py` | read + pass allowlist (inside existing try/except) |
| API | `backend/app/api/routes/security.py` | new `GET/PUT /api/security/allowed-origins` |
| API wiring | `backend/app/api/routes/__init__.py` (or main router include) | mount the security router |
| Settings registry | `frontend/src/components/settings/settingsRegistry.js` | add Security category + destination |
| Settings UI | `frontend/src/components/settings/categories/SecuritySettings.vue` | new allowlist editor |
| Tests | as listed above | unit + integration + component |
