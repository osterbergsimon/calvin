# CSP Allowed-Origins Allowlist Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the operator declare trusted origins (domains/IPs) in a new Security settings UI; those origins extend the Phase-1 CSP so the kiosk browser may embed, load images from, and connect to them.

**Architecture:** A shared origin validator + a global config-backed allowlist (`security_allowed_origins`) drive both a `GET/PUT /api/security/allowed-origins` API and the CSP middleware. `build_csp` generalizes to apply allowlist origins to `frame-src`, `img-src`, and `connect-src`. A new "Security" settings category with a dedicated Pinia store provides the editor.

**Tech Stack:** Backend — FastAPI, Starlette middleware, Ormar/SQLite via `ConfigService`, pytest (`uv run pytest`). Frontend — Vue 3, Pinia, Vitest, Vue Test Utils.

## Global Constraints

- **Design spec:** `docs/superpowers/specs/2026-07-15-csp-allowed-origins-design.md`.
- **Accepted origin forms** (CSP host-sources): bare host `grafana.lab`, host+port `192.168.1.50:3000`, subdomain wildcard `*.lab.example.com`, scheme+host `https://grafana.lab:3000` (http/https only). **Rejected:** CIDR/IP-range (`10.0.0.0/24`), paths/query/fragment, spaces, empty, bare `*`, non-http(s) schemes.
- **An allowlisted origin extends three directives:** `frame-src`, `img-src`, `connect-src`. Auto-derived web-service origins keep extending `frame-src` only.
- **Config key:** `security_allowed_origins` (JSON list of normalized strings). Global (per-kiosk deferred).
- **API JSON shape:** both GET response and PUT body use `{ "origins": [...] }`.
- **Backward compatibility:** `build_csp(frame_origins)` with no allowlist MUST produce byte-identical output to Phase 1 (existing `test_csp.py` must stay green).
- **Never-500:** the middleware's origin lookups stay inside the existing `try/except` fallback.
- **Backend tests:** `cd backend && uv run pytest`. Markers `@pytest.mark.unit` / `@pytest.mark.integration`; `asyncio_mode = "auto"`.
- **Frontend tests:** `cd frontend && npm run test`.
- **Out of scope:** plugin-manifest `browser_origins`, sealed mode, per-kiosk allowlists, CIDR support.

---

### Task 1: Origin validator (backend)

The shared, authoritative validator. Pure function; foundation for the API and CSP reader.

**Files:**
- Modify: `backend/app/services/csp.py` (add `validate_origin`, `is_valid_origin`; add `import re`)
- Test: `backend/tests/unit/test_csp.py` (add a `TestValidateOrigin` class)

**Interfaces:**
- Consumes: nothing new.
- Produces:
  - `validate_origin(value: str) -> str` — returns the normalized origin (host lowercased, scheme preserved), or raises `ValueError(reason)`.
  - `is_valid_origin(value: str) -> bool` — True iff `validate_origin` does not raise.

- [ ] **Step 1: Write the failing tests**

Add to `backend/tests/unit/test_csp.py`:

```python
from app.services.csp import validate_origin, is_valid_origin


@pytest.mark.unit
class TestValidateOrigin:
    def test_bare_host(self):
        assert validate_origin("grafana.lab") == "grafana.lab"

    def test_host_and_port(self):
        assert validate_origin("192.168.1.50:3000") == "192.168.1.50:3000"

    def test_subdomain_wildcard(self):
        assert validate_origin("*.lab.example.com") == "*.lab.example.com"

    def test_scheme_host_port(self):
        assert validate_origin("https://grafana.lab:3000") == "https://grafana.lab:3000"

    def test_lowercases_host_keeps_scheme(self):
        assert validate_origin("HTTPS://Grafana.Lab") == "https://grafana.lab"

    def test_rejects_cidr(self):
        with pytest.raises(ValueError):
            validate_origin("10.0.0.0/24")

    def test_rejects_path(self):
        with pytest.raises(ValueError):
            validate_origin("grafana.lab/d/home")

    def test_rejects_space(self):
        with pytest.raises(ValueError):
            validate_origin("a b")

    def test_rejects_empty(self):
        with pytest.raises(ValueError):
            validate_origin("")

    def test_rejects_bare_wildcard(self):
        with pytest.raises(ValueError):
            validate_origin("*")

    def test_rejects_non_http_scheme(self):
        with pytest.raises(ValueError):
            validate_origin("ftp://x.lab")

    def test_is_valid_origin_bool(self):
        assert is_valid_origin("grafana.lab") is True
        assert is_valid_origin("10.0.0.0/24") is False
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd backend && uv run pytest tests/unit/test_csp.py::TestValidateOrigin -v`
Expected: FAIL with `ImportError: cannot import name 'validate_origin'`.

