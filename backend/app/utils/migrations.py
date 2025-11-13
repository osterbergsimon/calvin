"""Database migration utilities."""

import asyncio
import sqlite3
from pathlib import Path

from app.config import settings


async def migrate_database():
    """Run database migrations."""
    # Run in executor to avoid blocking
    loop = asyncio.get_event_loop()
    await loop.run_in_executor(None, _migrate_database_sync)


def _migrate_database_sync():
    """Synchronous database migration."""
    # Extract database path and handle both absolute and relative paths
    db_path_str = settings.database_url.replace("sqlite:///", "")
    # If path starts with /, it's absolute; otherwise resolve relative to current working directory
    db_path = Path(db_path_str) if db_path_str.startswith("/") else Path(db_path_str).resolve()
    if not db_path.exists():
        # Database doesn't exist yet, will be created by init_db
        return

    conn = sqlite3.connect(str(db_path))
    cursor = conn.cursor()

    try:
        # Check if calendar_sources table exists
        cursor.execute("""
            SELECT name FROM sqlite_master
            WHERE type='table' AND name='calendar_sources'
        """)
        if not cursor.fetchone():
            # Table doesn't exist, will be created by init_db
            return

        # Check if color column exists
        cursor.execute("PRAGMA table_info(calendar_sources)")
        columns = [row[1] for row in cursor.fetchall()]

        # Add color column if it doesn't exist
        if "color" not in columns:
            print("Adding 'color' column to calendar_sources table...")
            cursor.execute("ALTER TABLE calendar_sources ADD COLUMN color TEXT")
            conn.commit()
            print("Added 'color' column")

        # Add show_time column if it doesn't exist
        if "show_time" not in columns:
            print("Adding 'show_time' column to calendar_sources table...")
            cursor.execute("ALTER TABLE calendar_sources ADD COLUMN show_time BOOLEAN DEFAULT 1")
            conn.commit()
            print("Added 'show_time' column")

        # Check if web_services table exists
        cursor.execute("""
            SELECT name FROM sqlite_master
            WHERE type='table' AND name='web_services'
        """)
        if not cursor.fetchone():
            # Create web_services table
            print("Creating 'web_services' table...")
            cursor.execute("""
                CREATE TABLE web_services (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    url TEXT NOT NULL,
                    enabled BOOLEAN DEFAULT 1 NOT NULL,
                    display_order INTEGER DEFAULT 0 NOT NULL,
                    fullscreen BOOLEAN DEFAULT 0 NOT NULL
                )
            """)
            conn.commit()
            print("Created 'web_services' table")

        # Check if plugins table exists
        cursor.execute("""
            SELECT name FROM sqlite_master
            WHERE type='table' AND name='plugins'
        """)
        if not cursor.fetchone():
            # Create plugins table
            print("Creating 'plugins' table...")
            cursor.execute("""
                CREATE TABLE plugins (
                    id TEXT PRIMARY KEY,
                    type_id TEXT NOT NULL,
                    plugin_type TEXT NOT NULL,
                    name TEXT NOT NULL,
                    version TEXT,
                    enabled BOOLEAN DEFAULT 1 NOT NULL,
                    config TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """)
            cursor.execute("CREATE INDEX idx_plugins_type_id ON plugins(type_id)")
            cursor.execute("CREATE INDEX idx_plugins_plugin_type ON plugins(plugin_type)")
            conn.commit()
            print("Created 'plugins' table")

        # Check if plugin_types table exists
        cursor.execute("""
            SELECT name FROM sqlite_master
            WHERE type='table' AND name='plugin_types'
        """)
        if not cursor.fetchone():
            # Create plugin_types table
            print("Creating 'plugin_types' table...")
            cursor.execute("""
                CREATE TABLE plugin_types (
                    type_id TEXT PRIMARY KEY,
                    plugin_type TEXT NOT NULL,
                    name TEXT NOT NULL,
                    description TEXT,
                    version TEXT,
                    common_config_schema TEXT,
                    enabled BOOLEAN DEFAULT 1 NOT NULL,
                    error_message TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """)
            conn.commit()
            print("Created 'plugin_types' table")
        else:
            # Check if error_message column exists
            cursor.execute("PRAGMA table_info(plugin_types)")
            columns = [row[1] for row in cursor.fetchall()]
            
            # Add error_message column if it doesn't exist
            if "error_message" not in columns:
                print("Adding 'error_message' column to plugin_types table...")
                cursor.execute("ALTER TABLE plugin_types ADD COLUMN error_message TEXT")
                conn.commit()
                print("Added 'error_message' column")

        # Migrate existing data to new tables
        _migrate_existing_data(cursor, conn)

        print("Database migration completed")
    except Exception as e:
        print(f"Error during migration: {e}")
        conn.rollback()
        raise
    finally:
        conn.close()


