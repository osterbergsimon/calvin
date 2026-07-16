# Sealed Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an opt-in global "sealed mode" that collapses the kiosk CSP to self-only (dropping web-service embeds, admin allowlist, and plugin `browser_origins`) and refuses to enable a `browser_origins` plugin while sealed.

**Architecture:** A global `sealed_mode` bool in `ConfigService`. The CSP middleware, when sealed, emits `build_csp([], [])` (baseline self-only). The plugin-enable path refuses enabling a plugin whose `metadata.browser_origins` is non-empty while sealed (403). A `GET/PUT /api/security/sealed-mode` API and a toggle in the existing Security settings category drive it.

**Tech Stack:** FastAPI, Pydantic v2, Starlette `BaseHTTPMiddleware`, `ConfigService` (Ormar/SQLite), pytest (`uv run pytest`, markers `@pytest.mark.unit`/`integration`, `asyncio_mode=auto`). Frontend: Vue 3, Pinia, Vitest (`npm run test -- --run`; bare `npm run test` = watch mode, avoid).

**Design spec:** `docs/superpowers/specs/2026-07-16-sealed-mode-design.md`.

## Global Constraints

- Sealed mode is **global-only** this phase (no per-kiosk; the middleware has no kiosk context).
- When sealed, the CSP is `build_csp([], [])` — **byte-identical** to the baseline self-only policy. When not sealed, behavior is unchanged from #102.
- The middleware must **never 500**: the sealed check lives inside the existing `try/except`, and the `except` fallback (`[], [], []`) is itself the self-only shape — so any error fails **toward** sealed.
- The enable guard fires **only on a False→True enable transition** of a plugin whose `metadata.browser_origins` is non-empty, and **only** while sealed. Disabling, config-only edits, and empty-`browser_origins` plugins are never blocked.
- `sealed_mode` is stored as a bool: `set_value("sealed_mode", value, value_type="bool")`; read with default `False`.
- Reuse existing patterns (the allowed-origins API/store/component); do not hand-roll new ones.

---

### Task 1: `get_sealed_mode()` + middleware self-only branch

**Files:**
- Modify: `backend/app/services/csp.py` (add `get_sealed_mode`)
- Modify: `backend/app/middleware/security_headers.py` (sealed branch)
- Test: `backend/tests/unit/test_csp.py`, `backend/tests/integration/test_security_headers.py`

**Interfaces:**
- Consumes: `config_service.get_value`, existing `build_csp`, `get_web_service_origins`, `get_allowed_origins`, `get_plugin_browser_origins`.
- Produces: `async get_sealed_mode() -> bool`.

- [ ] **Step 1: Write the failing unit test**

Add to `backend/tests/unit/test_csp.py` (add `get_sealed_mode` to the `app.services.csp` import block):

```python
@pytest.mark.unit
class TestGetSealedMode:
    async def test_true_when_config_true(self, monkeypatch):
        async def fake_get_value(key, default=None):
            assert key == "sealed_mode"
            return True

        import app.services.csp as csp_module

        monkeypatch.setattr(csp_module.config_service, "get_value", fake_get_value)
        assert await get_sealed_mode() is True

    async def test_false_when_absent(self, monkeypatch):
        async def fake_get_value(key, default=None):
            return default

        import app.services.csp as csp_module

        monkeypatch.setattr(csp_module.config_service, "get_value", fake_get_value)
        assert await get_sealed_mode() is False
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd backend && uv run pytest tests/unit/test_csp.py::TestGetSealedMode -v`
Expected: FAIL — `ImportError: cannot import name 'get_sealed_mode'`.

- [ ] **Step 3: Implement `get_sealed_mode`**

Append to `backend/app/services/csp.py`:

```python
async def get_sealed_mode() -> bool:
    """Whether sealed mode is on — the self-only CSP lockdown flag.

    When on, the middleware suppresses all external origins (web-service
    embeds, admin allowlist, plugin browser_origins) so the effective CSP is
    baseline self-only.
    """
    return bool(await config_service.get_value("sealed_mode", False))
```

- [ ] **Step 4: Run unit test to verify it passes**

Run: `cd backend && uv run pytest tests/unit/test_csp.py::TestGetSealedMode -v`
Expected: PASS (2 passed)

