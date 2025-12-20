# Calvin Documentation

Welcome to the Calvin documentation! This directory contains guides, references, and information for setting up, configuring, and extending Calvin.

## 📚 Documentation Structure

### 🚀 [Setup Guides](./setup/)
Get started with Calvin on your platform.

- **[Windows Setup](./setup/SETUP_WINDOWS.md)** - Install and run Calvin on Windows
- **[Linux Setup](./setup/SETUP_LINUX.md)** - Install and run Calvin on Linux (including Raspberry Pi)
- **[Polkit Service Restart](./setup/POLKIT_SERVICE_RESTART.md)** - Configure service restart permissions on Linux

### 🔌 [Plugin Documentation](./plugins/)
Everything you need to know about plugins.

- **[Plugin Development Guide](./plugins/PLUGIN_DEVELOPMENT_GUIDE.md)** - Complete guide to creating plugins
- **[Plugin Installation](./plugins/PLUGIN_INSTALLATION.md)** - How to install plugins from repositories
- **[Plugin Package Format](./plugins/PLUGIN_PACKAGE_FORMAT.md)** - Plugin package structure and requirements
- **[Plugin Repository Setup](./plugins/PLUGIN_REPOSITORY_SETUP.md)** - Setting up your own plugin repository
- **[Plugin Frontend Components](./plugins/PLUGIN_FRONTEND_COMPONENTS.md)** - Frontend integration guide
- **[Plugin Persistence and Restart](./plugins/PLUGIN_PERSISTENCE_AND_RESTART.md)** - Plugin lifecycle management
- **[Adding Google Calendar](./plugins/ADD_GOOGLE_CALENDAR.md)** - Quick guide for Google Calendar integration

### ⚙️ [Configuration](./configuration/)
Configuration and settings documentation.

- **[Remote Configuration](./configuration/REMOTE_CONFIG.md)** - Configure frontend to connect to remote backend
- **[Settings Save Behavior](./configuration/SETTINGS_SAVE_BEHAVIOR.md)** - How settings are saved and persisted

### 🧪 [Testing](./testing/)
Testing documentation and coverage information.

- **[Test Coverage for New Features](./testing/TEST_COVERAGE_NEW_FEATURES.md)** - Testing strategy and coverage for plugin installation and system management

### 📦 [Archive](./archive/)
Historical and completed documentation.

- Plugin installation flow analysis
- Plugin installation improvements (completed)
- Plugin uninstall and restart (completed)
- Settings UI improvements (completed)

## 🎯 Quick Start

1. **New to Calvin?** Start with the [Setup Guides](./setup/) for your platform
2. **Want to add a calendar?** See [Adding Google Calendar](./plugins/ADD_GOOGLE_CALENDAR.md)
3. **Want to create a plugin?** Read the [Plugin Development Guide](./plugins/PLUGIN_DEVELOPMENT_GUIDE.md)
4. **Setting up a remote dashboard?** Check [Remote Configuration](./configuration/REMOTE_CONFIG.md)

## 📖 Documentation Guidelines

### Contributing Documentation

When adding new documentation:

1. **Place files in the appropriate category directory**
   - Setup guides → `setup/`
   - Plugin docs → `plugins/`
   - Configuration → `configuration/`
   - Testing → `testing/`
   - Historical/completed → `archive/`

2. **Use descriptive filenames**
   - Use UPPERCASE_WITH_UNDERSCORES.md format
   - Be specific and clear about the topic

3. **Update this README**
   - Add new documents to the appropriate section
   - Include a brief description

4. **Keep it current**
   - Archive outdated docs to `archive/`
   - Update docs when features change
   - Remove duplicate or redundant content

## 🔗 External Resources

- **Plugin Repository**: See [PLUGIN_REPOSITORY_SETUP.md](./plugins/PLUGIN_REPOSITORY_SETUP.md)
- **Plugin Development**: See [PLUGIN_DEVELOPMENT_GUIDE.md](./plugins/PLUGIN_DEVELOPMENT_GUIDE.md)

## 📝 Notes

- All documentation is written in Markdown (`.md`)
- Code examples should be tested and working
- Keep documentation up-to-date with code changes
- Use clear, concise language
- Include examples where helpful

---

**Last Updated**: 2024 (organized during cleanup)

