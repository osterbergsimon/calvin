from pathlib import Path

import pytest

from app.plugins.sdk.backend import (
    BackendConfigField,
    build_backend_manager_config,
    build_backend_plugin_metadata,
    create_backend_plugin_instance,
    extract_backend_config,
    path_or_none,
)


class DummyBackendPlugin:
    def __init__(self, plugin_id: str, name: str, enabled: bool = True, **kwargs):
        self.plugin_id = plugin_id
        self.name = name
        self.enabled = enabled
        self.kwargs = kwargs


def test_path_or_none():
    assert path_or_none("") is None
    assert path_or_none("   ") is None
    assert path_or_none("C:/tmp") == Path("C:/tmp")


def test_build_backend_plugin_metadata():
    metadata = build_backend_plugin_metadata(
        type_id="dummy_backend",
        name="Dummy Backend",
        description="Dummy",
        plugin_class=DummyBackendPlugin,
        supports_multiple_instances=False,
        instance_label="Worker",
        ui_actions=[{"id": "fetch", "type": "fetch"}],
    )

    assert metadata["type_id"] == "dummy_backend"
    assert metadata["plugin_type"].value == "backend"
    assert metadata["supports_multiple_instances"] is False
    assert metadata["instance_label"] == "Worker"
    assert metadata["ui_actions"] == [{"id": "fetch", "type": "fetch"}]
    assert metadata["plugin_class"] is DummyBackendPlugin


def test_build_backend_plugin_metadata_rejects_app_managed_config_fields():
    with pytest.raises(ValueError, match="app-managed config field"):
        build_backend_plugin_metadata(
            type_id="dummy_backend",
            name="Dummy Backend",
            description="Dummy",
            plugin_class=DummyBackendPlugin,
            instance_config_schema={"enabled": {"type": "boolean"}},
        )


def test_extract_backend_config_uses_defaults_and_transforms():
    fields = (
        BackendConfigField("token", default="", converter=str, transform=str.strip),
        BackendConfigField("count", default=1, converter=int),
        BackendConfigField(
            "folder", default="", transform=path_or_none, arg_name="target_directory"
        ),
    )

    values = extract_backend_config(
        {"token": "  abc  ", "count": "4", "folder": "C:/tmp"},
        fields,
    )

    assert values == {
        "token": "abc",
        "count": 4,
        "target_directory": Path("C:/tmp"),
    }


def test_create_backend_plugin_instance_builds_kwargs():
    fields = (
        BackendConfigField("token", default="", converter=str),
        BackendConfigField("count", default=1, converter=int),
    )

    plugin = create_backend_plugin_instance(
        DummyBackendPlugin,
        expected_type_id="dummy_backend",
        plugin_id="dummy-instance",
        type_id="dummy_backend",
        name="Dummy",
        config={"enabled": True, "token": "abc", "count": "2"},
        fields=fields,
        extra_kwargs=lambda config: {"source": config.get("source", "default")},
    )

    assert plugin is not None
    assert plugin.plugin_id == "dummy-instance"
    assert plugin.enabled is True
    assert plugin.kwargs == {"token": "abc", "count": 2, "source": "default"}


def test_create_backend_plugin_instance_returns_none_for_other_type():
    plugin = create_backend_plugin_instance(
        DummyBackendPlugin,
        expected_type_id="dummy_backend",
        plugin_id="dummy-instance",
        type_id="other_backend",
        name="Dummy",
        config={},
    )

    assert plugin is None


def test_build_backend_manager_config_normalizes_fields_and_extras():
    fields = (
        BackendConfigField("token", default="", converter=str, transform=str.strip),
        BackendConfigField("count", default=1, converter=int),
        BackendConfigField("folder", default="", transform=path_or_none),
    )

    manager_config = build_backend_manager_config(
        type_id="dummy_backend",
        fields=fields,
        single_instance=True,
        instance_id="dummy-instance",
        extra_normalize=lambda config: {"enabled_flag": config.get("enabled", False)},
        default_instance_name="Dummy Backend",
    )

    normalized = manager_config.normalize_config(
        {"token": "  abc  ", "count": "3", "folder": "C:/tmp", "enabled": True}
    )

    assert manager_config.single_instance is True
    assert manager_config.instance_id == "dummy-instance"
    assert manager_config.default_instance_name == "Dummy Backend"
    assert normalized == {
        "token": "abc",
        "count": 3,
        "folder": Path("C:/tmp"),
        "enabled_flag": True,
    }
