"""Script to re-enable plugins that were incorrectly disabled."""
import sqlite3
import sys

conn = sqlite3.connect('data/db/calvin.db')
cursor = conn.cursor()

# Get all disabled plugins
cursor.execute('SELECT id, type_id, name, plugin_type FROM plugins WHERE enabled=0')
disabled_plugins = cursor.fetchall()

if not disabled_plugins:
    print("No disabled plugins found.")
    conn.close()
    sys.exit(0)

print(f"Found {len(disabled_plugins)} disabled plugins:")
for plugin_id, type_id, name, plugin_type in disabled_plugins:
    print(f"  {plugin_id} ({type_id}): {name} [{plugin_type}]")

response = input("\nRe-enable all these plugins? (yes/no): ")
if response.lower() in ['yes', 'y']:
    cursor.execute('UPDATE plugins SET enabled=1 WHERE enabled=0')
    conn.commit()
    print(f"Re-enabled {cursor.rowcount} plugins.")
else:
    print("Cancelled.")

conn.close()



