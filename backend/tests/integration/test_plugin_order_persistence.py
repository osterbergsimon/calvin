"""Integration tests for plugin ordering persistence across reloads.

These tests verify that plugin display_order persists correctly:
1. After updating display_order via API
2. After plugin reload (simulating server restart)
3. When reading from both /plugins endpoint and /config endpoint
"""

import pytest

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
        plugin_type = await PluginTypeDB.objects.get_or_none(type_id="local")
        assert plugin_type is not None

        assert plugin_type.display_order == 10
        assert "display_order" not in (plugin_type.common_config_schema or {})

        # Verify it's returned by /plugins endpoint
        response = test_client.get("/api/plugins?plugin_type=image")
        assert response.status_code == 200
        plugins_after = response.json().get("plugins", [])
        local_plugin_after = next((p for p in plugins_after if p["id"] == "local"), None)
        assert local_plugin_after is not None

        assert local_plugin_after.get("display_order") == 10
        assert "display_order" not in local_plugin_after.get("common_config_schema", {})

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
        plugin_type = await PluginTypeDB.objects.get_or_none(type_id="local")
        assert plugin_type is not None
        assert plugin_type.display_order == 5
        assert "display_order" not in (plugin_type.common_config_schema or {})

        # Simulate plugin reload (what happens on server restart)
        await load_plugin_types()

        # Verify display_order is still there after reload
        plugin_type = await PluginTypeDB.objects.get_or_none(type_id="local")
        assert plugin_type is not None

        assert plugin_type.display_order == 5
        assert "display_order" not in (plugin_type.common_config_schema or {})

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

        order1 = plugin1_after.get("display_order", 0)
        order2 = plugin2_after.get("display_order", 0)

        assert order1 == 1, f"Plugin {plugin1['id']} should have order 1, got {order1}"
        assert order2 == 0, f"Plugin {plugin2['id']} should have order 0, got {order2}"

        # Verify plugin2 comes before plugin1 when sorted
        sorted_plugins = sorted(
            [p for p in plugins_after if p.get("id") in [plugin1["id"], plugin2["id"]]],
            key=lambda p: int(p.get("display_order", 0)),
        )

        assert sorted_plugins[0]["id"] == plugin2["id"], (
            f"Expected {plugin2['id']} to come first (order 0), but order is: "
            f"{[p['id'] for p in sorted_plugins]}"
        )

    async def test_plugin_list_includes_display_order_value(self, test_client):
        """Test that /plugins endpoint returns display_order as an app-managed value."""
        # Set display_order
        response = test_client.put("/api/plugins/local", json={"display_order": "7"})
        assert response.status_code == 200

        # Get plugins list
        response = test_client.get("/api/plugins?plugin_type=image")
        assert response.status_code == 200
        plugins = response.json().get("plugins", [])

        local_plugin = next((p for p in plugins if p["id"] == "local"), None)
        assert local_plugin is not None

        # Verify common_config_schema exists but does not own display_order
        schema = local_plugin.get("common_config_schema")
        assert schema is not None, "common_config_schema should exist in plugin response"
        assert isinstance(schema, dict), (
            f"common_config_schema should be a dict, got {type(schema)}"
        )
        assert "display_order" not in schema
        assert local_plugin.get("display_order") == 7
