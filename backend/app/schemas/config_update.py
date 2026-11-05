"""The typed shape of a configuration update (settings-scope §7 item 8).

Both write paths use this model: ``POST /api/config`` for the household config
and ``PUT /api/kiosks/{id}/overrides`` for a screen's own layer. Declaring the
per-screen keys here means a bad value is refused (400 on the override route,
422 on the config route) instead of being stored and later rendered.

The schema stays open (``extra="allow"``): plugins and household settings added
outside this model must keep working. Only a *declared* key with a value of the
wrong shape or range is rejected.
"""

from __future__ import annotations

import re
from typing import Annotated, Any, Literal

from loguru import logger
from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    ValidationError,
    field_validator,
    model_validator,
)

from app.utils.git_refs import validate_git_branch, validate_git_repo_url


class ClockBarPart(BaseModel):
    """One part's options inside a clock bar design.

    A size is a step name or a px value (Custom). Part ids are dynamic for
    plugin tiles, so they are not validated here.
    """

    model_config = ConfigDict(extra="forbid")

    size: Annotated[int, Field(ge=0, le=200)] | Literal["s", "m", "l", "xl"] | None = None
    seconds: bool | None = None
    underTime: bool | None = None
    style: Literal["upright", "stacked", "line"] | None = None


class ClockBarHorizontalZones(BaseModel):
    model_config = ConfigDict(extra="forbid")

    left: Annotated[list[Annotated[str, Field(max_length=120)]], Field(max_length=100)] = Field(
        default_factory=list
    )
    center: Annotated[list[Annotated[str, Field(max_length=120)]], Field(max_length=100)] = Field(
        default_factory=list
    )
    right: Annotated[list[Annotated[str, Field(max_length=120)]], Field(max_length=100)] = Field(
        default_factory=list
    )


class ClockBarVerticalZones(BaseModel):
    model_config = ConfigDict(extra="forbid")

    top: Annotated[list[Annotated[str, Field(max_length=120)]], Field(max_length=100)] = Field(
        default_factory=list
    )
    middle: Annotated[list[Annotated[str, Field(max_length=120)]], Field(max_length=100)] = Field(
        default_factory=list
    )
    bottom: Annotated[list[Annotated[str, Field(max_length=120)]], Field(max_length=100)] = Field(
        default_factory=list
    )


class ClockBarHorizontalDesign(BaseModel):
    model_config = ConfigDict(extra="forbid")

    zones: ClockBarHorizontalZones
    hidden: Annotated[list[Annotated[str, Field(max_length=120)]], Field(max_length=100)] = Field(
        default_factory=list
    )
    parts: Annotated[dict[str, ClockBarPart], Field(max_length=50)] = Field(default_factory=dict)
    barHeight: Annotated[int, Field(ge=0, le=200)] | Literal["slim", "normal", "roomy"] = "normal"
    tileSize: Annotated[int, Field(ge=0, le=200)] | Literal["s", "m", "l"] = "m"


class ClockBarVerticalDesign(BaseModel):
    model_config = ConfigDict(extra="forbid")

    zones: ClockBarVerticalZones
    hidden: Annotated[list[Annotated[str, Field(max_length=120)]], Field(max_length=100)] = Field(
        default_factory=list
    )
    parts: Annotated[dict[str, ClockBarPart], Field(max_length=50)] = Field(default_factory=dict)
    barHeight: Annotated[int, Field(ge=0, le=200)] | Literal["slim", "normal", "roomy"] = "normal"
    tileSize: Annotated[int, Field(ge=0, le=200)] | Literal["s", "m", "l"] = "m"


class ClockBarDesign(BaseModel):
    """The household clock bar design (docs/design/2026-11-04-clock-bar-editor.md §4)."""

    model_config = ConfigDict(extra="forbid")

    version: Literal[1] = 1
    horizontal: ClockBarHorizontalDesign | None = None
    vertical: ClockBarVerticalDesign | None = None


