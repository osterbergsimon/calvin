"""Database migration utilities."""

import sqlite3
import asyncio
from pathlib import Path
from app.config import settings


async def migrate_database():
    """Run database migrations."""
    # Run in executor to avoid blocking
    loop = asyncio.get_event_loop()
    await loop.run_in_executor(None, _migrate_database_sync)


def _migrate_database_sync():
    """Synchronous database migration."""
    db_path = Path(settings.database_url.replace("sqlite:///", ""))
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
        if 'color' not in columns:
            print("Adding 'color' column to calendar_sources table...")
            cursor.execute("ALTER TABLE calendar_sources ADD COLUMN color TEXT")
            conn.commit()
            print("Added 'color' column")
        
        # Add show_time column if it doesn't exist
        if 'show_time' not in columns:
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
        
        print("Database migration completed")
    except Exception as e:
        print(f"Error during migration: {e}")
        conn.rollback()
        raise
    finally:
        conn.close()

