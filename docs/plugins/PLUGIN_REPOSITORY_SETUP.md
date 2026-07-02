# Plugin Repository Setup Guide

This guide covers setting up a separate repository for additional Calvin plugins and how to work with it effectively in your IDE.

## Should You Create a Separate Repository?

### ✅ **Yes, create `calvin-plugins` if:**

1. **Community Contributions**: You want others to contribute plugins without access to the main repo
2. **Separation of Concerns**: Keep core Calvin code separate from optional plugins
3. **Independent Versioning**: Plugins can be updated/released independently
4. **Easier Distribution**: Users can browse/install plugins without cloning the main repo
5. **Plugin Marketplace**: Foundation for a future plugin marketplace/registry

### ❌ **Keep plugins in main repo if:**

1. **Small Team**: Only a few developers working on both core and plugins
2. **Tight Integration**: Plugins require frequent core code changes
3. **Simple Workflow**: Prefer everything in one place

## Recommended Approach: Separate Repository

For a project like Calvin, a separate `calvin-plugins` repository is **recommended** because:

- ✅ Better organization and discoverability
- ✅ Community can contribute without core repo access
- ✅ Easier to maintain plugin versions independently
- ✅ Core repo stays focused on core functionality
- ✅ Already supported by your plugin installation system

## Setting Up `calvin-plugins` Repository

### 1. Repository Structure

```
calvin-plugins/
├── README.md              # Repository overview and contribution guide
├── plugins.json           # Repository manifest (optional but recommended)
├── plugin1/               # Plugin directory
│   ├── plugin.json
│   ├── plugin.py
│   └── frontend/
│       └── dist.js
├── plugin2/               # Another plugin
│   ├── plugin.json
│   └── plugin.py
└── CONTRIBUTING.md        # Plugin development guidelines
```

### 2. Create `plugins.json` Manifest

Each listed plugin's own `plugin.json` must declare `api_version: 1` (see
[PLUGIN_PACKAGE_FORMAT.md](PLUGIN_PACKAGE_FORMAT.md)) — the repository
manifest only handles discovery. In the official `calvin-plugins` repo,
`scripts/rebuild-manifest.py` regenerates this file from the plugin
directories; don't edit it by hand there.

```json
{
  "version": "1.0.0",
  "description": "Community-contributed plugins for Calvin",
  "plugins": [
    {
      "id": "weather",
      "name": "Weather Service",
      "path": "weather-plugin",
      "description": "Display weather information",
      "version": "1.0.0",
      "type": "service",
      "author": "Community Contributor"
    },
    {
      "id": "news",
      "name": "News Feed",
      "path": "news-plugin",
      "description": "RSS news feed display",
      "version": "1.0.0",
      "type": "service",
      "author": "Community Contributor"
    }
  ]
}
```

### 3. Repository README Template

```markdown
# Calvin Plugins

Community-contributed plugins for [Calvin Dashboard](https://github.com/your-org/calvin).

## Installation

1. Open Calvin Settings → Plugins
2. Enter this repository URL: `https://github.com/your-org/calvin-plugins`
3. Click "Browse Plugins"
4. Select a plugin and click "Install"

## Available Plugins

