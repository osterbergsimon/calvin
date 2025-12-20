# Plugin Package Format Specification

This document defines the official format for installable Calvin plugins.

## Package Types

### 1. Single Plugin Package (Zip File)

A zip file containing exactly **one** plugin. This is the format used for direct uploads.

**Structure:**
```
my-plugin.zip
└── my-plugin/              # Root directory (optional, can be flat)
    ├── plugin.json         # REQUIRED: Plugin manifest
    ├── plugin.py           # REQUIRED: Plugin implementation
    ├── frontend/           # OPTIONAL: Frontend components
    │   └── MyComponent.vue
    └── assets/             # OPTIONAL: Static assets
        └── icon.png
```

**Validation Rules:**
- Must contain exactly **one** `plugin.json` file
- Must contain exactly **one** `plugin.py` file in the same directory as `plugin.json`
- The `plugin.json` and `plugin.py` must be in the same directory (the plugin root)
- If zip contains a root directory, files will be extracted from it
- If zip is flat (no root directory), files must be at the root level

**Example:**
```bash
# Valid: Root directory structure
my-plugin.zip
  └── my-plugin/
      ├── plugin.json
      └── plugin.py

# Valid: Flat structure
my-plugin.zip
  ├── plugin.json
  └── plugin.py

# Invalid: Multiple plugins
my-plugin.zip
  ├── plugin1/
  │   ├── plugin.json
  │   └── plugin.py
  └── plugin2/
      ├── plugin.json
      └── plugin.py
```

### 2. Multi-Plugin Repository (GitHub)

A GitHub repository containing **one or more** plugins. Can include a manifest file for explicit enumeration.

**Structure Option A: With Manifest File**
```
my-plugins-repo/
├── plugins.json            # REQUIRED: Repository manifest
├── plugin1/                # Plugin directory
│   ├── plugin.json
│   └── plugin.py
├── plugin2/                # Plugin directory
│   ├── plugin.json
│   └── plugin.py
└── README.md
```

**Structure Option B: Without Manifest (Auto-Discovery)**
```
my-plugins-repo/
├── plugin1/                # Plugin directory (auto-discovered)
│   ├── plugin.json
│   └── plugin.py
├── plugin2/                # Plugin directory (auto-discovered)
│   ├── plugin.json
│   └── plugin.py
└── README.md
```

## Repository Manifest Format (`plugins.json`)

If a repository contains multiple plugins, it **should** include a `plugins.json` file at the root that explicitly lists available plugins.

**Format:**
```json
{
  "version": "1.0.0",
  "plugins": [
    {
      "id": "plugin1",
      "name": "Plugin One",
      "path": "plugin1",
      "description": "First plugin in the repository",
      "version": "1.0.0",
      "type": "service"
    },
    {
      "id": "plugin2",
      "name": "Plugin Two",
      "path": "plugin2",
      "description": "Second plugin in the repository",
      "version": "2.1.0",
      "type": "calendar"
    }
  ]
}
```

**Fields:**
- `version` (string, required): Manifest format version
- `plugins` (array, required): List of available plugins
  - `id` (string, required): Plugin identifier (must match plugin.json id)
  - `name` (string, required): Human-readable name
  - `path` (string, required): Relative path to plugin directory from repo root
  - `description` (string, optional): Plugin description
  - `version` (string, optional): Plugin version (if different from plugin.json)
  - `type` (string, optional): Plugin type (calendar/image/service)

**Auto-Discovery Rules:**
If `plugins.json` is not present, the installer will:
1. Scan the repository root for directories
2. For each directory, check if it contains `plugin.json` and `plugin.py`
3. Validate each found plugin directory
4. Return list of discovered plugins

**Validation:**
- Each plugin path must exist and be a directory
- Each plugin directory must contain valid `plugin.json` and `plugin.py`
- Plugin IDs must be unique within the repository
- Plugin paths must be relative and not contain `..` (security)

## Plugin Directory Structure

Each plugin directory must follow this structure:

```
plugin-name/
├── plugin.json         # REQUIRED: Plugin manifest
├── plugin.py          # REQUIRED: Plugin implementation
├── frontend/           # OPTIONAL: Frontend components
│   └── *.vue
└── assets/             # OPTIONAL: Static assets
    └── *
```

