# Cycle E2 — Plugin repository (lean) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a configurable default plugin-repository URL (prefilling the existing GitHub install flow) and make plugin installs apply without a server restart.

**Architecture:** Two independent slices. (1) Backend: a new `load_plugin_types_for_single(plugin_id)` in `registry/loader.py` registers a freshly-installed plugin type in the DB immediately; the GitHub and local install paths call it and return `requires_restart: False`. (2) Frontend: `pluginRepositoryUrl` is added as a generic config key (registry + store ref), surfaced as an editable `SettingRow` in the migrated Plugins → Install section, and prefilled into the GitHub repo-URL field on mount. No new endpoints, no second UI; `config_service` is untouched (it is key-agnostic).

**Tech Stack:** FastAPI + Ormar + pytest (backend, `uv`); Vue 3 `<script setup>` + Pinia + Vitest (frontend).

**Reference spec (authoritative):** `docs/design/2026-06-29-cycle-e2-plugin-repository-lean.md`.

## Global Constraints

Every task implicitly includes these.

- **Branch:** `feat/design-settings-cycle-c`. Do **not** create a new branch. Do **not** `git push`.
- Re-implement fresh from tag `salvage/plugin-repository` as a *reference only* — do **not** merge the WIP branch, and do **not** port the WIP `run_with_retry` refactor (use the existing `@retry_on_db_locked` decorator).
- **Out of scope (do not build):** `/plugins/repository/browse`, `/plugins/repository/install-from-repo`, server-side installed-status enrichment, any second "Repository"/marketplace tab, `config_service` changes, DB migrations, timestamp columns.
- Default `pluginRepositoryUrl` value: exactly `https://github.com/osterbergsimon/calvin-plugins`.
- New frontend UI uses the new shell tokens only (`--ink`, `--bg-1/2`, `--line`, `--focus`, `--font-ui`; ≥44px touch; `:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px }`). No legacy tokens, no hardcoded hex/rgb.
- **Staging:** `git add` **only** the explicit file(s) each task changes. NEVER `git add -A`/`.`. Untracked `.beads/`, `frontend/public/test-calendar.ics`, and the tracked-but-unrelated `.beads/issues.jsonl` must never be staged.
- **Commit trailer:** every commit message ends with `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>` (use `git commit -F -`).
- **Gates:** backend `cd backend && uv run pytest` green; frontend `cd frontend && npx vitest run` green; `cd frontend && npx eslint src` 0/0. Backend lint: `cd backend && uv run ruff check app` (0 problems) if ruff is configured.

---

### Task 1: Backend — no-restart installs

**Files:**
- Modify: `backend/app/plugins/registry/loader.py` (add `load_plugin_types_for_single`)
- Modify: `backend/app/api/routes/plugins/github.py` (call it in the plugin install + local install paths; flip `requires_restart`)
- Test: `backend/tests/unit/test_registry_loader_single.py` (new)

**Interfaces:**
- Produces: `async def load_plugin_types_for_single(plugin_id: str) -> None` in `app.plugins.registry.loader`. Looks up the type via `plugin_loader.get_plugin_types()`; registers/updates its `PluginTypeDB` row; no-ops (warns) if not found.
- Consumes (existing): `from app.utils.db_retry import retry_on_db_locked` (decorator, already used in this file); `from app.plugins.definitions import PluginDefinition`; `from app.plugins.loader import plugin_loader`; `from app.models.db_models import PluginTypeDB`.

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/unit/test_registry_loader_single.py`. Mirrors the conventions in `backend/tests/unit/test_plugin_registry.py` (`@pytest.mark.asyncio`, patch `app.plugins.registry.loader.plugin_loader`, use the `test_db` fixture for DB access).

```python
"""Tests for load_plugin_types_for_single (no-restart install registration)."""

from unittest.mock import MagicMock, patch

import pytest

from app.models.db_models import PluginTypeDB
from app.plugins.base import PluginType
from app.plugins.registry.loader import load_plugin_types_for_single


def _type_info(type_id="acme", name="Acme", version="1.0.0", schema=None):
    return {
        "type_id": type_id,
        "plugin_type": PluginType.SERVICE,
        "name": name,
        "description": "Acme plugin",
        "version": version,
        "common_config_schema": schema or {},
    }


