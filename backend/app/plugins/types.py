"""Plugin type registry for managing plugin types and their common settings.

⚠️ DEPRECATED: This module is deprecated. Plugin type registration is now handled
via pluggy hooks in app.plugins.hooks. The PluginTypeRegistry class and plugin_type_registry
instance are no longer used and kept only for backward compatibility reference.

DO NOT use PluginTypeRegistry or plugin_type_registry in new code.
Use pluggy hooks (register_plugin_types) instead.
"""
