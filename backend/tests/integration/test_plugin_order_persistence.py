"""Integration tests for plugin ordering persistence across reloads.

These tests verify that plugin display_order persists correctly:
1. After updating display_order via API
2. After plugin reload (simulating server restart)
3. When reading from both /plugins endpoint and /config endpoint
"""

import pytest

import app.database as db_module
from app.models.db_models import PluginTypeDB
from app.plugins.registry.loader import load_plugin_types


@pytest.mark.integration
class TestPluginOrderPersistence:
    """Test that plugin ordering persists across reloads."""

    async def test_display_order_persists_after_update(self, test_client):
        """Test that display_order is saved correctly after API update."""
        # Get current plugin state
        response = test_client.get("/api/plugins?plugin_type=image")
        assert response.status_code == 200
        plugins_before = response.json().get("plugins", [])

        # Find local plugin
        local_plugin = next((p for p in plugins_before if p["id"] == "local"), None)
        assert local_plugin is not None, "local plugin should exist"

        # Update display_order to 10
        response = test_client.put("/api/plugins/local", json={"display_order": "10"})
        assert response.status_code == 200

        # Verify it's saved in database
        # Use a fresh session to ensure we see committed changes
        async with db_module.AsyncSessionLocal() as session:
            from sqlalchemy import select

            result = await session.execute(
                select(PluginTypeDB).where(PluginTypeDB.type_id == "local")
            )
            plugin_type = result.scalar_one_or_none()
            assert plugin_type is not None

            # Refresh to get latest data
            await session.refresh(plugin_type)

            config = plugin_type.common_config_schema or {}
            display_order = config.get("display_order")
            assert display_order in ["10", 10], f"Expected '10' or 10, got {display_order}"

        # Verify it's returned by /plugins endpoint
        response = test_client.get("/api/plugins?plugin_type=image")
        assert response.status_code == 200
        plugins_after = response.json().get("plugins", [])
        local_plugin_after = next((p for p in plugins_after if p["id"] == "local"), None)
        assert local_plugin_after is not None

        # Check common_config_schema in response
        schema = local_plugin_after.get("common_config_schema", {})
        assert schema.get("display_order") in ["10", 10], (
            f"Expected '10' or 10 in schema, got {schema.get('display_order')}"
        )

        # Verify it's returned by /config endpoint
        response = test_client.get("/api/plugins/local/config")
        assert response.status_code == 200
        # The config endpoint returns the config directly, not wrapped in a "config" key
        config = response.json()
        assert config.get("display_order") in ["10", 10], (
            f"Expected '10' or 10 in config, got {config.get('display_order')}. Full config: {config}"
        )

    async def test_display_order_persists_after_plugin_reload(self, test_client):
        """Test that display_order persists after calling load_plugin_types (simulating server restart)."""
        # Set display_order to 5
        response = test_client.put("/api/plugins/local", json={"display_order": "5"})
        assert response.status_code == 200

        # Verify it's saved
        async with db_module.AsyncSessionLocal() as session:
            from sqlalchemy import select

            result = await session.execute(
                select(PluginTypeDB).where(PluginTypeDB.type_id == "local")
            )
            plugin_type = result.scalar_one_or_none()
            assert plugin_type is not None
            config_before = plugin_type.common_config_schema or {}
            assert config_before.get("display_order") in ["5", 5]

        # Simulate plugin reload (what happens on server restart)
        await load_plugin_types()

        # Verify display_order is still there after reload
        async with db_module.AsyncSessionLocal() as session:
            from sqlalchemy import select

            result = await session.execute(
                select(PluginTypeDB).where(PluginTypeDB.type_id == "local")
            )
            plugin_type = result.scalar_one_or_none()
            assert plugin_type is not None

            config_after = plugin_type.common_config_schema or {}
            display_order_after = config_after.get("display_order")
            assert display_order_after in ["5", 5], (
                f"display_order was lost after reload! Expected '5' or 5, got {display_order_after}. "
                f"Full config: {config_after}"
            )

    async def test_multiple_plugins_ordering_persists(self, test_client):
        """Test that ordering for multiple plugins persists correctly."""
        # Set different display orders for multiple image plugins
        # Find all image plugins
        response = test_client.get("/api/plugins?plugin_type=image")
        assert response.status_code == 200
        plugins = response.json().get("plugins", [])
        enabled_plugins = [p for p in plugins if p.get("enabled")]

        # Need at least 2 plugins for this test
        if len(enabled_plugins) < 2:
            pytest.skip("Need at least 2 enabled image plugins for this test")

        # Set different orders
        plugin1 = enabled_plugins[0]
        plugin2 = enabled_plugins[1]

        response = test_client.put("/api/plugins/" + plugin1["id"], json={"display_order": "1"})
        assert response.status_code == 200

        response = test_client.put("/api/plugins/" + plugin2["id"], json={"display_order": "0"})
        assert response.status_code == 200

        # Reload plugins
        await load_plugin_types()

        # Verify orders are preserved
        response = test_client.get("/api/plugins?plugin_type=image")
        assert response.status_code == 200
        plugins_after = response.json().get("plugins", [])

        plugin1_after = next((p for p in plugins_after if p["id"] == plugin1["id"]), None)
        plugin2_after = next((p for p in plugins_after if p["id"] == plugin2["id"]), None)

        assert plugin1_after is not None
        assert plugin2_after is not None

        schema1 = plugin1_after.get("common_config_schema", {})
        schema2 = plugin2_after.get("common_config_schema", {})

        order1 = schema1.get("display_order")
        order2 = schema2.get("display_order")

        # Parse as ints for comparison
        order1_int = int(order1) if order1 is not None else 0
        order2_int = int(order2) if order2 is not None else 0

        assert order1_int == 1, f"Plugin {plugin1['id']} should have order 1, got {order1}"
        assert order2_int == 0, f"Plugin {plugin2['id']} should have order 0, got {order2}"

        # Verify plugin2 comes before plugin1 when sorted
        sorted_plugins = sorted(
            [p for p in plugins_after if p.get("id") in [plugin1["id"], plugin2["id"]]],
            key=lambda p: int(p.get("common_config_schema", {}).get("display_order", 0)),
        )

        assert sorted_plugins[0]["id"] == plugin2["id"], (
            f"Expected {plugin2['id']} to come first (order 0), but order is: "
            f"{[p['id'] for p in sorted_plugins]}"
        )

    async def test_plugin_list_includes_display_order_in_schema(self, test_client):
        """Test that /plugins endpoint returns display_order in common_config_schema."""
        # Set display_order
        response = test_client.put("/api/plugins/local", json={"display_order": "7"})
        assert response.status_code == 200

        # Get plugins list
        response = test_client.get("/api/plugins?plugin_type=image")
        assert response.status_code == 200
        plugins = response.json().get("plugins", [])

        local_plugin = next((p for p in plugins if p["id"] == "local"), None)
        assert local_plugin is not None

        # Verify common_config_schema exists and has display_order
        schema = local_plugin.get("common_config_schema")
        assert schema is not None, "common_config_schema should exist in plugin response"
        assert isinstance(schema, dict), (
            f"common_config_schema should be a dict, got {type(schema)}"
        )

        display_order = schema.get("display_order")
        assert display_order is not None, (
            f"display_order should be in common_config_schema. Schema: {schema}"
        )
        assert display_order in ["7", 7], (
            f"Expected '7' or 7, got {display_order} (type: {type(display_order)})"
        )