@pytest.mark.unit
@pytest.mark.asyncio
@patch("app.plugins.registry.loader.plugin_loader")
async def test_creates_new_plugin_type(mock_loader, test_db):
    mock_loader.get_plugin_types.return_value = [_type_info()]

    await load_plugin_types_for_single("acme")

    row = await PluginTypeDB.objects.get_or_none(type_id="acme")
    assert row is not None
    assert row.name == "Acme"
    assert row.version == "1.0.0"
    assert row.enabled is False  # newly registered types default to disabled


@pytest.mark.unit
@pytest.mark.asyncio
@patch("app.plugins.registry.loader.plugin_loader")
async def test_updates_existing_plugin_type_and_merges_schema(mock_loader, test_db):
    await PluginTypeDB.objects.create(
        type_id="acme",
        plugin_type="service",
        name="Old",
        description="old",
        version="0.9.0",
        common_config_schema={"existing": {"keep": True}},
        enabled=True,
    )
    mock_loader.get_plugin_types.return_value = [
        _type_info(version="2.0.0", schema={"added": {"x": 1}})
    ]

    await load_plugin_types_for_single("acme")

    row = await PluginTypeDB.objects.get_or_none(type_id="acme")
    assert row.version == "2.0.0"
    assert row.name == "Acme"
    assert "existing" in row.common_config_schema  # existing keys preserved
    assert "added" in row.common_config_schema  # metadata keys merged in
    assert row.enabled is True  # update must not flip enabled state


@pytest.mark.unit
@pytest.mark.asyncio
@patch("app.plugins.registry.loader.plugin_loader")
async def test_not_found_is_noop(mock_loader, test_db):
    mock_loader.get_plugin_types.return_value = [_type_info(type_id="other")]

    await load_plugin_types_for_single("missing")  # must not raise

    assert await PluginTypeDB.objects.get_or_none(type_id="missing") is None
```

- [ ] **Step 2: Run the tests — verify they fail**

Run: `cd backend && uv run pytest tests/unit/test_registry_loader_single.py -v`
Expected: FAIL — `ImportError: cannot import name 'load_plugin_types_for_single'`.

- [ ] **Step 3: Implement `load_plugin_types_for_single`**

In `backend/app/plugins/registry/loader.py`, add this function (place it after `load_plugin_types`). It mirrors that function's per-type save body but for one id, and uses the existing `@retry_on_db_locked` decorator (NOT `run_with_retry`).

```python
async def load_plugin_types_for_single(plugin_id: str) -> None:
    """Register a single plugin type in the database after install.

    Mirrors the per-type save logic from ``load_plugin_types()`` for one
    ``plugin_id`` so a freshly installed plugin appears in
    ``get_plugin_types()`` output without a server restart. Handles both
    create (no existing row) and update (row already exists). No-ops with a
    warning if the type is not found after install.
    """
    plugin_types = plugin_loader.get_plugin_types()
    type_info = next((t for t in plugin_types if t.get("type_id") == plugin_id), None)
    if type_info is None:
        logger.warning(
            "Plugin type {} not found after install — skipping DB registration", plugin_id
        )
        return

    try:
        type_info = PluginDefinition.from_raw(type_info)
        type_id: str = type_info.type_id  # type: ignore[assignment]
    except Exception:
        logger.exception(
            "Plugin {} failed PluginDefinition validation — skipping DB registration", plugin_id
        )
        return

    db_type = await PluginTypeDB.objects.get_or_none(type_id=type_id)

    from app.utils.db_retry import retry_on_db_locked

    @retry_on_db_locked(max_retries=5, initial_delay=0.1, max_delay=1.0)
    async def _save_plugin_type() -> None:
        nonlocal db_type
        plugin_type_value = (
            type_info.plugin_type.value
            if hasattr(type_info.plugin_type, "value")
            else str(type_info.plugin_type)
        )
        if not db_type:
            await PluginTypeDB.objects.create(
                type_id=type_id,
                plugin_type=plugin_type_value,
                name=type_info.name or type_id or "Unknown Plugin",
                description=type_info.description,
                version=type_info.version,
                common_config_schema=type_info.common_config_schema,
                enabled=False,
                error_message=None,
            )
        else:
            db_type.name = type_info.name or type_id or "Unknown Plugin"
            db_type.description = type_info.description
            db_type.version = type_info.version
            metadata_schema = type_info.common_config_schema or {}
            existing_schema = db_type.common_config_schema or {}
            db_type.common_config_schema = {**metadata_schema, **existing_schema}
            db_type.plugin_type = plugin_type_value
            db_type.error_message = None
            await db_type.save_with_timestamp()

    await _save_plugin_type()