class ConfigUpdate(BaseModel):
    """Configuration update model."""

    orientation: Literal["landscape", "portrait"] | None = None
    orientationFlipped: bool | None = None  # Whether orientation is flipped (180° rotation)
    applyDisplayRotation: bool | None = (
        None  # Whether to physically rotate display on RPi (default: True)
    )
    calendarSplit: float | None = None
    dashboardLayout: dict[str, Any] | None = None
    dashboardScreens: dict[str, Any] | None = None
    lastSideViewMode: str | None = None  # Last side view mode ('photos' | 'web_services')
    photoFrameEnabled: bool | None = None
    photoFrameTimeout: int | None = None
    showUI: bool | None = None
    photoRotationInterval: int | None = None  # Photo rotation interval in seconds
    timeFormat: str | None = None  # '12h' or '24h' (default: '24h')
    modeIndicatorTimeout: int | None = (
        None  # Mode indicator auto-hide timeout in seconds (0 = never hide)
    )
    weekStartDay: int | None = None  # Week starting day (0=Sunday, 1=Monday, ..., 6=Saturday)
    showWeekNumbers: bool | None = None  # Show week numbers in calendar
    weekendDays: list[int] | None = None  # Weekend days (e.g. [0, 6] for Sun+Sat)
    maxVisibleEvents: int | None = None  # Max events visible per day cell
    showRedDays: bool | None = None  # Highlight holidays/red days
    uiSize: Literal["extra-compact", "compact", "default", "large", "extra-large"] | None = None
    themeMode: Literal["light", "dark", "auto", "time"] | None = None
    selectedTheme: str | None = None  # Selected custom theme ID (null = use themeMode)
    darkModeStart: int | None = Field(None, ge=0, le=23)  # Dark mode start hour
    darkModeEnd: int | None = Field(None, ge=0, le=23)  # Dark mode end hour
    # Font/type theme id from frontend/src/styles/typeThemes.js. The backend
    # keeps no list of ids: an unknown id falls back to the default face.
    typeTheme: str | None = Field(None, max_length=64)
    displayScheduleEnabled: bool | None = None  # Enable display power schedule
    # Display schedule as JSON string or array:
    # [{"day": 0-6, "enabled": bool, "onTime": "HH:MM", "offTime": "HH:MM"}, ...]
    displaySchedule: str | list[dict[str, Any]] | None = None
    displayTimeoutEnabled: bool | None = None  # Enable display timeout (screensaver)
    displayTimeout: int | None = None  # Display timeout in seconds (0 = never, default: 0)
    rebootComboKey1: str | None = None  # First key for reboot combo (e.g., "KEY_1")
    rebootComboKey2: str | None = None  # Second key for reboot combo (e.g., "KEY_7")
    rebootComboDuration: int | None = None  # Reboot combo duration in milliseconds (default: 10000)
    keyboardFeedbackEnabled: bool | None = None  # Enable visual keyboard feedback (default: True)
    keyboardFeedbackMode: Literal["normal", "small"] | None = (
        None  # Keyboard feedback label size (default: 'normal')
    )
    # Image display mode: 'fit', 'fill', 'crop', 'center', 'smart' (default: 'smart')
    imageDisplayMode: str | None = None
    randomizeImages: bool | None = None  # Randomize image order (default: False)
    # Timezone (e.g., "America/New_York", "Europe/London", "UTC") - null = system timezone
    timezone: str | None = None
    gitRepoUrl: str | None = (
        None  # Git repository URL for updates (default: 'https://github.com/osterbergsimon/calvin.git')
    )
    gitBranch: str | None = None  # Git branch to use for updates (default: 'main')
    # The add-on catalog the provider picker may install from (§3.7).
    pluginCatalogRepo: str | None = None

    @model_validator(mode="before")
    @classmethod
    def _check_snake_case_git_keys(cls, data: Any) -> Any:
        # extra="allow" would otherwise let git_branch/git_repo_url (the stored
        # names, read by the update route) through unvalidated.
        if isinstance(data, dict):
            if data.get("git_branch") is not None:
                validate_git_branch(data["git_branch"])
            if data.get("git_repo_url") is not None:
                validate_git_repo_url(data["git_repo_url"])
        return data

    @field_validator("gitRepoUrl")
    @classmethod
    def _check_git_repo_url(cls, value: str | None) -> str | None:
        return None if value is None else validate_git_repo_url(value)

    @field_validator("gitBranch")
    @classmethod
    def _check_git_branch(cls, value: str | None) -> str | None:
        return None if value is None else validate_git_branch(value)

    @field_validator("pluginCatalogRepo")
    @classmethod
    def _check_plugin_catalog_repo(cls, value: str | None) -> str | None:
        return None if value is None else validate_git_repo_url(value)

    configPollInterval: int | None = None  # Config polling interval in seconds (default: 30)
    # Calendar cache refresh interval in minutes (default: 15). Must never be
    # 0 or negative: that used to schedule one refresh per second (audit R4).
    calendarRefreshInterval: int | None = Field(None, ge=1)
    clockBarVerticalLayout: str | None = None  # Vertical bar layout
    clockBarVerticalFontSize: int | None = None
    clockBarVerticalDateFontSize: int | None = None
    clockBarVerticalPadding: int | None = None
    clockBarPluginItemSize: int | None = None
    clockBarVerticalPluginItemSize: int | None = None
    # The one household clock bar design. Not in CONFIG_DISPLAY_KEYS: editing it
    # needs admin, like the other clock bar keys.
    clockBarDesign: ClockBarDesign | None = None

    # --- Per-screen settings (settings-scope §7 item 8) -------------------
    # Keys a Screens page can write into a screen's override layer. The
    # descriptors in frontend/src/utils/screenOverrides.js are the source of
    # truth for which keys these are.
    effectsLevel: Literal["auto", "full", "standard"] | None = None
    loadingLight: Literal["comet", "pulse", "off"] | None = None
    layoutMode: Literal["auto", "desktop", "phone"] | None = None
    touchControls: Literal["auto", "on", "off"] | None = None
    onScreenKeyboard: Literal["auto", "on", "off"] | None = None
    photoFrameSourceIds: list[str] | None = None
    # The reveal corner while the controls are hidden.
    clockBarShowInKiosk: bool | None = None
    tapAnywhereReveal: bool | None = None
    hotCornerPosition: Literal["bottom-left", "bottom-right", "top-left", "top-right"] | None = None
    hotCornerOpacity: int | None = Field(None, ge=0, le=100)
    hotCornerSize: int | None = Field(None, gt=0)
    hotCornerLongPressMs: int | None = Field(None, ge=0)
    focusLightMode: Literal["always", "interaction", "off"] | None = None
    focusLightDimOthers: bool | None = None
    touchControlSize: Literal["xsmall", "small", "medium", "large", "xlarge"] | None = None

    # Per-kiosk content assignment (calvin-dd9.4). Override keys; null/absent on global config.
    availableScreens: list[str] | None = None  # allowlist of screen ids a kiosk may show
    defaultScreenId: str | None = None  # screen id a kiosk boots into

    # Allow arbitrary fields for extensibility
    model_config = ConfigDict(extra="allow")