def _migrate_existing_data(cursor, conn):
    """Migrate existing data from old tables to new unified tables."""
    import json
    from datetime import datetime

    # Migrate calendar sources to plugins table
    cursor.execute("""
        SELECT name FROM sqlite_master
        WHERE type='table' AND name='calendar_sources'
    """)
    if cursor.fetchone():
        cursor.execute("SELECT * FROM calendar_sources")
        calendar_sources = cursor.fetchall()
        if calendar_sources:
            print(f"Migrating {len(calendar_sources)} calendar sources to plugins table...")
            # Get column names
            cursor.execute("PRAGMA table_info(calendar_sources)")
            columns = [col[1] for col in cursor.fetchall()]
            
            for row in calendar_sources:
                source_dict = dict(zip(columns, row))

                # Map calendar source type to plugin type_id
                type_id = source_dict.get("type", "ical")
                if type_id == "google":
                    type_id = "google"
                elif type_id == "proton":
                    type_id = "proton"
                else:
                    type_id = "ical"

                # Create config dict
                config = {
                    "ical_url": source_dict.get("ical_url", ""),
                    "api_key": source_dict.get("api_key"),
                    "color": source_dict.get("color"),
                    "show_time": source_dict.get("show_time", True),
                }

                # Check if plugin already exists
                cursor.execute("SELECT id FROM plugins WHERE id = ?", (source_dict["id"],))
                if not cursor.fetchone():
                    cursor.execute("""
                        INSERT INTO plugins (id, type_id, plugin_type, name, enabled, config, created_at, updated_at)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    """, (
                        source_dict["id"],
                        type_id,
                        "calendar",
                        source_dict.get("name", ""),
                        source_dict.get("enabled", True),
                        json.dumps(config),
                        datetime.utcnow().isoformat(),
                        datetime.utcnow().isoformat(),
                    ))
            conn.commit()
            print("Migrated calendar sources to plugins table")

    # Migrate web services to plugins table
    cursor.execute("""
        SELECT name FROM sqlite_master
        WHERE type='table' AND name='web_services'
    """)
    if cursor.fetchone():
        cursor.execute("SELECT * FROM web_services")
        web_services = cursor.fetchall()
        if web_services:
            print(f"Migrating {len(web_services)} web services to plugins table...")
            # Get column names
            cursor.execute("PRAGMA table_info(web_services)")
            columns = [col[1] for col in cursor.fetchall()]
            
            for row in web_services:
                service_dict = dict(zip(columns, row))

                # Create config dict
                config = {
                    "url": service_dict.get("url", ""),
                    "fullscreen": service_dict.get("fullscreen", False),
                    "display_order": service_dict.get("display_order", 0),
                }

                # Check if plugin already exists
                cursor.execute("SELECT id FROM plugins WHERE id = ?", (service_dict["id"],))
                if not cursor.fetchone():
                    cursor.execute("""
                        INSERT INTO plugins (id, type_id, plugin_type, name, enabled, config, created_at, updated_at)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    """, (
                        service_dict["id"],
                        "iframe",
                        "service",
                        service_dict.get("name", ""),
                        service_dict.get("enabled", True),
                        json.dumps(config),
                        datetime.utcnow().isoformat(),
                        datetime.utcnow().isoformat(),
                    ))
            conn.commit()
            print("Migrated web services to plugins table")

    # Migrate local image plugin config
    cursor.execute("""
        SELECT name FROM sqlite_master
        WHERE type='table' AND name='config'
    """)
    if cursor.fetchone():
        cursor.execute("SELECT key, value FROM config WHERE key = 'plugin_local_config'")
        local_config = cursor.fetchone()
        if local_config:
            config_value = local_config[1]
            try:
                config_dict = json.loads(config_value) if config_value else {}
                # Check if local-images plugin already exists
                cursor.execute("SELECT id FROM plugins WHERE id = 'local-images'")
                if not cursor.fetchone():
                    cursor.execute("""
                        INSERT INTO plugins (id, type_id, plugin_type, name, enabled, config, created_at, updated_at)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    """, (
                        "local-images",
                        "local",
                        "image",
                        "Local Images",
                        True,
                        json.dumps(config_dict),
                        datetime.utcnow().isoformat(),
                        datetime.utcnow().isoformat(),
                    ))
                    conn.commit()
                    print("Migrated local image plugin config to plugins table")
            except json.JSONDecodeError:
                print("Warning: Failed to parse local image plugin config")
