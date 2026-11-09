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


# --- instance edits: only a real off -> on transition turns the type on -------------------


async def _instance(enabled):
    await PluginDB.objects.create(
        id="castish-1",
        type_id="castish",
        plugin_type="service",
        name="C1",
        enabled=enabled,
        config={},
    )


@pytest.mark.unit
@pytest.mark.asyncio
async def test_editing_an_enabled_instance_keeps_a_deliberate_type_off(test_client):
    """The edit forms always send enabled; that must not undo a deliberate off."""
    await _off_type()
    await _instance(enabled=True)
    with patch(SEALED, new=AsyncMock(return_value=False)):
        test_client.put("/api/plugins/instances/castish-1", json={"enabled": True, "name": "C2"})
    assert (await _row()).enabled is False


async def _generic_update(instance_flag):
    from app.plugins.utils.instance_manager import (
        InstanceManagerConfig,
        handle_plugin_config_update_generic,
    )

    plugin = MagicMock()
    plugin.configure = AsyncMock()
    plugin.initialize = AsyncMock()
    plugin.cleanup = AsyncMock()
    plugin.is_running.return_value = False
    db_type = await _row()
    with patch("app.plugins.utils.instance_manager.plugin_manager") as manager:
        manager.get_plugin.return_value = plugin
        await handle_plugin_config_update_generic(
            "castish",
            {"_instance_id": "castish-1", "_instance_enabled": instance_flag, "k": "v"},
            None,
            db_type,
            InstanceManagerConfig(type_id="castish"),
        )


@pytest.mark.unit
@pytest.mark.asyncio
async def test_manager_update_of_an_enabled_instance_keeps_the_type_off():
    await _off_type()
    await _instance(enabled=True)
    with patch(SEALED, new=AsyncMock(return_value=False)):
        await _generic_update(True)
    assert (await _row()).enabled is False


@pytest.mark.unit
@pytest.mark.asyncio
@pytest.mark.parametrize("sealed,expected", [(False, True), (True, False)])
async def test_manager_update_enabling_an_instance_turns_the_type_on(sealed, expected):
    await _off_type()
    await _instance(enabled=False)
    with (
        patch("app.plugins.registry.enable_policy.plugin_loader") as policy_loader,
        patch(SEALED, new=AsyncMock(return_value=sealed)),
    ):
        policy_loader.get_plugin_types.return_value = [_meta(["cast.example.com"])]
        await _generic_update(True)
    assert (await _row()).enabled is expected


@pytest.mark.unit
@pytest.mark.asyncio
async def test_manager_update_disabling_an_instance_still_turns_the_type_off():
    await PluginTypeDB.objects.create(
        type_id="castish",
        plugin_type="service",
        name="Castish",
        description=None,
        version="1",
        common_config_schema={},
        enabled=True,
    )
    await _instance(enabled=True)
    await _generic_update(False)
    assert (await _row()).enabled is False


# --- restore, stale reason ----------------------------------------------------------------


@pytest.mark.unit
@pytest.mark.asyncio
async def test_restore_keeps_a_sealed_blocked_type_off():
    from types import SimpleNamespace

    from app.services.backup.restorer import _Outcome, _restore_plugin_types

    await _off_type()
    doc = SimpleNamespace(
        data=SimpleNamespace(
            plugin_types=[SimpleNamespace(type_id="castish", enabled=True, common_config_schema={})]
        )
    )
    out = _Outcome()
    with (
        patch("app.plugins.registry.enable_policy.plugin_loader") as policy_loader,
        patch(SEALED, new=AsyncMock(return_value=True)),
    ):
        policy_loader.get_plugin_types.return_value = [_meta(["cast.example.com"])]
        await _restore_plugin_types(doc, out)
    assert (await _row()).enabled is False
    assert any("sealed mode" in w.lower() for w in out.warnings)


