"""Plugin registration module - DEPRECATED.

This module is kept for backward compatibility but is no longer needed.
Plugins now register themselves automatically via pluggy hooks in their own modules.

All plugins now provide their own metadata via get_plugin_metadata() class method
and register themselves via hook implementations in their own modules.
"""

# Stub for backward compatibility
plugin_registration = None
