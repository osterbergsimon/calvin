# Plugin Contract 1.0 — Design Decisions

Companion to the handoff brief (`2026-07-01-plugin-contract-1.0.md`). This is
the committed shape; the brief's appendix was non-binding and this document
records where we follow it and where we depart.

## Departures from the suggested implementation (and why)

1. **No legacy-adapter shim.** The suggested sequencing landed the new host
   behind a shim so old plugins keep working during migration. But the host
   *already* rejects the legacy display shape — `PluginDefinition` requires
   `display_schema.kind`, and 6 of 14 plugins (mealie, weather, yr_weather,
   system-monitor, test-plugin, test-plugin-frontend) fail the cross-repo
   contract tests today. There is no working legacy path to preserve, so a
   shim would only preserve breakage. We hard-cut both repos in lockstep.
2. **Pluggy is removed entirely**, not renamed. With declarative class
   discovery all three hookspecs die; nothing else uses the pluggy bus. The
   `plugin_manager`-vs-`plugin_manager` global collision (brief: rename to
   `hook_manager`) dissolves because `app.plugins.hooks` ceases to exist.
3. **`get_content()` is deleted, not folded into `fetch()`.** Grep shows zero
   host-side consumers — no route calls it. Universal-but-dead, so it goes.
4. **`api_version` lives in `plugin.json` only** (not also in class metadata).
   One field, one place. Built-in plugins (host repo) have no manifest and are
   versioned with the host itself.

## The contract

### Author-facing shape (the north star, realized)

```python
"""A complete minimal service plugin: one class + plugin.json."""
from app.plugins import PluginMetadata, ServicePlugin


class HelloPlugin(ServicePlugin):
    metadata = PluginMetadata(
        type_id="hello",
        name="Hello",
        description="Says hello",
        instance_config_schema={
            "url": {"type": "string", "default": "", "ui": {"component": "input"}},
        },
        display_schema={"kind": "status", "layout": "tile", "label": "Hello",
                        "value_path": "$.message"},
    )

    async def fetch(self, start_date=None, end_date=None):
        return {"message": f"hello from {self.config['url']}"}
```

No module-level hooks. No `__init__`. No `get_plugin_metadata()`. No
`SERVICE_FIELDS`. No `configure()` override unless the plugin reacts to
config changes. `self.config` is the schema-normalized instance config dict,
maintained by `BasePlugin.configure()`.

### Discovery (replaces the three pluggy hooks)

- `loader.py` imports each plugin module and scans for `BasePlugin` subclasses
  that define a `metadata` class attribute. Each discovered class registers
  into a `type_id -> class` registry.
- **Registration** (`register_plugin_types`) := `cls.metadata` + `plugin_class=cls`;
  `plugin_type` is derived from the family base class, never declared.
- **Instantiation** (`create_plugin_instance`) := `cls(plugin_id, name, enabled)`
  then `await instance.configure(config)`. Plugins do not unpack config in
  `__init__`.
- **Config update** (`handle_plugin_config_update`) := host-side call into
  `handle_plugin_config_update_generic` with an `InstanceManagerConfig` derived
  from `cls.metadata` + optional class hooks (below). The `session` parameter
  is gone.

Optional class-level hooks (override only when needed):

| hook | replaces | default |
|---|---|---|
| `validate_config(cls, config) -> bool` | per-plugin validate callbacks + instance `validate_config` | schema-driven: required fields present, types convert |
| `instance_id_for(cls, config) -> str` | `generate_instance_id` callbacks | `{type_id}` (single-instance) / `{type_id}-{hash}` |
| `test_connection(cls, config)` | `test_type_config` + deprecated hook | `None` (no test path) |
| `scan_options(cls, field_key)` | `scan_type_options` + deprecated hook | `None` |
| `prepare_instance_config` / `on_instance_created` / `on_instance_updated` | manager-config callbacks | no-op (kept for the plugins that use them) |

### Config: declared once

`instance_config_schema` (typed, `dict[str, ConfigFieldDefinition]`) is the
single declaration. From it the host derives: the settings form (unchanged),
value normalization/conversion (`type` drives the converter), required-field
validation, and `self.config` population in `BasePlugin.configure()`.
`ServiceConfigField`/`ImageConfigField`/`BackendConfigField` tuples, per-field
`__init__` params, and hand-written `configure()` extraction all die.

Config **values** are bare scalars everywhere: the API normalizes any legacy
`{value}`/`{default}` wrappers once at the write boundary; DB stores scalars;
the four frontend defensive-unwrap sites go away.

