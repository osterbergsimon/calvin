# Calvin — Developer Guide

Orientation for humans and AI agents working on Calvin. Read this first; follow the links for depth.

Calvin is a self-hosted Raspberry Pi dashboard (calendars, photos, web services) with a Vue 3 frontend, a FastAPI backend, and a plugin system. Plugins live in a **separate repo** at `../calvin-plugins/` and are installed into `data/plugins/{plugin_id}/` at runtime.

## Stack

- **Backend:** FastAPI + uvicorn, Python 3.12+, `uv` package manager, Ormar ORM + Alembic (SQLite), APScheduler, Loguru (unified via `InterceptHandler`), Pluggy for plugin hooks.
- **Frontend:** Vue 3 Composition API, Vite, Pinia stores, Vue Router. Built to `frontend/dist/` and served by FastAPI at `/`. API lives at `/api/*`.
- **Platforms:** develop on Windows/Linux, deploy on Raspberry Pi. Keyboard input uses `evdev` on Linux, a mock on Windows.

Entry points: [backend/app/main.py](backend/app/main.py) (lifespan → DB init → plugin load → schedulers), [frontend/src/main.js](frontend/src/main.js).

## Plugin system — the core pattern

**Plugins must be fully self-contained.** One directory holds everything: backend logic, config schema, frontend components, assets, manifest. No cross-plugin imports. A plugin only imports from `app.*` or third-party libraries.

A plugin directory:

```
{plugin_id}/
  plugin.json       # manifest: id, name, type, version, format_version, deps, requirements
  plugin.py         # backend: Pluggy hook impls + BasePlugin subclass
  frontend/         # optional Vue components, copied to frontend/src/components/plugins/{plugin_id}/ at install
  ...assets
```

**Plugin types:** `calendar`, `image`, `service`, `backend`, `theme` — see [app/plugins/base.py](backend/app/plugins/base.py).

**Contract (backend):**
- Implement a `BasePlugin` subclass with `initialize()`, `cleanup()`, `get_plugin_metadata()`.
- Register via Pluggy hooks in `plugin.py`: `register_plugin_types()`, `create_plugin_instance()`, and optionally `handle_plugin_config_update`, `test_plugin_connection`, `fetch_plugin_data`, `fetch_service_data`. See [app/plugins/hooks.py](backend/app/plugins/hooks.py).
- Use `instance_config_schema` in metadata to declare per-instance settings — the frontend auto-generates forms from this via `PluginFieldRenderer`. Don't hand-roll settings UI.
- For multi-instance plugins, use the generic helpers in `app/utils/instance_manager.py` (`extract_config_value`, `InstanceManagerConfig`, `handle_plugin_config_update_generic`). Avoid reimplementing CRUD.

**Contract (frontend):**
- Declare UI in metadata: `display_schema.component` (main view) and/or `statusbar_schema` (status bar item).
- Component files go in the plugin's `frontend/` dir and are copied into `frontend/src/components/plugins/{plugin_id}/` at install time.
- Components are discovered via a Vite glob and loaded dynamically by [usePluginComponent.js](frontend/src/composables/usePluginComponent.js). No manual registration.
- Frontend auto-rebuilds when a plugin with UI is installed — `FrontendBuildManager` in [plugin_installer.py](backend/app/services/plugin_installer.py) writes a `.rebuild_needed` marker and runs `npm run build` in the background; startup resumes interrupted builds.

**Reference plugin:** [`mealie/`](../calvin-plugins/mealie) in `calvin-plugins`. Scaffolding guide: [calvin-plugins/CREATING_PLUGINS.md](../calvin-plugins/CREATING_PLUGINS.md). Detailed specs in [docs/plugins/](docs/plugins/).

## Conventions

**State (frontend):** one Pinia store per domain (`config`, `webServices`, `calendar`, `images`, `themes`, `keyboard`, `mode`, `connection`). Stores expose refs + async actions. Network calls try the API first and fall back to localStorage cache with TTL (see [utils/cache.js](frontend/src/utils/cache.js) and [stores/webServices.js](frontend/src/stores/webServices.js)).

**Routing:** FastAPI routers per domain under `backend/app/api/routes/`. The backend serves `index.html` for all non-`/api` paths (SPA). Frontend uses Vue Router + `useModeStore` to switch between calendar/photos/services/settings.

**Components:** reusable building blocks (`PluginFieldRenderer`, `PluginActions`, `PluginStatusbarItems`, `LayoutManager`) compose plugin-provided views. Prefer extending these over new one-offs.

