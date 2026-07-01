"""Canonical tests for the plugin contract 1.0.

These tests pin the author-facing contract: a plugin is ONE BasePlugin
subclass with a `metadata = PluginMetadata(...)` class attribute — no
module-level hooks, no metadata classmethod, config declared once in the
schema. If these tests need changing, the contract is changing.
"""

import types
from typing import Any

import pytest
from pydantic import ValidationError

from app.plugins.base import BasePlugin, PluginType
from app.plugins.definitions import (
    CURRENT_PLUGIN_API_VERSION,
    PluginMetadata,
)
from app.plugins.loader import PluginLoader
from app.plugins.protocols import ServicePlugin
from app.services.validation import validate_manifest_api_version


class MinimalPlugin(ServicePlugin):
    """The smallest legal plugin: metadata + (optionally) fetch()."""

    metadata = PluginMetadata(
        type_id="minimal",
        name="Minimal",
        description="Smallest legal plugin",
        instance_config_schema={
            "url": {
                "type": "string",
                "default": "",
                "ui": {"validation": {"required": True}},
            },
            "count": {"type": "integer", "default": 3},
        },
        display_schema={"kind": "status-tile", "label": "Minimal", "value_path": "$.value"},
    )

    async def fetch(self, start_date=None, end_date=None):
        return {"value": self.config.get("url", "")}


def _module_with(*classes: type) -> types.ModuleType:
    module = types.ModuleType("fake_plugin_module")
    for cls in classes:
        setattr(module, cls.__name__, cls)
    return module


class TestDeclarativeDiscovery:
    """The loader discovers classes; there are no registration hooks."""

    def test_minimal_plugin_registers_with_no_module_hooks(self):
        loader = PluginLoader()
        registered = loader.register_module(_module_with(MinimalPlugin))
        assert registered == ["minimal"]
        assert loader.get_plugin_class("minimal") is MinimalPlugin

    def test_get_plugin_types_fills_runtime_fields(self):
        loader = PluginLoader()
        loader.register_module(_module_with(MinimalPlugin))
        (definition,) = loader.get_plugin_types()
        assert definition.type_id == "minimal"
        assert definition.plugin_class is MinimalPlugin
        assert definition.plugin_type == PluginType.SERVICE
        # The class attribute itself is never mutated
        assert MinimalPlugin.metadata.plugin_class is None
        assert MinimalPlugin.metadata.plugin_type is None

    def test_imported_base_classes_are_not_registered(self):
        # A plugin module usually imports its family protocol; the loader must
        # only register classes that DECLARE their own metadata.
        loader = PluginLoader()
        registered = loader.register_module(_module_with(ServicePlugin, BasePlugin, MinimalPlugin))
        assert registered == ["minimal"]

    def test_subclass_with_own_metadata_registers_as_new_type(self):
        # Reusing an implementation under a second type_id = subclass + metadata
        # (e.g. the built-in ical/proton pair).
        class RenamedPlugin(MinimalPlugin):
            metadata = MinimalPlugin.metadata.model_copy(
                update={"type_id": "renamed", "name": "Renamed"}
            )

        loader = PluginLoader()
        registered = loader.register_module(_module_with(MinimalPlugin, RenamedPlugin))
        assert set(registered) == {"minimal", "renamed"}

    def test_subclass_without_metadata_is_not_a_new_type(self):
        class Helper(MinimalPlugin):
            pass

        loader = PluginLoader()
        registered = loader.register_module(_module_with(Helper))
        assert registered == []

    def test_duplicate_type_id_keeps_first(self):
        class Impostor(ServicePlugin):
            metadata = PluginMetadata(type_id="minimal", name="Impostor")

        loader = PluginLoader()
        loader.register_module(_module_with(MinimalPlugin))
        registered = loader.register_module(_module_with(Impostor))
        assert registered == []
        assert loader.get_plugin_class("minimal") is MinimalPlugin

    def test_metadata_must_be_plugin_metadata(self):
        class Wrong(ServicePlugin):
            metadata = {"type_id": "wrong"}  # type: ignore[assignment]

        loader = PluginLoader()
        with pytest.raises(TypeError, match="metadata must be a PluginMetadata"):
            loader.register_module(_module_with(Wrong))

    def test_create_plugin_instance_uses_standard_constructor(self):
        loader = PluginLoader()
        loader.register_module(_module_with(MinimalPlugin))
        instance = loader.create_plugin_instance(
            plugin_id="minimal-1", type_id="minimal", name="One", config={"enabled": True}
        )
        assert isinstance(instance, MinimalPlugin)
        assert instance.plugin_id == "minimal-1"
        assert instance.enabled is True
        assert loader.create_plugin_instance("x", "unknown", "X", {}) is None

    def test_unload_installed_plugin_removes_types(self):
        loader = PluginLoader()
        module = _module_with(MinimalPlugin)
        module.__name__ = "installed_plugin_minimal"
        loader.register_module(module)
        assert loader.get_plugin_class("minimal") is MinimalPlugin
        loader.unload_installed_plugin("minimal")
        assert loader.get_plugin_class("minimal") is None


