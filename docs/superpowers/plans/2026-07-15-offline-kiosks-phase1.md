# Offline Kiosks — Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close today's kiosk→public-internet leaks and ship a browser-enforced baseline Content-Security-Policy so the kiosk browser only ever connects to the Calvin server (`'self'`) plus its own configured web-service origins.

**Architecture:** (1) Route remote images through the existing `/api/images/{id}` server proxy instead of handing raw CDN URLs to `<img src>`. (2) Delete deprecated OpenWeatherMap references. (3) Add a `SecurityHeadersMiddleware` that stamps every response with a CSP whose `frame-src` is derived at request time from the currently-configured built-in web-service (`iframe`) instances.

**Tech Stack:** Backend — FastAPI, Starlette `BaseHTTPMiddleware`, Ormar (SQLite), pytest (`uv run pytest`). Frontend — Vue 3, Pinia, Vitest.

## Global Constraints

- **"Remote" = "not `self`".** Never classify hosts by LAN-vs-internet. The only trusted origin is the Calvin server; everything else reaches the browser only via the server (proxied) or an explicit whitelist.
- **CSP host-sources only** for `frame-src` origins: `scheme://host[:port]`. No CIDR, no path.
- **Backend tests:** `cd backend && uv run pytest`. Markers: `@pytest.mark.unit`, `@pytest.mark.integration`. `asyncio_mode = "auto"` (async tests need no decorator).
- **Frontend tests:** `cd frontend && npm run test` (Vitest, jsdom).
- **Phase 1 does NOT add** the `browser_origins` manifest field, the system-settings admin allowlist, sealed mode, or the CI contract test — those are Phase 2/3. Keep scope to leaks + baseline CSP.
- **Commit after every task** with the shown message.

---

### Task 1: Route remote images through the server proxy (frontend)

The images store currently returns a raw remote CDN URL to `<img src>` for remote
images (picsum/unsplash/nasa-apod), bypassing the existing cached proxy at
`GET /api/images/{id}`. Make it always use the proxy. Existing tests assert the leak
behavior and must be flipped.

**Files:**
- Modify: `frontend/src/stores/images.js:157-169` (the `getImageUrl` function)
- Test: `frontend/tests/unit/stores/images.spec.js:218-270` (the `getCurrentImageUrl` describe block)

**Interfaces:**
- Consumes: nothing new.
- Produces: `getImageUrl(image)` returns `` `/api/images/${image.id}` `` for any image with an `id`, or `null` when `image` is falsy. No `http(s)://` value is ever returned.

- [ ] **Step 1: Update the existing tests to assert the proxied behavior**

In `frontend/tests/unit/stores/images.spec.js`, replace the three remote-URL test
cases (currently at lines ~230–262) so they assert the proxy path. Replace the block
from `it("should return direct URL for remote images"...` through the end of the
`it("should use raw_url if url is not available"...` case with:

```javascript
    it("should return API proxy URL for remote images (never a raw CDN URL)", () => {
      const store = useImagesStore();
      store.currentImage = {
        id: "1",
        filename: "image.jpg",
        url: "https://picsum.photos/id/123/800/600",
      };

      expect(store.getCurrentImageUrl).toBe("/api/images/1");
    });

    it("should return API proxy URL even when only raw_url is present", () => {
      const store = useImagesStore();
      store.currentImage = {
        id: "1",
        filename: "image.jpg",
        raw_url: "https://picsum.photos/id/123/1920/1080",
      };

      expect(store.getCurrentImageUrl).toBe("/api/images/1");
    });
```

Leave the `"should return API URL for local images (no URL field)"` and
`"should return null when no current image"` cases unchanged.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd frontend && npm run test -- images.spec.js`
Expected: FAIL — the two updated cases still receive `https://picsum.photos/...`
because `getImageUrl` returns the raw URL.

- [ ] **Step 3: Make `getImageUrl` always use the proxy**

In `frontend/src/stores/images.js`, replace the `getImageUrl` function
(lines 157–169) with:

