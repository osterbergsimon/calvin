# Plugin Package Format Specification

The official format for installable Calvin plugins under **plugin contract
1.0**. Enforced by
[plugin_installer.py](../../backend/app/services/plugin_installer.py) and
[manifest_validator.py](../../backend/app/services/validation/manifest_validator.py).

## Versioning: `api_version`

The **one** contract version signal is `api_version` in `plugin.json`:

- Integer, **required** — a manifest without it is rejected (never
  default-filled).
- Must equal the host's `CURRENT_PLUGIN_API_VERSION`
  ([definitions.py](../../backend/app/plugins/definitions.py)), currently `1`.
  Newer → "update Calvin"; older → "update the plugin".
- Checked at install **and** at every startup load — an installed plugin whose
  `api_version` no longer matches is skipped with a load error instead of
  loading half-broken.

The plugin's own `version` field remains a semver **release label**, used only
for upgrade/downgrade checks at install; it says nothing about the contract.

**Retired version keys:** `format_version` and `protocol_version` are gone.
They have no effect on the host, and the `calvin-plugins` repository validator
(`scripts/validate_plugins.py`) rejects manifests that still declare them.

## Package Types

### 1. Single Plugin Package (Zip File)

A zip containing exactly **one** plugin — the format for direct uploads.

```
my-plugin.zip
└── my-plugin/              # Root directory (optional, can be flat)
    ├── plugin.json         # REQUIRED: manifest
    ├── plugin.py           # REQUIRED: the plugin class
    ├── frontend/           # OPTIONAL: pre-built web-component assets
    │   └── dist.js
    └── assets/             # OPTIONAL: backend static assets
```

Validation rules:

- Exactly one `plugin.json` and one `plugin.py`, in the same directory (the
  plugin root).
- Root-directory and flat layouts both work; multiple plugins in one zip are
  rejected.

### 2. Multi-Plugin Repository (GitHub)

A repository containing one or more plugins, enumerated either through a
`plugins.json` manifest at the repo root or by auto-discovery (any directory
containing both `plugin.json` and `plugin.py`).

```
my-plugins-repo/
├── plugins.json            # RECOMMENDED: repository manifest
├── plugin1/
│   ├── plugin.json
│   └── plugin.py
└── plugin2/
    ├── plugin.json
    └── plugin.py
```

## Repository Manifest (`plugins.json`)

The repository-level manifest lists plugins for discovery. It is distinct
from the per-plugin `plugin.json`.

```json
{
  "version": "1.0.0",
  "plugins": [
    {
      "id": "weather",
      "name": "Weather Service",
      "path": "weather-plugin",
      "description": "Display weather information",
      "version": "1.0.0",
      "type": "service"
    }
  ]
}
```

- `version` (string): repository manifest format version.
- `plugins[]`: `id` and `path` required; `name`, `description`, `version`,
  `type` optional (fall back to the plugin's own manifest).
- Paths must be relative, without `..` (path-traversal protection).
- Entries whose directories are missing or fail plugin validation are skipped.

In the official `calvin-plugins` repo, `scripts/rebuild-manifest.py`
regenerates this file — don't edit it by hand there.

## Plugin Manifest Schema (`plugin.json`)

### Required fields

```json
{
  "api_version": 1,
  "id": "my_plugin",
  "name": "My Plugin",
  "version": "1.0.0",
  "type": "service"
}
```

- **`api_version`** (int, required): plugin contract version — see above.
- **`id`** (string, required): unique plugin identifier (lowercase; letters,
  numbers, underscores, hyphens). Must equal the class's
  `metadata.type_id`.
- **`name`** (string, required): human-readable name.
- **`version`** (string, required): semantic version; used for
  upgrade/downgrade checks at install.
- **`type`** (string, required): one of `calendar`, `image`, `service`,
  `backend`. Must match the family base class the plugin subclasses.

### Optional metadata fields

`description`, `author`, `license`, `homepage`, `repository`, `bugs`,
`keywords` — free-form metadata shown in the UI and used for discovery.

### Dependencies

```json
{
  "dependencies": {
    "packages": ["psutil>=5.9", "httpx"]
  }
}
```

- **`dependencies.packages`** (list of strings): pip requirement strings —
  **the only dependency mechanism**. The installer pip-installs each one into
  the host's venv at plugin install (resolving `uv`, a venv `pip`, or
  `python -m pip`, in that order). A failed or timed-out install (120 s per
  package) **rolls the whole plugin back**.
