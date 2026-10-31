"""Theme palette contract (theme_api 2).

A theme is a palette family: colours only, both modes, and no say over layout.
This module is the single place that decides whether a palette is usable:

* the colour allowlist (22 semantic colours + optional ``event-1``…``event-8``);
* strict colour value syntax (no ``url()``, ``var()`` or expressions);
* the 14 required base colours in both modes;
* the eight ``-ink``/``-text`` pairs, derived from the base colours when a
  theme leaves them out;
* the WCAG AA checks on text pairs;
* the status hue-distance rule (a warning for third-party themes).

The installer runs ``check_theme`` and rejects a theme that fails; the load path
runs it again for every installed and bundled theme, so a theme edited on disk
after install cannot bypass the contract.
"""

from __future__ import annotations

import colorsys
import re
from dataclasses import dataclass, field
from typing import Any

from loguru import logger

THEME_API_VERSION = 2

BASE_COLOUR_KEYS = (
    "bg-0",
    "bg-1",
    "bg-2",
    "ink",
    "ink-2",
    "ink-3",
    "line",
    "line-soft",
    "focus",
    "ok",
    "warn",
    "err",
    "shadow",
    "shadow-hover",
)

TONE_KEYS = ("focus", "ok", "warn", "err")
PAIR_KEYS = tuple(f"{tone}{suffix}" for tone in TONE_KEYS for suffix in ("-ink", "-text"))
EVENT_KEYS = tuple(f"event-{i}" for i in range(1, 9))

ALLOWED_COLOUR_KEYS = frozenset(BASE_COLOUR_KEYS + PAIR_KEYS + EVENT_KEYS)

# Minimum hue distance, in degrees, between a pair of status tones. The accent
# (focus) must stay clear of ok/err and of warning; warn and err must be
# distinguishable from each other. Warm accents cannot get further from an
# amber warning without turning olive, hence the lower focus/warn threshold.
HUE_RULES: dict[tuple[str, str], int] = {
    ("focus", "ok"): 25,
    ("focus", "err"): 25,
    ("warn", "err"): 25,
    ("focus", "warn"): 12,
}

HUE_WARNING = "Status colours may be hard to tell apart in this theme."

AA_RATIO = 4.5
# Derive with a little headroom so floating-point rounding cannot land a value
# at 4.4999:1 and fail the check it was derived against.
DERIVE_AA_RATIO = 4.6

_HEX_RE = re.compile(r"#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\Z")
_FUNC_RE = re.compile(r"(?:rgb|rgba|hsl|hsla)\(\s*[0-9.%\s,/+-]+\s*\)\Z", re.IGNORECASE)

RGB = tuple[int, int, int]


@dataclass
class ThemeCheck:
    """Outcome of checking one theme manifest."""

    variables: dict[str, str] = field(default_factory=dict)
    dark_mode: dict[str, str] = field(default_factory=dict)
    errors: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
    ignored_keys: list[str] = field(default_factory=list)

    @property
    def ok(self) -> bool:
        return not self.errors


# --- colour maths ---------------------------------------------------------


def is_colour_value(value: Any) -> bool:
    """True for the only value shapes a theme may use (never ``url()``/``var()``)."""
    if not isinstance(value, str):
        return False
    value = value.strip()
    return bool(_HEX_RE.match(value) or _FUNC_RE.match(value))


def _parse_hex(value: str) -> tuple[RGB, float]:
    raw = value.strip().lstrip("#")
    if len(raw) == 3:
        raw = "".join(ch * 2 for ch in raw)
    alpha = 1.0
    if len(raw) == 8:
        alpha = int(raw[6:8], 16) / 255
    return (int(raw[0:2], 16), int(raw[2:4], 16), int(raw[4:6], 16)), alpha


def _channel(value: str) -> int:
    value = value.strip()
    if value.endswith("%"):
        return round(float(value[:-1]) * 255 / 100)
    return round(float(value))


def _parse_func(value: str) -> tuple[RGB, float]:
    name, _, rest = value.partition("(")
    args = rest.rstrip(")").replace("/", " ").replace(",", " ").split()
    if not args:
        raise ValueError("empty colour function")
    if name.lower().startswith("rgb"):
        rgb = tuple(max(0, min(255, _channel(part))) for part in args[:3])
        alpha = (
            float(args[3].rstrip("%")) / (100 if args[3].endswith("%") else 1)
            if len(args) > 3
            else 1.0
        )
        return rgb, alpha  # type: ignore[return-value]
    hue = float(args[0].rstrip("deg"))
    saturation = float(args[1].rstrip("%")) / 100
    lightness = float(args[2].rstrip("%")) / 100
    alpha = (
        float(args[3].rstrip("%")) / (100 if args[3].endswith("%") else 1) if len(args) > 3 else 1.0
    )
    r, g, b = colorsys.hls_to_rgb((hue % 360) / 360, lightness, saturation)
    return (round(r * 255), round(g * 255), round(b * 255)), alpha