**Required Files:**
- `plugin.json`: Plugin manifest (see PLUGIN_INSTALLATION.md)
- `plugin.py`: Plugin implementation

**Optional Directories:**
- `frontend/`: Vue components for the plugin
- `assets/`: Static assets (images, icons, etc.)

## Validation Rules

### Zip File Validation
1. ✅ Contains exactly one `plugin.json` file
2. ✅ Contains exactly one `plugin.py` file in the same directory as `plugin.json`
3. ✅ `plugin.json` is valid JSON
4. ✅ `plugin.json` contains required fields: `id`, `name`, `version`, `type`
5. ✅ Plugin type is valid: `calendar`, `image`, or `service`
6. ✅ Plugin ID matches manifest ID (if provided during install)

### Repository Validation
1. ✅ If `plugins.json` exists, it must be valid JSON
2. ✅ Each plugin listed in `plugins.json` must exist at the specified path
3. ✅ Each plugin directory must contain valid `plugin.json` and `plugin.py`
4. ✅ Plugin IDs must be unique within the repository
5. ✅ Plugin paths must be relative and not contain `..`

### Plugin Directory Validation
1. ✅ Directory contains `plugin.json`
2. ✅ Directory contains `plugin.py`
3. ✅ `plugin.json` is valid and contains required fields
4. ✅ Plugin type is valid

## Installation Process

### Zip File Installation
1. Extract zip to temporary directory
2. Validate package structure (exactly one plugin)
3. Extract plugin to `backend/data/plugins/{plugin_id}/`
4. Copy frontend components if present
5. Reload plugin loader

### Repository Installation (Single Plugin)
1. Download repository zip from GitHub
2. Extract to temporary directory
3. Navigate to specified plugin path
4. Validate plugin directory
5. Install plugin (same as zip installation)

### Repository Installation (Multi-Plugin)
1. Download repository zip from GitHub
2. Extract to temporary directory
3. Check for `plugins.json` manifest
4. If manifest exists, validate and enumerate plugins
5. If no manifest, auto-discover plugins by scanning directories
6. Return list of available plugins to user
7. User selects plugin(s) to install
8. Install selected plugin(s) one by one

## Security Considerations

1. **Path Traversal**: Plugin paths must not contain `..` or absolute paths
2. **File Validation**: Only extract expected file types
3. **Size Limits**: Enforce reasonable size limits on downloads
4. **Malicious Code**: Plugins execute Python code - users must trust the source
5. **Dependencies**: Validate plugin dependencies before installation

## Examples

### Example 1: Single Plugin Zip
```bash
# Package structure
my-service-plugin.zip
  └── my-service-plugin/
      ├── plugin.json
      ├── plugin.py
      └── frontend/
          └── ServiceViewer.vue

# Installation
curl -X POST /api/plugins/install -F "file=@my-service-plugin.zip"
```

### Example 2: Multi-Plugin Repository with Manifest
```bash
# Repository structure
calvin-plugins/
├── plugins.json
├── weather-plugin/
│   ├── plugin.json
│   └── plugin.py
└── news-plugin/
    ├── plugin.json
    └── plugin.py

# plugins.json
{
  "version": "1.0.0",
  "plugins": [
    {
      "id": "weather",
      "name": "Weather Service",
      "path": "weather-plugin",
      "type": "service"
    },
    {
      "id": "news",
      "name": "News Feed",
      "path": "news-plugin",
      "type": "service"
    }
  ]
}

# Installation
# 1. Enumerate plugins
GET /api/plugins/enumerate-from-github?repo_url=https://github.com/user/calvin-plugins

# 2. Install selected plugin
POST /api/plugins/install-from-github
{
  "repo_url": "https://github.com/user/calvin-plugins",
  "plugin_path": "weather-plugin"
}
```

### Example 3: Multi-Plugin Repository without Manifest
```bash
# Repository structure (auto-discovered)
calvin-plugins/
├── weather-plugin/
│   ├── plugin.json
│   └── plugin.py
└── news-plugin/
    ├── plugin.json
    └── plugin.py

# Installation
# 1. Enumerate plugins (auto-discovers)
GET /api/plugins/enumerate-from-github?repo_url=https://github.com/user/calvin-plugins

# 2. Install selected plugin
POST /api/plugins/install-from-github
{
  "repo_url": "https://github.com/user/calvin-plugins",
  "plugin_path": "weather-plugin"
}
```

