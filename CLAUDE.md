# Calvin — Developer Guide

Orientation for humans and AI agents working on Calvin. Read this first; follow the links for depth.

Calvin is a self-hosted Raspberry Pi dashboard (calendars, photos, web services) with a Vue 3 frontend, a FastAPI backend, and a plugin system. Plugins live in a **separate repo** at `../calvin-plugins/` and are installed into `data/plugins/{plugin_id}/` at runtime.

## Stack

- **Backend:** FastAPI + uvicorn, Python 3.12+, `uv` package manager, Ormar ORM + Alembic (SQLite), APScheduler, Loguru (unified via `InterceptHandler`), declarative class-discovery plugin loader.
- **Frontend:** Vue 3 Composition API, Vite, Pinia stores, Vue Router. Built to `frontend/dist/` and served by FastAPI at `/`. API lives at `/api/*`.
- **Platforms:** develop on Windows/Linux, deploy on Raspberry Pi. **Live keyboard input is browser-side** — `frontend/src/components/KeyboardHandler.vue` listens for DOM `keydown`. The backend `evdev` handler (`backend/app/utils/keyboard.py`, mock on Windows) exists but its `read_events()` read-loop is **not currently wired into the running app** (test-only). Don't assume backend hardware events.

Entry points: [backend/app/main.py](backend/app/main.py) (lifespan → DB init → plugin load → schedulers), [frontend/src/main.js](frontend/src/main.js).

## Plugin system — the core pattern

**Plugins must be fully self-contained.** One directory holds everything: backend logic, config schema, frontend components, assets, manifest. No cross-plugin imports. A plugin only imports from `app.*` or third-party libraries.

A plugin directory:

```
{plugin_id}/
  plugin.json       # manifest: api_version (required, =1), id, name, type, version, dependencies.packages, files, requirements
  plugin.py         # backend: one BasePlugin-family subclass with metadata = PluginMetadata(...)
  frontend/         # optional pre-built web-component assets, served at /api/plugins/{id}/static/*
  ...assets
```

**Plugin types:** `calendar`, `image`, `service`, `backend`, `theme` — see [app/plugins/base.py](backend/app/plugins/base.py).

**Contract (backend)** — plugin contract 1.0 (`api_version: 1`):
- One class, declared once: a `CalendarPlugin`/`ImagePlugin`/`ServicePlugin`/`BackendPlugin` subclass with a `metadata = PluginMetadata(...)` attribute ([definitions.py](backend/app/plugins/definitions.py)). The loader ([loader.py](backend/app/plugins/loader.py)) discovers the class — no module-level hooks, no Pluggy, no `get_plugin_metadata()`.
- Config is declared once in `metadata.instance_config_schema`: it drives the auto-generated settings form (`PluginFieldRenderer`), normalization into `self.config` (via `configure()`), and required-field validation. Never take config in `__init__`; the host constructs `cls(plugin_id, name, enabled)` then awaits `configure(config)`. Config values are bare scalars.
- Data verbs: `fetch(start_date, end_date)` (service/backend, serves `/api/plugins/{id}/data`), `fetch_events()` (calendar), `get_images()` et al. (image). Optional classmethods: `validate_config`, `test_connection`, `scan_options`, `instance_id_for`.
- Instance CRUD is host-side: `apply_plugin_config_update` in [app/plugins/utils/instance_manager.py](backend/app/plugins/utils/instance_manager.py) derives everything from `metadata` + the class hooks. Plugins implement no config-update handler.
- `dependencies.packages` in `plugin.json` is the only dep mechanism (pip-installed at plugin install, rollback on failure). `format_version`/`protocol_version`/`python_dependencies` are retired. Install is live — no restart.

**Contract (frontend):**
- Declare UI in metadata: `display_schema.kind` (selects a built-in renderer) and/or `statusbar_schema` (clock-bar item; its namespace is `status` only).
- Built-in renderer kinds (`status`, `card-grid`, `item-list`, `iframe`, `image-with-caption`, `metric-dashboard`, `weather-forecast`, `web-component`) live in [rendererRegistry.js](frontend/src/components/plugins/rendererRegistry.js); the canonical list is enforced backend-side by `SUPPORTED_DISPLAY_KINDS` in [definitions.py](backend/app/plugins/definitions.py). Invalid kinds — and the retired `type: "api"`/`render_template`/`component` keys — fail at plugin load.
- For schema renderers the plugin ships **no frontend code** — it returns a `display_schema` and a data payload, and a built-in Vue renderer draws it. Use the `calvin-plugin-*` body classes ([main.css](frontend/src/styles/main.css)) for any custom markup so plugins inherit Calvin's surfaces, spacing, and theming.
- Web-component plugins (escape hatch) ship pre-built JS/CSS in their `frontend/` dir; Calvin serves those at `/api/plugins/{plugin_id}/static/{asset}` at runtime and pushes each payload to the element's `.data` property. **No host-side rebuild happens on plugin install.**