```javascript
  const getImageUrl = image => {
    if (!image) return null;
    // Always serve images through the Calvin server proxy (/api/images/{id}).
    // Remote CDN URLs (picsum/unsplash/nasa-apod) are cached + served by the
    // backend so the kiosk browser never contacts an external origin directly.
    // See docs/superpowers/specs/2026-07-15-offline-kiosks-csp-design.md.
    return `/api/images/${image.id}`;
  };
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd frontend && npm run test -- images.spec.js`
Expected: PASS — all `getCurrentImageUrl` cases green, including the local-image and
null cases.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/stores/images.js frontend/tests/unit/stores/images.spec.js
git commit -m "fix(kiosk): serve remote images through /api proxy, never raw CDN URL"
```

---

### Task 2: Delete deprecated OpenWeatherMap references (frontend)

`WeatherWidget.vue` is dead code (imported nowhere) that loads icons from
`openweathermap.org`; `index.html` has a `dns-prefetch` to the same host. OpenWeatherMap
is deprecated legacy. Remove both so no kiosk-side reference to that origin remains.

**Files:**
- Delete: `frontend/src/components/WeatherWidget.vue`
- Modify: `frontend/index.html:14` (remove the `dns-prefetch` line)

**Interfaces:**
- Consumes: nothing.
- Produces: no source reference to `openweathermap.org` anywhere under `frontend/`.

- [ ] **Step 1: Confirm `WeatherWidget.vue` is unreferenced**

Run: `cd frontend && grep -rn "WeatherWidget" src --include=*.vue --include=*.js | grep -v "components/WeatherWidget.vue:"`
Expected: no output (nothing imports it).

- [ ] **Step 2: Delete the dead component**

```bash
git rm frontend/src/components/WeatherWidget.vue
```

- [ ] **Step 3: Remove the dns-prefetch line**

In `frontend/index.html`, delete line 14:

```html
    <link rel="dns-prefetch" href="https://openweathermap.org" />
```

- [ ] **Step 4: Verify no OpenWeatherMap references remain and the app still builds**

Run: `cd frontend && grep -rin "openweathermap" src index.html public; echo "grep-exit:$?"`
Expected: no matches (`grep-exit:1`).
Run: `cd frontend && npm run test`
Expected: PASS — full frontend suite green (nothing depended on the deleted widget).

- [ ] **Step 5: Commit**

```bash
git add -A frontend/index.html
git commit -m "chore(kiosk): remove deprecated OpenWeatherMap widget and dns-prefetch"
```

---

### Task 3: CSP builder + web-service origin reader (backend)

A small, pure-where-possible service module: parse an origin from a URL, build the CSP
string from a list of `frame-src` origins, and read the configured built-in
web-service (`iframe`) origins from the database.

**Files:**
- Create: `backend/app/services/csp.py`
- Test: `backend/tests/unit/test_csp.py`

**Interfaces:**
- Consumes: `PluginDB` from `app.models.db_models` (fields: `type_id`, `enabled`, `config` dict with optional `"url"`).
- Produces:
  - `origin_from_url(url: str | None) -> str | None` — returns `"scheme://host[:port]"` or `None` if the value has no scheme+host.
  - `build_csp(frame_origins: list[str]) -> str` — returns the full CSP header value; `frame-src` is `'self'` plus the given origins (deduped, order preserved).
  - `async get_web_service_origins() -> list[str]` — distinct origins of enabled `type_id="iframe"` instances, sorted.

- [ ] **Step 1: Write the failing unit tests**

Create `backend/tests/unit/test_csp.py`:

```python
"""Unit tests for the CSP builder + origin parser."""

import pytest

from app.services.csp import build_csp, origin_from_url


@pytest.mark.unit
class TestOriginFromUrl:
    def test_https_host_and_path_reduced_to_origin(self):
        assert origin_from_url("https://grafana.lab/some/path") == "https://grafana.lab"

    def test_keeps_explicit_port(self):
        assert origin_from_url("http://192.168.1.50:3000/x") == "http://192.168.1.50:3000"

    def test_none_for_empty(self):
        assert origin_from_url("") is None
        assert origin_from_url(None) is None

    def test_none_for_schemeless(self):
        assert origin_from_url("grafana.lab:3000") is None


@pytest.mark.unit
class TestBuildCsp:
    def test_baseline_contains_self_directives(self):
        csp = build_csp([])
        assert "default-src 'self'" in csp
        assert "img-src 'self' data:" in csp
        assert "connect-src 'self'" in csp
        assert "font-src 'self'" in csp
        assert "frame-src 'self'" in csp

    def test_frame_src_includes_given_origins(self):
        csp = build_csp(["https://grafana.lab", "http://192.168.1.50:3000"])
        assert "frame-src 'self' https://grafana.lab http://192.168.1.50:3000" in csp

    def test_frame_src_dedupes(self):
        csp = build_csp(["https://a.lab", "https://a.lab"])
        assert csp.count("https://a.lab") == 1
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd backend && uv run pytest tests/unit/test_csp.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'app.services.csp'`.

- [ ] **Step 3: Implement `csp.py`**

Create `backend/app/services/csp.py`:

```python
"""Content-Security-Policy construction for the kiosk single-attack-surface model.

The kiosk browser must only ever connect to the Calvin server ('self') plus the
origins of the operator's own configured web-service (iframe) embeds. See
docs/superpowers/specs/2026-07-15-offline-kiosks-csp-design.md.
"""