**Logging:** `loguru` on the backend (via `InterceptHandler` — don't use stdlib `logging` directly). `logDebug`/`logError` from [utils/logger.js](frontend/src/utils/logger.js) on the frontend.

**Database writes:** wrap with `retry_on_db_locked` — SQLite locks under concurrent plugin ops. Always `await initialize_database()` before loading plugins.

**Adding a feature to an existing plugin:** extend `instance_config_schema` → the form updates itself → wire the field into the plugin's hook impl. No frontend form edits needed for plain inputs.

## Gotchas — learned the hard way

- **Unref reactive refs before string interpolation** in axios URLs. `${serviceId}` on a `ref` becomes `[object Object]`. Always `unref(serviceId)` first. (commit 6edb2c4)
- **`uv pip` flag order:** `uv pip install --python <path> <pkg>` — `--python` goes *after* `install`, not before. (commit 4d73ca2)
- **Frontend rebuild marker** (`.rebuild_needed`) must be written *before* the build starts so an interrupted process resumes on next startup. (commit 08cda03)
- **SQLite "database is locked"** under plugin install concurrency → use `retry_on_db_locked` with exponential backoff.
- **Vite glob paths must match exactly.** Component paths are relative to `frontend/src/components/plugins/`. If `usePluginComponent` can't find a component, check the glob debug logs and the exact filename case.
- **Keyboard input on Windows** uses a mock — real input paths only work on Linux/RPi. Don't assume hardware events in dev.

## Quick map

| Area | Path |
|---|---|
| Backend bootstrap | [backend/app/main.py](backend/app/main.py) |
| Plugin base / types | [backend/app/plugins/base.py](backend/app/plugins/base.py) |
| Plugin hooks (Pluggy) | [backend/app/plugins/hooks.py](backend/app/plugins/hooks.py) |
| Plugin loader | [backend/app/plugins/loader.py](backend/app/plugins/loader.py) |
| Install + frontend build | [backend/app/services/plugin_installer.py](backend/app/services/plugin_installer.py) |
| Plugin mgmt API | [backend/app/api/routes/plugins/management.py](backend/app/api/routes/plugins/management.py) |
| Instance manager helpers | [backend/app/utils/instance_manager.py](backend/app/utils/instance_manager.py) |
| Dynamic component loader | [frontend/src/composables/usePluginComponent.js](frontend/src/composables/usePluginComponent.js) |
| Layout / mode switching | [frontend/src/components/LayoutManager.vue](frontend/src/components/LayoutManager.vue) |
| Plugin settings UI | [frontend/src/components/settings/categories/PluginsCategory.vue](frontend/src/components/settings/categories/PluginsCategory.vue) |
| Stores | [frontend/src/stores/](frontend/src/stores/) |

## Deeper docs

- [docs/index.md](docs/index.md) — full doc index
- [docs/plugins/PLUGIN_DEVELOPMENT_GUIDE.md](docs/plugins/PLUGIN_DEVELOPMENT_GUIDE.md) — writing plugins end-to-end
- [docs/plugins/PLUGIN_INTERFACE.md](docs/plugins/PLUGIN_INTERFACE.md) — hook reference
- [docs/plugins/PLUGIN_FRONTEND_COMPONENTS.md](docs/plugins/PLUGIN_FRONTEND_COMPONENTS.md) — Vue integration
- [docs/plugins/PLUGIN_PACKAGE_FORMAT.md](docs/plugins/PLUGIN_PACKAGE_FORMAT.md) — `plugin.json` schema
- [docs/plugins/PLUGIN_PERSISTENCE_AND_RESTART.md](docs/plugins/PLUGIN_PERSISTENCE_AND_RESTART.md) — lifecycle
- [docs/EVENT_SYSTEM.md](docs/EVENT_SYSTEM.md) — cross-plugin events
- [docs/setup/QUICKSTART_DEVELOP.md](docs/setup/QUICKSTART_DEVELOP.md) — dev env
- [docs/testing/BACKEND_TESTS.md](docs/testing/BACKEND_TESTS.md) — running tests
- [calvin-plugins/CREATING_PLUGINS.md](../calvin-plugins/CREATING_PLUGINS.md) — plugin scaffold guide

## House rules

- **Keep plugins self-contained.** If you're tempted to import plugin A from plugin B, put the shared code in `app/` or publish a library. Plugins never reach across.
- **Schema-driven UI first.** Prefer extending `instance_config_schema` over writing a custom settings component.
- **Don't bypass the instance manager.** If you need CRUD for instances, use the generic helpers.
- **Check the gotchas list** before debugging weird symptoms like `[object Object]`, "database is locked", or a plugin component that won't load.
