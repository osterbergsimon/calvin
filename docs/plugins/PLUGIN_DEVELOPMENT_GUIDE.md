# Plugin Development Guide

This is the host-side guide to the Calvin plugin system under **plugin
contract 1.0** (`api_version: 1`): what the host expects from a plugin, and
where each piece is enforced.

If you are creating a plugin, start with
[`calvin-plugins/CREATING_PLUGINS.md`](../../../calvin-plugins/CREATING_PLUGINS.md) —
it has the scaffold script, the walkthrough, and the publishing checklist.
Use this guide when you need the host's view of the contract. For the package
format (`plugin.json`), see [PLUGIN_PACKAGE_FORMAT.md](PLUGIN_PACKAGE_FORMAT.md);
for the full method reference, see [PLUGIN_INTERFACE.md](PLUGIN_INTERFACE.md).

## Where Plugins Live

Plugins are **not** part of the Calvin host repo. They live in
[`../calvin-plugins/`](../../../calvin-plugins/) (a sibling repo) and are
installed at runtime into `backend/data/plugins/{plugin_id}/`. Each installed
plugin is a directory with a `plugin.json` manifest, a `plugin.py` entry
point, and optional `frontend/` assets. The host imports `plugin.py` and
discovers the plugin class — installation takes effect immediately, no
restart (see [PLUGIN_PERSISTENCE_AND_RESTART.md](PLUGIN_PERSISTENCE_AND_RESTART.md)).

A handful of foundational plugins (google, ical, local images, iframe) ship
inside `backend/app/plugins/{calendar,image,service}/` because they are needed
before any external plugins are installed. New plugins go in `calvin-plugins`.

## The Contract in One Example

A plugin is one class plus a manifest. This is the complete `hello` plugin
(identical to the example in CREATING_PLUGINS.md):

```python
"""plugin.py"""
from app.plugins.definitions import PluginMetadata
from app.plugins.protocols import ServicePlugin


class HelloPlugin(ServicePlugin):
    metadata = PluginMetadata(
        type_id="hello",
        name="Hello",
        description="Says hello",
        instance_label="Greeting",
        instance_config_schema={
            "who": {"type": "string", "default": "world",
                    "ui": {"component": "input", "validation": {"required": True}}},
        },
        display_schema={
            "kind": "status",
            "item": {"label": "Hello", "value_path": "$.message"},
        },
    )

    async def fetch(self, start_date=None, end_date=None):
        return {"message": f"hello, {self.config['who']}"}
```

```json
{
  "api_version": 1,
  "id": "hello",
  "name": "Hello",
  "version": "1.0.0",
  "type": "service",
  "description": "Says hello"
}
```

What the host does with it:

1. **Discovery.** [loader.py](../../backend/app/plugins/loader.py) imports
   `plugin.py` and registers every `BasePlugin`-family subclass that declares
   its own `metadata = PluginMetadata(...)`. No registration hooks — Pluggy
   is gone.
2. **Instantiation.** `HelloPlugin(plugin_id, name, enabled)` then
   `await instance.configure(config)`. Plugins never take config in
   `__init__`.
3. **Config.** `configure()` normalizes values against
   `instance_config_schema` (type-driven conversion) into `self.config`. The
   settings form is generated from the same schema — declare config once.
4. **Validation.** The host awaits `HelloPlugin.validate_config(config)`
   (async classmethod) before creating/updating an instance. The default
   enforces `ui.validation.required`.
5. **Display.** `fetch()` returns a JSON payload; the built-in renderer
   selected by `display_schema.kind` draws it. The plugin ships no frontend
   code.

Reference implementation: [`mealie/`](../../../calvin-plugins/mealie) — a real
service plugin with connection testing, per-instance identity
(`instance_identity=["mealie_url"]`), payload shaping for `card-grid`, and a
contract-shaped test suite.

## Plugin Types

The `PluginType` enum in [base.py](../../backend/app/plugins/base.py) defines
the categories. Each non-theme type has a protocol class in
[protocols.py](../../backend/app/plugins/protocols.py) that the plugin
subclasses; the loader derives the type from the base class — it is never
declared.