@pytest.mark.unit
@pytest.mark.asyncio
async def test_turning_a_blocked_type_on_after_unsealing_clears_the_reason():
    from app.plugins.registry.enable_policy import SEALED_REASON, turn_type_on

    await _off_type()
    row = await _row()
    row.error_message = SEALED_REASON
    await row.save_with_timestamp()
    with (
        patch("app.plugins.registry.enable_policy.plugin_loader") as policy_loader,
        patch(SEALED, new=AsyncMock(return_value=False)),
    ):
        policy_loader.get_plugin_types.return_value = [_meta(["cast.example.com"])]
        assert await turn_type_on("castish") is True
    row = await _row()
    assert row.enabled is True
    assert row.error_message is None


@pytest.mark.unit
@pytest.mark.asyncio
async def test_startup_refresh_keeps_the_reason_while_the_type_is_off():
    from app.plugins.registry.enable_policy import SEALED_REASON

    await _off_type()
    row = await _row()
    row.error_message = SEALED_REASON
    await row.save_with_timestamp()
    with (
        patch("app.plugins.registry.loader.plugin_loader") as loader,
        patch(SEALED, new=AsyncMock(return_value=True)),
    ):
        loader.get_plugin_types.return_value = [_meta(["cast.example.com"])]
        await load_plugin_types()
        await load_plugin_types_for_single("castish")
    assert (await _row()).error_message == SEALED_REASON


@pytest.mark.unit
@pytest.mark.asyncio
async def test_the_toggle_clears_the_reason_when_it_turns_the_type_on(test_client):
    from types import SimpleNamespace

    from app.plugins.registry.enable_policy import SEALED_REASON

    await _off_type()
    row = await _row()
    row.error_message = SEALED_REASON
    await row.save_with_timestamp()
    fake = SimpleNamespace(
        type_id="castish",
        browser_origins=["cast.example.com"],
        plugin_type="service",
        common_config_schema={},
        instance_config_schema={},
        name="Castish",
        description="",
        version="1",
        ui_actions=[],
        ui_sections=[],
        supports_multiple_instances=False,
        instance_label=None,
        display_schema=None,
        statusbar_schema=None,
    )
    with (
        patch(
            "app.api.routes.plugins.management.plugin_loader.get_plugin_types",
            return_value=[fake],
        ),
        patch(
            "app.api.routes.plugins.management.get_sealed_mode", new=AsyncMock(return_value=False)
        ),
    ):
        test_client.put("/api/plugins/castish", json={"enabled": True})
    row = await _row()
    assert row.enabled is True
    assert row.error_message is None


# --- calvin-7xxf: the recorded reason must not outlive sealed mode ----------------------------


async def _blocked_type():
    from app.plugins.registry.enable_policy import SEALED_REASON

    await _off_type()
    row = await _row()
    row.error_message = SEALED_REASON
    await row.save_with_timestamp()


@pytest.mark.unit
@pytest.mark.asyncio
async def test_a_refresh_after_sealed_mode_went_off_drops_the_reason():
    """keeps_reason used to ignore the current sealed state."""
    await _blocked_type()
    with (
        patch("app.plugins.registry.loader.plugin_loader") as loader,
        patch(SEALED, new=AsyncMock(return_value=False)),
    ):
        loader.get_plugin_types.return_value = [_meta(["cast.example.com"])]
        await load_plugin_types()
    row = await _row()
    assert row.error_message is None
    assert row.enabled is False  # still off: unsealing never switches a plugin on by itself


@pytest.mark.unit
@pytest.mark.asyncio
async def test_turning_sealed_mode_off_clears_the_reason_at_once(test_client):
    await _blocked_type()
    assert (
        test_client.put("/api/security/sealed-mode", json={"sealed_mode": False}).status_code == 200
    )
    row = await _row()
    assert row.error_message is None
    assert row.enabled is False


@pytest.mark.unit
@pytest.mark.asyncio
async def test_turning_sealed_mode_on_leaves_other_errors_alone(test_client):
    await _off_type()
    row = await _row()
    row.error_message = "ImportError: boom"
    await row.save_with_timestamp()
    assert (
        test_client.put("/api/security/sealed-mode", json={"sealed_mode": False}).status_code == 200
    )
    assert (await _row()).error_message == "ImportError: boom"
