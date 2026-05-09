# Plugin Development Guide

This is the host-side reference for the Calvin plugin system: the contracts a plugin must
implement, the SDK helpers Calvin provides, and the display contract for dashboard UI.

If you are creating a plugin for the first time, start with
[`calvin-plugins/CREATING_PLUGINS.md`](../../../calvin-plugins/CREATING_PLUGINS.md) — it
contains the scaffold script, directory layout, and step-by-step walkthrough. Use this
guide alongside it when you need to know what the host expects on the other end of the
contract.

For the package format itself (`plugin.json`, manifest fields, install rules), see
[PLUGIN_PACKAGE_FORMAT.md](PLUGIN_PACKAGE_FORMAT.md).

## Where Plugins Live

Plugins are **not** part of the Calvin host repo. They live in
[`../calvin-plugins/`](../../../calvin-plugins/) (a sibling repo) and are installed at
runtime into `backend/data/plugins/{plugin_id}/`. Each installed plugin is a directory with
a `plugin.json` manifest, a `plugin.py` entry point, and optional `frontend/` and `assets/`
folders. The host loads them via Pluggy at startup — there is no in-tree import to add.

A handful of foundational plugins (e.g. the iframe service) still ship inside
`backend/app/plugins/` because they are needed before any external plugins are installed.
New plugins should go in `calvin-plugins`, not in-tree.

## Table of Contents