```

Confirm the top of `loader.py` already imports `logger` (loguru), `PluginDefinition`, `plugin_loader`, and `PluginTypeDB` — it does (used by `load_plugin_types`). Do not add duplicate imports.

- [ ] **Step 4: Run the tests — verify they pass**

Run: `cd backend && uv run pytest tests/unit/test_registry_loader_single.py -v`
Expected: PASS (3 passed).

- [ ] **Step 5: Wire into the install paths + flip `requires_restart`**

In `backend/app/api/routes/plugins/github.py`:

(a) Add the import near the other `app.plugins...` imports at the top:
```python
from app.plugins.registry.loader import load_plugin_types_for_single
```

(b) In the plugin (non-theme) install success path, replace this block:
```python
                actual_branch = "master" if branch_switched else branch
                return {
                    "success": True,
                    "message": f"Plugin {manifest['id']} installed successfully from {repo_url}",
                    "manifest": manifest,
                    "branch": actual_branch,
                    "branch_switched": branch_switched,
                    "requires_restart": True,
                    "frontend_rebuild_in_progress": False,
                }
```
with:
```python
                actual_branch = "master" if branch_switched else branch
                # Register the plugin type now so it appears without a restart.
                await load_plugin_types_for_single(manifest["id"])
                return {
                    "success": True,
                    "message": f"Plugin {manifest['id']} installed successfully from {repo_url}",
                    "manifest": manifest,
                    "branch": actual_branch,
                    "branch_switched": branch_switched,
                    "requires_restart": False,
                    "frontend_rebuild_in_progress": False,
                }
```

(c) In `install_plugin_from_local`, replace this block:
```python
            return {
                "success": True,
                "message": f"Plugin {manifest['id']} installed successfully",
                "manifest": manifest,
                "requires_restart": True,
                "frontend_rebuild_in_progress": False,
            }
```
with:
```python
            await load_plugin_types_for_single(manifest["id"])
            return {
                "success": True,
                "message": f"Plugin {manifest['id']} installed successfully",
                "manifest": manifest,
                "requires_restart": False,
                "frontend_rebuild_in_progress": False,
            }
```

Leave theme installs unchanged (already `requires_restart: False`). Do not touch the GitHub *enumerate* path.

- [ ] **Step 6: Verify the full backend suite + lint**

Run: `cd backend && uv run pytest`
Expected: all pass (prior count + the 3 new tests; no regressions).
Run: `cd backend && uv run ruff check app/plugins/registry/loader.py app/api/routes/plugins/github.py`
Expected: 0 problems (skip if ruff isn't configured).

- [ ] **Step 7: Commit**

```bash
git add backend/app/plugins/registry/loader.py backend/app/api/routes/plugins/github.py backend/tests/unit/test_registry_loader_single.py
git commit -F - <<'EOF'
feat(plugins): register installed plugin type immediately (no-restart installs)

Add load_plugin_types_for_single() and call it from the GitHub and local
install paths so a freshly installed plugin appears in the Installed list
without a server restart; both paths now return requires_restart: false.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 2: Frontend — configurable default repo (`pluginRepositoryUrl`)

**Files:**
- Modify: `frontend/src/stores/configRegistry.js` (add `CONFIG_FIELD_DEFINITIONS` entry)
- Modify: `frontend/src/stores/config.js` (add ref + `configRefs` entry + return entry)
- Modify: `frontend/src/components/settings/categories/PluginsCategory.vue` (editable SettingRow + onMounted prefill)
- Test: `frontend/tests/unit/stores/configRegistry.spec.js` (add a case) and `frontend/tests/unit/components/PluginsCategory.prefill.spec.js` (new)

**Interfaces:**
- Consumes (existing): `applyConfigPayload(payload, configRefs, {useDefaults})` maps `CONFIG_FIELD_DEFINITIONS[].name` → `configRefs[name].value`; `configStore.updateConfig(partial)` persists keys to the backend; `PluginsCategory` already holds `configStore` and a `githubRepoUrl` ref.
- Produces: `configStore.pluginRepositoryUrl` (string ref, default `https://github.com/osterbergsimon/calvin-plugins`).

- [ ] **Step 1: Register the config field**

