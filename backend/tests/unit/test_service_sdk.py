from app.plugins.sdk.service import (
    ServiceConfigField,
    build_service_manager_config,
    build_service_plugin_metadata,
    create_service_plugin_instance,
    extract_service_config,
)


class DummyServicePlugin:
    def __init__(self, plugin_id: str, name: str, enabled: bool = True, **kwargs):
        self.plugin_id = plugin_id
        self.name = name
        self.enabled = enabled
        self.kwargs = kwargs


def test_build_service_plugin_metadata():
    metadata = build_service_plugin_metadata(
        type_id="dummy_service",
        name="Dummy Service",
        description="Dummy",
        plugin_class=DummyServicePlugin,
        supports_multiple_instances=False,
        instance_label="Source",
        display_schema={"component": "dummy/Viewer.vue"},
    )

    assert metadata["type_id"] == "dummy_service"
    assert metadata["plugin_type"].value == "service"
    assert metadata["supports_multiple_instances"] is False
    assert metadata["instance_label"] == "Source"
    assert metadata["plugin_class"] is DummyServicePlugin


def test_extract_service_config_uses_defaults_and_transforms():
    fields = (
        ServiceConfigField("token", default="", converter=str, transform=str.strip),
        ServiceConfigField("count", default=1, converter=int),
        ServiceConfigField("alias", default="", arg_name="label"),
    )

    values = extract_service_config(
        {"token": "  abc  ", "count": "4", "alias": "Name"},
        fields,
    )

    assert values == {
        "token": "abc",
        "count": 4,
        "label": "Name",
    }


def test_create_service_plugin_instance_builds_kwargs():
    fields = (
        ServiceConfigField("token", default="", converter=str),
        ServiceConfigField("count", default=1, converter=int),
    )

    plugin = create_service_plugin_instance(
        DummyServicePlugin,
        expected_type_id="dummy_service",
        plugin_id="dummy-instance",
        type_id="dummy_service",
        name="Dummy",
        config={"enabled": True, "token": "abc", "count": "2"},
        fields=fields,
        extra_kwargs=lambda config: {"source": config.get("source", "default")},
    )

    assert plugin is not None
    assert plugin.plugin_id == "dummy-instance"
    assert plugin.enabled is True
    assert plugin.kwargs == {"token": "abc", "count": 2, "source": "default"}


def test_create_service_plugin_instance_returns_none_for_other_type():
    plugin = create_service_plugin_instance(
        DummyServicePlugin,
        expected_type_id="dummy_service",
        plugin_id="dummy-instance",
        type_id="other_service",
        name="Dummy",
        config={},
    )

    assert plugin is None


def test_build_service_manager_config_normalizes_fields_and_extras():
    fields = (
        ServiceConfigField("token", default="", converter=str, transform=str.strip),
        ServiceConfigField("count", default=1, converter=int),
        ServiceConfigField("alias", default="", arg_name="label"),
    )

    manager_config = build_service_manager_config(
        type_id="dummy_service",
        fields=fields,
        single_instance=True,
        instance_id="dummy-instance",
        extra_normalize=lambda config: {"enabled_flag": config.get("enabled", False)},
        default_instance_name="Dummy Service",
    )

    normalized = manager_config.normalize_config(
        {"token": "  abc  ", "count": "3", "alias": "Shown", "enabled": True}
    )

    assert manager_config.single_instance is True
    assert manager_config.instance_id == "dummy-instance"
    assert manager_config.default_instance_name == "Dummy Service"
    assert normalized == {
        "token": "abc",
        "count": 3,
        "alias": "Shown",
        "enabled_flag": True,
    }