def _spelling_signature(key: str) -> str:
    """Token shared by the snake_case and camelCase spellings of one key."""
    return re.sub(r"[^a-z0-9]", "", key.lower())


# snake_case aliases (show_ui, theme_mode, ...) name the same setting as the
# declared camelCase field. Match on the spelling signature so acronyms such as
# showUI work too.
_FIELDS_BY_SIGNATURE = {_spelling_signature(name): name for name in ConfigUpdate.model_fields}


def sanitize_overrides(overrides: dict | None, *, kiosk_id: str | None = None) -> dict:
    """Drop stored override values that no longer validate, and keep the rest.

    A value written before its key was typed (or hand-edited into the DB) must
    not break loading a screen's config. Only declared keys are checked;
    unknown keys (plugin settings, ``displayName``, ``screenNow`` and the
    host-internal ``_`` flags) pass through untouched.

    Nothing is written back here: the bad value simply reads as absent, so the
    screen follows the household value, until the next override write replaces
    the layer.
    """
    if not overrides or not isinstance(overrides, dict):
        return {}
    fields = ConfigUpdate.model_fields
    clean = dict(overrides)
    for key, value in overrides.items():
        if key.startswith("_"):
            continue
        # The Settings UI writes camelCase; older layers may hold snake_case.
        # Both spellings name the same setting, so validate either against the
        # declared camelCase field.
        field_key = (
            key if key in fields else _FIELDS_BY_SIGNATURE.get(_spelling_signature(key), key)
        )
        if field_key not in fields:
            continue
        try:
            ConfigUpdate.model_validate({field_key: value})
        except ValidationError as exc:
            reason = exc.errors()[0].get("msg", "invalid value")
            logger.warning(
                "Dropping invalid stored override {!r} on screen {!r}: {}",
                key,
                kiosk_id or "unknown",
                reason,
            )
            del clean[key]
    return clean
