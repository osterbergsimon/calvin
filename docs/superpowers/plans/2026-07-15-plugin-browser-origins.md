# Plugin `browser_origins` Contract Field — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an optional `browser_origins` field to the plugin contract so a plugin can declare the fixed, intrinsic origins its frontend is allowed to reach, and have those origins extend the browser-enforced CSP for enabled plugins.

**Architecture:** `browser_origins` lives in `PluginMetadata` (plugin.py), exactly like `display_schema`/`statusbar_schema` — that is the declaration surface the loader instantiates and the runtime CSP builder reads. A Pydantic `field_validator` validates entries at load (reusing the existing `csp.validate_origin`). At request time, `csp.get_plugin_browser_origins()` unions the declared origins of currently-enabled plugins and the middleware merges them into the same broad allowlist slot as the admin allowlist (`frame-src` + `img-src` + `connect-src`). A standalone AST check in the `calvin-plugins` CI validator enforces the same shape before a plugin is ever published.

**Tech Stack:** FastAPI, Pydantic v2, Starlette middleware, pytest (`uv run pytest`, markers `@pytest.mark.unit`/`integration`, `asyncio_mode=auto`). Second repo: `calvin-plugins` (stdlib `ast`, pytest).

## Global Constraints

- `browser_origins` is a list of **CSP host-sources**: bare host (`grafana.lab`), `host:port`, `*.subdomain` wildcard, or `http(s)://host[:port]`. **CIDR / IP-ranges, paths, spaces, and non-http(s) schemes are rejected** — same rules as `csp.validate_origin`.
- Default is an **empty list** (the plugin promises the kiosk only talks to Calvin). Site-specific origins belong in the admin allowlist, **not** here.
- Reuse `app.services.csp.validate_origin` in the backend; do **not** re-implement origin validation in the backend. The `calvin-plugins` validator (separate repo, cannot import backend) reimplements a minimal host-source check that mirrors it.
- When the admin allowlist is empty AND no enabled plugin declares `browser_origins`, the emitted CSP must be **byte-identical** to today's output (no regressions to Phase 1 / PR #102 behavior).
- Origins are re-validated defensively on read (`get_plugin_browser_origins`) so a metadata value can never emit a malformed CSP token.
- Backend field lives in `PluginMetadata` (plugin.py / metadata), **not** `plugin.json`. Do not touch `manifest_validator.py`.

---

### Task 1: `browser_origins` field on `PluginMetadata` + load-time validator

**Files:**
- Modify: `backend/app/plugins/definitions.py` (add field after `statusbar_schema` at line 149; add `field_validator`)
- Test: `backend/tests/unit/test_plugin_definitions.py`

**Interfaces:**
- Consumes: `app.services.csp.validate_origin(value: str) -> str` (raises `ValueError` on bad input).
- Produces: `PluginMetadata.browser_origins: list[str]` — normalized, deduped, order-preserved. Read by Task 2's `get_plugin_browser_origins`.

- [ ] **Step 1: Write the failing tests**

Add to `backend/tests/unit/test_plugin_definitions.py`:

```python
@pytest.mark.unit
class TestBrowserOrigins:
    """browser_origins declares plugin-intrinsic CSP host-sources."""

    def test_defaults_to_empty_list(self):
        metadata = PluginMetadata(type_id="p", name="P")
        assert metadata.browser_origins == []

    def test_accepts_and_normalizes_valid_forms(self):
        metadata = PluginMetadata(
            type_id="p",
            name="P",
            browser_origins=["Grafana.LAB", "*.lab.example.com", "https://X:3000", "10.0.0.5:8080"],
        )
        assert metadata.browser_origins == [
            "grafana.lab",
            "*.lab.example.com",
            "https://x:3000",
            "10.0.0.5:8080",
        ]

    def test_dedupes_preserving_order(self):
        metadata = PluginMetadata(
            type_id="p", name="P", browser_origins=["a.lab", "b.lab", "a.lab"]
        )
        assert metadata.browser_origins == ["a.lab", "b.lab"]

    def test_rejects_cidr(self):
        with pytest.raises(ValidationError):
            PluginMetadata(type_id="p", name="P", browser_origins=["10.0.0.0/24"])

    def test_rejects_path(self):
        with pytest.raises(ValidationError):
            PluginMetadata(type_id="p", name="P", browser_origins=["grafana.lab/d/home"])

    def test_rejects_empty_entry(self):
        with pytest.raises(ValidationError):
            PluginMetadata(type_id="p", name="P", browser_origins=[""])
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && uv run pytest tests/unit/test_plugin_definitions.py::TestBrowserOrigins -v`
Expected: FAIL — `browser_origins` is rejected by `extra="forbid"` (unknown field) / does not exist yet.