- **Weather Service**: Display weather information
- **News Feed**: RSS news feed display
- [Add more...]

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for guidelines on creating plugins.
```

## Working with Multiple Repositories

Most modern IDEs (VS Code, Cursor, etc.) support multiple ways to work with multiple repositories. Here are the best approaches:

### Option 1: Multi-Root Workspace (Recommended)

Create a workspace file that includes both repositories:

**`.code-workspace` file** (create locally in your main `calvin` directory, not tracked in git):

```json
{
  "folders": [
    {
      "path": ".",
      "name": "Calvin (Main)"
    },
    {
      "path": "../calvin-plugins",
      "name": "Calvin Plugins"
    }
  ],
  "settings": {
    "python.defaultInterpreterPath": "${workspaceFolder:Calvin (Main)}/backend/.venv/bin/python",
    "files.exclude": {
      "**/__pycache__": true,
      "**/.pyc": true
    }
  }
}
```

**Usage:**
1. Create `calvin.code-workspace` locally in your `calvin` directory (this file is gitignored)
2. Open it in your IDE: `File → Open Workspace from File...`
3. Both repos appear in the sidebar
4. You can navigate between them seamlessly
5. Search works across both repositories

**Benefits:**
- ✅ Both repos visible in sidebar
- ✅ Cross-repo search and navigation
- ✅ Shared settings and extensions
- ✅ Easy to switch between repos

### Option 2: Git Submodule (For Development)

If you want to develop plugins alongside core code:

```bash
# In calvin directory
git submodule add https://github.com/your-org/calvin-plugins.git plugins-repo
```

Then in your IDE, the plugins appear as a subdirectory. You can edit them directly.

**Benefits:**
- ✅ Plugins are part of your workspace
- ✅ Can test plugins with local changes
- ✅ Version control integration

**Drawbacks:**
- ⚠️ Submodules can be tricky to manage
- ⚠️ Not ideal if plugins repo is separate concern

### Option 3: Symlink (For Local Development)

Create a symlink to the plugins repo in your workspace:

**Windows (PowerShell as Admin):**
```powershell
# In calvin directory
New-Item -ItemType SymbolicLink -Path "plugins-repo" -Target "..\calvin-plugins"
```

**Linux/Mac:**
```bash
# In calvin directory
ln -s ../calvin-plugins plugins-repo
```

Then the plugins appear as a directory in your workspace.

**Benefits:**
- ✅ Simple and straightforward
- ✅ No workspace file needed
- ✅ Works with existing IDE setup

**Drawbacks:**
- ⚠️ Symlinks can be confusing
- ⚠️ Git may not track symlinks well

### Option 4: Separate Windows (Simple)

Just open both folders in separate IDE windows:

1. Open `calvin` in your IDE
2. Open `calvin-plugins` in a new IDE window (`File → New Window`)

**Benefits:**
- ✅ Simplest approach
- ✅ No configuration needed
- ✅ Clear separation

**Drawbacks:**
- ⚠️ No cross-repo search
- ⚠️ Need to switch windows

## Recommended Setup for Calvin

### For Development

**Use Multi-Root Workspace:**

1. Create `calvin.code-workspace` locally (this file is gitignored):
```json
{
  "folders": [
    {
      "path": ".",
      "name": "Calvin"
    },
    {
      "path": "../calvin-plugins",
      "name": "Calvin Plugins"
    }
  ],
  "settings": {
    "python.defaultInterpreterPath": "${workspaceFolder:Calvin}/backend/.venv/bin/python",
    "python.analysis.extraPaths": [
      "${workspaceFolder:Calvin}/backend"
    ],
    "files.exclude": {
      "**/__pycache__": true,
      "**/.pyc": true,
      "**/node_modules": true
    }
  }
}
```

2. Open workspace in your IDE
3. Both repos are accessible

### For Testing Plugins

When developing plugins, you can:

1. **Test locally** by installing from the local path:
   ```bash
   # In calvin-plugins/weather-plugin
   # Copy to calvin's plugin directory for testing
   cp -r weather-plugin /path/to/calvin/backend/data/plugins/weather
   ```

2. **Use the plugin installer's repo support**:
   - Point to local path: `file:///path/to/calvin-plugins`
   - Or use the GitHub URL for testing

3. **Development workflow**:
   - Edit plugin in `calvin-plugins` repo
   - Test by installing from local path or GitHub
   - Commit and push when ready

## IDE-Specific Tips

### 1. Configure Python Paths

In workspace settings, ensure Python can find both repos:

```json
{
  "python.analysis.extraPaths": [
    "${workspaceFolder:Calvin}/backend",
    "${workspaceFolder:Calvin Plugins}"
  ]
}
```

### 2. Use Multi-Root Search

- `Ctrl+Shift+F` (Windows) or `Cmd+Shift+F` (Mac) searches across all workspace folders
- Use `files to include` filter to search specific repos

### 3. Configure Git

If using multi-root workspace, your IDE handles Git for each folder separately. You can:
- Commit to each repo independently
- See separate Git status in source control panel

### 4. Extension Settings

Extensions work across all workspace folders. Configure once, applies to both.

## Best Practices

### Repository Organization

1. **Keep plugins independent**: Each plugin should work standalone
2. **Version plugins**: Use semantic versioning in `plugin.json`
3. **Document plugins**: Include README in each plugin directory
4. **Test before submitting**: Ensure plugins work with latest Calvin version

### Development Workflow

1. **Develop in `calvin-plugins`**: Create/edit plugins there
2. **Test in `calvin`**: Install and test plugins in main repo
3. **Version control**: Commit to appropriate repo
4. **Release**: Tag releases in plugins repo

### CI/CD Considerations

- **Plugins repo**: Can have its own CI for plugin validation
- **Main repo**: Tests core functionality, may test against plugin repo
- **Integration**: Can set up workflows to test plugins against main repo

## Example Workflow

### Creating a New Plugin

1. **In `calvin-plugins` repo:**
   ```bash
   cd calvin-plugins
   mkdir my-new-plugin
   cd my-new-plugin
   # Create plugin.json, plugin.py, etc.
   ```

2. **Test locally:**
   ```bash
   # In calvin repo, install from local path
   # Use plugin installer API or UI
   ```

3. **Update `plugins.json`:**
   ```bash
   # Add plugin entry to calvin-plugins/plugins.json
   ```

4. **Commit and push:**
   ```bash
   git add .
   git commit -m "Add my-new-plugin"
   git push
   ```

5. **Users install:**
   - Enter `https://github.com/your-org/calvin-plugins` in Settings
   - Browse and install `my-new-plugin`

## Summary

- ✅ **Create `calvin-plugins` repository** for better organization
- ✅ **Use multi-root workspace** for best development experience
- ✅ **Keep plugins independent** and well-documented
- ✅ **Test locally** before publishing
- ✅ **Version control separately** but coordinate releases

This setup gives you the flexibility to develop plugins independently while maintaining a clean separation between core and plugins.