- Shape is validated at install: must be a list of non-empty strings.

**Retired dependency keys** (no effect on the host; rejected by the
`calvin-plugins` repo validator): `python_dependencies`,
`dependencies.python`, `dependencies.calvin`, and the old dict form of
`packages` (must be a list of requirement strings).

### Files

```json
{
  "files": {
    "include": ["plugin.py", "plugin.json", "frontend/**"],
    "exclude": ["*.md", "tests/**", "__pycache__/**"]
  }
}
```

- `include` / `exclude` (arrays of glob patterns): which files belong in the
  installable package. `__pycache__`, `.git`, `.gitignore` are always skipped
  when installing from a directory.

### Requirements

```json
{
  "requirements": {
    "config_required": true,
    "permissions": ["network"]
  }
}
```

- **`config_required`** (bool, default `false`): the plugin needs
  configuration before it can do anything useful.
- **`permissions`** (array): informational permission tags (e.g. `"network"`,
  `"filesystem"`).
- **`restart_required`** (bool, default `false`): legacy flag, echoed in the
  install response. Installation is live under contract 1.0 (see
  [PLUGIN_PERSISTENCE_AND_RESTART.md](PLUGIN_PERSISTENCE_AND_RESTART.md)) —
  don't set this.

### Complete example

```json
{
  "api_version": 1,
  "id": "weather_service",
  "name": "Weather Service",
  "version": "1.2.0",
  "type": "service",
  "description": "Displays weather information from OpenWeatherMap",
  "author": "John Doe",
  "license": "MIT",
  "homepage": "https://github.com/johndoe/weather-plugin",
  "keywords": ["weather", "api", "service"],
  "dependencies": {"packages": ["httpx>=0.27"]},
  "files": {
    "include": ["plugin.py", "plugin.json"],
    "exclude": ["tests/**", "docs/**", "*.md"]
  },
  "requirements": {"config_required": true}
}
```

## Plugin Directory Structure

```
plugin-name/
├── plugin.json         # REQUIRED: manifest
├── plugin.py           # REQUIRED: one BasePlugin subclass with metadata
├── frontend/           # OPTIONAL: pre-built assets for kind: "web-component"
│   ├── dist.js
│   └── dist.css
└── assets/             # OPTIONAL: backend static assets
```

- `frontend/` files are served at
  `/api/plugins/{plugin_id}/static/{asset_path}` — pre-built ES modules only,
  **no `.vue` sources and no host rebuild**.
- `plugin.py` must declare a plugin class per
  [PLUGIN_INTERFACE.md](PLUGIN_INTERFACE.md); module-level hooks are not part
  of the format.

## Validation at Install

1. Exactly one `plugin.json` + `plugin.py` (zip) / both present (directory).
2. `plugin.json` is valid JSON with `id`, `name`, `version`, `type`.
3. `type` is one of `calendar`, `image`, `service`, `backend`.
4. `api_version` present, integer, equal to the host's supported version.
5. Optional fields (`dependencies`, `files`, `requirements`) have valid
   structure if present.
6. After extraction, the host imports `plugin.py` and validates the plugin
   class (`PluginMetadata` validation runs at import — bad `display_schema`
   kinds, retired display keys, or a missing plugin class **roll the install
   back** with a descriptive error).

## Installation Process

Full flow (including the no-restart lifecycle):
[PLUGIN_INSTALLATION.md](PLUGIN_INSTALLATION.md) and
[PLUGIN_PERSISTENCE_AND_RESTART.md](PLUGIN_PERSISTENCE_AND_RESTART.md).

1. Validate the package (rules above).
2. Extract/copy to `backend/data/plugins/{plugin_id}/`.
3. Pip-install `dependencies.packages` (failure → rollback).
4. Import `plugin.py`, register the plugin class, validate (failure →
   rollback).
5. Register the plugin type in the database (disabled by default) — visible
   in the UI immediately, no restart.

## Security Considerations

1. **Path traversal**: plugin paths must not contain `..` or be absolute.
2. **Trusted sources only**: plugins execute Python in the host process and
   install pip packages — install only code you trust.
3. **Static assets**: the `/static/` endpoint is confined to the plugin's own
   directory.
