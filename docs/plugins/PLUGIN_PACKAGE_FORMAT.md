# Plugin Package Format Specification

This document defines the official format for installable Calvin plugins.

## Format Versioning

The plugin package format is versioned to allow for future changes while maintaining backward compatibility.

**Current Format Version: `1.0.0`**

### Format Version Fields

- **Repository Manifest (`plugins.json`)**: The `version` field specifies the manifest format version
- **Plugin Manifest (`plugin.json`)**: The `format_version` field (optional) specifies the plugin manifest format version

If `format_version` is not specified in `plugin.json`, it defaults to `1.0.0` (the current format).

### Version Compatibility

- **Format 1.0.0**: Initial format specification
  - Supports all current features (dependencies, files, requirements, etc.)
  - All plugins without `format_version` are treated as 1.0.0

Future format versions will be documented here with migration guides.

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

**Note**: The repository manifest (`plugins.json`) is different from the plugin manifest (`plugin.json`):
- **`plugins.json`** (repository-level): Lists all plugins in the repository for discovery
- **`plugin.json`** (plugin-level): Defines individual plugin metadata, dependencies, and installation rules

See [Plugin Manifest Schema](#plugin-manifest-schema-pluginjson) section below for the complete plugin manifest schema.

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
- `version` (string, required): Repository manifest format version (currently `"1.0.0"`)
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
- `plugin.json`: Plugin manifest (see [Plugin Manifest Schema](#plugin-manifest-schema-pluginjson) below)
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
3. ✅ `plugin.json` is valid JSON and contains required fields (`id`, `name`, `version`, `type`)
4. ✅ Plugin type is valid (`calendar`, `image`, or `service`)
5. ✅ Optional fields (dependencies, files, requirements) have valid structure if present

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

## Plugin Manifest Schema (`plugin.json`)

Each plugin **must** have a `plugin.json` file in its root directory. This manifest defines plugin metadata, dependencies, file inclusion/exclusion rules, and installation requirements.

### Required Fields

```json
{
  "id": "my_plugin",
  "name": "My Plugin",
  "version": "1.0.0",
  "type": "service"
}
```

- **`id`** (string, required): Unique plugin identifier
  - Must be lowercase
  - Can contain letters, numbers, underscores, and hyphens
  - Must be unique within the Calvin installation
  - Example: `"my_plugin"`, `"weather-service"`

- **`name`** (string, required): Human-readable plugin name
  - Displayed in the UI
  - Can contain any characters
  - Example: `"My Plugin"`, `"Weather Service"`

- **`version`** (string, required): Plugin version
  - Should follow semantic versioning (e.g., `"1.0.0"`, `"2.1.3"`)
  - Used for version checking during installation

- **`type`** (string, required): Plugin type
  - Must be one of: `"calendar"`, `"image"`, or `"service"`

### Format Version Field

```json
{
  "format_version": "1.0.0"
}
```

- **`format_version`** (string, optional): Plugin manifest format version
  - Defaults to `"1.0.0"` if not specified
  - Should match the format version this plugin was created for
  - Used for format compatibility checking

### Optional Metadata Fields

```json
{
  "description": "A description of what this plugin does",
  "author": "Plugin Author Name",
  "license": "MIT",
  "homepage": "https://github.com/user/my-plugin",
  "repository": "https://github.com/user/my-plugin",
  "bugs": "https://github.com/user/my-plugin/issues",
  "keywords": ["weather", "api", "service"]
}
```

- **`description`** (string, optional): Detailed plugin description
- **`author`** (string, optional): Plugin author name or organization
- **`license`** (string, optional): License type (e.g., `"MIT"`, `"Apache-2.0"`, `"GPL-3.0"`)
- **`homepage`** (string, optional): Plugin homepage URL
- **`repository`** (string, optional): Source code repository URL
- **`bugs`** (string, optional): Bug tracker URL
- **`keywords`** (array of strings, optional): Tags for plugin discovery

### Dependencies

```json
{
  "dependencies": {
    "python": ">=3.10",
    "packages": {
      "requests": ">=2.28.0",
      "pydantic": "^2.0.0"
    },
    "system": {
      "ffmpeg": ">=4.0.0"
    },
    "calvin": ">=1.0.0"
  }
}
```

- **`dependencies`** (object, optional): Plugin dependencies
  - **`python`** (string, optional): Required Python version (e.g., `">=3.10"`, `"3.9"`)
  - **`packages`** (object, optional): Python package dependencies
    - Keys are package names (PyPI names)
    - Values are version constraints (e.g., `">=2.28.0"`, `"^2.0.0"`, `"==1.5.0"`)
  - **`system`** (object, optional): System-level dependencies
    - Keys are system package names
    - Values are version constraints (if applicable)
  - **`calvin`** (string, optional): Minimum required Calvin version

### File Inclusion/Exclusion

```json
{
  "files": {
    "include": [
      "plugin.py",
      "config.yaml",
      "assets/**",
      "data/**"
    ],
    "exclude": [
      "*.pyc",
      "__pycache__/**",
      "*.log",
      "tests/**",
      ".git/**"
    ]
  }
}
```

- **`files`** (object, optional): File inclusion/exclusion rules
  - **`include`** (array of strings, optional): Files/directories to include
    - Supports glob patterns (e.g., `"assets/**"`, `"*.py"`)
    - If not specified, all files in plugin directory are included (except excludes)
    - Default: All files except common exclusions
  - **`exclude`** (array of strings, optional): Files/directories to exclude
    - Supports glob patterns
    - Always excludes: `.git/**`, `__pycache__/**`, `*.pyc`, `*.pyo`, `.DS_Store`
    - Default: Common build artifacts and version control files

**Note**: The `files` field is primarily useful for:
- Including additional files beyond `plugin.py` (config files, data files, etc.)
- Excluding test files, documentation, or development files from installation
- Optimizing plugin package size

### Installation Requirements

```json
{
  "requirements": {
    "restart_required": true,
    "permissions": ["network", "filesystem"],
    "config_required": true
  }
}
```

- **`requirements`** (object, optional): Installation and runtime requirements
  - **`restart_required`** (boolean, optional): Whether plugin requires restart after installation
    - Default: `true` (plugins typically need restart to load)
  - **`permissions`** (array of strings, optional): Required permissions
    - Common values: `"network"`, `"filesystem"`, `"database"`
  - **`config_required`** (boolean, optional): Whether plugin requires configuration before use
    - Default: `false`

### Complete Plugin Manifest Example

```json
{
  "id": "weather_service",
  "name": "Weather Service",
  "version": "1.2.0",
  "type": "service",
  "description": "Displays weather information from OpenWeatherMap API",
  "author": "John Doe",
  "license": "MIT",
  "homepage": "https://github.com/johndoe/weather-plugin",
  "repository": "https://github.com/johndoe/weather-plugin",
  "keywords": ["weather", "api", "service", "openweathermap"],
  "dependencies": {
    "python": ">=3.10",
    "packages": {
      "requests": ">=2.28.0",
      "pydantic": "^2.0.0"
    },
    "calvin": ">=1.0.0"
  },
  "files": {
    "include": [
      "plugin.py",
      "config.yaml",
      "assets/icons/**"
    ],
    "exclude": [
      "tests/**",
      "docs/**",
      "*.md"
    ]
  },
  "requirements": {
    "restart_required": true,
    "permissions": ["network"],
    "config_required": true
  }
}
```

### Manifest Validation Rules

1. **Required fields**: `id`, `name`, `version`, `type` must be present
2. **Plugin type**: Must be one of `"calendar"`, `"image"`, or `"service"`
3. **Version format**: Should follow semantic versioning (e.g., `"1.0.0"`)
4. **Format version**: If specified, `format_version` must be a valid format version (currently `"1.0.0"`)
5. **ID format**: Must be valid identifier (lowercase, alphanumeric, underscores, hyphens)
6. **Dependencies**: Version constraints should follow standard format
7. **Files**: Glob patterns must be valid
8. **Optional fields**: Dependencies, files, and requirements have valid structure if present

### Two-Level Manifest System

Calvin uses a **two-level manifest system**:

1. **Repository Manifest (`plugins.json`)** - Repository root
   - Lists all plugins in the repository
   - Used for discovery and enumeration
   - Minimal metadata (id, name, path, version, type, description)

2. **Plugin Manifest (`plugin.json`)** - Each plugin directory
   - Complete plugin metadata
   - Dependencies and requirements
   - File inclusion/exclusion rules
   - Installation requirements

**Benefits**:
- Fast repository enumeration (only reads `plugins.json`)
- Detailed information only loaded when needed
- Clear separation of concerns
- Scalable for large repositories
