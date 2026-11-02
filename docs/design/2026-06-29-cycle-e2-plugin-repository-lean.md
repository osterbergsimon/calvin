# Calvin — Cycle E2: Plugin repository (configurable default + no-restart installs)

**Status:** Design approved. Awaiting implementation planning.
**Date:** 2026-06-29
**Bead:** `calvin-e00` (Cycle 2 of 2). Cycle 1 (Plugins shell migration) shipped in commits 387cbdc..eb792f8.
**Builds on:** Cycle 1 shell migration (PluginsCategory on `SettingsSection`). Branch `feat/design-settings-cycle-c`.
**Salvage reference:** git tag `salvage/plugin-repository` (commit a332b2e) — re-implement fresh; do **not** merge the WIP branch.

---

## 1. Background & scope decision

The WIP envisioned a `/plugins/repository/browse` + `/install-from-repo` marketplace. Investigation against current `develop`/cycle-c found:

- The **existing GitHub install tab already does the browse experience**: `/plugins/github/enumerate` lists a repo's plugins, and `PluginInstaller.vue` already renders them with installed/update badges (`plugin._installed`, `plugin._installedVersion`, "Installed: v1 → Update to v2") and installs selected ones.
- The WIP's frontend **never built a browse UI** — it only prefilled the existing GitHub URL field from a configured `pluginRepositoryUrl`.

So the WIP's `/browse` + `/install-from-repo` endpoints largely **reinvent** existing functionality. Re-scoped against today's code, only two improvements carry genuine, non-duplicative value:

1. **Configurable default repo** (`pluginRepositoryUrl`) — so the user doesn't paste the GitHub URL each time.
2. **No-restart installs** — the existing GitHub/local install returns `requires_restart: true`; registering the new plugin type immediately makes it appear without a restart. Benefits **all** installs.

**This cycle builds only those two.** It does **not** build (YAGNI — the GitHub tab already covers it): the `/plugins/repository/browse` and `/plugins/repository/install-from-repo` endpoints, server-side installed-status enrichment, or any second "Repository" tab/UI.

## 2. Decisions (locked)

- Default `pluginRepositoryUrl` = `https://github.com/osterbergsimon/calvin-plugins`.
- The repo URL is **user-editable** via a `SettingRow` in the Plugins → Install section (discoverable + changeable).
- No-restart install uses the **existing `@retry_on_db_locked` decorator** — NOT the WIP's `run_with_retry` rewrite (that refactor is out of scope and partly superseded on develop).

## 3. Win 1 — Configurable default repo (`pluginRepositoryUrl`)

**Backend:** none. `config_service` is fully key-agnostic — `ConfigDB` is a generic key/value table, `get_config()` returns all rows, and `update_config()`/`set_value()` accept any key with auto-detected type. `pluginRepositoryUrl` flows through automatically once the frontend sends it. No DB migration, no `config_service` edit.

**Frontend:**
- `frontend/src/stores/configRegistry.js` — add a `pluginRepositoryUrl` entry to `CONFIG_FIELD_DEFINITIONS` with default `"https://github.com/osterbergsimon/calvin-plugins"` and `keys: ["pluginRepositoryUrl", "plugin_repository_url"]` (snake/camel tolerance, matching existing entries).
- `frontend/src/stores/config.js` — expose a `pluginRepositoryUrl` `ref` and include it in the store's returned state and in the config load/serialize paths, mirroring how sibling string keys (e.g. `gitRepoUrl`) are wired.
- `frontend/src/components/settings/categories/PluginsCategory.vue`:
  - Add an editable `SettingRow` labelled **"Plugin repository URL"** inside the existing `<SettingsSection id="plugins-install" title="Install">`, above/around the `PluginInstaller`. Bind its value to `configStore.pluginRepositoryUrl`; on change, persist via the existing `configStore.updateConfig({ pluginRepositoryUrl: <value> })` action (PluginsCategory already imports `useConfigStore`). Use the shell input vocabulary (new tokens, ≥44px, `--focus` ring) — it lives in the migrated shell.
  - In `onMounted`, prefill the GitHub install field: `if (!githubRepoUrl.value && configStore.pluginRepositoryUrl) githubRepoUrl.value = configStore.pluginRepositoryUrl;`. Must **not** overwrite a URL the user already typed.