- [ ] **Step 5: Wire the middleware sealed branch**

In `backend/app/middleware/security_headers.py`, add `get_sealed_mode` to the csp import block, then change the dispatch `try` body:

```python
from app.services.csp import (
    build_csp,
    get_allowed_origins,
    get_plugin_browser_origins,
    get_sealed_mode,
    get_web_service_origins,
)
```

```python
        try:
            if await get_sealed_mode():
                # Sealed: collapse to baseline self-only — no embeds, allowlist,
                # or plugin origins reach the kiosk browser.
                frame_origins, allowed, plugin_origins = [], [], []
            else:
                frame_origins = await get_web_service_origins()
                allowed = await get_allowed_origins()
                plugin_origins = await get_plugin_browser_origins()
        except Exception:
            # A CSP header must never fail the response. The fallback is already
            # the self-only shape, so a config/DB hiccup fails toward sealed.
            logger.warning("CSP origins lookup failed; falling back to baseline self-only policy")
            frame_origins, allowed, plugin_origins = [], [], []
        response.headers["Content-Security-Policy"] = build_csp(
            frame_origins, [*allowed, *plugin_origins]
        )
        return response
```

- [ ] **Step 6: Write the failing integration test**

Add to `backend/tests/integration/test_security_headers.py` (mirror `test_allowlist_origin_appears_in_three_directives`'s ConfigDB seeding + the plugin-origins patch idiom):

```python
    def test_sealed_mode_forces_self_only_csp(self, security_test_client, monkeypatch):
        """With sealed_mode on, the CSP is baseline self-only even when a web-service
        embed, an admin allowlist entry, and a plugin browser_origins all exist."""
        import json

        from app.models.db_models import ConfigDB, PluginDB

        class _Meta:
            browser_origins = ["cast.example.com"]

        class _Plugin:
            metadata = _Meta()

        import app.plugins.manager as manager_module

        monkeypatch.setattr(
            manager_module.plugin_manager, "get_plugins", lambda enabled_only=True: [_Plugin()]
        )

        async def _seed():
            await ConfigDB.objects.create(
                key="security_allowed_origins",
                value=json.dumps(["https://grafana.lab:3000"]),
                value_type="json",
            )
            await ConfigDB.objects.create(key="sealed_mode", value="true", value_type="bool")
            await PluginDB.objects.create(
                id="ws-embed",
                type_id="iframe",
                plugin_type="service",
                name="Embed",
                enabled=True,
                config={"url": "https://embed.internal/board"},
                display_order=0,
                created_at=datetime.utcnow(),
                updated_at=datetime.utcnow(),
            )

        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:
            loop.run_until_complete(_seed())
        finally:
            loop.close()

        csp = security_test_client.get("/api/health").headers.get("content-security-policy", "")
        assert "frame-src 'self';" in csp + ";"  # frame-src has no extra origins
        assert "cast.example.com" not in csp
        assert "grafana.lab" not in csp
        assert "embed.internal" not in csp
        # Baseline directives intact
        assert "default-src 'self'" in csp
        assert "img-src 'self' data:" in csp
        assert "connect-src 'self'" in csp
```

> Note the assertion `"frame-src 'self';" in csp + ";"` guards that `frame-src` ends with just `'self'` (the `+ ";"` handles frame-src being the last directive). If the file's other tests use a cleaner idiom to assert "no extra origins in a directive," prefer that. The key asserts are the three `not in csp` checks.

- [ ] **Step 7: Run integration tests (fail → pass), then the CSP regression set**

Run: `cd backend && uv run pytest tests/integration/test_security_headers.py -v`
Expected: the new test PASSES with the sealed branch in place; all prior CSP tests still pass (they have no `sealed_mode` config, so the `else` branch runs unchanged).

Run: `cd backend && uv run pytest tests/unit/test_csp.py tests/integration/test_security_headers.py tests/integration/test_security_allowlist.py -q`
Expected: PASS (all).

- [ ] **Step 8: Commit**

```bash
git add backend/app/services/csp.py backend/app/middleware/security_headers.py backend/tests/unit/test_csp.py backend/tests/integration/test_security_headers.py
git commit -m "feat(csp): sealed mode — self-only CSP when the sealed_mode flag is on"
```

---

### Task 2: `GET/PUT /api/security/sealed-mode` API

**Files:**
- Modify: `backend/app/api/routes/security.py`
- Test: `backend/tests/integration/test_security_allowlist.py` (add a sealed-mode class) — this file already exercises the security router via `test_client`.
- Regenerate: `backend/tests/contract/openapi.json`, `frontend/src/api/types.ts`

**Interfaces:**
- Produces: `GET /api/security/sealed-mode` → `{"sealed_mode": bool}`; `PUT` body `{"sealed_mode": bool}` → persists + echoes.

- [ ] **Step 1: Write the failing integration test**

Add to `backend/tests/integration/test_security_allowlist.py`:

```python
@pytest.mark.integration
class TestSealedModeApi:
    def test_get_defaults_to_false(self, test_client: TestClient):
        response = test_client.get("/api/security/sealed-mode")
        assert response.status_code == 200
        assert response.json() == {"sealed_mode": False}

    def test_put_persists_and_roundtrips(self, test_client: TestClient):
        assert test_client.put(
            "/api/security/sealed-mode", json={"sealed_mode": True}
        ).json() == {"sealed_mode": True}
        assert test_client.get("/api/security/sealed-mode").json() == {"sealed_mode": True}

        assert test_client.put(
            "/api/security/sealed-mode", json={"sealed_mode": False}
        ).json() == {"sealed_mode": False}
        assert test_client.get("/api/security/sealed-mode").json() == {"sealed_mode": False}

    def test_put_non_bool_is_422(self, test_client: TestClient):
        assert test_client.put(
            "/api/security/sealed-mode", json={"sealed_mode": "yes"}
        ).status_code == 422
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd backend && uv run pytest tests/integration/test_security_allowlist.py::TestSealedModeApi -v`
Expected: FAIL — 404 (route not defined).

- [ ] **Step 3: Add the endpoints**

Append to `backend/app/api/routes/security.py` (the `config_service` import is already present):

```python
_SEALED_KEY = "sealed_mode"


class SealedModeBody(BaseModel):
    sealed_mode: bool


@router.get("/security/sealed-mode")
async def get_sealed_mode_setting():
    """Return whether sealed mode (self-only CSP lockdown) is on."""
    stored = await config_service.get_value(_SEALED_KEY, False)
    return {"sealed_mode": bool(stored)}


@router.put("/security/sealed-mode")
async def put_sealed_mode_setting(body: SealedModeBody):
    """Enable or disable sealed mode."""
    await config_service.set_value(_SEALED_KEY, body.sealed_mode, value_type="bool")
    return {"sealed_mode": body.sealed_mode}
```

- [ ] **Step 4: Run the API test to verify it passes**

Run: `cd backend && uv run pytest tests/integration/test_security_allowlist.py::TestSealedModeApi -v`
Expected: PASS (3 passed)

- [ ] **Step 5: Regenerate the OpenAPI snapshot + frontend types**

The new route drifts the contract snapshot. Regenerate both:

Run: `cd backend && UPDATE_OPENAPI_SNAPSHOT=1 uv run pytest tests/contract/test_openapi_snapshot.py -q`
Then: `cd frontend && npm run gen:api`
Then verify the snapshot test passes clean:
Run: `cd backend && uv run pytest tests/contract/test_openapi_snapshot.py -q`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/app/api/routes/security.py backend/tests/integration/test_security_allowlist.py backend/tests/contract/openapi.json frontend/src/api/types.ts
git commit -m "feat(api): GET/PUT /api/security/sealed-mode"
```

---

### Task 3: Enable-guard — refuse enabling a `browser_origins` plugin while sealed

**Files:**
- Modify: `backend/app/api/routes/plugins/management.py`
- Test: `backend/tests/integration/test_api_plugins.py` (or a focused new test file `backend/tests/integration/test_sealed_mode_enable_guard.py`)

**Interfaces:**
- Consumes: `get_sealed_mode` (Task 1), `plugin_loader.get_plugin_types()` (returns `PluginMetadata` with `browser_origins`), `type_info` and `db_type` already resolved in `_update_plugin_type`.

- [ ] **Step 1: Write the failing test**

Create `backend/tests/integration/test_sealed_mode_enable_guard.py`. The guard sits early in `_update_plugin_type` (before any DB write), so the test patches `plugin_loader.get_plugin_types` to present a fake type with `browser_origins`, patches the management module's `get_sealed_mode`, and PUTs an enable:

```python
"""Integration tests for the sealed-mode plugin-enable guard."""

from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient


def _fake_types():
    # PluginMetadata-shaped: has type_id + browser_origins; is NOT a theme.
    return [
        SimpleNamespace(type_id="castish", browser_origins=["cast.example.com"], plugin_type="service"),
        SimpleNamespace(type_id="plain", browser_origins=[], plugin_type="service"),
    ]


@pytest.mark.integration
class TestSealedModeEnableGuard:
    def test_enabling_browser_origins_plugin_while_sealed_is_403(self, test_client: TestClient):
        with (
            patch(
                "app.api.routes.plugins.management.plugin_loader.get_plugin_types",
                return_value=_fake_types(),
            ),
            patch(
                "app.api.routes.plugins.management.get_sealed_mode",
                new=AsyncMock(return_value=True),
            ),
        ):
            resp = test_client.put("/api/plugins/castish", json={"enabled": True})
        assert resp.status_code == 403
        assert "sealed mode" in resp.json()["detail"].lower()

    def test_enabling_plugin_without_browser_origins_while_sealed_is_allowed(
        self, test_client: TestClient
    ):
        with (
            patch(
                "app.api.routes.plugins.management.plugin_loader.get_plugin_types",
                return_value=_fake_types(),
            ),
            patch(
                "app.api.routes.plugins.management.get_sealed_mode",
                new=AsyncMock(return_value=True),
            ),
        ):
            resp = test_client.put("/api/plugins/plain", json={"enabled": True})
        assert resp.status_code != 403

    def test_enabling_browser_origins_plugin_while_unsealed_is_allowed(
        self, test_client: TestClient
    ):
        with (
            patch(
                "app.api.routes.plugins.management.plugin_loader.get_plugin_types",
                return_value=_fake_types(),
            ),
            patch(
                "app.api.routes.plugins.management.get_sealed_mode",
                new=AsyncMock(return_value=False),
            ),
        ):
            resp = test_client.put("/api/plugins/castish", json={"enabled": True})
        assert resp.status_code != 403
```

> The non-403 tests may return 200 or another non-403 status depending on how far `_update_plugin_type` proceeds for a fake type; the assertion is specifically `!= 403` (the guard did not fire). If a fake type causes an unrelated 500 downstream, narrow the fake to satisfy `_update_plugin_type` far enough, or assert the guard by other means — but do NOT weaken the 403 assertion in the first test.

- [ ] **Step 2: Run to verify the first test fails**

Run: `cd backend && uv run pytest tests/integration/test_sealed_mode_enable_guard.py -v`
Expected: `test_enabling_browser_origins_plugin_while_sealed_is_403` FAILS (no guard yet → not 403).

- [ ] **Step 3: Add the import**

In `backend/app/api/routes/plugins/management.py`, add near the other `app.services` imports:

```python
from app.services.csp import get_sealed_mode
```

- [ ] **Step 4: Add the guard**

In `_update_plugin_type`, immediately after `db_type = await PluginTypeDB.objects.get_or_none(type_id=plugin_id)` (the line before the theme branch), insert:

```python
    # Sealed-mode guard: refuse to ENABLE a plugin that declares browser_origins,
    # so the operator never ends up with a silently browser-blocked widget. Only
    # a False->True transition is blocked; already-enabled plugins are untouched.
    if enabled is True and getattr(type_info, "browser_origins", None):
        already_enabled = bool(db_type and db_type.enabled)
        if not already_enabled and await get_sealed_mode():
            raise HTTPException(
                status_code=403,
                detail=(
                    "Cannot enable a plugin that declares browser_origins while "
                    "sealed mode is on. Disable sealed mode first (Settings → Security)."
                ),
            )
```

- [ ] **Step 5: Run to verify tests pass**

Run: `cd backend && uv run pytest tests/integration/test_sealed_mode_enable_guard.py -v`
Expected: PASS (3 passed)

- [ ] **Step 6: Regression on plugin management**

Run: `cd backend && uv run pytest tests/integration/test_api_plugins.py -q`
Expected: PASS (unchanged — no sealed_mode config in those tests, so the guard never fires).

- [ ] **Step 7: Commit**

```bash
git add backend/app/api/routes/plugins/management.py backend/tests/integration/test_sealed_mode_enable_guard.py
git commit -m "feat(plugins): refuse enabling a browser_origins plugin while sealed"
```

---

### Task 4: Frontend — sealed-mode toggle + store actions

**Files:**
- Modify: `frontend/src/stores/security.js`
- Modify: `frontend/src/components/settings/categories/SecuritySettings.vue`
- Test: `frontend/tests/unit/stores/security.spec.js`, `frontend/tests/unit/components/settings/SecuritySettings.spec.js`

**Interfaces:**
- Produces store: `fetchSealedMode() -> Promise<bool>`, `saveSealedMode(bool) -> Promise<void>`.

- [ ] **Step 1: Write failing store tests**

Add to `frontend/tests/unit/stores/security.spec.js`:

```javascript
  it("fetchSealedMode GETs and returns the flag", async () => {
    axios.get.mockResolvedValue({ data: { sealed_mode: true } });
    const store = useSecurityStore();
    expect(await store.fetchSealedMode()).toBe(true);
    expect(axios.get).toHaveBeenCalledWith("/api/security/sealed-mode");
  });

  it("fetchSealedMode returns false when the field is missing", async () => {
    axios.get.mockResolvedValue({ data: {} });
    const store = useSecurityStore();
    expect(await store.fetchSealedMode()).toBe(false);
  });

  it("saveSealedMode PUTs under the sealed_mode key", async () => {
    axios.put.mockResolvedValue({ data: { sealed_mode: true } });
    const store = useSecurityStore();
    await store.saveSealedMode(true);
    expect(axios.put).toHaveBeenCalledWith("/api/security/sealed-mode", { sealed_mode: true });
  });
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd frontend && npm run test -- --run tests/unit/stores/security.spec.js`
Expected: FAIL — `store.fetchSealedMode is not a function`.

- [ ] **Step 3: Add store actions**

In `frontend/src/stores/security.js`, add before the `return`:

```javascript
  async function fetchSealedMode() {
    try {
      const response = await axios.get("/api/security/sealed-mode");
      return response.data?.sealed_mode ?? false;
    } catch (err) {
      logError("[security]", "Failed to fetch sealed mode:", err);
      throw err;
    }
  }

  async function saveSealedMode(sealedMode) {
    await axios.put("/api/security/sealed-mode", { sealed_mode: sealedMode });
  }
```

And extend the return:

```javascript
  return { fetchAllowedOrigins, saveAllowedOrigins, fetchSealedMode, saveSealedMode };
```

- [ ] **Step 4: Run store tests to verify pass**

Run: `cd frontend && npm run test -- --run tests/unit/stores/security.spec.js`
Expected: PASS (all).

- [ ] **Step 5: Write failing component tests**

In `frontend/tests/unit/components/settings/SecuritySettings.spec.js`, extend the `mountWith` helper to stub the new store methods, and add tests. Update the helper:

```javascript
function mountWith(list = [], sealed = false) {
  setActivePinia(createPinia());
  const store = useSecurityStore();
  store.fetchAllowedOrigins = vi.fn(async () => list);
  store.saveAllowedOrigins = vi.fn(async () => {});
  store.fetchSealedMode = vi.fn(async () => sealed);
  store.saveSealedMode = vi.fn(async () => {});
  const wrapper = mount(SecuritySettings);
  return { wrapper, store };
}
```

Add tests:

```javascript
  it("renders the sealed-mode toggle reflecting current state", async () => {
    const { wrapper } = mountWith([], true);
    await flushPromises();
    expect(wrapper.find("[data-test='sealed-mode-toggle']").element.checked).toBe(true);
  });

  it("saves sealed mode when toggled", async () => {
    const { wrapper, store } = mountWith([], false);
    await flushPromises();
    const toggle = wrapper.find("[data-test='sealed-mode-toggle']");
    await toggle.setValue(true);
    await flushPromises();
    expect(store.saveSealedMode).toHaveBeenCalledWith(true);
  });

  it("marks the allowlist inactive while sealed", async () => {
    const { wrapper } = mountWith(["grafana.lab"], true);
    await flushPromises();
    expect(wrapper.find("[data-test='allowlist-inactive']").exists()).toBe(true);
  });
```

- [ ] **Step 6: Run to verify they fail**

Run: `cd frontend && npm run test -- --run tests/unit/components/settings/SecuritySettings.spec.js`
Expected: FAIL — no `sealed-mode-toggle` element.

- [ ] **Step 7: Implement the toggle + dimming in `SecuritySettings.vue`**

Add a sealed-mode section at the **top** of the `<section>` (before `<h2>Allowed origins</h2>`):

```html
    <div class="security-settings__sealed">
      <label class="security-settings__sealed-label">
        <input
          type="checkbox"
          data-test="sealed-mode-toggle"
          :checked="sealed"
          @change="onSealedToggle($event.target.checked)"
        />
        <span>Sealed mode</span>
      </label>
      <p class="security-settings__intro">
        Locks the kiosk to your Calvin server only — no external embeds, allowed origins, or
        plugins that reach outside. Calendars, photos, and local-data plugins keep working.
      </p>
    </div>
```

Wrap the allowlist body so it can be marked inactive. Change the allowed-origins block to show an inactive banner when sealed:

```html
    <p v-if="sealed" data-test="allowlist-inactive" class="security-settings__inactive">
      Ignored while sealed mode is on.
    </p>
```

Place that line just under `<h2>Allowed origins</h2>`. Optionally add `:class="{ 'is-inactive': sealed }"` to the `<ul>`/add block for dimming (a CSS-only nicety; the `data-test='allowlist-inactive'` element is what the test asserts).

In `<script setup>`, add the sealed state + handlers:

```javascript
const sealed = ref(false);

onMounted(async () => {
  try {
    origins.value = await store.fetchAllowedOrigins();
    sealed.value = await store.fetchSealedMode();
  } catch (err) {
    logError("[SecuritySettings]", "load failed", err);
  }
});

async function onSealedToggle(value) {
  sealed.value = value;
  try {
    await store.saveSealedMode(value);
  } catch (err) {
    error.value = err?.response?.data?.detail || "Failed to save sealed mode.";
    logError("[SecuritySettings]", "sealed save failed", err);
    sealed.value = !value; // revert optimistic toggle on failure
  }
}
```

> Replace the existing `onMounted` block rather than adding a second one — merge the `fetchSealedMode` line into the existing handler as shown.

- [ ] **Step 8: Run component tests to verify pass**

Run: `cd frontend && npm run test -- --run tests/unit/components/settings/SecuritySettings.spec.js`
Expected: PASS (all — new and existing).

- [ ] **Step 9: Lint + format the changed frontend files**

Run: `cd frontend && npx prettier@3.6.2 --write src/stores/security.js src/components/settings/categories/SecuritySettings.vue tests/unit/stores/security.spec.js tests/unit/components/settings/SecuritySettings.spec.js && npx eslint src/stores/security.js src/components/settings/categories/SecuritySettings.vue`
Expected: no errors.

- [ ] **Step 10: Commit**

```bash
git add frontend/src/stores/security.js frontend/src/components/settings/categories/SecuritySettings.vue frontend/tests/unit/stores/security.spec.js frontend/tests/unit/components/settings/SecuritySettings.spec.js
git commit -m "feat(settings): sealed-mode toggle in Security settings"
```

---

## Notes for the executor

- All tasks land on branch `feature/sealed-mode` (off `develop`).
- After all tasks: run `cd backend && uv run pytest -q` and `cd frontend && npm run test -- --run`; confirm both green and `git status` clean.
- Pre-commit parity: backend uses ruff `v0.14.11` (format + check); frontend uses prettier `3.6.2`. Run `uvx ruff@0.14.11 format <files>` and `uvx ruff@0.14.11 check <files>` on changed backend files before finishing to match CI.
- Deferred (file as a follow-up issue, not implemented here): the calvin-plugins CI "built bundle references no undeclared origin" contract test.