- [ ] **Step 3: Add the field**

In `backend/app/plugins/definitions.py`, immediately after the `statusbar_schema` field (line 149):

```python
    # Origins intrinsic to the plugin that the kiosk browser may reach (CSP
    # host-sources; e.g. a fixed SDK host). Default empty = the plugin promises
    # the kiosk only talks to Calvin. Site-specific origins belong in the admin
    # allowlist, not here. See docs/superpowers/specs/2026-07-15-offline-kiosks-csp-design.md.
    browser_origins: list[str] = Field(default_factory=list)
```

- [ ] **Step 4: Add the validator**

In the same class, add alongside the other validators (after `validate_statusbar_schema`, before `validate_instance_identity`):

```python
    @field_validator("browser_origins")
    @classmethod
    def validate_browser_origins(cls, value: list[str]) -> list[str]:
        """Each entry must be a valid CSP host-source (no CIDR); normalize + dedupe.

        A malformed entry fails plugin load rather than silently emitting an
        invalid CSP token at runtime. Imported lazily to avoid any
        plugins<->services import ordering surprise during early load.
        """
        from app.services.csp import validate_origin

        normalized: list[str] = []
        for entry in value:
            try:
                origin = validate_origin(entry)
            except (ValueError, TypeError) as exc:
                raise ValueError(f"browser_origins entry {entry!r} is invalid: {exc}") from exc
            if origin not in normalized:
                normalized.append(origin)
        return normalized
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd backend && uv run pytest tests/unit/test_plugin_definitions.py::TestBrowserOrigins -v`
Expected: PASS (6 passed)

- [ ] **Step 6: Run the surrounding suites to confirm no regression**

Run: `cd backend && uv run pytest tests/unit/test_plugin_definitions.py tests/unit/test_plugin_contract.py -q`
Expected: PASS (all)

- [ ] **Step 7: Commit**

```bash
git add backend/app/plugins/definitions.py backend/tests/unit/test_plugin_definitions.py
git commit -m "feat(plugins): add browser_origins field to PluginMetadata with CSP host-source validation"
```

---

### Task 2: Runtime union into the CSP + middleware wiring

**Files:**
- Modify: `backend/app/services/csp.py` (add `get_plugin_browser_origins`)
- Modify: `backend/app/middleware/security_headers.py` (union plugin origins into `allowed`)
- Test: `backend/tests/unit/test_csp.py`, `backend/tests/integration/test_security_allowlist.py`

**Interfaces:**
- Consumes: `plugin_manager.get_plugins(enabled_only=True) -> list[BasePlugin]`; each plugin's `.metadata.browser_origins` (Task 1). `validate_origin` (existing). `build_csp(frame_origins, allowed_origins)` (existing, unchanged — it already dedupes `allowed_origins` and applies them to frame/img/connect).
- Produces: `async get_plugin_browser_origins() -> list[str]` — validated, deduped union of enabled plugins' declared origins.

- [ ] **Step 1: Write the failing unit test**

Add to `backend/tests/unit/test_csp.py` (import `get_plugin_browser_origins` in the existing csp import block):

```python
@pytest.mark.unit
class TestGetPluginBrowserOrigins:
    async def test_unions_and_dedupes_enabled_plugin_origins(self, monkeypatch):
        class _Meta:
            def __init__(self, origins):
                self.browser_origins = origins

        class _Plugin:
            def __init__(self, origins):
                self.metadata = _Meta(origins)

        import app.plugins.manager as manager_module

        def fake_get_plugins(enabled_only=True):
            assert enabled_only is True
            return [_Plugin(["a.lab", "10.0.0.0/24"]), _Plugin(["b.lab", "a.lab"])]

        monkeypatch.setattr(manager_module.plugin_manager, "get_plugins", fake_get_plugins)

        from app.services.csp import get_plugin_browser_origins

        # invalid entry (CIDR) is defensively dropped; valid ones deduped, order preserved
        assert await get_plugin_browser_origins() == ["a.lab", "b.lab"]

    async def test_empty_when_no_plugins(self, monkeypatch):
        import app.plugins.manager as manager_module

        monkeypatch.setattr(manager_module.plugin_manager, "get_plugins", lambda enabled_only=True: [])
        from app.services.csp import get_plugin_browser_origins

        assert await get_plugin_browser_origins() == []
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd backend && uv run pytest tests/unit/test_csp.py::TestGetPluginBrowserOrigins -v`
Expected: FAIL — `ImportError: cannot import name 'get_plugin_browser_origins'`.

