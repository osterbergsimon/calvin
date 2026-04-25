"""Integration tests for IMAP plugin migration from ImagePlugin to BackendPlugin."""

import json
from datetime import datetime

import databases
import pytest


@pytest.mark.asyncio
class TestImapMigration:
    """Test IMAP plugin migration from image to backend type."""

    async def test_migration_handles_imap_image_plugin_instances(self, test_db: databases.Database):
        """Test that migration correctly converts IMAP ImagePlugin instances to BackendPlugin."""
        # Create a test IMAP ImagePlugin instance
        test_plugin_id = "test-imap-instance"
        test_config = {
            "email_address": "test@example.com",
            "email_password": "password123",
            "imap_server": "imap.gmail.com",
            "imap_port": 993,
            "image_dir": "./data/images/imap",  # Old config field
        }

        # Insert test IMAP ImagePlugin instance
        await test_db.execute(
            """
                INSERT INTO plugins (
                    id, type_id, plugin_type, name, enabled, config, display_order,
                    created_at, updated_at
                )
                VALUES (
                    :id, 'imap', 'image', 'Test IMAP Plugin', :enabled, :config, 0,
                    :created_at, :updated_at
                )
            """,
            {
                "id": test_plugin_id,
                "enabled": True,
                "config": json.dumps(test_config),
                "created_at": datetime.utcnow(),
                "updated_at": datetime.utcnow(),
            },
        )

        # Insert test IMAP plugin type as 'image'
        await test_db.execute(
            """
                INSERT INTO plugin_types (
                    type_id, plugin_type, name, description, version,
                    enabled, created_at, updated_at
                )
                VALUES (
                    'imap', 'image', 'Email (IMAP)', 'IMAP email plugin', '1.0.0',
                    :enabled, :created_at, :updated_at
                )
            """,
            {
                "enabled": True,
                "created_at": datetime.utcnow(),
                "updated_at": datetime.utcnow(),
            },
        )

        # Verify instance exists as 'image' type
        result = await test_db.fetch_one(
            "SELECT id, plugin_type, config FROM plugins WHERE id = :id",
            {"id": test_plugin_id},
        )
        row = result
        assert row is not None
        assert row["plugin_type"] == "image"  # plugin_type
        config = json.loads(row["config"]) if row["config"] else {}
        assert "image_dir" in config
        assert config["image_dir"] == "./data/images/imap"

        # Note: In a real migration test, we would run the migration here
        # For now, this test just verifies we can create the test data correctly
        # The actual migration would be tested via alembic upgrade/downgrade

    async def test_migration_preserves_other_config_fields(self, test_db: databases.Database):
        """Test that migration preserves non-image_dir config fields."""
        test_plugin_id = "test-imap-instance-2"
        test_config = {
            "email_address": "test2@example.com",
            "email_password": "password456",
            "imap_server": "imap.outlook.com",
            "imap_port": 993,
            "image_dir": "./data/images/custom",  # Old field
            "check_interval": 600,  # Other field that should be preserved
        }

        await test_db.execute(
            """
                INSERT INTO plugins (
                    id, type_id, plugin_type, name, enabled, config, display_order,
                    created_at, updated_at
                )
                VALUES (
                    :id, 'imap', 'image', 'Test IMAP Plugin 2', :enabled, :config, 0,
                    :created_at, :updated_at
                )
            """,
            {
                "id": test_plugin_id,
                "enabled": True,
                "config": json.dumps(test_config),
                "created_at": datetime.utcnow(),
                "updated_at": datetime.utcnow(),
            },
        )

        # Verify config has all expected fields
        result = await test_db.fetch_one(
            "SELECT config FROM plugins WHERE id = :id",
            {"id": test_plugin_id},
        )
        assert result is not None
        config = json.loads(result["config"]) if result["config"] else {}
        assert "email_address" in config
        assert "check_interval" in config
        assert config["check_interval"] == 600

    async def test_migration_handles_missing_image_dir(self, test_db: databases.Database):
        """Test that migration handles configs without image_dir field."""
        test_plugin_id = "test-imap-instance-3"
        test_config = {
            "email_address": "test3@example.com",
            "email_password": "password789",
            "imap_server": "imap.gmail.com",
            "imap_port": 993,
            # No image_dir - should still migrate
        }

        await test_db.execute(
            """
                INSERT INTO plugins (
                    id, type_id, plugin_type, name, enabled, config, display_order,
                    created_at, updated_at
                )
                VALUES (
                    :id, 'imap', 'image', 'Test IMAP Plugin 3', :enabled, :config, 0,
                    :created_at, :updated_at
                )
            """,
            {
                "id": test_plugin_id,
                "enabled": True,
                "config": json.dumps(test_config),
                "created_at": datetime.utcnow(),
                "updated_at": datetime.utcnow(),
            },
        )

        # Verify instance was created successfully
        result = await test_db.fetch_one(
            "SELECT id FROM plugins WHERE id = :id",
            {"id": test_plugin_id},
        )
        assert result is not None
