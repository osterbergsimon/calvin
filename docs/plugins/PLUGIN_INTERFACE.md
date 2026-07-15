# Plugin Interface Reference (contract 1.0)

The host-side reference for the interface between Calvin core and plugins.
A plugin is **one `BasePlugin`-family subclass with a
`metadata = PluginMetadata(...)` class attribute**. The loader discovers the
class; registration, instantiation, config normalization, and config-update
handling are all derived from it. There are no module-level registration
hooks — Pluggy and the hook system are gone.

Authoritative code:

- [definitions.py](../../backend/app/plugins/definitions.py) — `PluginMetadata`, kind sets, `CURRENT_PLUGIN_API_VERSION`
- [base.py](../../backend/app/plugins/base.py) — `BasePlugin`
- [protocols.py](../../backend/app/plugins/protocols.py) — the four family protocols
- [loader.py](../../backend/app/plugins/loader.py) — class discovery and the type registry
- [instance_manager.py](../../backend/app/plugins/utils/instance_manager.py) — host-side config-update flow

Author-facing walkthrough: [`calvin-plugins/CREATING_PLUGINS.md`](../../../calvin-plugins/CREATING_PLUGINS.md).

## PluginMetadata

Declared as a class attribute; validated by Pydantic at class-definition time
(`extra="forbid"` — unknown fields are errors).