| Type | Base class | Data verb |
|---|---|---|
| `calendar` | `CalendarPlugin` | `fetch_events(start, end)` → `list[CalendarEvent]` (required) |
| `image` | `ImagePlugin` | `get_images` / `get_image` / `get_image_data` / `scan_images` (required); `upload_image` / `delete_image` / `get_thumbnail_path` (optional) |
| `service` | `ServicePlugin` | `fetch(start_date, end_date)` → payload for the display schema |
| `backend` | `BackendPlugin` | optional: `fetch()` ("check now"), scheduled tasks, workers, event handlers, service provider |
| `theme` | — | **Not a Python plugin** — CSS bundles installed via `app.services.theme_installer`. The enum value only tags theme records in the management routes. |

## Optional Class-Level Hooks

Override only what you need (all on the plugin class; defaults in
[base.py](../../backend/app/plugins/base.py)):

| Method | Kind | Purpose |
|---|---|---|
| `validate_config(config)` | async classmethod | Extra validation rules beyond schema-driven required fields. |
| `instance_id_for(config)` | classmethod | Custom instance identity (usually just declare `metadata.instance_identity` instead). |
| `test_connection(config)` | async classmethod | Powers the Test Connection button (`ui_actions` with `type: "test"`). Return `{"success", "message"}`. |
| `scan_options(field_key)` | async classmethod | Discover config-field options (e.g. enumerate devices). Return `{"options": [{"value", "label"}]}`. |
| `prepare_instance_config(config, context)` | classmethod | Adjust the persisted instance config. |
| `initialize()` / `cleanup()` / `configure()` | async instance | Lifecycle; `configure` overrides call `super().configure(config)` first. |

Instance CRUD is entirely host-side: `apply_plugin_config_update` in
[instance_manager.py](../../backend/app/plugins/utils/instance_manager.py)
derives everything from `metadata` plus these hooks. Plugins implement no
config-update handler.

## Display Schema (Service Plugins)

Service plugins describe their panel declaratively via `display_schema`.
Calvin dispatches on `kind` and renders with a built-in Vue component —
plugins ship data, not markup.

`kind` is required and must be one of `SUPPORTED_DISPLAY_KINDS` in
[definitions.py](../../backend/app/plugins/definitions.py):

| Kind | Used for |
|---|---|
| `status` | Readouts (label over value); `layout: tile \| row \| list`. |
| `card-grid` | Grid of cards, each with a titled item list. |
| `item-list` | Timestamped feed/log list. |
| `iframe` | Embed an external URL. Pair with `panel_variant: "iframe"`. |
| `image-with-caption` | Full-bleed image + caption. Pair with `panel_variant: "media"`. |
| `metric-dashboard` | Grid of big metric tiles. |
| `weather-forecast` | Current conditions + daily forecast. |
| `web-component` | Escape hatch — a pre-built custom element from the plugin's `frontend/` dir. |

Unknown kinds — and the retired pre-1.0 keys `type: "api"`,
`render_template`, `component` — are rejected when the class is imported, so
a broken plugin fails at install, not at render.

Per-kind schema fields, shell fields (`title`, `title_path`, `panel_variant`,
`poll_interval_ms`), JSON-path binding, statusbar items, and the
web-component contract: [PLUGIN_FRONTEND_COMPONENTS.md](PLUGIN_FRONTEND_COMPONENTS.md).

## Configuration UI Schema

`instance_config_schema` (per instance) and `common_config_schema` (per type
— rare) drive auto-generated settings forms via `PluginFieldRenderer`. Don't
hand-roll settings UI.

```python
instance_config_schema={
    "api_key": {
        "type": "password",
        "description": "API key",
        "default": "",
        "ui": {
            "component": "password",
            "placeholder": "Paste your key",
            "help_text": "Available in your account dashboard.",
            "validation": {"required": True},
        },
    },
    "interval_minutes": {
        "type": "integer",
        "default": 15,
        "ui": {"component": "number", "validation": {"min": 1, "max": 1440}},
    },
}
```

**Field types**: `string`, `password`, `integer`, `number`, `boolean` —
`string`/`integer`/`number`/`boolean` drive value conversion in
`normalize_config` (see [base.py](../../backend/app/plugins/base.py)).

**UI components** (see [PluginFieldRenderer.vue](../../frontend/src/components/PluginFieldRenderer.vue)):
`input`, `password`, `number`, `textarea`, `select` (with `options`),
`select-scan` (options discovered via `scan_options`), `checkbox`,
`directory` (filesystem picker).

Action buttons (Save / Test / Fetch) are declared as `ui_actions`; structured
sections (e.g. upload) as `ui_sections` — both render via the shared
`PluginActions` and section components.

## Cross-Plugin Events

Plugins publish and subscribe via the host event system
([EVENT_SYSTEM.md](../EVENT_SYSTEM.md)):