class TestConfigDeclaredOnce:
    """instance_config_schema drives normalization, validation, and self.config."""

    @pytest.mark.asyncio
    async def test_configure_normalizes_against_schema(self):
        plugin = MinimalPlugin("p1", "P1")
        await plugin.configure({"url": {"value": "http://x"}, "count": "7", "extra": "kept"})
        assert plugin.config["url"] == "http://x"
        assert plugin.config["count"] == 7  # converted by schema type
        assert plugin.config["extra"] == "kept"  # unknown keys pass through

    @pytest.mark.asyncio
    async def test_configure_applies_schema_defaults(self):
        plugin = MinimalPlugin("p1", "P1")
        await plugin.configure({"url": "http://x"})
        assert plugin.config["count"] == 3

    @pytest.mark.asyncio
    async def test_default_validate_config_checks_required(self):
        assert await MinimalPlugin.validate_config({"url": "http://x"}) is True
        assert await MinimalPlugin.validate_config({"url": ""}) is False
        assert await MinimalPlugin.validate_config({}) is False

    def test_instance_identity_derives_stable_id(self):
        class IdentityPlugin(ServicePlugin):
            metadata = PluginMetadata(
                type_id="ident",
                name="Ident",
                instance_identity=["url"],
                instance_config_schema={"url": {"type": "string", "default": ""}},
            )

        id_a = IdentityPlugin.instance_id_for({"url": "http://a"})
        id_b = IdentityPlugin.instance_id_for({"url": "http://a"})
        id_c = IdentityPlugin.instance_id_for({"url": "http://c"})
        assert id_a == id_b
        assert id_a != id_c
        assert id_a.startswith("ident-")
        # Empty identity -> None -> generic fallback applies
        assert IdentityPlugin.instance_id_for({"url": ""}) is None
        # No instance_identity declared -> None
        assert MinimalPlugin.instance_id_for({"url": "http://a"}) is None


class TestVerbs:
    """One verb each: fetch (instance), test_connection / scan_options (class)."""

    @pytest.mark.asyncio
    async def test_defaults_signal_unsupported(self):
        plugin = MinimalPlugin("p1", "P1")
        assert await MinimalPlugin.test_connection({}) is None
        assert await MinimalPlugin.scan_options("field") is None
        # fetch is supported by MinimalPlugin
        await plugin.configure({"url": "http://x"})
        assert await plugin.fetch() == {"value": "http://x"}

    def test_retired_surface_is_gone(self):
        for retired in (
            "get_plugin_metadata",
            "fetch_type_data",
            "test_type_config",
            "scan_type_options",
            "fetch_service_data",
            "get_content",
            "handle_webhook",
            "handle_api_request",
        ):
            assert not hasattr(MinimalPlugin, retired), retired

    def test_hooks_module_is_gone(self):
        with pytest.raises(ModuleNotFoundError):
            import app.plugins.hooks  # noqa: F401


class TestPluginMetadataModel:
    """PluginMetadata is the one typed contract model."""

    def test_unknown_top_level_keys_are_rejected(self):
        with pytest.raises(ValidationError):
            PluginMetadata(type_id="x", name="X", protocol_version=1)
        with pytest.raises(ValidationError):
            PluginMetadata(type_id="x", name="X", capabilities={})

    def test_display_schema_requires_supported_kind(self):
        with pytest.raises(ValidationError, match="kind is required"):
            PluginMetadata(type_id="x", name="X", display_schema={"type": "api"})
        with pytest.raises(ValidationError, match="must be one of"):
            PluginMetadata(type_id="x", name="X", display_schema={"kind": "nope"})

    def test_dict_compat_shims_are_gone(self):
        metadata = PluginMetadata(type_id="x", name="X")
        with pytest.raises(TypeError):
            metadata["type_id"]  # noqa: B018
        assert not hasattr(metadata, "from_raw")


class TestApiVersionGate:
    """One enforced version signal: plugin.json api_version."""

    def _manifest(self, **overrides: Any) -> dict[str, Any]:
        manifest = {"id": "x", "name": "X", "version": "1.0.0", "type": "service"}
        manifest.update(overrides)
        return manifest

    def test_current_version_passes(self):
        validate_manifest_api_version(
            self._manifest(api_version=CURRENT_PLUGIN_API_VERSION),
            CURRENT_PLUGIN_API_VERSION,
        )

    def test_missing_api_version_is_rejected(self):
        with pytest.raises(ValueError, match="must declare api_version"):
            validate_manifest_api_version(self._manifest(), CURRENT_PLUGIN_API_VERSION)

    def test_non_int_api_version_is_rejected(self):
        for bad in ("1", 1.0, True, None):
            with pytest.raises(ValueError):
                validate_manifest_api_version(
                    self._manifest(api_version=bad), CURRENT_PLUGIN_API_VERSION
                )

    def test_newer_api_version_is_rejected(self):
        with pytest.raises(ValueError, match="newer than this Calvin"):
            validate_manifest_api_version(
                self._manifest(api_version=CURRENT_PLUGIN_API_VERSION + 1),
                CURRENT_PLUGIN_API_VERSION,
            )

    def test_loader_skips_stale_installed_plugin(self, tmp_path, monkeypatch):
        from app.services.plugin_installer import plugin_installer

        plugin_dir = tmp_path / "stale"
        plugin_dir.mkdir()
        (plugin_dir / "plugin.py").write_text("raise AssertionError('must not be imported')\n")

        monkeypatch.setattr(
            plugin_installer,
            "get_installed_plugins",
            lambda: [{"id": "stale", "protocol_version": 1}],  # old manifest, no api_version
        )
        monkeypatch.setattr(plugin_installer, "get_plugin_path", lambda _pid: plugin_dir)

        loader = PluginLoader()
        loader.load_installed_plugins()
        assert loader.get_plugin_class("stale") is None
        assert "api_version" in (loader.get_load_error("stale") or "")