- [ ] **Step 3: Implement the validator in `csp.py`**

At the top of `backend/app/services/csp.py`, change the import line `from urllib.parse import urlsplit` to also import `re`:

```python
import re
from urllib.parse import urlsplit
```

Then add (below `origin_from_url`):

```python
# A CSP host-source: optional leading "*." wildcard, dot-separated labels, optional :port.
# Accepts domains and bare IPv4 hosts (over-strict IP validation is unnecessary — CSP
# treats the value as an opaque host token).
_HOST_SOURCE_RE = re.compile(
    r"^(?:\*\.)?"
    r"(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)*"
    r"[a-z0-9](?:[a-z0-9-]*[a-z0-9])?"
    r"(?::\d{1,5})?$"
)


def validate_origin(value: str) -> str:
    """Normalize a trusted-origin string or raise ValueError with a reason.

    Accepts CSP host-sources: 'grafana.lab', '*.lab.example.com',
    'host:port', and 'http(s)://host[:port]'. Rejects CIDR/IP-ranges,
    paths, spaces, non-http(s) schemes, and empties.
    """
    if not value or not value.strip():
        raise ValueError("Origin must not be empty")
    raw = value.strip()

    scheme = ""
    host_part = raw
    if "://" in raw:
        scheme, host_part = raw.split("://", 1)
        scheme = scheme.lower()
        if scheme not in ("http", "https"):
            raise ValueError(f"Unsupported scheme '{scheme}://' — use http:// or https://")

    if "/" in host_part:
        raise ValueError(
            "IP ranges (CIDR) and paths are not supported — use a domain, a wildcard "
            "like *.lab.example.com, or host:port"
        )
    if any(c in host_part for c in " \t?#"):
        raise ValueError("Origin must not contain spaces, query, or fragment")

    host_lower = host_part.lower()
    if not _HOST_SOURCE_RE.match(host_lower):
        raise ValueError(f"'{value}' is not a valid domain, wildcard, or host")

    return f"{scheme}://{host_lower}" if scheme else host_lower


def is_valid_origin(value: str) -> bool:
    """True iff validate_origin accepts the value."""
    try:
        validate_origin(value)
        return True
    except (ValueError, TypeError):
        return False
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd backend && uv run pytest tests/unit/test_csp.py -v`
Expected: PASS — the new `TestValidateOrigin` class and all existing csp tests green.

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/csp.py backend/tests/unit/test_csp.py
git commit -m "feat(security): add shared trusted-origin validator"
```

---

### Task 2: Generalize build_csp + read the allowlist (backend)

Apply allowlist origins to three directives, and add the config reader.

**Files:**
- Modify: `backend/app/services/csp.py` (`build_csp` signature + body; add `get_allowed_origins`; add config_service import)
- Test: `backend/tests/unit/test_csp.py`

**Interfaces:**
- Consumes: `validate_origin` (Task 1); `config_service` singleton (`await config_service.get_value(key, default)`).
- Produces:
  - `build_csp(frame_origins: list[str], allowed_origins: list[str] | None = None) -> str` — allowlist origins extend `frame-src`, `img-src`, `connect-src`; empty/None allowlist → byte-identical to Phase 1.
  - `get_allowed_origins() -> list[str]` — reads `security_allowed_origins`, drops any entry failing `validate_origin`, deduped, order preserved.

- [ ] **Step 1: Write the failing tests**

Add to `backend/tests/unit/test_csp.py`:

```python
from app.services.csp import get_allowed_origins