- [ ] **Step 3: Implement `get_plugin_browser_origins`**

Append to `backend/app/services/csp.py`:

```python
async def get_plugin_browser_origins() -> list[str]:
    """Union of enabled plugins' declared browser_origins, validated.

    These are origins intrinsic to a plugin (declared in its PluginMetadata).
    Re-validated on read so a metadata value can never emit a malformed CSP
    token. plugin_manager is imported lazily to avoid a plugins<->services
    import cycle (definitions.py already imports this module's validate_origin).
    """
    from app.plugins.manager import plugin_manager

    result: list[str] = []
    for plugin in plugin_manager.get_plugins(enabled_only=True):
        metadata = getattr(plugin, "metadata", None)
        if metadata is None:
            continue
        for entry in getattr(metadata, "browser_origins", None) or []:
            try:
                normalized = validate_origin(entry)
            except (ValueError, TypeError):
                continue
            if normalized not in result:
                result.append(normalized)
    return result
```

- [ ] **Step 4: Run the unit test to verify it passes**

Run: `cd backend && uv run pytest tests/unit/test_csp.py::TestGetPluginBrowserOrigins -v`
Expected: PASS (2 passed)

- [ ] **Step 5: Wire the middleware**

In `backend/app/middleware/security_headers.py`, update the import and dispatch:

```python
from app.services.csp import (
    build_csp,
    get_allowed_origins,
    get_plugin_browser_origins,
    get_web_service_origins,
)
```

```python
        try:
            frame_origins = await get_web_service_origins()
            allowed = await get_allowed_origins()
            plugin_origins = await get_plugin_browser_origins()
        except Exception:
            # A CSP header must never fail the response. On any DB/registry hiccup
            # fall back to the baseline self-only policy rather than 500-ing.
            logger.warning("CSP origins lookup failed; falling back to baseline self-only policy")
            frame_origins, allowed, plugin_origins = [], [], []
        response.headers["Content-Security-Policy"] = build_csp(
            frame_origins, [*allowed, *plugin_origins]
        )
        return response
```

(No `build_csp` change: it already dedupes the combined `allowed_origins` and applies them to `frame-src` + `img-src` + `connect-src`.)

- [ ] **Step 6: Write the failing integration test**