```python
await self.emit_event("image_processed", {"image_id": "123", "status": "completed"})
```

Events are the only sanctioned way for plugins to communicate. **Plugins must
not import each other** — keep them self-contained.

## Best Practices

1. **Start with the scaffold** — `python scripts/create_plugin.py` in
   `calvin-plugins`, then `python scripts/validate_plugins.py <id>`.
2. **Declare config once** in `instance_config_schema`. Don't unpack it in
   `__init__` or keep parallel field lists; read `self.config["key"]` (small
   `@property` accessors for trimming are fine — see mealie).
3. **`fetch()` returns data, not markup.** Shape the payload for the display
   schema (see `mealie._shape_for_display`) and let the renderer draw it.
4. **Schema renderers first.** Reach for `kind: "web-component"` only when no
   built-in kind fits; then use the `calvin-plugin-*` classes and `--plugin-*`
   custom properties so it inherits Calvin's theming.
5. **Copy is interface.** Error strings in payloads (`{"error": "..."}`)
   surface on the wall — write direction, not stack traces.
6. **Validate at boundaries** in `validate_config`; trust internal callers.
7. **Declare pip deps** in `plugin.json` `dependencies.packages` and exclude
   tests/docs via `files.exclude`.

## Troubleshooting

### Install fails with a validation error

Install is atomic: if the plugin class fails to import, declares invalid
metadata, or a pip dependency fails to install, the install rolls back and
the API returns the error. Common causes:

- `plugin.json` missing `api_version` (required, must be `1`).
- `display_schema.kind` typo — `PluginMetadata` validation raises at import.
- `plugin.py` doesn't declare a `BasePlugin` subclass with a
  `metadata = PluginMetadata(...)` attribute.

### Plugin rejected with "display_schema.kind must be one of …"

The kind isn't in `SUPPORTED_DISPLAY_KINDS`. Fix the typo — or, if you
genuinely need a new kind, add a renderer under
[frontend/src/components/plugins/renderers/](../../frontend/src/components/plugins/renderers/),
register it in [rendererRegistry.js](../../frontend/src/components/plugins/rendererRegistry.js),
and add the kind to `SUPPORTED_DISPLAY_KINDS` in
[definitions.py](../../backend/app/plugins/definitions.py). The kind-sync test
(`backend/tests/unit/test_display_kind_sync.py`) fails the build if the lists
drift.

### Plugin loads but the panel is empty

- Check `GET /api/plugins/{instance_id}/data` returns the shape the schema
  binds to (browser network tab).
- JSON paths (`$.foo.bar`, `$.items[0].name`) must match payload keys exactly.
- For `panel_variant: "media"`/`"iframe"`, the region shell already draws the
  header — the renderer body should not.

### "database is locked"

SQLite contention during plugin operations. Host-side writes are wrapped with
`retry_on_db_locked`; if you see this from your own code, do the same.

### Web component doesn't render

- `frontend/dist.js` (or whatever `display_schema.module` names) must exist in
  the installed plugin directory and be listed in `files.include`.
- The module must register the custom element named by
  `display_schema.element` — the host errors if it isn't registered after
  import.
- Check the browser console for module-load errors.

## Reference

- [PLUGIN_INTERFACE.md](PLUGIN_INTERFACE.md) — `PluginMetadata` fields,
  `BasePlugin` surface, family protocols, host derivation.
- [PLUGIN_PACKAGE_FORMAT.md](PLUGIN_PACKAGE_FORMAT.md) — `plugin.json` schema
  and package rules.
- [PLUGIN_FRONTEND_COMPONENTS.md](PLUGIN_FRONTEND_COMPONENTS.md) — renderer
  schemas, `calvin-plugin-*` classes, web-component contract.
- [PLUGIN_PERSISTENCE_AND_RESTART.md](PLUGIN_PERSISTENCE_AND_RESTART.md) —
  persistence and install/uninstall lifecycle.
- [PLUGIN_INSTALLATION.md](PLUGIN_INSTALLATION.md) — install flow and API.
- [EVENT_SYSTEM.md](../EVENT_SYSTEM.md) — cross-plugin events.
- [`calvin-plugins/CREATING_PLUGINS.md`](../../../calvin-plugins/CREATING_PLUGINS.md) —
  scaffold, testing, publishing.
- Built-in plugins: [`backend/app/plugins/`](../../backend/app/plugins/).
  Reference plugin: [`mealie/`](../../../calvin-plugins/mealie).