**Reference plugin:** [`mealie/`](../calvin-plugins/mealie) in `calvin-plugins` (contract-1.0 shape: declarative class, `instance_identity`, card-grid payload shaping, contract tests). Scaffolding guide: [calvin-plugins/CREATING_PLUGINS.md](../calvin-plugins/CREATING_PLUGINS.md). Detailed specs in [docs/plugins/](docs/plugins/).

## Conventions

**State (frontend):** one Pinia store per domain (`config`, `webServices`, `calendar`, `images`, `themes`, `keyboard`, `mode`, `connection`). Stores expose refs + async actions. Network calls try the API first and fall back to localStorage cache with TTL (see [utils/cache.js](frontend/src/utils/cache.js) and [stores/webServices.js](frontend/src/stores/webServices.js)).

**Routing:** FastAPI routers per domain under `backend/app/api/routes/`. The backend serves `index.html` for all non-`/api` paths (SPA). Frontend uses Vue Router + `useModeStore` to switch between calendar/photos/services/settings.

**Components:** reusable building blocks (`PluginFieldRenderer`, `PluginActions`, `PluginStatusbarItems`, `LayoutManager`) compose plugin-provided views. Prefer extending these over new one-offs.

**Logging:** `loguru` on the backend (via `InterceptHandler` — don't use stdlib `logging` directly). `logDebug`/`logError` from [utils/logger.js](frontend/src/utils/logger.js) on the frontend.

**Database writes:** wrap with `retry_on_db_locked` — SQLite locks under concurrent plugin ops. Always `await initialize_database()` before loading plugins.

**Adding a feature to an existing plugin:** extend `instance_config_schema` → the form updates itself → read the new key from `self.config` in the plugin. No frontend form edits needed for plain inputs.

## Gotchas — learned the hard way

- **Unref reactive refs before string interpolation** in axios URLs. `${serviceId}` on a `ref` becomes `[object Object]`. Always `unref(serviceId)` first. (commit 6edb2c4)
- **`uv pip` flag order:** `uv pip install --python <path> <pkg>` — `--python` goes *after* `install`, not before. (commit 4d73ca2)
- **SQLite "database is locked"** under plugin install concurrency → use `retry_on_db_locked` with exponential backoff.
- **Schema renderer kind typos fail at load time, not silently.** If you add a renderer to [rendererRegistry.js](frontend/src/components/plugins/rendererRegistry.js), also add the kind to `SUPPORTED_DISPLAY_KINDS` in [definitions.py](backend/app/plugins/definitions.py) — otherwise plugins using it are rejected at install. The kind-sync test (`backend/tests/unit/test_display_kind_sync.py`) enforces this.
- **Keyboard input is browser-DOM, not backend evdev.** The live path is `KeyboardHandler.vue` (`window` `keydown`). The backend `evdev` `read_events()` loop is dead code (test-only, no supervisor/hot-plug) — don't wire it up expecting it to already work, and don't trust "uses evdev" as the active path.

## Quick map

| Area | Path |
|---|---|
| Backend bootstrap | [backend/app/main.py](backend/app/main.py) |
| Plugin base / types | [backend/app/plugins/base.py](backend/app/plugins/base.py) |
| Plugin metadata contract | [backend/app/plugins/definitions.py](backend/app/plugins/definitions.py) |
| Plugin loader (class discovery) | [backend/app/plugins/loader.py](backend/app/plugins/loader.py) |
| Plugin install + static assets | [backend/app/services/plugin_installer.py](backend/app/services/plugin_installer.py) |
| Plugin mgmt API | [backend/app/api/routes/plugins/management.py](backend/app/api/routes/plugins/management.py) |
| Instance manager (host-side CRUD) | [backend/app/plugins/utils/instance_manager.py](backend/app/plugins/utils/instance_manager.py) |
| Schema renderer registry + dispatch | [frontend/src/components/plugins/rendererRegistry.js](frontend/src/components/plugins/rendererRegistry.js), [SchemaRenderer.vue](frontend/src/components/plugins/SchemaRenderer.vue) |
| Plugin body CSS vocabulary | [frontend/src/styles/main.css](frontend/src/styles/main.css) (`.calvin-plugin-*`) |
| Layout / mode switching | [frontend/src/components/LayoutManager.vue](frontend/src/components/LayoutManager.vue) |
| Plugin settings UI | [frontend/src/components/settings/categories/PluginsCategory.vue](frontend/src/components/settings/categories/PluginsCategory.vue) |
| Stores | [frontend/src/stores/](frontend/src/stores/) |

## Deeper docs

- [docs/index.md](docs/index.md) — full doc index
- [docs/plugins/PLUGIN_DEVELOPMENT_GUIDE.md](docs/plugins/PLUGIN_DEVELOPMENT_GUIDE.md) — writing plugins end-to-end
- [docs/plugins/PLUGIN_INTERFACE.md](docs/plugins/PLUGIN_INTERFACE.md) — `PluginMetadata` + `BasePlugin` reference
- [docs/plugins/PLUGIN_FRONTEND_COMPONENTS.md](docs/plugins/PLUGIN_FRONTEND_COMPONENTS.md) — Vue integration
- [docs/plugins/PLUGIN_PACKAGE_FORMAT.md](docs/plugins/PLUGIN_PACKAGE_FORMAT.md) — `plugin.json` schema
- [docs/plugins/PLUGIN_PERSISTENCE_AND_RESTART.md](docs/plugins/PLUGIN_PERSISTENCE_AND_RESTART.md) — lifecycle
- [docs/EVENT_SYSTEM.md](docs/EVENT_SYSTEM.md) — cross-plugin events
- [docs/setup/QUICKSTART_DEVELOP.md](docs/setup/QUICKSTART_DEVELOP.md) — dev env
- [docs/testing/BACKEND_TESTS.md](docs/testing/BACKEND_TESTS.md) — running tests
- [calvin-plugins/CREATING_PLUGINS.md](../calvin-plugins/CREATING_PLUGINS.md) — plugin scaffold guide

## House rules

- **Always use superpowers skills.** If there's even a remote chance a Superpowers skill applies to what you're doing, invoke it — brainstorming before creative work, systematic-debugging before any bugfix, test-driven-development before writing implementation, writing-plans/executing-plans for multi-step work, and so on. When in doubt, invoke the skill. Process skills set the approach first; implementation skills follow. This is not optional.
- **Keep plugins self-contained.** If you're tempted to import plugin A from plugin B, put the shared code in `app/` or publish a library. Plugins never reach across.
- **Schema-driven UI first.** Prefer extending `instance_config_schema` over writing a custom settings component.
- **Don't bypass the instance manager.** If you need CRUD for instances, use the generic helpers.
- **Check the gotchas list** before debugging weird symptoms like `[object Object]`, "database is locked", or a plugin component that won't load.


<!-- BEGIN BEADS INTEGRATION v:1 profile:minimal hash:6cd5cc61 -->
## Beads Issue Tracker

This project uses **bd (beads)** for issue tracking. Run `bd prime` to see full workflow context and commands.

### Quick Reference

```bash
bd ready              # Find available work
bd show <id>          # View issue details
bd update <id> --claim  # Claim work
bd close <id>         # Complete work
```

### Rules

- Use `bd` for ALL task tracking — do NOT use TodoWrite, TaskCreate, or markdown TODO lists
- Run `bd prime` for detailed command reference and session close protocol
- Use `bd remember` for persistent knowledge — do NOT use MEMORY.md files

**Architecture in one line:** issues live in a local Dolt DB; sync uses `refs/dolt/data` on your git remote; `.beads/issues.jsonl` is a passive export. See https://github.com/gastownhall/beads/blob/main/docs/SYNC_CONCEPTS.md for details and anti-patterns.

## Agent Context Profiles

The managed Beads block is task-tracking guidance, not permission to override repository, user, or orchestrator instructions.

- **Conservative (default)**: Use `bd` for task tracking. Do not run git commits, git pushes, or Dolt remote sync unless explicitly asked. At handoff, report changed files, validation, and suggested next commands.
- **Minimal**: Keep tool instruction files as pointers to `bd prime`; use the same conservative git policy unless active instructions say otherwise.
- **Team-maintainer**: Only when the repository explicitly opts in, agents may close beads, run quality gates, commit, and push as part of session close. A current "do not commit" or "do not push" instruction still wins.

## Session Completion

This protocol applies when ending a Beads implementation workflow. It is subordinate to explicit user, repository, and orchestrator instructions.

1. **File issues for remaining work** - Create beads for anything that needs follow-up
2. **Run quality gates** (if code changed) - Tests, linters, builds
3. **Update issue status** - Close finished work, update in-progress items
4. **Handle git/sync by active profile**:
   ```bash
   # Conservative/minimal/default: report status and proposed commands; wait for approval.
   git status

   # Team-maintainer opt-in only, unless current instructions forbid it:
   git pull --rebase
   git push
   git status
   ```
5. **Hand off** - Summarize changes, validation, issue status, and any blocked sync/commit/push step

**Critical rules:**
- Explicit user or orchestrator instructions override this Beads block.
- Do not commit or push without clear authority from the active profile or the current user request.
- If a required sync or push is blocked, stop and report the exact command and error.
<!-- END BEADS INTEGRATION -->