1. [Plugin Types](#plugin-types)
2. [Plugin Contract](#plugin-contract)
3. [Hooks (Pluggy)](#hooks-pluggy)
4. [Plugin SDK](#plugin-sdk)
5. [Instance Manager](#instance-manager)
6. [Display Schema (Service Plugins)](#display-schema-service-plugins)
7. [Statusbar Schema](#statusbar-schema)
8. [Configuration UI Schema](#configuration-ui-schema)
9. [Cross-Plugin Events](#cross-plugin-events)
10. [Best Practices](#best-practices)
11. [Troubleshooting](#troubleshooting)

## Plugin Types

The `PluginType` enum in [base.py](../../backend/app/plugins/base.py) defines the
supported categories:

| Type | Purpose | SDK module |
|---|---|---|
| `calendar` | Calendar events from external sources (Google, iCal, CalDAV). | `app.plugins.sdk.calendar` |
| `image` | Image sources for the photo mode (filesystem, APIs, IMAP attachments). | `app.plugins.sdk.image` |
| `service` | Dashboard cards: web embeds, API-driven widgets, status displays. | `app.plugins.sdk.service` |
| `backend` | Headless background work, event handlers, processing jobs. | `app.plugins.sdk.backend` |
| `theme` | Visual theme bundles. **Not a Pluggy plugin** — themes are CSS bundles installed via `app.services.theme_installer`, not Python modules. The enum value exists only so the management routes can tag theme records uniformly. Skip if you're writing a Python plugin. | (no SDK) |

Each non-theme type has a matching protocol class in
[protocols.py](../../backend/app/plugins/protocols.py) (`CalendarPlugin`, `ImagePlugin`,
`ServicePlugin`, `BackendPlugin`) that the plugin class subclasses.

## Plugin Contract

All plugins inherit from `BasePlugin` ([base.py](../../backend/app/plugins/base.py)) and
satisfy a small set of contracts. Full reference: [PLUGIN_INTERFACE.md](PLUGIN_INTERFACE.md).

### Required on every plugin (`BasePlugin`)

- `plugin_type` (property): returns one of the `PluginType` values.
- `get_plugin_metadata()` (classmethod): returns a `PluginDefinition` (or compatible dict).
  Prefer the SDK `build_*_plugin_metadata` helpers — they fill in defaults and produce a
  validated definition.
- `initialize()` (async): set up resources. Call `self.start()` on success.
- `cleanup()` (async): tear down resources. Call `self.stop()` first.

### Per-type required methods

| Type | Required protocol methods |
|---|---|
| `calendar` | `fetch_events(start_date, end_date)`, `validate_config(config)` |
| `image` | `get_images()`, `get_image(id)`, `get_image_data(id)`, `scan_images()`, `validate_config(config)` |
| `service` | `validate_config(config)` (and **should** implement `fetch_service_data` if the plugin renders dashboard content) |
| `backend` | `validate_config(config)` |

### Per-type optional methods

- **Image**: `upload_image`, `delete_image`, `get_thumbnail_path`.
- **Service**: `fetch_service_data(start_date, end_date)` — the canonical data source for
  schema-driven dashboard rendering. `handle_webhook`, `handle_api_request` for
  push/pull integrations.
- **All**: `configure(config)`, `test_type_config(config)` (classmethod, replaces the
  legacy `test_plugin_connection` hook), `scan_type_options(field_key)` (classmethod,
  replaces the legacy `scan_plugin_options` hook), `fetch_type_data(instance_id)`
  (classmethod, replaces the legacy `fetch_plugin_data` hook).

> Newer host code prefers class-based methods (`test_type_config`, `scan_type_options`,
> `fetch_type_data`) on the plugin class over the corresponding Pluggy hooks. The hooks
> still work but are marked deprecated in [hooks.py](../../backend/app/plugins/hooks.py).

### Core code rules (host-side)

The host follows strict rules when calling plugins (see PLUGIN_INTERFACE.md):

- **No `hasattr()`** to probe for plugin methods — go through protocol methods only.
- **No `getattr()`** for plugin attributes — same reason.
- **`isinstance()` checks** before invoking type-specific methods.
- **No private methods** (anything prefixed with `_`).

Plugins should similarly avoid reaching into host internals beyond the documented surface
(`app.plugins.*`, `app.plugins.sdk.*`, `app.plugins.utils.instance_manager.*`, the event
system, and any explicitly public utilities under `app.utils`).

## Hooks (Pluggy)

Plugins register themselves via two required Pluggy hooks at the module level of
`plugin.py`:

```python
from app.plugins.hooks import hookimpl

@hookimpl
def register_plugin_types() -> list[dict[str, Any]]:
    return [MyPlugin.get_plugin_metadata()]

@hookimpl
def create_plugin_instance(
    plugin_id: str,
    type_id: str,
    name: str,
    config: dict[str, Any],
) -> MyPlugin | None:
    if type_id != "my_plugin":
        return None
    # Use the SDK helper instead of hand-rolling instance construction:
    return create_service_plugin_instance(MyPlugin, ..., fields=SERVICE_FIELDS)
```

Optional hooks are documented in [hooks.py](../../backend/app/plugins/hooks.py):

- `handle_plugin_config_update` — runs when a plugin type's config changes; should
  delegate to `handle_plugin_config_update_generic` (see
  [Instance Manager](#instance-manager)).
- `test_plugin_connection`, `fetch_plugin_data`, `scan_plugin_options`,
  `fetch_service_data` — **deprecated** in favor of class-based equivalents on
  `BasePlugin`. Implement these on the plugin class instead.

## Plugin SDK

The SDK (`app.plugins.sdk.*`) provides per-type helpers that remove boilerplate from
plugin code. New plugins **should use the SDK** — the scaffold script in `calvin-plugins`
generates SDK-first templates for every plugin type.

For each type there is a parallel set of helpers:

| Helper | Purpose |
|---|---|
| `<Type>ConfigField` | Declarative field spec: name, default, converter (`str`, `int`, `bool`, `path_or_none`, etc.). |
| `build_<type>_plugin_metadata(...)` | Builds a `PluginDefinition` dict with type-correct defaults. |
| `extract_<type>_config(config, fields)` | Pulls instance config values out using the field tuple. |
| `create_<type>_plugin_instance(cls, ..., fields)` | Instantiates the plugin class from a config dict; for use inside `create_plugin_instance`. |
| `build_<type>_manager_config(...)` | Builds an `InstanceManagerConfig` for use with the generic instance manager. |

Example service plugin entry point — see
[`calvin-plugins/CREATING_PLUGINS.md`](../../../calvin-plugins/CREATING_PLUGINS.md) for a
full walkthrough.

```python
from app.plugins.sdk.service import (
    ServiceConfigField,
    build_service_plugin_metadata,
    create_service_plugin_instance,
    build_service_manager_config,
)

SERVICE_FIELDS = (
    ServiceConfigField("api_key", default="", converter=str),
)

class MyServicePlugin(ServicePlugin):
    @classmethod
    def get_plugin_metadata(cls):
        return build_service_plugin_metadata(
            type_id="my_plugin",
            name="My Plugin",
            plugin_class=cls,
            supports_multiple_instances=True,
            instance_config_schema={ "api_key": { "type": "password", ... } },
            display_schema={ "kind": "status-tile", "value_path": "$.value" },
        )
```

## Instance Manager

Use `handle_plugin_config_update_generic` from
[`app.plugins.utils.instance_manager`](../../backend/app/plugins/utils/instance_manager.py)
instead of writing CRUD for plugin instances. It handles single-instance and multi-instance
plugins, reconciles the database state with incoming config, and fires lifecycle hooks.

```python
from app.plugins.utils.instance_manager import handle_plugin_config_update_generic

@hookimpl
async def handle_plugin_config_update(type_id, config, enabled, db_type, session):
    if type_id != "my_plugin":
        return None
    manager_config = build_service_manager_config(
        type_id="my_plugin",
        fields=SERVICE_FIELDS,
        validate_config=lambda c: bool(c.get("api_key")),
        generate_instance_id=lambda c, _: f"my-plugin-{abs(hash(c['api_key'])) % 100000}",
    )
    return await handle_plugin_config_update_generic(
        type_id=type_id, config=config, enabled=enabled,
        db_type=db_type, session=session, manager_config=manager_config,
    )
```

For multi-instance plugins, supply a stable `generate_instance_id` so existing instances
survive config edits.

## Display Schema (Service Plugins)

Service plugins describe their dashboard UI declaratively via `display_schema`. Calvin
dispatches on `display_schema.kind` and renders the matching built-in Vue component —
plugins do **not** ship Vue components for built-in renderers, only data.

`kind` is **required** when `display_schema` is set, and must be one of the values in
`SUPPORTED_DISPLAY_KINDS` in [definitions.py](../../backend/app/plugins/definitions.py).
Unknown or missing kinds are rejected at plugin load.

### Supported kinds

| Kind | Used for |
|---|---|
| `status-tile` | A single value + label tile. |
| `status-list` | List of `{label, value, status}` rows. |
| `status-row` | Inline row of small status pills/metrics. |
| `card-grid` | Grid of cards from an array of items. |
| `item-list` | Vertical list of items (titles, subtitles, optional thumbs). |
| `iframe` | Embed an external URL. Pair with `panel_variant: "iframe"`. |
| `image-with-caption` | Single image surface with optional caption. Pair with `panel_variant: "media"`. |
| `metric-dashboard` | Multi-tile numeric dashboard. |
| `weather-forecast` | Current conditions + forecast. |
| `web-component` | Escape hatch — load a pre-built custom element from the plugin's `frontend/` dir. |

Each kind has its own renderer-specific schema fields (e.g. `value_path`, `url_path`,
`items_path`). Renderer specs and field reference live in
[PLUGIN_FRONTEND_COMPONENTS.md](PLUGIN_FRONTEND_COMPONENTS.md).

### Shell fields (apply to every kind)

- `title` — literal title for the dashboard region header.
- `title_path` — JSONPath-lite into the data payload; wins over `title` when present.
- `panel_variant` — one of `default`, `dense`, `media`, `iframe`. Controls panel chrome
  (padding, surface, overflow). Required only when the renderer needs a non-default
  variant.

### How the data flows

1. Calvin asks the plugin for service data via `ServicePlugin.fetch_service_data()` (or
   the data endpoint declared in the schema).
2. The plugin returns a JSON payload.
3. Calvin's renderer (selected by `kind`) reads the relevant paths from that payload.

```python
# In get_plugin_metadata():
display_schema={
    "kind": "status-tile",
    "title_path": "$.location.name",
    "panel_variant": "default",
    "value_path": "$.temperature",
    "unit": "°C",
    "status_path": "$.status",
}

# On the plugin instance:
async def fetch_service_data(self, start_date=None, end_date=None):
    return {
        "location": {"name": "Stockholm"},
        "temperature": 18.4,
        "status": "ok",
    }
```

### Web components (escape hatch)

If no built-in kind fits, ship a pre-built custom element in `frontend/dist.js` (and
optional `dist.css`) and reference it via `kind: "web-component"`:

```python
display_schema={
    "kind": "web-component",
    "element": "calvin-my-plugin",
    "module": "dist.js",
    "stylesheet": "dist.css",
}
```

Calvin serves the assets from `/api/plugins/{plugin_id}/static/{asset_path}` and assigns
the latest service data to the element's `data` property. Use the `calvin-plugin-*` body
classes documented in PLUGIN_FRONTEND_COMPONENTS.md so custom components inherit Calvin's
surfaces, spacing, and theming.

There is **no host frontend rebuild** when a plugin is installed. Plugins must ship their
own pre-built JS/CSS in `frontend/`.

## Statusbar Schema

Service plugins can also render compact items in the dashboard statusbar via
`statusbar_schema`. The schema is dispatched the same way as `display_schema` and reads
the same data payload. See [PLUGIN_FRONTEND_COMPONENTS.md](PLUGIN_FRONTEND_COMPONENTS.md)
for renderer details.

## Configuration UI Schema

Plugins declare their settings UI via `instance_config_schema` (per-instance) and
`common_config_schema` (per plugin type — rare). The settings frontend auto-generates
forms from these schemas via `PluginFieldRenderer`, so plugins should not hand-roll
settings UI.

```python
"instance_config_schema": {
    "api_key": {
        "type": "password",
        "description": "API key",
        "default": "",
        "ui": {
            "component": "password",
            "placeholder": "Paste your key",
            "help_text": "Available in your account dashboard.",
            "validation": { "required": True },
        },
    },
    "interval_minutes": {
        "type": "integer",
        "default": 15,
        "ui": { "component": "number", "validation": { "min": 1, "max": 1440 } },
    },
}
```

**Field types**: `string`, `password`, `integer`, `boolean`, `textarea`.

**UI components**: `input`, `password`, `number`, `textarea`, `select` (with `options`),
`checkbox`. Add `browse_button: true` (with `browse_type: "directory"` or `"file"`) for
filesystem pickers.

For action buttons (Save / Test / Fetch / Custom) and structured upload sections, declare
them as `ui_actions` and `ui_sections` in metadata — both render via the shared
`PluginActions` and section components.

## Cross-Plugin Events

Plugins can publish and subscribe to events via the host event system. See
[EVENT_SYSTEM.md](../EVENT_SYSTEM.md) for the full surface. From inside a plugin:

```python
await self.emit_event(
    "image_processed",
    {"image_id": "123", "status": "completed"},
)
```

Events are the only sanctioned way for plugins to communicate. **Plugins must not import
each other** — keep them self-contained.

## Best Practices

1. **Start with the scaffold.** Run the create-plugin script in
   [`calvin-plugins/scripts/`](../../../calvin-plugins/scripts/) and edit the generated
   files. The scaffold wires the SDK and instance manager correctly.
2. **Use the SDK helpers** (`build_*_plugin_metadata`, `create_*_plugin_instance`,
   `build_*_manager_config`) rather than constructing metadata by hand.
3. **Use `handle_plugin_config_update_generic`** rather than implementing your own CRUD.
4. **Schema-driven UI first.** Reach for `kind: "web-component"` only when no built-in
   kind fits.
5. **Use the `calvin-plugin-*` body classes** for any custom markup (web components or
   future custom renderers) — they give you Calvin's surfaces, spacing, and theme tokens
   for free.
6. **Validate at boundaries** in `validate_config`. Trust internal callers.
7. **`isinstance()` rather than `hasattr()`** when your plugin code dispatches on type.
8. **Pin dependencies** in `plugin.json` and exclude tests/docs/build artifacts via
   `files.exclude`.
9. **Declare `format_version` and `protocol_version`** explicitly in `plugin.json` so
   future host versions can detect compatibility.

## Troubleshooting

### Plugin not appearing after install

- Check `backend/data/plugins/{plugin_id}/plugin.json` and `plugin.py` exist.
- Look for import errors in the backend logs (`loguru` output) — a missing dependency in
  the plugin's Python imports will silently skip the plugin.
- Confirm `register_plugin_types` is decorated with `@hookimpl` and exported at module
  level.

### Plugin rejected at load with "display_schema.kind must be one of …"

The plugin's `display_schema.kind` is not in `SUPPORTED_DISPLAY_KINDS`. Either fix the
typo or, if you genuinely need a new kind, add a renderer in
[SchemaRenderer.vue](../../frontend/src/components/plugins/SchemaRenderer.vue), register
it in [rendererRegistry.js](../../frontend/src/components/plugins/rendererRegistry.js),
**and** add it to `SUPPORTED_DISPLAY_KINDS` — all three must stay in sync.

### Plugin loads but the dashboard region is empty

- Check the data endpoint actually returns the shape the renderer expects (use the
  network tab; the URL is `/api/plugins/{plugin_id}/data` for the default API endpoint).
- JSONPath-lite paths in the schema (`$.foo.bar`) must match the payload keys exactly.
- For `panel_variant: "media"` and `"iframe"`, verify the plugin's CSS doesn't draw an
  outer header — Calvin's region shell already provides one.

### "database is locked"

SQLite contention during plugin install. The instance manager already wraps writes with
`retry_on_db_locked`; if you see this from your own code, do the same.

### Web component doesn't render

- Confirm `frontend/dist.js` is committed and present in the installed plugin directory.
- The custom element must be registered in `dist.js` under the name in
  `display_schema.element`.
- Check the browser console for module-load errors — bad MIME types or missing exports
  fail silently in some browsers.

## Reference

- [PLUGIN_PACKAGE_FORMAT.md](PLUGIN_PACKAGE_FORMAT.md) — `plugin.json` schema and zip
  package rules.
- [PLUGIN_INTERFACE.md](PLUGIN_INTERFACE.md) — full protocol method reference.
- [PLUGIN_FRONTEND_COMPONENTS.md](PLUGIN_FRONTEND_COMPONENTS.md) — schema renderer
  fields, `calvin-plugin-*` body classes, web-component contract.
- [PLUGIN_PERSISTENCE_AND_RESTART.md](PLUGIN_PERSISTENCE_AND_RESTART.md) — install &
  lifecycle internals.
- [EVENT_SYSTEM.md](../EVENT_SYSTEM.md) — cross-plugin events.
- [PLUGIN_INSTALLATION.md](PLUGIN_INSTALLATION.md) — install flow and CLI/API.
- [`calvin-plugins/CREATING_PLUGINS.md`](../../../calvin-plugins/CREATING_PLUGINS.md) —
  scaffold script and step-by-step tutorial.
- Built-in plugin examples: [`backend/app/plugins/`](../../backend/app/plugins/).
- Reference plugin: [`mealie/`](../../../calvin-plugins/mealie) in `calvin-plugins`.
