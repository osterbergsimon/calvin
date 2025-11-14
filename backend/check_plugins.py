"""Quick script to check plugin status in database."""

import json
import sqlite3

conn = sqlite3.connect("data/db/calvin.db")
cursor = conn.cursor()

# Check calendar plugins
cursor.execute(
    'SELECT id, type_id, name, enabled, config FROM plugins WHERE plugin_type="calendar"'
)
calendar_plugins = cursor.fetchall()

print("Calendar Plugins:")
for row in calendar_plugins:
    plugin_id, type_id, name, enabled, config_json = row
    config = json.loads(config_json) if config_json else {}
    print(f"  {plugin_id} ({type_id}): {name}")
    print(f"    Enabled: {bool(enabled)}")
    print(f"    Config: {config}")
    print()

# Check plugin types
cursor.execute(
    'SELECT type_id, name, enabled, error_message FROM plugin_types WHERE plugin_type="calendar"'
)
plugin_types = cursor.fetchall()

print("Calendar Plugin Types:")
for row in plugin_types:
    type_id, name, enabled, error_message = row
    print(f"  {type_id}: {name}")
    print(f"    Enabled: {bool(enabled)}")
    if error_message:
        print(f"    ERROR: {error_message}")
    print()

conn.close()
