"""Tests for app.plugins.sdk.schema field helpers.

These helpers build ``instance_config_schema`` field dicts in the canonical
contract-1.0 shape: ``type`` drives normalization, ``ui.component`` selects the
renderer, and all constraints live under ``ui.validation`` (``required`` / ``min``
/ ``max`` / ``type``). See docs/plugins/PLUGIN_INTERFACE.md.
"""

import pytest

from app.plugins.sdk.schema import (
    number_field,
    password_field,
    select_field,
    text_field,
    toggle_field,
    url_field,
)


class TestUrlField:
    def test_minimal_flags_url_validation(self):
        assert url_field("Website URL") == {
            "type": "string",
            "description": "Website URL",
            "default": "",
            "ui": {"component": "input", "validation": {"type": "url"}},
        }

    def test_full(self):
        field = url_field(
            "Website URL",
            placeholder="https://example.com",
            required=True,
            help_text="Public address",
        )
        assert field["type"] == "string"
        assert field["ui"] == {
            "component": "input",
            "placeholder": "https://example.com",
            "help_text": "Public address",
            "validation": {"required": True, "type": "url"},
        }


class TestToggleField:
    def test_minimal(self):
        assert toggle_field("Prefer fullscreen mode") == {
            "type": "boolean",
            "description": "Prefer fullscreen mode",
            "default": False,
            "ui": {"component": "checkbox"},
        }

    def test_default_true_and_help_text(self):
        field = toggle_field("Show weather", default=True, help_text="In the bar")
        assert field["default"] is True
        assert field["ui"] == {"component": "checkbox", "help_text": "In the bar"}


class TestNumberField:
    def test_minimal_omits_default_and_validation(self):
        # No default -> the key is absent, so normalize_config can't inject a
        # phantom 0.0 for an unconfigured field (cf. calvin-8p0).
        assert number_field("Count") == {
            "type": "number",
            "description": "Count",
            "ui": {"component": "number"},
        }

    def test_integer_with_bounds_in_validation(self):
        # Bounds live in ui.validation (canonical), NOT ui.min/ui.max.
        assert number_field("Days ahead", default=7, min=1, max=30, integer=True) == {
            "type": "integer",
            "description": "Days ahead",
            "default": 7,
            "ui": {"component": "number", "validation": {"min": 1, "max": 30}},
        }

    def test_float_required_with_bounds(self):
        field = number_field("Latitude", min=-90, max=90, required=True)
        assert field["type"] == "number"
        assert "default" not in field
        assert field["ui"]["validation"] == {"required": True, "min": -90, "max": 90}

    def test_default_zero_is_preserved(self):
        # A caller who explicitly wants 0.0 as the default still gets it —
        # only an absent default is omitted.
        assert number_field("Offset", default=0)["default"] == 0


class TestTextField:
    def test_minimal(self):
        assert text_field("Group ID") == {
            "type": "string",
            "description": "Group ID",
            "default": "",
            "ui": {"component": "input"},
        }

    def test_required_with_placeholder_and_help(self):
        field = text_field(
            "Server", placeholder="imap.example.com", required=True, help_text="Hostname only"
        )
        assert field["ui"] == {
            "component": "input",
            "placeholder": "imap.example.com",
            "help_text": "Hostname only",
            "validation": {"required": True},
        }


class TestPasswordField:
    def test_minimal(self):
        assert password_field("API token") == {
            "type": "password",
            "description": "API token",
            "default": "",
            "ui": {"component": "password"},
        }

    def test_required(self):
        field = password_field("API key", required=True)
        assert field["type"] == "password"
        assert field["ui"] == {"component": "password", "validation": {"required": True}}


class TestSelectField:
    def test_tuple_options(self):
        assert select_field("Answer", [("true", "Yes"), ("false", "No")]) == {
            "type": "string",
            "description": "Answer",
            "ui": {
                "component": "select",
                "options": [
                    {"value": "true", "label": "Yes"},
                    {"value": "false", "label": "No"},
                ],
            },
        }

    def test_default_and_help_text(self):
        field = select_field("Mode", [("a", "A")], default="a", help_text="Pick one")
        assert field["default"] == "a"
        assert field["ui"]["help_text"] == "Pick one"

    def test_dict_options_pass_through(self):
        field = select_field("X", [{"value": "a", "label": "A", "disabled": True}])
        assert field["ui"]["options"] == [{"value": "a", "label": "A", "disabled": True}]

    def test_dict_option_without_value_raises(self):
        with pytest.raises(ValueError, match="value"):
            select_field("X", [{"label": "no value"}])