| Field | Type / default | Meaning |
|---|---|---|
| `type_id` | `str`, required | Unique plugin type id. Must equal `plugin.json` `id` for installed plugins. |
| `name` | `str`, required | Human-readable name. |
| `description` | `str \| None` | One-line description. |
| `version` | `str = "1.0.0"` | Release label (not a contract signal — that's `api_version` in `plugin.json`). |
| `supports_multiple_instances` | `bool = True` | `False` for single-instance plugins. |
| `instance_label` | `str \| None` | Noun for one instance in the settings UI (e.g. `"Server"`). |
| `default_instance_name` | `str \| None` | Default name for new instances. |
| `fixed_instance_id` | `str \| None` | Fixed id for single-instance plugins (default `{type_id}-instance`). |
| `instance_identity` | `list[str] \| None` | Config keys that identify an instance — same values → same instance id (see `instance_id_for`). |
| `common_config_schema` | `dict = {}` | Per-type settings schema (rare). |
| `instance_config_schema` | `dict = {}` | Per-instance settings schema — **the single config declaration** (drives the form, normalization, validation, and `self.config`). |
| `ui_actions` | `list[dict] = []` | Settings buttons: `{id, type, label, style, scope}`. `type: "test"` wires the Test Connection button to `test_connection`; `type: "geocode"` enables the geocode helper. |
| `ui_sections` | `list[dict] = []` | Structured settings sections (e.g. upload). |
| `display_schema` | `dict \| None` | Panel declaration; `kind` required, must be in `SUPPORTED_DISPLAY_KINDS`. |
| `statusbar_schema` | `dict \| None` | Statusbar item; `kind` must be in `SUPPORTED_STATUSBAR_KINDS` (`status` only). |
| `browser_origins` | `list[str]` (default `[]`) | Origins **intrinsic to the plugin** that the kiosk browser may reach (CSP host-sources). Extends the kiosk CSP's `frame-src`, `img-src`, `connect-src` for enabled plugins. Empty by default — see below. |
| `plugin_type`, `plugin_class` | runtime | Filled by the loader — **plugins never declare them**. `plugin_type` is derived from the family base class. |

Validation at class definition (so errors surface at import, not render):

- `display_schema.kind` must be one of `SUPPORTED_DISPLAY_KINDS`:
  `status`, `card-grid`, `item-list`, `iframe`, `image-with-caption`,
  `metric-dashboard`, `weather-forecast`, `web-component`.
- `statusbar_schema.kind` must be in `SUPPORTED_STATUSBAR_KINDS` (`status`).
- `display_schema.panel_variant`, if present, must be one of
  `default`, `dense`, `media`, `iframe`.
- Retired pre-1.0 display keys are rejected loudly: `type` (as in
  `type: "api"`), `api_endpoint`, `render_template`, `component`,
  `data_schema`.
- `browser_origins` entries must each be a valid CSP host-source: a host
  (`grafana.lab`), `host:port`, a `*.` wildcard (`*.lab.example.com`), or an
  `http(s)://` URL. **CIDR / IP ranges are rejected** (not expressible in CSP —
  use a wildcard domain). A malformed entry rejects the plugin at load. Entries
  are normalized (host lowercased) and deduped.

**When to set `browser_origins`.** Leave it empty (the default) unless the
plugin's frontend genuinely must load from a *fixed* external origin the plugin
author knows and that is the same for every install (e.g. a fixed SDK host).
**Site-specific** origins — the operator's own self-hosted services — belong in
the operator's Security → Allowed origins list, not here. Variable, per-user
hosts (e.g. album-art CDNs that differ by casting app) are not a fit for a fixed
list; proxy those through Calvin or add them to the admin allowlist. Backend-side
network access needs no declaration — it is invisible to the kiosk browser.

Renderer schema fields per kind: [PLUGIN_FRONTEND_COMPONENTS.md](PLUGIN_FRONTEND_COMPONENTS.md).

### Config field shape

Each `instance_config_schema` entry is a field dict in one canonical shape:

```python
"field_key": {
    "type": "string" | "integer" | "number" | "boolean" | "password",
    "description": "shown in the form",
    "default": ...,          # optional — omit to leave a field genuinely unset
    "ui": {
        "component": "input" | "password" | "number" | "checkbox"
                     | "select" | "directory" | "textarea",
        "placeholder": "...",   # optional
        "help_text": "...",     # optional
        "options": [...],       # select only
        "validation": {         # all constraints live here
            "required": bool,   # enforced by the default validate_config
            "min": num, "max": num,   # enforced by the number renderer
            "type": "url",      # semantic hint (e.g. URL fields)
        },
    },
}
```

- **`type`** drives `normalize_config` conversion — numeric fields must be
  `integer`/`number`, never `string`, or the value won't convert.
- **Constraints belong under `ui.validation`** — this is the single validation
  namespace. `min`/`max` at `ui.min`/`ui.max` are **not** read.
- **Omit `default` when a field should start unset.** A default is injected by
  `normalize_config`, and for numeric fields `to_float(None)` yields `0.0`; a
  spurious default can make an empty config look valid (see calvin-8p0).

**Authoring helpers** ([`app/plugins/sdk/schema.py`](../../backend/app/plugins/sdk/schema.py))
build this shape so plugins don't hand-roll nested dicts. `text_field()`,
`password_field()`, `url_field()`, `number_field()`, `select_field()`,
`toggle_field()` — mix freely with raw dicts:

```python
from app.plugins.sdk.schema import number_field, password_field, select_field, toggle_field, url_field

instance_config_schema={
    "url": url_field("Website URL", placeholder="https://example.com", required=True),
    "api_token": password_field("API token", required=True),
    "days_ahead": number_field("Days ahead", default=7, min=1, max=30, integer=True),
    "mark_as_read": select_field("Mark as read", [("true", "Yes"), ("false", "No")]),
    "fullscreen": toggle_field("Prefer fullscreen mode"),
}
```

The `iframe` plugin uses these as the reference example.

## BasePlugin surface

### Construction and config

- `__init__(plugin_id, name, enabled=True)` — the standard signature. **Never
  add config parameters to `__init__`**; the host constructs instances with
  exactly these three arguments, then applies config.
- `configure(config)` (async) — normalizes `config` against
  `metadata.instance_config_schema` and stores it in `self.config`. Override
  only to react to config changes, and call `await super().configure(config)`
  first.
- `normalize_config(config)` (classmethod) — schema-driven conversion:
  `string`/`password` → `str`, `integer` → `int`, `number` → `float`,
  `boolean` → `bool`; applies schema defaults; unwraps legacy `{value}`
  wrappers. Keys not in the schema pass through.
- `validate_config(config)` (async classmethod) — awaited by the host before
  an instance is created or updated. Default: every field whose
  `ui.validation.required` is truthy must be present and non-empty after
  normalization. Override for plugin-specific rules; start with
  `normalized = cls.normalize_config(config)`.
- `get_config()` — returns a copy of `self.config`.

### Identity

- `instance_id_for(config)` (classmethod) — derives a stable instance id from
  the config keys named in `metadata.instance_identity` (an md5 short-hash:
  `{type_id}-{digest}`). Returns `None` when no identity is declared; the
  host then falls back to a hash of the whole config. Same identity → same
  instance across config edits.

### Class-level operations (no instance required)

- `test_connection(config)` (async classmethod) — test a possibly-unsaved
  config; return `{"success": bool, "message": str}` or `None` (no test
  path). Served at `POST /api/plugins/{type_id}/test`.
- `scan_options(field_key)` (async classmethod) — discover options for a
  config field (e.g. enumerate devices); return
  `{"options": [{"value", "label"}]}` or `None`. Served at
  `GET /api/plugins/{type_id}/scan?field=...`.
- `prepare_instance_config(config, context)` (classmethod) — adjust the
  config persisted for an instance; `context` carries
  `instance_name` / `instance_enabled` / `type_enabled`. Default: unchanged.

### Lifecycle

- `initialize()` (async) — connect/validate; runs after `configure`. Default no-op.
- `cleanup()` (async) — release resources. Default no-op.
- `enable()` / `disable()`, `start()` / `stop()`, `is_running()` — enable
  state and running state; the host drives these around config updates and
  install/uninstall.
- `emit_event(event_type, event_data, wait_for_handlers=False)` (async) —
  publish to the cross-plugin event system ([EVENT_SYSTEM.md](../EVENT_SYSTEM.md)).

## Family protocols

Every plugin subclasses exactly one family protocol; the loader derives
`plugin_type` from it.

| Family | Base class | MUST implement | CAN implement |
|---|---|---|---|
| `service` | `ServicePlugin` | — | `fetch(start_date=None, end_date=None)` → the JSON payload the display/statusbar schema binds to; served at `GET /api/plugins/{instance_id}/data`. |
| `calendar` | `CalendarPlugin` | `fetch_events(start_date, end_date)` → `list[CalendarEvent]` | — |
| `image` | `ImagePlugin` | `get_images()`, `get_image(id)`, `get_image_data(id)`, `scan_images()` | `upload_image(data, filename)`, `delete_image(id)`, `get_thumbnail_path(id)` |
| `backend` | `BackendPlugin` | — | `fetch()` (on-demand "check now"), `get_schedule_config()` / `run_scheduled_task()`, `start_worker()` / `stop_worker()`, `provide_service()` / `get_provided_services()`, `handle_event()` / `get_subscribed_events()` |

`fetch()` is the one data verb for service and backend plugins. It replaces
the retired per-plugin fetch variants and the deprecated fetch hooks; there is
no other data path.

## How the host derives everything

There are no plugin-implemented registration or config-update hooks. The host
does all of this from the class:

- **Discovery** — the loader imports built-in plugin packages
  (`app.plugins.{calendar,image,service}`) and each installed plugin's
  `plugin.py`, then registers every `BasePlugin` subclass that declares **its
  own** `metadata` attribute (inherited metadata doesn't count — that's how a
  subclass can reuse an implementation under a new `type_id`, see the
  `ical`/`proton` built-ins). Duplicate `type_id`s keep the first class and
  log an error.
- **Registration** — `plugin_loader.get_plugin_types()` returns each class's
  `metadata` with `plugin_class` and `plugin_type` filled in; the registry
  loader mirrors types into the `plugin_types` DB table (new types default to
  disabled).
- **Instantiation** — `plugin_loader.create_plugin_instance(...)` calls
  `cls(plugin_id=..., name=..., enabled=...)`; callers then apply config via
  `await instance.configure(config)`.
- **Config update** — `apply_plugin_config_update` in
  [instance_manager.py](../../backend/app/plugins/utils/instance_manager.py)
  builds an `InstanceManagerConfig` from `metadata`
  (multiplicity, fixed id, default name) plus the class's `normalize_config`,
  `validate_config`, `instance_id_for`, and `prepare_instance_config`, and
  routes through `handle_plugin_config_update_generic` (create/update DB row,
  configure the live instance, start/stop as needed).
- **Config values are bare scalars.** The API normalizes legacy
  `{value}`/`{default}` wrappers once at the write boundary
  ([routes/plugins/config.py](../../backend/app/api/routes/plugins/config.py));
  the DB stores plain values; `self.config` holds plain values.

### HTTP surface per plugin method

| Endpoint | Dispatches to |
|---|---|
| `GET /api/plugins/{instance_id}/data` | `instance.fetch(start_date, end_date)` (service plugins) |
| `POST /api/plugins/{type_id}/fetch` | `instance.fetch()` on each enabled instance of the type |
| `POST /api/plugins/{type_id}/test` | `cls.test_connection(config)` |
| `GET /api/plugins/{type_id}/scan?field=` | `cls.scan_options(field)` |
| `PUT /api/plugins/{type_id}/config` | `apply_plugin_config_update` (see above) |

## Core code rules (host-side)

1. No `hasattr()`/`getattr()` probing for plugin functionality — go through
   `BasePlugin` and the protocol methods only.
2. `isinstance()` checks before invoking family-specific methods.
3. Never call private methods (`_`-prefixed).
4. Optional methods return `None` when unsupported — check return values.

```python
# CORRECT
if isinstance(plugin, ServicePlugin):
    data = await plugin.fetch()  # None if the plugin has no data path
    if data is not None:
        return data

# WRONG
if hasattr(plugin, "_fetch_meal_plan"):
    data = await plugin._fetch_meal_plan()
```
