"""Tests for app.plugins.sdk.schema field helpers."""

import pytest

from app.plugins.sdk.schema import (
    number_field,
    password_field,
    path_field,
    select_field,
    text_field,
    textarea_field,
    toggle_field,
    url_field,
)


def test_text_field_minimal():
    field = text_field("Display name")
    assert field == {
        "type": "string",
        "description": "Display name",
        "default": "",
        "ui": {"component": "input"},
    }


def test_text_field_full():
    field = text_field(
        "Server",
        default="imap.gmail.com",
        placeholder="imap.example.com",
        required=True,
        help_text="Hostname only",
    )
    assert field["type"] == "string"
    assert field["default"] == "imap.gmail.com"
    assert field["ui"] == {
        "component": "input",
        "placeholder": "imap.example.com",
        "help_text": "Hostname only",
        "validation": {"required": True},
    }


def test_password_field_required():
    field = password_field("API key", required=True)
    assert field["type"] == "password"
    assert field["ui"]["component"] == "password"
    assert field["ui"]["validation"] == {"required": True}


def test_url_field_emits_url_validation():
    field = url_field("Website URL", placeholder="https://example.com", required=True)
    assert field["type"] == "string"
    assert field["ui"]["component"] == "input"
    assert field["ui"]["validation"] == {"required": True, "type": "url"}


def test_number_field_min_max():
    field = number_field("Port", default=993, min=1, max=65535)
    assert field["default"] == 993
    assert field["ui"]["component"] == "number"
    assert field["ui"]["min"] == 1
    assert field["ui"]["max"] == 65535


def test_number_field_omits_default_when_none():
    field = number_field("Optional", min=0)
    assert "default" not in field
    assert field["ui"]["min"] == 0
    assert "max" not in field["ui"]


def test_select_field_tuples_and_dicts():
    tuple_options = select_field(
        "Mode",
        [("a", "Alpha"), ("b", "Bravo")],
        default="a",
    )
    assert tuple_options["default"] == "a"
    assert tuple_options["ui"]["options"] == [
        {"value": "a", "label": "Alpha"},
        {"value": "b", "label": "Bravo"},
    ]

    dict_options = select_field(
        "Mode",
        [{"value": "x", "label": "X", "extra": True}],
    )
    assert dict_options["ui"]["options"] == [{"value": "x", "label": "X", "extra": True}]


def test_select_field_rejects_dict_without_value():
    with pytest.raises(ValueError):
        select_field("Bad", [{"label": "no value"}])


def test_toggle_field_shape():
    field = toggle_field("Enable feature", default=True, help_text="Toggle it")
    assert field == {
        "type": "boolean",
        "description": "Enable feature",
        "default": True,
        "ui": {"component": "checkbox", "help_text": "Toggle it"},
    }


def test_path_field_uses_directory_component():
    field = path_field("Image directory", placeholder="./images", required=True)
    assert field["ui"]["component"] == "directory"
    assert field["ui"]["placeholder"] == "./images"
    assert field["ui"]["validation"] == {"required": True}


def test_textarea_field_shape():
    field = textarea_field("Notes", placeholder="Free text")
    assert field["ui"]["component"] == "textarea"
    assert field["ui"]["placeholder"] == "Free text"


def test_helpers_match_iframe_plugin_schema():
    """Helpers reproduce the existing iframe plugin schema fields verbatim."""
    from app.plugins.service.iframe import IframeServicePlugin

    metadata = IframeServicePlugin.get_plugin_metadata()
    schema = metadata["instance_config_schema"]

    expected_url = url_field(
        "Website URL",
        default="",
        placeholder="https://example.com",
        required=True,
    )
    expected_fullscreen = toggle_field(
        "Prefer fullscreen mode",
        default=False,
        help_text="Open this service in fullscreen by default",
    )

    assert schema["url"] == expected_url
    assert schema["fullscreen"] == expected_fullscreen
