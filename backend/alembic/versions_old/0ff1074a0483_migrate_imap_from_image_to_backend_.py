"""migrate_imap_from_image_to_backend_plugin

Revision ID: 0ff1074a0483
Revises: 2e2f87ec8be2
Create Date: 2026-01-10 17:49:36.412014

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0ff1074a0483"
down_revision: str | Sequence[str] | None = "2e2f87ec8be2"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Migrate IMAP ImagePlugin instances to BackendPlugin instances.

    This migration:
    1. Updates all IMAP plugin instances from plugin_type='image' to plugin_type='backend'
    2. Migrates config fields:
       - Converts 'image_dir' to 'target_directory' if present
       - Preserves all other config fields (email_address, email_password, imap_server, etc.)
    3. Updates the plugin_types table to change IMAP from 'image' to 'backend' type
    """
    import json
    from datetime import datetime

    connection = op.get_bind()

    # Check if tables exist
    inspector = sa.inspect(connection)
    existing_tables = inspector.get_table_names()

    if "plugins" not in existing_tables or "plugin_types" not in existing_tables:
        print("Warning: plugins or plugin_types table does not exist, skipping IMAP migration")
        return

    # Step 1: Migrate plugin instances from image to backend
    # Find all IMAP ImagePlugin instances
    result = connection.execute(
        sa.text("SELECT id, config FROM plugins WHERE type_id = 'imap' AND plugin_type = 'image'")
    )
    imap_instances = result.fetchall()

    migrated_count = 0
    for instance_id, config_json in imap_instances:
        # Parse config JSON
        try:
            config = json.loads(config_json) if config_json else {}
        except (json.JSONDecodeError, TypeError):
            config = {}

        # Migrate config fields
        migrated_config = config.copy()

        # Convert 'image_dir' to 'target_directory' if present
        if "image_dir" in migrated_config:
            migrated_config["target_directory"] = migrated_config.pop("image_dir")
            print(f"  Migrated config for {instance_id}: image_dir -> target_directory")

        # Ensure target_directory exists (default to empty, which means use default)
        if "target_directory" not in migrated_config:
            # If there was no image_dir, leave target_directory empty (use default)
            pass

        # Update plugin instance
        config_json_new = json.dumps(migrated_config) if migrated_config else "{}"
        now = datetime.utcnow().isoformat()

        connection.execute(
            sa.text("""
                UPDATE plugins
                SET plugin_type = :plugin_type,
                    config = :config,
                    updated_at = :updated_at
                WHERE id = :instance_id AND type_id = 'imap' AND plugin_type = 'image'
            """),
            {
                "plugin_type": "backend",
                "config": config_json_new,
                "instance_id": instance_id,
                "updated_at": now,
            },
        )

        migrated_count += 1
        print(f"  Migrated IMAP plugin instance: {instance_id} (image -> backend)")

    # Step 2: Update plugin_types table - change IMAP from 'image' to 'backend'
    # Check if IMAP plugin type exists as 'image'
    result = connection.execute(
        sa.text("SELECT type_id FROM plugin_types WHERE type_id = 'imap' AND plugin_type = 'image'")
    )
    imap_type = result.fetchone()

    if imap_type:
        # Update existing IMAP plugin type to 'backend'
        now = datetime.utcnow().isoformat()
        connection.execute(
            sa.text("""
                UPDATE plugin_types
                SET plugin_type = :plugin_type,
                    updated_at = :updated_at
                WHERE type_id = 'imap' AND plugin_type = 'image'
            """),
            {
                "plugin_type": "backend",
                "updated_at": now,
            },
        )
        print("  Updated IMAP plugin type: image -> backend")
    else:
        # Check if IMAP already exists as 'backend'
        # (already migrated or installed from calvin-plugins)
        result = connection.execute(
            sa.text(
                "SELECT type_id FROM plugin_types "
                "WHERE type_id = 'imap' AND plugin_type = 'backend'"
            )
        )
        imap_backend = result.fetchone()
        if not imap_backend:
            print(
                "  Note: IMAP plugin type not found as 'image' "
                "(may already be 'backend' or not installed)"
            )

    connection.commit()

    if migrated_count > 0:
        print(
            f"✓ Successfully migrated {migrated_count} IMAP plugin instance(s) "
            "from image to backend type"
        )
    else:
        print(
            "✓ No IMAP ImagePlugin instances found to migrate "
            "(may already be migrated or not installed)"
        )


def downgrade() -> None:
    """Downgrade: Convert IMAP BackendPlugin instances back to ImagePlugin.

    Note: This is a partial downgrade. The old IMAP ImagePlugin code has been removed,
    so downgraded instances may not work until the old plugin is restored.
    """
    import json
    from datetime import datetime

    connection = op.get_bind()

    # Check if tables exist
    inspector = sa.inspect(connection)
    existing_tables = inspector.get_table_names()

    if "plugins" not in existing_tables or "plugin_types" not in existing_tables:
        print("Warning: plugins or plugin_types table does not exist, skipping IMAP downgrade")
        return

    # Find all IMAP BackendPlugin instances
    result = connection.execute(
        sa.text("SELECT id, config FROM plugins WHERE type_id = 'imap' AND plugin_type = 'backend'")
    )
    imap_instances = result.fetchall()

    downgraded_count = 0
    for instance_id, config_json in imap_instances:
        # Parse config JSON
        try:
            config = json.loads(config_json) if config_json else {}
        except (json.JSONDecodeError, TypeError):
            config = {}

        # Reverse config migration: convert 'target_directory' back to 'image_dir' if present
        downgraded_config = config.copy()

        if "target_directory" in downgraded_config:
            downgraded_config["image_dir"] = downgraded_config.pop("target_directory")
            print(f"  Reverted config for {instance_id}: target_directory -> image_dir")

        # Update plugin instance back to 'image' type
        config_json_new = json.dumps(downgraded_config) if downgraded_config else "{}"
        now = datetime.utcnow().isoformat()

        connection.execute(
            sa.text("""
                UPDATE plugins
                SET plugin_type = :plugin_type,
                    config = :config,
                    updated_at = :updated_at
                WHERE id = :instance_id AND type_id = 'imap' AND plugin_type = 'backend'
            """),
            {
                "plugin_type": "image",
                "config": config_json_new,
                "instance_id": instance_id,
                "updated_at": now,
            },
        )

        downgraded_count += 1
        print(f"  Downgraded IMAP plugin instance: {instance_id} (backend -> image)")

    # Update plugin_types table - change IMAP from 'backend' to 'image'
    result = connection.execute(
        sa.text(
            "SELECT type_id FROM plugin_types WHERE type_id = 'imap' AND plugin_type = 'backend'"
        )
    )
    imap_type = result.fetchone()

    if imap_type:
        now = datetime.utcnow().isoformat()
        connection.execute(
            sa.text("""
                UPDATE plugin_types
                SET plugin_type = :plugin_type,
                    updated_at = :updated_at
                WHERE type_id = 'imap' AND plugin_type = 'backend'
            """),
            {
                "plugin_type": "image",
                "updated_at": now,
            },
        )
        print("  Reverted IMAP plugin type: backend -> image")

    connection.commit()

    if downgraded_count > 0:
        print(
            f"⚠ Downgraded {downgraded_count} IMAP plugin instance(s) to image type. "
            "Note: The old IMAP ImagePlugin code has been removed, so these instances may not work "
            "until the old plugin is restored."
        )
    else:
        print("✓ No IMAP BackendPlugin instances found to downgrade")