- No change to `PluginInstaller.vue` internals (it already accepts `:repo-url` and emits `update:repoUrl`).

## 4. Win 2 — No-restart installs

**`backend/app/plugins/registry/loader.py`** — add:

```python
async def load_plugin_types_for_single(plugin_id: str) -> None:
    """Register a single plugin type in the DB after install, so a freshly
    installed plugin appears in get_plugin_types() without a server restart.
    Mirrors the per-type save in load_plugin_types(); handles create and
    update; no-ops with a warning if the type isn't found post-install."""
```

Implementation mirrors the per-type body of `load_plugin_types()`: look up the type via `plugin_loader.get_plugin_types()` by `type_id == plugin_id`; if absent, log a warning and return; validate via `PluginDefinition.from_raw`; then a `_save_plugin_type` inner function wrapped with `@retry_on_db_locked(max_retries=5, initial_delay=0.1, max_delay=1.0)` (same decorator/params as `load_plugin_types`) that creates (`enabled=False`, `error_message=None`) or updates the `PluginTypeDB` row (merge `common_config_schema` as `{**metadata_schema, **existing_schema}`, refresh name/description/version/plugin_type, clear `error_message`, `save_with_timestamp()`).

**`backend/app/api/routes/plugins/github.py`:**
- In the plugin (non-theme) install success path (currently returns `requires_restart: True` at ~`:321`): add `await load_plugin_types_for_single(installed_id)` before the return, and set `"requires_restart": False`.
- In `install_plugin_from_local` success path (~`:513`, `requires_restart: True`): same — `await load_plugin_types_for_single(installed_id)` and `"requires_restart": False`. (`installed_id` = `manifest["id"]`, as already computed for validation.)
- Theme installs are unchanged (already `requires_restart: False`).

Import `load_plugin_types_for_single` from `app.plugins.registry.loader` at the top of `github.py`.

## 5. Behavior & compatibility

- The only behavior change is: installs no longer prompt for restart, and the GitHub URL is prefilled. The frontend already branches on `requires_restart` (restart prompt / `@restart` emit) — returning `False` simply skips the prompt; no frontend change needed for that.
- `load_plugin_types_for_single` is additive; `load_plugin_types()` (full load on startup) is unchanged.
- Editing `pluginRepositoryUrl` persists like any other config value; existing installs are unaffected.

## 6. Testing

**Backend (pytest):**
- Unit-test `load_plugin_types_for_single`: (a) create path — a new `PluginTypeDB` row is registered with `enabled=False`; (b) update path — an existing row is updated and `common_config_schema` merged (existing keys win); (c) not-found path — logs a warning and is a no-op (no exception). Port the relevant slices of the salvaged `backend/tests/unit/test_plugin_repository.py` that cover this loader; **drop** the `/browse` and `/install-from-repo` endpoint tests (those endpoints aren't built).
- A focused test that the plugin (non-theme) GitHub install and the local install responses return `requires_restart: False` and that `load_plugin_types_for_single` is invoked (mock the installer pipeline; assert the call + response flag).

**Frontend (vitest):**
- Config store: `pluginRepositoryUrl` default resolves to `https://github.com/osterbergsimon/calvin-plugins`.
- `PluginsCategory`: on mount with an empty `githubRepoUrl`, it is prefilled from `configStore.pluginRepositoryUrl`; with a non-empty `githubRepoUrl`, it is **not** overwritten. Editing the SettingRow calls `configStore.updateConfig({ pluginRepositoryUrl })`.

**Gates:** full `npx vitest run` green; backend `pytest` green; `npx eslint src` 0/0; backend lint clean. On-device: Plugins → Install → GitHub field is prefilled with the configured repo; enumerate lists plugins; installing one makes it appear in **Installed** with no restart prompt; editing the repo URL persists across reload.

## 7. Out of scope / deferred

- `/plugins/repository/browse`, `/plugins/repository/install-from-repo`, server-side installed-status enrichment, a dedicated "Repository"/marketplace tab — not built (existing GitHub tab covers browsing; revisit only if a distinct non-technical "official repo" entry point is wanted later).
- The WIP `run_with_retry` db_retry refactor, `created_at/updated_at` timestamp columns, and other entangled WIP changes — not ported.
- `calvin-4zj` (settings-shell sticky chrome + breadcrumb) — separate cycle.