from urllib.parse import urlsplit

from app.models.db_models import PluginDB

# Baseline directives. frame-src is appended per-request with configured origins.
_BASELINE = [
    "default-src 'self'",
    "img-src 'self' data:",
    "connect-src 'self'",
    "font-src 'self'",
    "script-src 'self'",
    # Vue/Vite inject inline styles; without 'unsafe-inline' the dashboard breaks.
    "style-src 'self' 'unsafe-inline'",
    "base-uri 'self'",
    "form-action 'self'",
]


def origin_from_url(url: str | None) -> str | None:
    """Reduce a URL to its CSP origin ('scheme://host[:port]'), or None."""
    if not url:
        return None
    parts = urlsplit(url)
    if not parts.scheme or not parts.netloc:
        return None
    return f"{parts.scheme}://{parts.netloc}"


def build_csp(frame_origins: list[str]) -> str:
    """Build the full CSP header value with frame-src = 'self' + given origins."""
    seen: list[str] = []
    for origin in frame_origins:
        if origin and origin not in seen:
            seen.append(origin)
    frame_src = " ".join(["frame-src 'self'", *seen]).rstrip()
    return "; ".join([*_BASELINE, frame_src])


async def get_web_service_origins() -> list[str]:
    """Distinct origins of enabled built-in web-service (iframe) instances."""
    instances = await PluginDB.objects.filter(type_id="iframe", enabled=True).all()
    origins: set[str] = set()
    for instance in instances:
        url = (instance.config or {}).get("url") if instance.config else None
        origin = origin_from_url(url)
        if origin:
            origins.add(origin)
    return sorted(origins)
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd backend && uv run pytest tests/unit/test_csp.py -v`
Expected: PASS — all cases green.

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/csp.py backend/tests/unit/test_csp.py
git commit -m "feat(kiosk): add CSP builder + web-service origin reader"
```

---

### Task 4: Security-headers middleware wiring (backend)

Add a middleware that stamps every response with the CSP built from the configured
web-service origins, and register it. This is the browser-enforced backstop.

