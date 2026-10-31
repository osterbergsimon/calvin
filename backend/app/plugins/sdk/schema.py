"""Schema authoring helpers for ``instance_config_schema``.

Each helper returns a plain field dict in the canonical contract-1.0 shape, so
plugins can write

    from app.plugins.sdk.schema import url_field, toggle_field

    instance_config_schema={
        "url": url_field(
            "The web address to show.", label="Address", placeholder="https://example.com", required=True
        ),
        "fullscreen": toggle_field("Open this service in fullscreen by default", label="Fullscreen"),
    }

instead of hand-rolling nested ``{type, ui: {component, validation}}`` dicts.
Helpers are additive — raw field dicts remain valid and can be mixed in freely.

Canonical shape (see docs/plugins/PLUGIN_INTERFACE.md):
- ``type`` drives ``normalize_config`` conversion (string/integer/number/boolean).
- ``ui.component`` selects the ``PluginFieldRenderer`` widget.
- All constraints live under ``ui.validation``: ``required`` (enforced by the
  default ``validate_config``), ``min`` / ``max`` (enforced by the number
  renderer), and ``type`` (e.g. ``"url"``).
"""

from collections.abc import Iterable
from typing import Any


def _labelled(field: dict[str, Any], label: str | None) -> dict[str, Any]:
    """Attach the optional form label; absent means the UI humanises the key."""
    if label is not None:
        field["label"] = label
    return field


def _ui(
    component: str,
    *,
    placeholder: str | None = None,
    help_text: str | None = None,
    validation: dict[str, Any] | None = None,
) -> dict[str, Any]:
    ui: dict[str, Any] = {"component": component}
    if placeholder is not None:
        ui["placeholder"] = placeholder
    if help_text is not None:
        ui["help_text"] = help_text
    if validation:
        ui["validation"] = validation
    return ui


def text_field(
    description: str,
    *,
    label: str | None = None,
    default: str = "",
    placeholder: str | None = None,
    required: bool = False,
    help_text: str | None = None,
) -> dict[str, Any]:
    """Plain single-line text input."""
    validation = {"required": True} if required else None
    return _labelled(
        {
            "type": "string",
            "description": description,
            "default": default,
            "ui": _ui("input", placeholder=placeholder, help_text=help_text, validation=validation),
        },
        label,
    )


def password_field(
    description: str,
    *,
    label: str | None = None,
    default: str = "",
    placeholder: str | None = None,
    required: bool = False,
    help_text: str | None = None,
) -> dict[str, Any]:
    """Masked secret input (API tokens, passwords)."""
    validation = {"required": True} if required else None
    return _labelled(
        {
            "type": "password",
            "description": description,
            "default": default,
            "ui": _ui(
                "password", placeholder=placeholder, help_text=help_text, validation=validation
            ),
        },
        label,
    )


def select_field(
    description: str,
    options: Iterable[tuple[Any, str] | dict[str, Any]],
    *,
    label: str | None = None,
    default: Any = None,
    required: bool = False,
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
            value, option_label = option
            normalized.append({"value": value, "label": option_label})
    validation = {"required": True} if required else None
    ui = _ui("select", help_text=help_text, validation=validation)
    ui["options"] = normalized
    field: dict[str, Any] = {
        "type": "string",
        "description": description,
        "ui": ui,
    }
    if default is not None:
        field["default"] = default
    return _labelled(field, label)


def url_field(
    description: str,
    *,
    label: str | None = None,
    default: str = "",
    placeholder: str | None = None,
    required: bool = False,
    help_text: str | None = None,
) -> dict[str, Any]:
    """Text input flagged as a URL (``ui.validation.type == "url"``)."""
    validation: dict[str, Any] = {}
    if required:
        validation["required"] = True
    validation["type"] = "url"
    return _labelled(
        {
            "type": "string",
            "description": description,
            "default": default,
            "ui": _ui("input", placeholder=placeholder, help_text=help_text, validation=validation),
        },
        label,
    )


def toggle_field(
    description: str,
    *,
    label: str | None = None,
    default: bool = False,
    help_text: str | None = None,
) -> dict[str, Any]:
    """Boolean toggle (a switch in the form, not a native checkbox)."""
    return _labelled(
        {
            "type": "boolean",
            "description": description,
            "default": default,
            "ui": _ui("checkbox", help_text=help_text),
        },
        label,
    )


def number_field(
    description: str,
    *,
    label: str | None = None,
    default: Any = None,
    min: int | float | None = None,
    max: int | float | None = None,
    required: bool = False,
    integer: bool = False,
    placeholder: str | None = None,
    help_text: str | None = None,
) -> dict[str, Any]:
    """Numeric input. ``integer=True`` emits ``type: "integer"`` (else ``"number"``).

    An absent ``default`` is omitted so ``normalize_config`` can't inject a
    phantom ``0.0`` for an unconfigured field (cf. calvin-8p0). Bounds go in
    ``ui.validation`` where the number renderer reads them.
    """
    validation: dict[str, Any] = {}
    if required:
        validation["required"] = True
    if min is not None:
        validation["min"] = min
    if max is not None:
        validation["max"] = max
    field: dict[str, Any] = {
        "type": "integer" if integer else "number",
        "description": description,
        "ui": _ui("number", placeholder=placeholder, help_text=help_text, validation=validation),
    }
    if default is not None:
        field["default"] = default
    return _labelled(field, label)