Add to `backend/tests/integration/test_security_allowlist.py` (use the file's existing `security_test_client` / app fixture pattern — mirror the neighboring CSP-header test; monkeypatch `plugin_manager.get_plugins` to return one fake enabled plugin with `browser_origins`):

```python
async def test_plugin_browser_origins_extend_csp(security_test_client, monkeypatch):
    class _Meta:
        browser_origins = ["cast.example.com"]

    class _Plugin:
        metadata = _Meta()

    import app.plugins.manager as manager_module

    monkeypatch.setattr(
        manager_module.plugin_manager, "get_plugins", lambda enabled_only=True: [_Plugin()]
    )

    response = await security_test_client.get("/api/security/allowed-origins")
    csp = response.headers["content-security-policy"]
    assert "frame-src 'self'" in csp and "cast.example.com" in csp
    # present in the three broad fetch/embed directives
    for directive in csp.split(";"):
        directive = directive.strip()
        if directive.startswith(("img-src", "connect-src", "frame-src")):
            assert "cast.example.com" in directive
```

> ⚠️ Adjust the fixture name and request path to whatever the existing tests in this file use. If the file monkeypatches origins differently (e.g. patches `csp.get_web_service_origins`), follow that established idiom rather than introducing a new one.

- [ ] **Step 7: Run it to verify it fails, then passes**

Run: `cd backend && uv run pytest tests/integration/test_security_allowlist.py -v`
Expected: the new test PASSES once the middleware wiring (Step 5) is in place; if it fails, reconcile with the file's actual fixture/monkeypatch idiom.

- [ ] **Step 8: Full CSP + middleware regression**

Run: `cd backend && uv run pytest tests/unit/test_csp.py tests/integration/test_security_allowlist.py tests/integration/test_security_headers.py -q`
Expected: PASS (all). Confirms empty-allowlist output is unchanged.

- [ ] **Step 9: Commit**

```bash
git add backend/app/services/csp.py backend/app/middleware/security_headers.py backend/tests/unit/test_csp.py backend/tests/integration/test_security_allowlist.py
git commit -m "feat(csp): merge enabled plugins' browser_origins into the effective CSP"
```

---

### Task 3: Document the field

**Files:**
- Modify: `docs/plugins/PLUGIN_INTERFACE.md` (add `browser_origins` to the `PluginMetadata` reference)
- Modify: `docs/plugins/PLUGIN_PACKAGE_FORMAT.md` (one line clarifying `browser_origins` is a metadata field, not a `plugin.json` field, and pointing to PLUGIN_INTERFACE.md)

**Interfaces:** none (docs only).

- [ ] **Step 1: Add to PLUGIN_INTERFACE.md**

Find the `PluginMetadata` field table/list and add an entry describing `browser_origins`:

> `browser_origins` (optional, `list[str]`, default `[]`) — Origins intrinsic to the plugin that the kiosk browser is allowed to reach, as CSP host-sources: a host (`grafana.lab`), `host:port`, a `*.` wildcard (`*.lab.example.com`), or an `http(s)://` URL. **CIDR / IP ranges are not accepted** (not expressible in CSP — use a wildcard domain). Leave empty (the default) unless the plugin's frontend genuinely must load from a fixed external origin; **site-specific** service origins belong in the operator's Security → Allowed origins list, not here. Enabled plugins' `browser_origins` extend the kiosk CSP's `frame-src`, `img-src`, and `connect-src`. Validated at load; a malformed entry rejects the plugin.

Match the file's existing formatting (table row vs. bullet) for the other optional fields.

- [ ] **Step 2: Add the clarifying line to PLUGIN_PACKAGE_FORMAT.md**

Where the doc enumerates optional keys / notes what does NOT go in `plugin.json`, add:

> `browser_origins` is declared in `PluginMetadata` (plugin.py), **not** in `plugin.json` — see [PLUGIN_INTERFACE.md](PLUGIN_INTERFACE.md). It is the plugin's declaration of the fixed external origins its frontend may reach; it extends the kiosk CSP for enabled plugins.

- [ ] **Step 3: Commit**

```bash
git add docs/plugins/PLUGIN_INTERFACE.md docs/plugins/PLUGIN_PACKAGE_FORMAT.md
git commit -m "docs(plugins): document the browser_origins metadata field"
```

---

### Task 4: `calvin-plugins` CI validator enforces `browser_origins` shape

**Repo:** `/home/tux/code/calvin-plugins` (separate git repo — commit here, do NOT commit into the calvin worktree). Create a branch off its default branch first.

**Files:**
- Modify: `scripts/validate_plugins.py`
- Test: `test_validate_plugins.py`

**Interfaces:** extends the existing AST `MetadataVisitor` / `MetadataRecord` / `validate_record` pipeline. `validate_plugins(paths)` return contract (list of error strings) unchanged.

- [ ] **Step 1: Write the failing tests**

Add to `test_validate_plugins.py` (reuse `write_valid_plugin` / `VALID_PLUGIN_PY` helpers — write a plugin whose `PluginMetadata(...)` includes a `browser_origins=[...]` kwarg):

```python
_PY_WITH_BROWSER_ORIGINS = """
from app.plugins.definitions import PluginMetadata
from app.plugins.protocols import ServicePlugin


class DemoServicePlugin(ServicePlugin):
    metadata = PluginMetadata(
        type_id="demo_plugin",
        name="Demo Plugin",
        instance_label="Source",
        instance_config_schema={},
        display_schema={"kind": "status", "item": {"label": "Demo", "value_path": "$.v"}},
        browser_origins=[%s],
    )

    async def fetch(self, start_date=None, end_date=None):
        return {"v": 1}
"""


def test_validator_accepts_valid_browser_origins(tmp_path):
    plugin_dir = tmp_path / "demo-plugin"
    src = _PY_WITH_BROWSER_ORIGINS % '"*.lab.example.com", "https://cast.example.com"'
    write_valid_plugin(plugin_dir, src)
    assert _mod.validate_plugins([plugin_dir]) == []


def test_validator_rejects_cidr_browser_origin(tmp_path):
    plugin_dir = tmp_path / "demo-plugin"
    src = _PY_WITH_BROWSER_ORIGINS % '"10.0.0.0/24"'
    write_valid_plugin(plugin_dir, src)
    errors = _mod.validate_plugins([plugin_dir])
    assert any("browser_origins" in e for e in errors)


def test_validator_rejects_non_literal_browser_origin(tmp_path):
    plugin_dir = tmp_path / "demo-plugin"
    src = _PY_WITH_BROWSER_ORIGINS % "SOME_VAR"
    write_valid_plugin(plugin_dir, src)
    errors = _mod.validate_plugins([plugin_dir])
    assert any("browser_origins" in e for e in errors)
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd /home/tux/code/calvin-plugins && python -m pytest test_validate_plugins.py -k browser_origins -v`
Expected: the two "rejects" tests FAIL (validator does not inspect `browser_origins` yet).

- [ ] **Step 3: Extend `MetadataRecord`**

In `scripts/validate_plugins.py`, add to the `MetadataRecord` dataclass (after `statusbar_schema`):

```python
    browser_origins: ast.List | None = None
```

- [ ] **Step 4: Extract it in the visitor**

In `MetadataVisitor.visit_ClassDef`, inside the `MetadataRecord(...)` construction, add:

```python
                    browser_origins=keyword(call, "browser_origins")
                    if isinstance(keyword(call, "browser_origins"), ast.List)
                    else None,
```

Also capture the "declared but not a list literal" case: after building the record, if `keyword(call, "browser_origins")` is non-None but not an `ast.List`, append an error. Simplest: handle it in the validator (Step 5) by checking presence separately. To keep the visitor simple, add this right after appending the record:

```python
            bo_node = keyword(call, "browser_origins")
            if bo_node is not None and not isinstance(bo_node, ast.List):
                self.records[-1].errors.append(
                    "browser_origins must be a list literal of host-source strings"
                )
```

- [ ] **Step 5: Add the host-source check + validation function**

Near the top of `scripts/validate_plugins.py` (after imports), add:

```python
import re

# Mirrors backend app.services.csp.validate_origin (this repo cannot import the backend).
_HOST_SOURCE_RE = re.compile(
    r"^(?:\*\.)?(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)*"
    r"[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?::\d{1,5})?$"
)


def _is_valid_host_source(value: str) -> bool:
    raw = value.strip()
    if not raw:
        return False
    host = raw
    if "://" in raw:
        scheme, host = raw.split("://", 1)
        if scheme.lower() not in ("http", "https"):
            return False
    if "/" in host or any(c in host for c in " \t?#"):
        return False
    return bool(_HOST_SOURCE_RE.match(host.lower()))
```

Add a validator:

```python
def validate_browser_origins(record: MetadataRecord) -> None:
    if record.browser_origins is None:
        return
    for elt in record.browser_origins.elts:
        literal = literal_string(elt)
        if literal is None:
            record.errors.append("browser_origins entries must be string literals")
            continue
        if not _is_valid_host_source(literal):
            record.errors.append(
                f"browser_origins entry {literal!r} is not a valid CSP host-source "
                "(no CIDR/paths; use a host, host:port, *.wildcard, or http(s):// URL)"
            )
```

- [ ] **Step 6: Call it from `validate_record`**

Add to `validate_record` after `validate_actions(record)`:

```python
    validate_browser_origins(record)
```

- [ ] **Step 7: Run the new tests, then the full validator suite**

Run: `cd /home/tux/code/calvin-plugins && python -m pytest test_validate_plugins.py -v`
Expected: PASS (all, including the 3 new browser_origins tests and the existing `test_owned_plugins_pass_metadata_validation` — the shipped plugins declare no `browser_origins`, so they stay green).

- [ ] **Step 8: Commit (in the calvin-plugins repo)**

```bash
cd /home/tux/code/calvin-plugins
git add scripts/validate_plugins.py test_validate_plugins.py
git commit -m "feat(validator): enforce browser_origins host-source shape in CI"
```

---

## Notes for the executor

- Tasks 1–3 land on the current calvin worktree branch `feature/csp-allowlist` (extending PR #102's Phase-2 work). Task 4 is a **separate commit in the `calvin-plugins` repo** on its own branch — it will need its own PR there.
- Chromecast is intentionally **not** modified: its `album_art_url` is a variable, app-dependent CDN host, which the *admin* allowlist (already shipped in #102) covers — a fixed plugin-declared list does not fit it. This is a deliberate scope decision, not an oversight.
- After all tasks: run `cd backend && uv run pytest -q` for the backend and the full `test_validate_plugins.py` for the validator; verify `git status` clean in both repos before finishing.
