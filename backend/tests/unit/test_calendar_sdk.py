import pytest

from app.plugins.sdk.calendar import (
    CalendarConfigField,
    build_calendar_manager_config,
    build_calendar_plugin_metadata,
    create_calendar_plugin_instance,
    extract_calendar_config,
)


class DummyCalendarPlugin:
    def __init__(self, plugin_id: str, name: str, enabled: bool = True, **kwargs):
        self.plugin_id = plugin_id
        self.name = name
        self.enabled = enabled
        self.kwargs = kwargs


def test_build_calendar_plugin_metadata():
    metadata = build_calendar_plugin_metadata(
        type_id="dummy_calendar",
        name="Dummy Calendar",
        description="Dummy",
        plugin_class=DummyCalendarPlugin,
        supports_multiple_instances=False,
        instance_label="Source",
    )

    assert metadata["type_id"] == "dummy_calendar"
    assert metadata["plugin_type"].value == "calendar"
    assert metadata["supports_multiple_instances"] is False
    assert metadata["instance_label"] == "Source"
    assert metadata["plugin_class"] is DummyCalendarPlugin


def test_build_calendar_plugin_metadata_rejects_app_managed_config_fields():
    with pytest.raises(ValueError, match="app-managed config field"):
        build_calendar_plugin_metadata(
            type_id="dummy_calendar",
            name="Dummy Calendar",
            description="Dummy",
            plugin_class=DummyCalendarPlugin,
            instance_config_schema={"enabled": {"type": "boolean"}},
        )


def test_extract_calendar_config_uses_defaults_and_transforms():
    fields = (
        CalendarConfigField("url", default="", converter=str, transform=str.strip),
        CalendarConfigField("name_override", default="", arg_name="calendar_name"),
    )

    values = extract_calendar_config(
        {"url": "  https://example.com/calendar.ics  ", "name_override": "Personal"},
        fields,
    )

    assert values == {
        "url": "https://example.com/calendar.ics",
        "calendar_name": "Personal",
    }


def test_create_calendar_plugin_instance_builds_kwargs():
    fields = (
        CalendarConfigField("url", default="", converter=str),
        CalendarConfigField("refresh_minutes", default=5, converter=int),
    )

    plugin = create_calendar_plugin_instance(
        DummyCalendarPlugin,
        expected_type_ids="dummy_calendar",
        plugin_id="dummy-instance",
        type_id="dummy_calendar",
        name="Dummy",
        config={"enabled": True, "url": "https://example.com", "refresh_minutes": "10"},
        fields=fields,
        extra_kwargs=lambda config: {"source": config.get("source", "default")},
    )

    assert plugin is not None
    assert plugin.plugin_id == "dummy-instance"
    assert plugin.enabled is True
    assert plugin.kwargs == {
        "url": "https://example.com",
        "refresh_minutes": 10,
        "source": "default",
    }


def test_create_calendar_plugin_instance_accepts_multiple_type_ids():
    plugin = create_calendar_plugin_instance(
        DummyCalendarPlugin,
        expected_type_ids=("ical", "proton"),
        plugin_id="calendar-instance",
        type_id="proton",
        name="Calendar",
        config={},
    )

    assert plugin is not None


def test_create_calendar_plugin_instance_returns_none_for_other_type():
    plugin = create_calendar_plugin_instance(
        DummyCalendarPlugin,
        expected_type_ids=("ical", "proton"),
        plugin_id="calendar-instance",
        type_id="google",
        name="Calendar",
        config={},
    )

    assert plugin is None


def test_build_calendar_manager_config_normalizes_fields_and_extras():
    fields = (
        CalendarConfigField("url", default="", converter=str, transform=str.strip),
        CalendarConfigField("refresh_minutes", default=5, converter=int),
    )

    manager_config = build_calendar_manager_config(
        type_id="dummy_calendar",
        fields=fields,
        single_instance=True,
        instance_id="dummy-instance",
        extra_normalize=lambda config: {"enabled_flag": config.get("enabled", False)},
        default_instance_name="Dummy Calendar",
    )

    normalized = manager_config.normalize_config(
        {"url": "  https://example.com  ", "refresh_minutes": "15", "enabled": True}
    )

    assert manager_config.single_instance is True
    assert manager_config.instance_id == "dummy-instance"
    assert manager_config.default_instance_name == "Dummy Calendar"
    assert normalized == {
        "url": "https://example.com",
        "refresh_minutes": 15,
        "enabled_flag": True,
    }