def parse_colour(value: str) -> tuple[RGB, float]:
    """Parse an allowlisted colour value to ``(rgb, alpha)``."""
    value = value.strip()
    if value.startswith("#"):
        return _parse_hex(value)
    return _parse_func(value)


def _composite(rgb: RGB, alpha: float, background: RGB) -> RGB:
    if alpha >= 1:
        return rgb
    return tuple(round(c * alpha + bg * (1 - alpha)) for c, bg in zip(rgb, background, strict=True))  # type: ignore[return-value]


def _linear(channel: int) -> float:
    value = channel / 255
    return value / 12.92 if value <= 0.04045 else ((value + 0.055) / 1.055) ** 2.4


def luminance(rgb: RGB) -> float:
    return 0.2126 * _linear(rgb[0]) + 0.7152 * _linear(rgb[1]) + 0.0722 * _linear(rgb[2])


def contrast_ratio(a: RGB, b: RGB) -> float:
    high, low = sorted((luminance(a), luminance(b)), reverse=True)
    return (high + 0.05) / (low + 0.05)


def _rgb(value: str, background: RGB = (255, 255, 255)) -> RGB:
    rgb, alpha = parse_colour(value)
    return _composite(rgb, alpha, background)


def mix(a: RGB, b: RGB, share: float) -> RGB:
    """``color-mix(in srgb, a share%, b)``."""
    return tuple(round(a[i] * share + b[i] * (1 - share)) for i in range(3))  # type: ignore[return-value]


def to_hex(rgb: RGB) -> str:
    return "#{:02x}{:02x}{:02x}".format(*rgb)


def hue(value: str) -> float:
    rgb = _rgb(value)
    r, g, b = (channel / 255 for channel in rgb)
    return colorsys.rgb_to_hls(r, g, b)[0] * 360


def hue_distance(a: str, b: str) -> float:
    distance = abs(hue(a) - hue(b)) % 360
    return min(distance, 360 - distance)


def derive_ink(palette: dict[str, str], tone: str) -> str:
    """Readable ink for a filled tone: ``--ink`` or ``--bg-1``, whichever passes."""
    background = _rgb(palette["bg-1"])
    tone_rgb = _rgb(palette[tone], background)
    ink = palette["ink"]
    bg1 = palette["bg-1"]
    if contrast_ratio(_rgb(ink), tone_rgb) >= AA_RATIO:
        return ink
    if contrast_ratio(_rgb(bg1), tone_rgb) >= AA_RATIO:
        return bg1
    # Neither passes. Ship the better one so the pair check names the tone,
    # rather than silently leaving the key missing.
    return ink if contrast_ratio(_rgb(ink), tone_rgb) > contrast_ratio(_rgb(bg1), tone_rgb) else bg1


def derive_text(palette: dict[str, str], tone: str) -> str:
    """The tone mixed toward ``--ink`` until it clears AA on ``--bg-1``."""
    background = _rgb(palette["bg-1"])
    tone_rgb = _rgb(palette[tone], background)
    ink = _rgb(palette["ink"], background)
    for step in range(0, 101, 2):
        candidate = mix(tone_rgb, ink, 1 - step / 100)
        if contrast_ratio(candidate, background) >= DERIVE_AA_RATIO:
            return to_hex(candidate)
    return palette["ink"]


# --- contract checks ------------------------------------------------------


def _mode_label(mode_key: str) -> str:
    return "dark mode" if mode_key == "dark_mode" else "light mode"


def _check_api_version(manifest: dict[str, Any], errors: list[str]) -> None:
    api = manifest.get("theme_api")
    if api is None:
        return
    if isinstance(api, bool) or not isinstance(api, int):
        errors.append("theme_api must be an integer")
    elif api > THEME_API_VERSION:
        errors.append(f"theme_api {api} is newer than this Calvin supports ({THEME_API_VERSION})")