### Verbs: one each

- `fetch(start_date=None, end_date=None)` — instance-level, service plugins.
  Replaces `fetch_service_data`, `fetch_type_data`, `get_content`, and the
  deprecated `fetch_plugin_data` hook. `/api/plugins/{id}/data` calls it.
- `test_connection(config)` — classmethod (works on unsaved config).
  Replaces `test_type_config` / `test_plugin_connection`.
- `scan_options(field_key)` — classmethod. Replaces `scan_type_options` /
  `scan_plugin_options`.
- Calendar/image family protocols keep their domain verbs (`fetch_events`,
  `get_images`, ...) — those were never part of the confusion.
- `CapabilitySet` deleted (zero reads). Capability inference stays as-is:
  presence of method/ui_action.

### Version signal

`plugin.json` gains required `api_version: 1` (int). Installer rejects
missing, non-int, or `> CURRENT_PLUGIN_API_VERSION` — no default-fill.
`format_version`, `protocol_version`, and `dependencies.calvin` are removed
everywhere (manifest validator, PluginMetadata, SDK, docs). The plugin's own
semver `version` remains (it's a release label, not a contract signal).

### Dependencies

`dependencies: {"packages": ["psutil>=5.9"]}` — the documented shape becomes
the enforced one. Installer pip-installs from it; `python_dependencies` and
the inert `dependencies.python` key are removed. Shape validated at install
(list of requirement strings).

### Display: one path

- Panel kinds: `status` (new, with `layout: tile|row|list`), `card-grid`,
  `item-list`, `iframe`, `image-with-caption`, `metric-dashboard`,
  `weather-forecast`, `web-component`. `status-tile`/`status-list`/`status-row`
  are deleted, replaced by consolidated `status`.
- Statusbar gets its **own namespace**: `SUPPORTED_STATUSBAR_KINDS = {"status"}`.
  A statusbar item can no longer declare an iframe panel.
- Legacy `type: "api"`, `render_template`, `component: "*.vue"` are rejected
  at load (already true for missing `kind`; now the fields themselves are
  refused so straddlers fail loudly).
- `SchemaRenderer` drops the redundant `web-component` `v-else-if` (registry
  handles it) and forwards `plugin-id` on the generic branch.
- **Kind-sync test** (pytest): parses `rendererRegistry.js` and asserts the
  key set equals backend `SUPPORTED_DISPLAY_KINDS`, and statusbar kinds match.

### Typed boundary

`PluginMetadata` (successor of `PluginDefinition`, still in `definitions.py`)
is the one typed model, used both as the author-facing class attribute and the
runtime definition (loader fills `plugin_class`). Sub-schemas
(`ConfigFieldDefinition`, `DisplaySchema`, `StatusbarSchema`,
`ActionDefinition`) are applied, not decorative. The `get()`/`__getitem__`
dict shims are removed; call sites move to attribute access.

### Dead surface (csg.6)

`frontend_rebuild_in_progress` dropped from all response models + types.ts.
`/geocode` de-hardcoded: the route serves any plugin whose `ui_actions`
declare `type: "geocode"`; yr_weather declares it; InstanceModal keys off the
action, not the plugin id. `webServices.js` "iframe" default handled in the
same pass (explicit host-owned constant or metadata flag — decided in code).

### Install without restart (csg.8)

Mostly already true at the route level (`load_plugin_types_for_single`); with
class discovery the loader path gets simpler. Covered by an integration test:
install via API → type visible in `GET /api/plugins` without restart.

## Sequencing

1. **Core contract in host** (csg.1 + csg.2 + csg.3 together — same files):
   new `PluginMetadata`, class-discovery loader, pluggy removal, verb
   unification, version gate, built-in plugins (google, ical, local, iframe)
   migrated in the same commit. Tests updated/added, incl. minimal-declarative-
   plugin test.
2. **Display path** (csg.4): backend kind sets + frontend consolidation +
   kind-sync test.
3. **Visual pass** (csg.9, frontend-design loop): renderer token migration to
   the shell-native semantic tokens, `status` renderer anchors.
4. **Deps + dead surface + typed boundary** (csg.5, csg.6, csg.7).
5. **Migrate calvin-plugins** (csg.10): mealie first as reference, then the
   other 13 in parallel; regenerate scaffold; verify install-no-restart (csg.8).
6. **Docs** (csg.11).
