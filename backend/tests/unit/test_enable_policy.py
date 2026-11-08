"""A type that declares browser_origins is not switched on by install/seed/instance paths
while sealed mode is on (it stays off, with the reason recorded)."""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.models.db_models import PluginDB, PluginTypeDB
from app.plugins.base import PluginType
from app.plugins.definitions import PluginMetadata
from app.plugins.registry.loader import load_plugin_types, load_plugin_types_for_single

SEALED = "app.plugins.registry.enable_policy.get_sealed_mode"


def _meta(origins):
    return PluginMetadata(
        type_id="castish",
        plugin_type=PluginType.SERVICE,
        name="Castish",
        description="x",
        version="1.0.0",
        browser_origins=origins,
    )


async def _row():
    return await PluginTypeDB.objects.get_or_none(type_id="castish")


@pytest.fixture(autouse=True)
async def _clean(test_db):
    await PluginDB.objects.filter(type_id="castish").delete()
    await PluginTypeDB.objects.filter(type_id="castish").delete()
    yield
    await PluginDB.objects.filter(type_id="castish").delete()
    await PluginTypeDB.objects.filter(type_id="castish").delete()


@pytest.mark.unit
@pytest.mark.asyncio
@pytest.mark.parametrize(
    "sealed,origins,expected",
    [(True, ["cast.example.com"], False), (False, ["cast.example.com"], True), (True, [], True)],
)
async def test_install_path_respects_sealed_mode(sealed, origins, expected):
    with (
        patch("app.plugins.registry.loader.plugin_loader") as loader,
        patch(SEALED, new=AsyncMock(return_value=sealed)),
    ):
        loader.get_plugin_types.return_value = [_meta(origins)]
        await load_plugin_types_for_single("castish")
    row = await _row()
    assert row.enabled is expected
    if not expected:
        assert "sealed mode" in (row.error_message or "").lower()


@pytest.mark.unit
@pytest.mark.asyncio
async def test_startup_seed_respects_sealed_mode():
    with (
        patch("app.plugins.registry.loader.plugin_loader") as loader,
        patch(SEALED, new=AsyncMock(return_value=True)),
    ):
        loader.get_plugin_types.return_value = [_meta(["cast.example.com"])]
        await load_plugin_types()
    row = await _row()
    assert row.enabled is False
    assert "sealed mode" in (row.error_message or "").lower()


async def _off_type():
    await PluginTypeDB.objects.create(
        type_id="castish",
        plugin_type="service",
        name="Castish",
        description=None,
        version="1",
        common_config_schema={},
        enabled=False,
    )


@pytest.mark.unit
@pytest.mark.asyncio
@pytest.mark.parametrize("sealed,expected", [(True, False), (False, True)])
async def test_creating_an_enabled_instance_respects_sealed_mode(sealed, expected):
    from app.plugins.registry.manager import register_plugin

    await _off_type()
    plugin = MagicMock()
    plugin.initialize = AsyncMock()
    plugin.configure = AsyncMock()
    plugin.enabled = True
    with (
        patch("app.plugins.registry.manager.plugin_loader") as loader,
        patch("app.plugins.registry.manager.instance_manager") as manager,
        patch("app.plugins.registry.enable_policy.plugin_loader") as policy_loader,
        patch(SEALED, new=AsyncMock(return_value=sealed)),
    ):
        loader.create_plugin_instance.return_value = plugin
        policy_loader.get_plugin_types.return_value = [_meta(["cast.example.com"])]
        manager.register = AsyncMock(return_value=None)
        await register_plugin("castish-1", "castish", "C1", {}, enabled=True)
    assert (await _row()).enabled is expected


@pytest.mark.unit
@pytest.mark.asyncio
@pytest.mark.parametrize("sealed,expected", [(True, False), (False, True)])
async def test_re_enabling_an_existing_instance_turns_its_type_on(test_client, sealed, expected):
    await _off_type()
    await PluginDB.objects.create(
        id="castish-1",
        type_id="castish",
        plugin_type="service",
        name="C1",
        enabled=False,
        config={},
    )
    with (
        patch("app.plugins.registry.enable_policy.plugin_loader") as policy_loader,
        patch(SEALED, new=AsyncMock(return_value=sealed)),
    ):
        policy_loader.get_plugin_types.return_value = [_meta(["cast.example.com"])]
        test_client.put("/api/plugins/instances/castish-1", json={"enabled": True})
    assert (await _row()).enabled is expected