def _collect_palette(
    manifest: dict[str, Any], mode_key: str, check: ThemeCheck
) -> dict[str, str] | None:
    raw = manifest.get(mode_key)
    if raw is None:
        check.errors.append(f"it's missing the {_mode_label(mode_key)} palette")
        return None
    if not isinstance(raw, dict):
        check.errors.append(f"{mode_key} must be an object")
        return None

    palette: dict[str, str] = {}
    for key, value in raw.items():
        if key not in ALLOWED_COLOUR_KEYS:
            if key not in check.ignored_keys:
                check.ignored_keys.append(key)
            continue
        if not is_colour_value(value):
            check.errors.append(f"{key} in {_mode_label(mode_key)} is not a valid colour")
            continue
        palette[key] = value.strip()
    return palette


def _check_pairs(check: ThemeCheck, mode_key: str, palette: dict[str, str]) -> None:
    label = _mode_label(mode_key)
    background = _rgb(palette["bg-1"])

    for key in ("ink", "ink-2", "ink-3"):
        if contrast_ratio(_rgb(palette[key]), background) < AA_RATIO:
            check.errors.append(f"{key} is below AA on bg-1 in {label}")

    for tone in TONE_KEYS:
        tone_rgb = _rgb(palette[tone], background)
        ink_key = f"{tone}-ink"
        text_key = f"{tone}-text"
        if ink_key not in palette:
            palette[ink_key] = derive_ink(palette, tone)
        if text_key not in palette:
            palette[text_key] = derive_text(palette, tone)
        if contrast_ratio(_rgb(palette[ink_key], background), tone_rgb) < AA_RATIO:
            check.errors.append(f"{ink_key} is below AA on {tone} in {label}")
        if contrast_ratio(_rgb(palette[text_key], background), background) < AA_RATIO:
            check.errors.append(f"{text_key} is below AA on bg-1 in {label}")


def _check_hues(check: ThemeCheck, mode_key: str, palette: dict[str, str]) -> None:
    label = _mode_label(mode_key)
    for (first, second), minimum in HUE_RULES.items():
        distance = hue_distance(palette[first], palette[second])
        # Reported hues are whole degrees (the audit's "47°, Δ12°"), so compare
        # the rounded distance rather than failing on a 0.2° rounding artefact.
        if round(distance) < minimum:
            check.warnings.append(
                f"{first} and {second} are {round(distance)}° apart in {label} (minimum {minimum}°)"
            )


def check_theme(manifest: dict[str, Any]) -> ThemeCheck:
    """Check a theme manifest against theme_api 2 and normalise its palettes."""
    check = ThemeCheck()
    if not isinstance(manifest, dict):
        check.errors.append("theme.json must be an object")
        return check

    _check_api_version(manifest, check.errors)

    for mode_key in ("variables", "dark_mode"):
        palette = _collect_palette(manifest, mode_key, check)
        if palette is None:
            continue
        missing = [key for key in BASE_COLOUR_KEYS if key not in palette]
        for key in missing:
            check.errors.append(f"missing {key} in {_mode_label(mode_key)}")
        if not missing:
            _check_pairs(check, mode_key, palette)
            _check_hues(check, mode_key, palette)
        if mode_key == "variables":
            check.variables = palette
        else:
            check.dark_mode = palette

    if check.warnings:
        check.warnings = [HUE_WARNING, *check.warnings]

    return check


def install_error(manifest: dict[str, Any], check: ThemeCheck) -> str:
    """The one-line rejection shown to the user, naming the failing keys."""
    name = manifest.get("name") or manifest.get("id") or "This theme"
    return f"{name} can't be installed: " + "; ".join(check.errors)


def log_ignored_keys(manifest: dict[str, Any], check: ThemeCheck) -> None:
    if not check.ignored_keys:
        return
    name = manifest.get("name") or manifest.get("id") or "theme"
    logger.warning(
        f"Ignoring non-colour keys in theme {name}: {', '.join(sorted(check.ignored_keys))}"
    )


def decorate_theme(manifest: dict[str, Any]) -> dict[str, Any]:
    """Attach the load-time verdict the picker uses.

    An invalid installed theme is kept on disk but is not selectable; the
    frontend falls back to Calvin when it was the selected theme.
    """
    check = check_theme(manifest)
    decorated = dict(manifest)
    decorated["selectable"] = check.ok
    decorated["validation_errors"] = check.errors
    decorated["validation_warnings"] = check.warnings
    if not check.ok:
        name = manifest.get("name") or manifest.get("id") or "theme"
        logger.warning(f"Theme {name} is not selectable: {'; '.join(check.errors)}")
    return decorated