@pytest.mark.unit
class TestBuildCspAllowlist:
    def test_empty_allowlist_is_byte_identical_to_no_allowlist(self):
        assert build_csp(["https://a.lab"], []) == build_csp(["https://a.lab"])
        assert build_csp([], None) == build_csp([])

    def test_allowlist_extends_three_directives(self):
        csp = build_csp([], ["https://grafana.lab"])
        assert "img-src 'self' data: https://grafana.lab" in csp
        assert "connect-src 'self' https://grafana.lab" in csp
        assert "frame-src 'self' https://grafana.lab" in csp

    def test_frame_src_merges_web_service_and_allowlist_deduped(self):
        csp = build_csp(["https://a.lab"], ["https://a.lab", "https://b.lab"])
        # 'a.lab' appears once in frame-src despite being in both inputs
        frame = [d for d in csp.split("; ") if d.startswith("frame-src")][0]
        assert frame.count("https://a.lab") == 1
        assert "https://b.lab" in frame


@pytest.mark.unit
class TestGetAllowedOrigins:
    async def test_reads_and_filters_config(self, monkeypatch):
        async def fake_get_value(key, default=None):
            assert key == "security_allowed_origins"
            return ["grafana.lab", "10.0.0.0/24", "grafana.lab"]  # bad + dupe

        import app.services.csp as csp_module
        monkeypatch.setattr(csp_module.config_service, "get_value", fake_get_value)
        assert await get_allowed_origins() == ["grafana.lab"]

    async def test_non_list_config_returns_empty(self, monkeypatch):
        async def fake_get_value(key, default=None):
            return "not-a-list"

        import app.services.csp as csp_module
        monkeypatch.setattr(csp_module.config_service, "get_value", fake_get_value)
        assert await get_allowed_origins() == []
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd backend && uv run pytest tests/unit/test_csp.py::TestBuildCspAllowlist tests/unit/test_csp.py::TestGetAllowedOrigins -v`
Expected: FAIL — `build_csp()` takes 1 positional arg / `get_allowed_origins` not defined.

- [ ] **Step 3: Implement in `csp.py`**

Add the config_service import near the top of `backend/app/services/csp.py` (after the PluginDB import):

```python
from app.services.config_service import config_service
```

Add a dedupe helper and replace `build_csp` with the generalized version:

```python
def _dedupe(origins: list[str]) -> list[str]:
    seen: list[str] = []
    for origin in origins:
        if origin and origin not in seen:
            seen.append(origin)
    return seen


def build_csp(frame_origins: list[str], allowed_origins: list[str] | None = None) -> str:
    """Build the CSP header value.

    frame_origins (auto-derived web-service embeds) extend frame-src only.
    allowed_origins (admin allowlist) are trusted broadly and extend
    frame-src, img-src, and connect-src. With no allowlist the output is
    byte-identical to the Phase-1 baseline-plus-frame-src policy.
    """
    allowed = _dedupe(allowed_origins or [])
    directives: list[str] = []
    for directive in _BASELINE:
        if allowed and directive == "img-src 'self' data:":
            directives.append(" ".join([directive, *allowed]))
        elif allowed and directive == "connect-src 'self'":
            directives.append(" ".join([directive, *allowed]))
        else:
            directives.append(directive)
    frame = _dedupe([*frame_origins, *allowed])
    frame_src = " ".join(["frame-src 'self'", *frame]).rstrip()
    return "; ".join([*directives, frame_src])
```

Add the config reader (below `get_web_service_origins`):

```python
async def get_allowed_origins() -> list[str]:
    """Admin-configured trusted origins (security_allowed_origins), validated.

    Any stored entry that fails validation is dropped so a hand-edited or
    corrupt config can never emit a malformed CSP token.
    """
    raw = await config_service.get_value("security_allowed_origins", [])
    if not isinstance(raw, list):
        return []
    result: list[str] = []
    for entry in raw:
        try:
            normalized = validate_origin(entry)
        except (ValueError, TypeError):
            continue
        if normalized not in result:
            result.append(normalized)
    return result
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd backend && uv run pytest tests/unit/test_csp.py -v`
Expected: PASS — new classes green AND the Phase-1 `TestBuildCsp` byte-identical checks still pass.

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/csp.py backend/tests/unit/test_csp.py
git commit -m "feat(security): extend CSP with admin allowlist across frame/img/connect-src"
```

