"""Schema authoring helpers for ``instance_config_schema`` / ``common_config_schema``.

These return plain dicts in the same shape ``PluginFieldRenderer`` expects, so
plugins can mix helper-built fields and raw dicts freely. Helpers are additive —
no existing plugin needs to change.

Example:

    from app.plugins.sdk.schema import url_field, toggle_field

    instance_config_schema={
        "url": url_field("Website URL", placeholder="https://example.com", required=True),
        "fullscreen": toggle_field("Prefer fullscreen mode", help_text="Open in fullscreen"),
    }
"""

from collections.abc import Iterable
from typing import Any


def _build_ui(
    component: str,
    *,
    placeholder: str | None = None,
    help_text: str | None = None,
    extra: dict[str, Any] | None = None,
    validation: dict[str, Any] | None = None,
) -> dict[str, Any]:
    ui: dict[str, Any] = {"component": component}
    if placeholder is not None:
        ui["placeholder"] = placeholder
    if help_text is not None:
        ui["help_text"] = help_text
    if extra:
        ui.update(extra)
    if validation:
        ui["validation"] = validation
    return ui


def _build_validation(
    *,
    required: bool = False,
    validation_type: str | None = None,
) -> dict[str, Any] | None:
    validation: dict[str, Any] = {}
    if required:
        validation["required"] = True
    if validation_type is not None:
        validation["type"] = validation_type
    return validation or None


def text_field(
    description: str,
    *,
    default: str = "",
    placeholder: str | None = None,
    required: bool = False,
    help_text: str | None = None,
) -> dict[str, Any]:
    """Plain text input."""
    return {
        "type": "string",
        "description": description,
        "default": default,
        "ui": _build_ui(
            "input",
            placeholder=placeholder,
            help_text=help_text,
            validation=_build_validation(required=required),
        ),
    }


def password_field(
    description: str,
    *,
    default: str = "",
    placeholder: str | None = None,
    required: bool = False,
    help_text: str | None = None,
) -> dict[str, Any]:
    """Masked password input."""
    return {
        "type": "password",
        "description": description,
        "default": default,
        "ui": _build_ui(
            "password",
            placeholder=placeholder,
            help_text=help_text,
            validation=_build_validation(required=required),
        ),
    }


def url_field(
    description: str,
    *,
    default: str = "",
    placeholder: str | None = None,
    required: bool = False,
    help_text: str | None = None,
) -> dict[str, Any]:
    """Text input flagged as a URL for client-side validation."""
    return {
        "type": "string",
        "description": description,
        "default": default,
        "ui": _build_ui(
            "input",
            placeholder=placeholder,
            help_text=help_text,
            validation=_build_validation(required=required, validation_type="url"),
        ),
    }


def number_field(
    description: str,
    *,
    default: Any = None,
    min: int | float | None = None,
    max: int | float | None = None,
    placeholder: str | None = None,
    required: bool = False,
    help_text: str | None = None,
) -> dict[str, Any]:
    """Numeric input. ``default`` is stored as-is so callers control the type."""
    extra: dict[str, Any] = {}
    if min is not None:
        extra["min"] = min
    if max is not None:
        extra["max"] = max
    field: dict[str, Any] = {
        "type": "string",
        "description": description,
        "ui": _build_ui(
            "number",
            placeholder=placeholder,
            help_text=help_text,
            extra=extra,
            validation=_build_validation(required=required),
        ),
    }
    if default is not None:
        field["default"] = default
    return field


def select_field(
    description: str,
    options: Iterable[tuple[Any, str] | dict[str, Any]],
    *,
    default: Any = None,
    help_text: str | None = None,
) -> dict[str, Any]:
    """Dropdown. ``options`` accepts ``(value, label)`` tuples or pre-shaped dicts."""
    normalized: list[dict[str, Any]] = []
    for option in options:
        if isinstance(option, dict):
            if "value" not in option:
                raise ValueError("select_field option dicts must include 'value'")
            normalized.append(option)
        else:
            value, label = option
            normalized.append({"value": value, "label": label})
    field: dict[str, Any] = {
        "type": "string",
        "description": description,
        "ui": _build_ui("select", help_text=help_text, extra={"options": normalized}),
    }
    if default is not None:
        field["default"] = default
    return field


def toggle_field(
    description: str,
    *,
    default: bool = False,
    help_text: str | None = None,
) -> dict[str, Any]:
    """Boolean checkbox."""
    return {
        "type": "boolean",
        "description": description,
        "default": default,
        "ui": _build_ui("checkbox", help_text=help_text),
    }


def path_field(
    description: str,
    *,
    default: str = "",
    placeholder: str | None = None,
    required: bool = False,
    help_text: str | None = None,
) -> dict[str, Any]:
    """Filesystem directory path input."""
    return {
        "type": "string",
        "description": description,
        "default": default,
        "ui": _build_ui(
            "directory",
            placeholder=placeholder,
            help_text=help_text,
            validation=_build_validation(required=required),
        ),
    }


def textarea_field(
    description: str,
    *,
    default: str = "",
    placeholder: str | None = None,
    help_text: str | None = None,
) -> dict[str, Any]:
    """Multi-line text input."""
    return {
        "type": "string",
        "description": description,
        "default": default,
        "ui": _build_ui("textarea", placeholder=placeholder, help_text=help_text),
    }