In `frontend/src/stores/configRegistry.js`, add an entry to the `CONFIG_FIELD_DEFINITIONS` array (place it near other string keys, after the `timeFormat`/`weekStartDay` group is fine):
```js
  {
    name: "pluginRepositoryUrl",
    keys: ["pluginRepositoryUrl", "plugin_repository_url"],
    defaultValue: "https://github.com/osterbergsimon/calvin-plugins",
  },
```

- [ ] **Step 2: Add the store ref, registry mapping, and export**

In `frontend/src/stores/config.js`:

(a) Add the ref near the other simple refs (e.g. after `timeFormat`):
```js
  const pluginRepositoryUrl = ref("https://github.com/osterbergsimon/calvin-plugins"); // Default plugin repo for the GitHub install flow
```

(b) Add `pluginRepositoryUrl,` to the `const configRefs = { ... }` map (so `applyConfigPayload` loads it from the backend payload).

(c) Add `pluginRepositoryUrl,` to the store's `return { ... }` object (so components can read it).

- [ ] **Step 3: Write the failing tests**

(a) In `frontend/tests/unit/stores/configRegistry.spec.js`, add a test asserting the default resolves when applying an empty payload with `useDefaults: true`:
```js
it("defaults pluginRepositoryUrl to the Calvin plugins repo", () => {
  const refs = { pluginRepositoryUrl: { value: "" } };
  applyConfigPayload({}, refs, { useDefaults: true });
  expect(refs.pluginRepositoryUrl.value).toBe(
    "https://github.com/osterbergsimon/calvin-plugins"
  );
});
```
(Match the file's existing import of `applyConfigPayload`; if the spec imports it already, reuse that.)

(b) Create `frontend/tests/unit/components/PluginsCategory.prefill.spec.js`. It mounts `PluginsCategory` with a stubbed config store and asserts the prefill behavior. Mirror the mounting/stubbing pattern used by the existing `frontend/tests/unit/components/PluginManager.spec.js` (Pinia test setup, shallow stubs for child components like `PluginInstaller`/`PluginManager`/`InstanceModal`/`ConfirmModal`/`TabNavigation`/`SettingsSection`/`SettingRow`).

```js
import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import { createTestingPinia } from "@pinia/testing";
import PluginsCategory from "@/components/settings/categories/PluginsCategory.vue";
import { useConfigStore } from "@/stores/config";

const globalStubs = {
  SettingsSection: { template: "<div><slot /></div>" },
  SettingRow: { template: "<div><slot /></div>" },
  PluginInstaller: { template: "<div />", props: ["repoUrl"] },
  PluginManager: true,
  InstanceModal: true,
  ConfirmModal: true,
};

function mountWith(repoUrl) {
  const wrapper = mount(PluginsCategory, {
    global: {
      plugins: [createTestingPinia({ stubActions: true })],
      stubs: globalStubs,
    },
  });
  const store = useConfigStore();
  store.pluginRepositoryUrl = repoUrl;
  return { wrapper, store };
}

describe("PluginsCategory repo prefill", () => {
  it("prefills the GitHub repo URL from pluginRepositoryUrl when empty", async () => {
    const { wrapper } = mountWith("https://github.com/osterbergsimon/calvin-plugins");
    // onMounted prefill runs; the PluginInstaller stub receives the prefilled repo-url
    await wrapper.vm.$nextTick();
    expect(wrapper.findComponent({ name: "PluginInstaller" }).props("repoUrl"))
      .toBe("https://github.com/osterbergsimon/calvin-plugins");
  });
});
```
Note: if the existing component-test harness differs (e.g. uses a manual `useConfigStore` mock instead of `@pinia/testing`), follow that harness instead — the assertion to preserve is: **empty `githubRepoUrl` → prefilled from `pluginRepositoryUrl`; non-empty `githubRepoUrl` → left unchanged.** Add the second (non-empty preserved) case if the harness allows setting `githubRepoUrl` before mount; otherwise cover it via the implementation's guard and note it.

- [ ] **Step 4: Run the tests — verify they fail**

Run: `cd frontend && npx vitest run tests/unit/stores/configRegistry.spec.js tests/unit/components/PluginsCategory.prefill.spec.js`
Expected: FAIL (default not yet wired / prefill not implemented).

- [ ] **Step 5: Implement the SettingRow + prefill in `PluginsCategory.vue`**

(a) Ensure `SettingRow` is imported (add if absent):
```js
import SettingRow from "@/components/settings/shell/SettingRow.vue";
```

(b) Inside the `<SettingsSection id="plugins-install" title="Install">`, **above** the `<PluginInstaller .../>`, add an editable row:
```html
      <SettingRow
        label="Plugin repository URL"
        description="Default GitHub repository the install browser points at."
      >
        <input
          type="url"
          class="repo-url-input"
          :value="configStore.pluginRepositoryUrl"
          @change="onRepoUrlChange"
          placeholder="https://github.com/owner/repo"
        />
      </SettingRow>
```

(c) In `<script setup>`, add the change handler (persists via the existing store action):
```js
const onRepoUrlChange = event => {
  const value = event.target.value.trim();
  configStore.updateConfig({ pluginRepositoryUrl: value });
};
```

(d) Add the prefill in `onMounted` (extend the existing `onMounted`, do not add a second one):
```js
  // Prefill the GitHub install field with the configured repo when empty.
  if (!githubRepoUrl.value && configStore.pluginRepositoryUrl) {
    githubRepoUrl.value = configStore.pluginRepositoryUrl;
  }
```

(e) Add the input style to the component's `<style scoped>` (shell tokens only):
```css
.repo-url-input {
  min-height: 44px;
  width: 320px;
  max-width: 100%;
  padding: 0.5rem 0.75rem;
  background: var(--bg-2);
  color: var(--ink);
  border: 1px solid var(--line);
  border-radius: 8px;
  font-family: var(--font-ui);
  font-size: 0.95rem;
}
.repo-url-input:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: 2px;
  border-color: var(--focus);
}
```

- [ ] **Step 6: Run the tests — verify they pass**

Run: `cd frontend && npx vitest run tests/unit/stores/configRegistry.spec.js tests/unit/components/PluginsCategory.prefill.spec.js`
Expected: PASS.

- [ ] **Step 7: Verify full frontend suite + lint + grep**

Run: `cd frontend && npx vitest run` → full suite passes (prior count + new tests).
Run: `cd frontend && npx eslint src` → 0 problems.
Run (no legacy tokens/hex in the new input CSS):
```bash
cd frontend && grep -nE '\-\-(accent-primary|text-primary|text-secondary|text-tertiary|bg-primary|bg-secondary|bg-tertiary|border-color)|#[0-9a-fA-F]{3,8}\b|rgba?\(' src/components/settings/categories/PluginsCategory.vue
```
Expected: no output (PluginsCategory was fully tokenized in Cycle 1; the new input adds none).

- [ ] **Step 8: Commit**

```bash
git add frontend/src/stores/configRegistry.js frontend/src/stores/config.js frontend/src/components/settings/categories/PluginsCategory.vue frontend/tests/unit/stores/configRegistry.spec.js frontend/tests/unit/components/PluginsCategory.prefill.spec.js
git commit -F - <<'EOF'
feat(settings): configurable plugin repository URL with GitHub-field prefill

Add pluginRepositoryUrl config (default osterbergsimon/calvin-plugins) as an
editable SettingRow in Plugins > Install, and prefill the GitHub install
repo-URL field from it on mount when empty.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 3: On-device verification (manual, controller/user)

Not a code task. Against the running stack (frontend `:5174`, backend `:8001`), open Settings → Plugins → Install:
- The **Plugin repository URL** row shows `https://github.com/osterbergsimon/calvin-plugins`; editing it and reloading persists the new value.
- The GitHub install tab's repo-URL field is **prefilled** with the configured repo (when it was empty); enumerating lists that repo's plugins.
- Installing a plugin makes it appear in the **Installed** list **without a restart prompt**.
- Toggle light/dark theme — the new input renders correctly in both.

---

## Notes for the executor

- Tasks 1 (backend) and 2 (frontend) are independent; do them in order, each its own commit. Task 3 is the manual gate.
- TDD both code tasks: tests first (Step 1–2 must show RED), then implement to GREEN.
- Task 1's only behavior change is `requires_restart: true → false` + immediate type registration. If a broader backend test asserted `requires_restart is True` for installs, update that assertion (it is now `False` by design) and note it in the report — do not revert the flip.
- Task 2 must NOT change `PluginInstaller.vue` internals, `config_service`, or add a DB migration. The prefill must never overwrite a user-entered `githubRepoUrl`.