---

### Task 3: Security API route (backend)

`GET/PUT /api/security/allowed-origins` with all-or-nothing 422 validation.

**Files:**
- Create: `backend/app/api/routes/security.py`
- Modify: `backend/app/main.py` (add `security` to the `from app.api.routes import (...)` block ~line 123; add an `include_router` line after ~line 560)
- Test: `backend/tests/integration/test_security_allowlist.py`

**Interfaces:**
- Consumes: `validate_origin` (Task 1), `config_service`.
- Produces: `GET /api/security/allowed-origins` → `{"origins": [...]}`; `PUT` body `{"origins": [...]}` → 200 `{"origins": [normalized]}` or 422.

- [ ] **Step 1: Write the failing integration tests**

Create `backend/tests/integration/test_security_allowlist.py`:

```python
"""Integration tests for the security allowed-origins API."""

import pytest
from fastapi.testclient import TestClient


@pytest.mark.integration
class TestAllowedOriginsApi:
    def test_get_defaults_to_empty(self, test_client: TestClient):
        response = test_client.get("/api/security/allowed-origins")
        assert response.status_code == 200
        assert response.json() == {"origins": []}

    def test_put_valid_persists_and_normalizes(self, test_client: TestClient):
        response = test_client.put(
            "/api/security/allowed-origins",
            json={"origins": ["HTTPS://Grafana.Lab:3000", "grafana.lab", "grafana.lab"]},
        )
        assert response.status_code == 200
        assert response.json() == {"origins": ["https://grafana.lab:3000", "grafana.lab"]}

        persisted = test_client.get("/api/security/allowed-origins")
        assert persisted.json() == {"origins": ["https://grafana.lab:3000", "grafana.lab"]}

    def test_put_cidr_is_rejected_and_persists_nothing(self, test_client: TestClient):
        response = test_client.put(
            "/api/security/allowed-origins",
            json={"origins": ["grafana.lab", "10.0.0.0/24"]},
        )
        assert response.status_code == 422
        assert "10.0.0.0/24" in response.text

        after = test_client.get("/api/security/allowed-origins")
        assert after.json() == {"origins": []}
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd backend && uv run pytest tests/integration/test_security_allowlist.py -v`
Expected: FAIL — 404 (route not mounted yet).

- [ ] **Step 3: Create the route**

Create `backend/app/api/routes/security.py`:

```python
"""Security settings endpoints: the admin trusted-origin allowlist."""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.services.config_service import config_service
from app.services.csp import validate_origin

router = APIRouter()

_CONFIG_KEY = "security_allowed_origins"


class AllowedOriginsBody(BaseModel):
    origins: list[str]


@router.get("/security/allowed-origins")
async def get_allowed_origins():
    """Return the configured trusted origins."""
    stored = await config_service.get_value(_CONFIG_KEY, [])
    return {"origins": stored if isinstance(stored, list) else []}


@router.put("/security/allowed-origins")
async def put_allowed_origins(body: AllowedOriginsBody):
    """Validate + replace the trusted-origin allowlist (all-or-nothing)."""
    normalized: list[str] = []
    for entry in body.origins:
        try:
            origin = validate_origin(entry)
        except (ValueError, TypeError) as exc:
            raise HTTPException(status_code=422, detail=f"Invalid origin '{entry}': {exc}")
        if origin not in normalized:
            normalized.append(origin)
    await config_service.set_value(_CONFIG_KEY, normalized, value_type="json")
    return {"origins": normalized}
```

- [ ] **Step 4: Mount the router in `main.py`**

In `backend/app/main.py`, find the `from app.api.routes import (` block (~line 123) and add `security,` to the imported names (keep alphabetical/existing style). Then, after the last `app.include_router(...)` line in the group (~line 560, the `system` router), add:

```python
app.include_router(security.router, prefix="/api", tags=["security"])
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd backend && uv run pytest tests/integration/test_security_allowlist.py -v`
Expected: PASS — GET empty, PUT normalizes+persists, CIDR → 422 with nothing persisted.

- [ ] **Step 6: Commit**