**Files:**
- Create: `backend/app/middleware/__init__.py` (empty package marker, if the dir doesn't exist)
- Create: `backend/app/middleware/security_headers.py`
- Modify: `backend/app/main.py` (register the middleware near the existing `app.add_middleware(CORSMiddleware, ...)` at ~line 437)
- Test: `backend/tests/integration/test_security_headers.py`

**Interfaces:**
- Consumes: `build_csp`, `get_web_service_origins` from `app.services.csp` (Task 3).
- Produces: every HTTP response carries a `Content-Security-Policy` header; `frame-src` includes the origins of enabled `iframe` instances.

- [ ] **Step 1: Write the failing integration tests**

Create `backend/tests/integration/test_security_headers.py`:

```python
"""Integration tests for the CSP security-headers middleware."""

import pytest
from fastapi.testclient import TestClient

from app.models.db_models import PluginDB


@pytest.mark.integration
class TestSecurityHeaders:
    def test_csp_present_on_api_response(self, test_client: TestClient):
        response = test_client.get("/api/health")
        csp = response.headers.get("content-security-policy")
        assert csp is not None
        assert "default-src 'self'" in csp
        assert "frame-src 'self'" in csp

    def test_frame_src_includes_configured_web_service_origin(
        self, test_client: TestClient
    ):
        # Seed an enabled built-in web-service (iframe) instance.
        async def _seed():
            await PluginDB.objects.create(
                id="ws-grafana",
                type_id="iframe",
                plugin_type="service",
                name="Grafana",
                enabled=True,
                config={"url": "https://grafana.lab:3000/d/home"},
            )

        # Starlette's TestClient runs an anyio portal; use it to run the async seed
        # on the app's event loop so it hits the same test database.
        test_client.portal.call(_seed)

        response = test_client.get("/api/health")
        csp = response.headers.get("content-security-policy", "")
        assert "https://grafana.lab:3000" in csp
```

> Note: if `test_client.portal` is unavailable in this Starlette version, seed via the
> `test_db`-backed async fixture pattern in `tests/conftest.py` instead — create the
> `PluginDB` row inside an `@pytest_asyncio.fixture` and depend on it. Confirm the
> seeding approach against `tests/conftest.py` before implementing; the assertion on
> the header is the invariant that matters.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd backend && uv run pytest tests/integration/test_security_headers.py -v`
Expected: FAIL — no `content-security-policy` header exists yet.

- [ ] **Step 3: Implement the middleware**

Create `backend/app/middleware/__init__.py` (empty) if `backend/app/middleware/` does
not already exist. Then create `backend/app/middleware/security_headers.py`:

```python
"""Middleware that stamps every response with the kiosk CSP header."""

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request

from app.services.csp import build_csp, get_web_service_origins


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        origins = await get_web_service_origins()
        response.headers["Content-Security-Policy"] = build_csp(origins)
        return response
```

- [ ] **Step 4: Register the middleware in `main.py`**

In `backend/app/main.py`, immediately after the existing
`app.add_middleware(CORSMiddleware, ...)` block (~line 452), add:

```python
    from app.middleware.security_headers import SecurityHeadersMiddleware

    app.add_middleware(SecurityHeadersMiddleware)
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd backend && uv run pytest tests/integration/test_security_headers.py -v`
Expected: PASS — CSP present, and the seeded `https://grafana.lab:3000` appears in
`frame-src`.

- [ ] **Step 6: Run the full backend suite (guard against regressions)**

Run: `cd backend && uv run pytest -q`
Expected: PASS — no existing test broken by the always-on CSP header.

- [ ] **Step 7: Commit**

```bash
git add backend/app/middleware/ backend/app/main.py backend/tests/integration/test_security_headers.py
git commit -m "feat(kiosk): stamp CSP on all responses via SecurityHeadersMiddleware"
```

---

### Task 5: Manual CSP validation against the built app

Automated tests confirm the header is present and correct, but only a real browser
confirms the policy doesn't break the dashboard (the `script-src 'self'` /
`style-src` risk from the spec). This task is a manual smoke check, not a code change.

**Files:** none (validation only).

- [ ] **Step 1: Build the frontend**

Run: `cd frontend && npm run build`
Expected: build succeeds, `frontend/dist/index.html` produced.

- [ ] **Step 2: Run the backend and open the dashboard**

Run the app (per `docs/setup/QUICKSTART_DEVELOP.md`), open it in Chrome, and open
DevTools → Console.
Expected: dashboard renders normally; **no** `Content Security Policy` violation
errors in the console. Confirm calendar, photos, and a web-service embed (if
configured) all render.

- [ ] **Step 3: If violations appear, record and adjust**

If the console reports a blocked inline script or style, note the exact directive in
the plan/spec and widen only that directive minimally (e.g. add a nonce or, as a last
resort, `'unsafe-inline'` to `script-src`) in `backend/app/services/csp.py`, then
re-run `cd backend && uv run pytest tests/unit/test_csp.py` and repeat Step 2. If no
violations, no change needed.

- [ ] **Step 4: Confirm image loads come from `/api/images/` only**

In DevTools → Network, filter images and confirm every image request targets
`/api/images/...` (same-origin), with no requests to `picsum.photos`,
`images.unsplash.com`, or `apod.nasa.gov`.
Expected: no external image origins in the Network panel.

---

## Self-Review

**Spec coverage (Phase 1 rows of the spec):**
- Leak #1 (images.js raw URL) → Task 1. ✅
- Leak #2 (dns-prefetch) + #3 (WeatherWidget) → Task 2. ✅
- Strict CSP served by FastAPI → Tasks 3–4. ✅
- `frame-src` auto-derived from configured web-service instances → Task 3 (`get_web_service_origins`) + Task 4. ✅
- Implementation risk: CSP vs Vue/Vite inline styles → Task 5 (manual validation) + `style-src 'self' 'unsafe-inline'` baseline. ✅
- Out of scope for Phase 1 (browser_origins field, admin allowlist, sealed mode, CI contract test) → correctly excluded per Global Constraints. ✅

**Placeholder scan:** No TBD/TODO; every code step shows complete code; the one advisory note (test seeding fallback in Task 4) gives a concrete alternative, not a placeholder.

**Type consistency:** `origin_from_url`, `build_csp(frame_origins)`, `get_web_service_origins()` are defined in Task 3 and consumed with identical names/signatures in Task 4's middleware. `getImageUrl(image) -> string|null` consistent between Task 1 implementation and its tests.
