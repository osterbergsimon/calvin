---
name: calvin-plugin-contract
description: Use when writing or changing Calvin plugins or the plugin host (loader, definitions, renderers, instance manager) — plugin contract 1.0 for backend and frontend.
---

# Calvin plugin contract 1.0

A plugin directory:

```
{plugin_id}/
  plugin.json       # manifest: api_version (required, =1), id, name, type, version, dependencies.packages, files, requirements
  plugin.py         # backend: one BasePlugin-family subclass with metadata = PluginMetadata(...)
  frontend/         # optional pre-built web-component assets, served at /api/plugins/{id}/static/*
  ...assets
```

**Plugin types:** `calendar`, `image`, `service`, `backend`, `theme` — see [app/plugins/base.py](../../../backend/app/plugins/base.py).

**Contract (backend)** — plugin contract 1.0 (`api_version: 1`):
- One class, declared once: a `CalendarPlugin`/`ImagePlugin`/`ServicePlugin`/`BackendPlugin` subclass with a `metadata = PluginMetadata(...)` attribute ([definitions.py](../../../backend/app/plugins/definitions.py)). The loader ([loader.py](../../../backend/app/plugins/loader.py)) discovers the class — no module-level hooks, no Pluggy, no `get_plugin_metadata()`.
- `metadata.icon` is optional: an emoji string or a file in the plugin's own `frontend/` dir (served at `/api/plugins/{id}/static/`). Absent = the UI shows the name's first letter. It is a purely additive field; plugins that never set it load exactly as before.
- Config is declared once in `metadata.instance_config_schema`: it drives the auto-generated settings form (`PluginFieldRenderer`), normalization into `self.config` (via `configure()`), and required-field validation. Never take config in `__init__`; the host constructs `cls(plugin_id, name, enabled)` then awaits `configure(config)`. Config values are bare scalars.
- Data verbs: `fetch(start_date, end_date)` (service/backend, serves `/api/plugins/{id}/data`), `fetch_events()` (calendar), `get_images()` et al. (image). Optional classmethods: `validate_config`, `test_connection`, `scan_options`, `instance_id_for`.
- Instance CRUD is host-side: `apply_plugin_config_update` in [app/plugins/utils/instance_manager.py](../../../backend/app/plugins/utils/instance_manager.py) derives everything from `metadata` + the class hooks. Plugins implement no config-update handler.
- `dependencies.packages` in `plugin.json` is the only dep mechanism (pip-installed at plugin install, rollback on failure). `format_version`/`protocol_version`/`python_dependencies` are retired. Install is live — no restart.

**Contract (frontend):**
- Declare UI in metadata: `display_schema.kind` (selects a built-in renderer) and/or `statusbar_schema` (clock-bar item; its namespace is `status` only).
- Built-in renderer kinds live in [rendererRegistry.js](../../../frontend/src/components/plugins/rendererRegistry.js); the canonical list is enforced backend-side by `SUPPORTED_DISPLAY_KINDS` in [definitions.py](../../../backend/app/plugins/definitions.py). Invalid kinds — and the retired `type: "api"`/`render_template`/`component` keys — fail at plugin load.
- For schema renderers the plugin ships **no frontend code** — it returns a `display_schema` and a data payload, and a built-in Vue renderer draws it. Use the `calvin-plugin-*` body classes ([main.css](../../../frontend/src/styles/main.css)) for any custom markup so plugins inherit Calvin's surfaces, spacing, and theming.
- Web-component plugins (escape hatch) ship pre-built JS/CSS in their `frontend/` dir; Calvin serves those at `/api/plugins/{plugin_id}/static/{asset}` at runtime and pushes each payload to the element's `.data` property. **No host-side rebuild happens on plugin install.**

**Reference plugin:** [`mealie/`](../../../../calvin-plugins/mealie) in `calvin-plugins` (contract-1.0 shape: declarative class, `instance_identity`, card-grid payload shaping, contract tests). Scaffolding guide: [calvin-plugins/CREATING_PLUGINS.md](../../../../calvin-plugins/CREATING_PLUGINS.md). Detailed specs in [docs/plugins/](../../../docs/plugins/).