```bash
git add backend/app/api/routes/security.py backend/app/main.py backend/tests/integration/test_security_allowlist.py
git commit -m "feat(security): add GET/PUT /api/security/allowed-origins"
```

---

### Task 4: Middleware applies the allowlist (backend)

Wire the allowlist into the stamped CSP.

**Files:**
- Modify: `backend/app/middleware/security_headers.py`
- Test: `backend/tests/integration/test_security_headers.py`

**Interfaces:**
- Consumes: `build_csp` (Task 2, now 2-arg), `get_web_service_origins`, `get_allowed_origins` (Task 2).
- Produces: every non-exempt response's CSP includes the allowlist origins in `frame-src`, `img-src`, `connect-src`.

- [ ] **Step 1: Write the failing integration test**

Add to `backend/tests/integration/test_security_headers.py` (reuse the existing `security_test_client` fixture pattern; seed a config row directly). Add this test method inside the existing test class that uses `security_test_client`:

```python
    def test_allowlist_origin_appears_in_three_directives(self, security_test_client):
        import json

        from app.models.db_models import ConfigDB

        async def _seed():
            await ConfigDB.objects.create(
                key="security_allowed_origins",
                value=json.dumps(["https://grafana.lab:3000"]),
                value_type="json",
            )

        security_test_client.portal.call(_seed)

        csp = security_test_client.get("/api/health").headers.get("content-security-policy", "")
        assert "img-src 'self' data: https://grafana.lab:3000" in csp
        assert "connect-src 'self' https://grafana.lab:3000" in csp
        assert "frame-src 'self' https://grafana.lab:3000" in csp
```

> Note: if `security_test_client.portal` is unavailable in this Starlette version, seed with the same event-loop pattern the file's other seeding tests use (there is an existing `asyncio.new_event_loop().run_until_complete(...)` seed in this file — mirror it). The header assertions are the invariant that matters.

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd backend && uv run pytest tests/integration/test_security_headers.py::TestSecurityHeaders::test_allowlist_origin_appears_in_three_directives -v`
(adjust the class name to the actual class in the file)
Expected: FAIL — the allowlist origin is not yet in the CSP.

- [ ] **Step 3: Update the middleware**

In `backend/app/middleware/security_headers.py`, change the import line:

```python
from app.services.csp import build_csp, get_allowed_origins, get_web_service_origins
```

and replace the `try/except` + header assignment in `dispatch` with:

```python
        try:
            frame_origins = await get_web_service_origins()
            allowed = await get_allowed_origins()
        except Exception:
            # A CSP header must never fail the response. On any DB hiccup fall
            # back to the baseline self-only policy rather than 500-ing.
            logger.warning("CSP origins lookup failed; falling back to baseline self-only policy")
            frame_origins, allowed = [], []
        response.headers["Content-Security-Policy"] = build_csp(frame_origins, allowed)
        return response
```

- [ ] **Step 4: Run the test to verify it passes, then the full security-headers file**

Run: `cd backend && uv run pytest tests/integration/test_security_headers.py -v`
Expected: PASS — the new test plus all existing security-headers tests (fallback, exclusion, exclude-unit) stay green.

- [ ] **Step 5: Run the full backend suite (middleware touches all responses)**

Run: `cd backend && uv run pytest -q`
Expected: PASS — no regression.

- [ ] **Step 6: Commit**

```bash
git add backend/app/middleware/security_headers.py backend/tests/integration/test_security_headers.py
git commit -m "feat(security): apply admin allowlist to the stamped CSP"
```

---

### Task 5: Frontend security store

Dedicated Pinia store for the allowlist API (mirrors `stores/kiosks.js`).

**Files:**
- Create: `frontend/src/stores/security.js`
- Test: `frontend/tests/unit/stores/security.spec.js`

**Interfaces:**
- Consumes: the `GET/PUT /api/security/allowed-origins` API (Task 3), JSON shape `{ "origins": [...] }`.
- Produces: `useSecurityStore()` with `fetchAllowedOrigins() -> Promise<string[]>` and `saveAllowedOrigins(origins: string[]) -> Promise<void>`.

- [ ] **Step 1: Write the failing store tests**

Create `frontend/tests/unit/stores/security.spec.js`:

```javascript
import { describe, it, expect, beforeEach, vi } from "vitest";
import { setActivePinia, createPinia } from "pinia";
import axios from "axios";
import { useSecurityStore } from "@/stores/security";

