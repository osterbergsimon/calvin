"""Tests for load_plugin_types_for_single (no-restart install registration)."""

from unittest.mock import patch

import pytest

from app.models.db_models import PluginTypeDB
from app.plugins.base import PluginType
from app.plugins.registry.loader import load_plugin_types_for_single


def _type_info(type_id="acme", name="Acme", version="1.0.0", schema=None):
    return {
        "type_id": type_id,
        "plugin_type": PluginType.SERVICE,
        "name": name,
        "description": "Acme plugin",
        "version": version,
        "common_config_schema": schema or {},
    }


@pytest.mark.unit
@pytest.mark.asyncio
@patch("app.plugins.registry.loader.plugin_loader")
async def test_creates_new_plugin_type(mock_loader, test_db):
    mock_loader.get_plugin_types.return_value = [_type_info()]

    await load_plugin_types_for_single("acme")

    row = await PluginTypeDB.objects.get_or_none(type_id="acme")
    assert row is not None
    assert row.name == "Acme"
    assert row.version == "1.0.0"
    assert row.enabled is False  # newly registered types default to disabled


@pytest.mark.unit
@pytest.mark.asyncio
@patch("app.plugins.registry.loader.plugin_loader")
async def test_updates_existing_plugin_type_and_merges_schema(mock_loader, test_db):
    await PluginTypeDB.objects.create(
        type_id="acme",
        plugin_type="service",
        name="Old",
        description="old",
        version="0.9.0",
        common_config_schema={"existing": {"keep": True}},
        enabled=True,
    )
    mock_loader.get_plugin_types.return_value = [
        _type_info(version="2.0.0", schema={"added": {"x": 1}})
    ]

    await load_plugin_types_for_single("acme")

    row = await PluginTypeDB.objects.get_or_none(type_id="acme")
    assert row.version == "2.0.0"
    assert row.name == "Acme"
    assert "existing" in row.common_config_schema  # existing keys preserved
    assert "added" in row.common_config_schema  # metadata keys merged in
    assert row.enabled is True  # update must not flip enabled state


@pytest.mark.unit
@pytest.mark.asyncio
@patch("app.plugins.registry.loader.plugin_loader")
async def test_not_found_is_noop(mock_loader, test_db):
    mock_loader.get_plugin_types.return_value = [_type_info(type_id="other")]

    await load_plugin_types_for_single("missing")  # must not raise

    assert await PluginTypeDB.objects.get_or_none(type_id="missing") is None