vi.mock("axios");

describe("security store", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  it("fetchAllowedOrigins GETs and returns the origins list", async () => {
    axios.get.mockResolvedValue({ data: { origins: ["grafana.lab"] } });
    const store = useSecurityStore();
    const result = await store.fetchAllowedOrigins();
    expect(result).toEqual(["grafana.lab"]);
    expect(axios.get).toHaveBeenCalledWith("/api/security/allowed-origins");
  });

  it("fetchAllowedOrigins returns [] when the field is missing", async () => {
    axios.get.mockResolvedValue({ data: {} });
    const store = useSecurityStore();
    expect(await store.fetchAllowedOrigins()).toEqual([]);
  });

  it("saveAllowedOrigins PUTs the list under the origins key", async () => {
    axios.put.mockResolvedValue({ data: { origins: ["grafana.lab"] } });
    const store = useSecurityStore();
    await store.saveAllowedOrigins(["grafana.lab"]);
    expect(axios.put).toHaveBeenCalledWith("/api/security/allowed-origins", {
      origins: ["grafana.lab"],
    });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd frontend && npm run test -- security.spec.js`
Expected: FAIL — cannot resolve `@/stores/security`.

- [ ] **Step 3: Create the store**

Create `frontend/src/stores/security.js`:

```javascript
import { defineStore } from "pinia";
import axios from "axios";
import { logError } from "@/utils/logger";

export const useSecurityStore = defineStore("security", () => {
  async function fetchAllowedOrigins() {
    try {
      const response = await axios.get("/api/security/allowed-origins");
      return response.data?.origins ?? [];
    } catch (err) {
      logError("[security]", "Failed to fetch allowed origins:", err);
      throw err;
    }
  }

  async function saveAllowedOrigins(origins) {
    await axios.put("/api/security/allowed-origins", { origins });
  }

  return { fetchAllowedOrigins, saveAllowedOrigins };
});
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd frontend && npm run test -- security.spec.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/stores/security.js frontend/tests/unit/stores/security.spec.js
git commit -m "feat(security): add allowed-origins Pinia store"
```

---

### Task 6: Security settings category + editor UI

New "Security" category with an add/remove allowlist editor, light client-side validation, and save.

**Files:**
- Create: `frontend/src/components/settings/categories/SecuritySettings.vue`
- Modify: `frontend/src/components/settings/settingsRegistry.js` (add the category)
- Modify: `frontend/src/views/Settings.vue` (async import + `v-if` block)
- Test: `frontend/tests/unit/components/settings/SecuritySettings.spec.js`

**Interfaces:**
- Consumes: `useSecurityStore()` (Task 5).
- Produces: the rendered Security settings screen (self-contained, like `KiosksSettings.vue`).

- [ ] **Step 1: Write the failing component tests**

Create `frontend/tests/unit/components/settings/SecuritySettings.spec.js`:

```javascript
import { describe, it, expect, beforeEach, vi } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import SecuritySettings from "@/components/settings/categories/SecuritySettings.vue";
import { useSecurityStore } from "@/stores/security";

function mountWith(list = []) {
  setActivePinia(createPinia());
  const store = useSecurityStore();
  store.fetchAllowedOrigins = vi.fn(async () => list);
  store.saveAllowedOrigins = vi.fn(async () => {});
  const wrapper = mount(SecuritySettings);
  return { wrapper, store };
}

describe("SecuritySettings", () => {
  beforeEach(() => vi.clearAllMocks());

  it("loads and lists existing origins", async () => {
    const { wrapper } = mountWith(["grafana.lab"]);
    await flushPromises();
    expect(wrapper.text()).toContain("grafana.lab");
  });

  it("rejects a CIDR entry with guidance and does not add it", async () => {
    const { wrapper } = mountWith([]);
    await flushPromises();
    await wrapper.find("[data-test='origin-input']").setValue("10.0.0.0/24");
    await wrapper.find("[data-test='origin-add']").trigger("click");
    expect(wrapper.text().toLowerCase()).toContain("wildcard");
    expect(wrapper.text()).not.toContain("10.0.0.0/24");
  });

  it("adds a valid origin and saves the full list", async () => {
    const { wrapper, store } = mountWith(["grafana.lab"]);
    await flushPromises();
    await wrapper.find("[data-test='origin-input']").setValue("*.lab.example.com");
    await wrapper.find("[data-test='origin-add']").trigger("click");
    await wrapper.find("[data-test='origins-save']").trigger("click");
    await flushPromises();
    expect(store.saveAllowedOrigins).toHaveBeenCalledWith(["grafana.lab", "*.lab.example.com"]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd frontend && npm run test -- SecuritySettings.spec.js`
Expected: FAIL — cannot resolve the component.

- [ ] **Step 3: Create the component**

Create `frontend/src/components/settings/categories/SecuritySettings.vue`:

```vue
<template>
  <section id="section-security-origins" class="security-settings">
    <h2>Allowed origins</h2>
    <p class="security-settings__intro">
      Origins the kiosk may embed, load images from, or connect to. Everything else is
      blocked. Use a domain (grafana.lab), a wildcard (*.lab.example.com), a host:port, or
      an http(s):// URL. IP ranges (CIDR) are not supported.
    </p>

    <ul class="security-settings__list">
      <li v-for="origin in origins" :key="origin" class="security-settings__row">
        <span class="security-settings__origin">{{ origin }}</span>
        <button type="button" data-test="origin-remove" @click="remove(origin)">Remove</button>
      </li>
      <li v-if="origins.length === 0" class="security-settings__empty">No allowed origins.</li>
    </ul>

    <div class="security-settings__add">
      <input
        v-model="draft"
        data-test="origin-input"
        placeholder="grafana.lab or *.lab.example.com"
        @keyup.enter="add"
      />
      <button type="button" data-test="origin-add" @click="add">Add</button>
    </div>
    <p v-if="error" class="security-settings__error" data-test="origin-error">{{ error }}</p>

    <button type="button" data-test="origins-save" :disabled="saving" @click="save">
      {{ saving ? "Saving…" : "Save" }}
    </button>
  </section>
</template>

<script setup>
import { onMounted, ref } from "vue";
import { useSecurityStore } from "@/stores/security";
import { logError } from "@/utils/logger";

const store = useSecurityStore();
const origins = ref([]);
const draft = ref("");
const error = ref("");
const saving = ref(false);

onMounted(async () => {
  try {
    origins.value = await store.fetchAllowedOrigins();
  } catch (err) {
    logError("[SecuritySettings]", "load failed", err);
  }
});

// Light client-side check for instant feedback; the server validator is authoritative.
function inputError(value) {
  const v = (value || "").trim();
  if (!v) return "Enter a domain, wildcard, host:port, or http(s):// URL.";
  const hostPart = v.includes("://") ? v.split("://")[1] : v;
  if (hostPart.includes("/")) {
    return "IP ranges (CIDR) and paths aren't supported — use a wildcard domain like *.lab.example.com.";
  }
  if (/[\s?#]/.test(hostPart)) return "Origins can't contain spaces, query, or fragment.";
  return "";
}

function add() {
  const v = draft.value.trim();
  const err = inputError(v);
  if (err) {
    error.value = err;
    return;
  }
  if (!origins.value.includes(v)) origins.value = [...origins.value, v];
  draft.value = "";
  error.value = "";
}

function remove(origin) {
  origins.value = origins.value.filter(o => o !== origin);
}

async function save() {
  saving.value = true;
  error.value = "";
  try {
    await store.saveAllowedOrigins(origins.value);
  } catch (err) {
    error.value = err?.response?.data?.detail || "Failed to save.";
    logError("[SecuritySettings]", "save failed", err);
  } finally {
    saving.value = false;
  }
}
</script>
```

- [ ] **Step 4: Register the category and wire the component**

In `frontend/src/components/settings/settingsRegistry.js`, add to the `settingsCategories` array (after the `maintenance` entry):

```javascript
  { id: "security", label: "Security", icon: "🔒", subtitle: "Allowed origins · network access" },
```

In `frontend/src/views/Settings.vue`: add an async import alongside the other category imports (near the top `<script setup>` imports):

```javascript
const SecuritySettings = defineAsyncComponent(
  () => import("@/components/settings/categories/SecuritySettings.vue")
);
```

and add the render block alongside the other category `v-if`s (near the `maintenance` block):

```vue
        <SecuritySettings v-if="activeCategory === 'security'" :key="categoryRenderKey" />
```

> Match the exact prop/`:key` style the sibling self-contained category (`KiosksSettings`) uses in this file. `SecuritySettings` manages its own data via the store, so it needs no `config`/`@update:config` props.

- [ ] **Step 5: Run the component tests, then the full frontend suite**

Run: `cd frontend && npm run test -- SecuritySettings.spec.js`
Expected: PASS — load/list, CIDR rejection with "wildcard" guidance, add + save with the full list.
Run: `cd frontend && npm run test`
Expected: PASS — full suite green (no regression from the new category/import).

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/settings/categories/SecuritySettings.vue frontend/src/components/settings/settingsRegistry.js frontend/src/views/Settings.vue frontend/tests/unit/components/settings/SecuritySettings.spec.js
git commit -m "feat(security): add Security settings category with allowed-origins editor"
```

---

### Task 7: Manual end-to-end validation

Confirm the loop works in the running app (no automated test covers browser → API → CSP end-to-end).

**Files:** none (validation only).

- [ ] **Step 1: Build the frontend and start the backend**

Run: `cd frontend && npm run build`, then start the backend (per `docs/setup/QUICKSTART_DEVELOP.md`).

- [ ] **Step 2: Add an origin via the UI**

Open the dashboard → Settings → **Security**. Add `*.lab.example.com`, then Save.
Expected: it appears in the list; Save succeeds with no error.

- [ ] **Step 3: Confirm the CSP reflects it**

Run: `curl -si http://<host>:<port>/ | grep -i content-security-policy`
Expected: the header's `img-src`, `connect-src`, and `frame-src` each include `*.lab.example.com`.

- [ ] **Step 4: Confirm CIDR is rejected**

In the UI, try to add `10.0.0.0/24`.
Expected: inline error mentioning wildcard domains; the entry is not added. (And a direct `curl -si -X PUT .../api/security/allowed-origins -H 'content-type: application/json' -d '{"origins":["10.0.0.0/24"]}'` returns 422.)

- [ ] **Step 5: Confirm removal**

Remove the origin, Save, and re-check the CSP header no longer contains it.

---

## Self-Review

**Spec coverage:**
- Validator (accept 4 forms, reject CIDR/path/garbage) → Task 1. ✅
- Storage (`security_allowed_origins`, JSON list) → Task 3 (write) + Task 2 (read). ✅
- CSP integration (allowlist extends frame/img/connect-src; backward-compatible) → Task 2 + Task 4. ✅
- API (`GET/PUT /api/security/allowed-origins`, 422 all-or-nothing) → Task 3. ✅
- Frontend Security category + editor + validation UX → Task 5 (store) + Task 6 (UI). ✅
- Testing (unit validator/build_csp; integration API + CSP; frontend store + component) → Tasks 1–6. ✅
- Per-kiosk-later (global key unchanged) → honored (single global key throughout). ✅
- Out-of-scope items (`browser_origins`, sealed mode, CIDR) → correctly excluded. ✅

**Placeholder scan:** none — every code step is complete; the two "match the sibling pattern" notes (Task 4 seeding fallback, Task 6 `:key` style) give concrete references, not TODOs.

**Type consistency:** `validate_origin(str)->str` / `is_valid_origin(str)->bool` (Task 1) used unchanged in Tasks 2–3. `build_csp(frame_origins, allowed_origins=None)` (Task 2) called with the same 2-arg shape in Task 4. `get_allowed_origins()->list[str]` (Task 2) consumed in Task 4. API shape `{"origins": [...]}` (Task 3) matches the store's `origins` key (Task 5) and the component (Task 6). Config key `security_allowed_origins` identical in Tasks 2, 3, and the Task 4 test seed.
