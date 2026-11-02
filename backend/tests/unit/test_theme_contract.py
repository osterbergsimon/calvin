"""Tests for the theme_api 2 palette contract."""

import json
from pathlib import Path

import pytest
from loguru import logger

from app.config import BACKEND_DIR
from app.services.theme_contract import (
    AA_RATIO,
    BASE_COLOUR_KEYS,
    HUE_WARNING,
    check_theme,
    contrast_ratio,
    decorate_theme,
    derive_ink,
    derive_text,
    hue_distance,
    install_error,
    is_colour_value,
    log_ignored_keys,
    parse_colour,
)

BUILTIN = BACKEND_DIR / "data" / "themes" / "builtin.json"

LIGHT = {
    "bg-0": "#eef1f4",
    "bg-1": "#ffffff",
    "bg-2": "#ffffff",
    "line": "#dde3e8",
    "line-soft": "#e8edf1",
    "ink": "#1b242b",
    "ink-2": "#5d6b75",
    "ink-3": "#636e77",
    "focus": "#e08a1e",
    "ok": "#2e9e6b",
    "warn": "#b38f00",
    "err": "#c0392b",
    "shadow": "rgba(0, 0, 0, 0.1)",
    "shadow-hover": "rgba(0, 0, 0, 0.15)",
}
DARK = {
    "bg-0": "#0e1316",
    "bg-1": "#151c21",
    "bg-2": "#1d262d",
    "line": "#27313a",
    "line-soft": "#1e272e",
    "ink": "#eaf0f3",
    "ink-2": "#9aa7b0",
    "ink-3": "#818d96",
    "focus": "#f3b052",
    "ok": "#5bd0a0",
    "warn": "#ffd84d",
    "err": "#ef6b5e",
    "shadow": "rgba(0, 0, 0, 0.3)",
    "shadow-hover": "rgba(0, 0, 0, 0.4)",
}


def manifest(**overrides):
    data = {
        "id": "test_theme",
        "name": "Test Theme",
        "version": "1.0.0",
        "theme_api": 2,
        "variables": dict(LIGHT),
        "dark_mode": dict(DARK),
    }
    data.update(overrides)
    return data


class TestColourSyntax:
    @pytest.mark.parametrize(
        "value",
        [
            "#fff",
            "#ffffff",
            "#ffffffcc",
            "rgb(1, 2, 3)",
            "rgba(1, 2, 3, 0.5)",
            "hsl(120, 50%, 40%)",
            "hsla(120, 50%, 40%, 0.5)",
        ],
    )
    def test_allowed_values(self, value):
        assert is_colour_value(value)

    @pytest.mark.parametrize(
        "value",
        [
            "url(https://evil.example/a.png)",
            "var(--focus)",
            "expression(alert(1))",
            "red",
            "currentColor",
            "#12345",
            "rgb(1, 2, 3); color: red",
            "",
            None,
            42,
        ],
    )
    def test_rejected_values(self, value):
        assert not is_colour_value(value)

    def test_parses_hex_and_functions(self):
        assert parse_colour("#ffffff")[0] == (255, 255, 255)
        assert parse_colour("rgb(255, 0, 0)")[0] == (255, 0, 0)
        assert parse_colour("hsl(0, 100%, 50%)")[0] == (255, 0, 0)
        assert parse_colour("#00000080")[1] == pytest.approx(128 / 255)


class TestRequiredColours:
    def test_complete_palette_passes_and_derives_pairs(self):
        check = check_theme(manifest())
        assert check.errors == []
        assert check.warnings == []
        assert set(BASE_COLOUR_KEYS) <= set(check.variables)
        for tone in ("focus", "ok", "warn", "err"):
            assert f"{tone}-ink" in check.variables
            assert f"{tone}-text" in check.variables

    def test_missing_base_colour_names_key_and_mode(self):
        data = manifest()
        del data["dark_mode"]["bg-2"]
        check = check_theme(data)
        assert "missing bg-2 in dark mode" in check.errors
        assert install_error(data, check) == (
            "Test Theme can't be installed: missing bg-2 in dark mode"
        )

    def test_missing_whole_mode_is_rejected(self):
        data = manifest()
        del data["dark_mode"]
        check = check_theme(data)
        assert any("dark mode" in error for error in check.errors)

    @pytest.mark.parametrize("mode", ["variables", "dark_mode"])
    def test_bad_value_names_the_key(self, mode):
        data = manifest()
        data[mode]["focus"] = "url(https://evil.example/x)"
        check = check_theme(data)
        label = "dark mode" if mode == "dark_mode" else "light mode"
        assert f"focus in {label} is not a valid colour" in check.errors

    def test_non_colour_keys_are_ignored_not_rejected(self):
        data = manifest()
        data["variables"]["gap-4"] = "4rem"
        data["variables"]["z-modal"] = "9999"
        data["variables"]["bg-primary"] = "#123456"
        check = check_theme(data)
        assert check.errors == []
        assert set(check.ignored_keys) == {"gap-4", "z-modal", "bg-primary"}
        assert "gap-4" not in check.variables

    def test_ignored_keys_are_logged(self):
        messages = []
        sink = logger.add(lambda message: messages.append(message.record["message"]))
        try:
            log_ignored_keys(
                manifest(), check_theme({**manifest(), "variables": {**LIGHT, "gap-4": "1rem"}})
            )
        finally:
            logger.remove(sink)
        assert any("gap-4" in message for message in messages)

    def test_event_keys_are_optional(self):
        check = check_theme(manifest())
        assert not any(key.startswith("event-") for key in check.variables)

    def test_event_values_are_validated(self):
        data = manifest()
        data["variables"]["event-1"] = "var(--focus)"
        assert "event-1 in light mode is not a valid colour" in check_theme(data).errors


class TestPairs:
    def test_missing_pairs_are_derived_and_pass_aa(self):
        check = check_theme(manifest())
        assert check.errors == []
        for palette in (check.variables, check.dark_mode):
            background = parse_colour(palette["bg-1"])[0]
            for tone in ("focus", "ok", "warn", "err"):
                ink = parse_colour(palette[f"{tone}-ink"])[0]
                text = parse_colour(palette[f"{tone}-text"])[0]
                assert contrast_ratio(ink, parse_colour(palette[tone])[0]) >= AA_RATIO
                assert contrast_ratio(text, background) >= AA_RATIO

    def test_derivation_matches_the_helpers(self):
        palette = dict(LIGHT)
        assert derive_ink(palette, "warn") == palette["ink"]
        assert parse_colour(derive_text(palette, "focus"))[0] is not None

    def test_a_low_contrast_ink_pair_is_rejected(self):
        data = manifest()
        data["variables"]["ok-ink"] = "#2e9e6b"
        check = check_theme(data)
        assert "ok-ink is below AA on ok in light mode" in check.errors

    def test_a_low_contrast_text_pair_is_rejected(self):
        data = manifest()
        data["variables"]["err-text"] = "#ffcccc"
        check = check_theme(data)
        assert "err-text is below AA on bg-1 in light mode" in check.errors

    def test_surface_ink_below_aa_is_rejected(self):
        data = manifest()
        data["variables"]["ink-3"] = "#cccccc"
        check = check_theme(data)
        assert "ink-3 is below AA on bg-1 in light mode" in check.errors


class TestHueRule:
    def test_status_collision_warns_but_does_not_reject(self):
        data = manifest()
        data["variables"]["warn"] = data["variables"]["focus"]
        check = check_theme(data)
        assert check.errors == []
        assert check.warnings[0] == HUE_WARNING

    def test_hue_distance_wraps_around_360(self):
        assert hue_distance("#ff0000", "#ff00ff") == pytest.approx(60)

    def test_api_version_must_be_int_and_known(self):
        data = manifest(theme_api="2")
        assert "theme_api must be an integer" in check_theme(data).errors
        data = manifest(theme_api=99)
        assert any("newer than this Calvin supports" in e for e in check_theme(data).errors)

    def test_missing_api_version_still_checked(self):
        data = manifest()
        del data["theme_api"]
        assert check_theme(data).errors == []


class TestBuiltInThemes:
    """Every bundled theme must pass the same rules it applies to plugins."""

    def test_all_built_in_themes_pass_without_warnings(self):
        themes = json.loads(Path(BUILTIN).read_text())
        assert set(themes) == {"ocean", "forest", "sunset"}
        for theme_id, theme in themes.items():
            check = check_theme(theme)
            assert check.errors == [], (theme_id, check.errors)
            assert check.warnings == [], (theme_id, check.warnings)

    def test_built_in_themes_declare_theme_api_2(self):
        themes = json.loads(Path(BUILTIN).read_text())
        for theme in themes.values():
            assert theme["theme_api"] == 2

    def test_built_in_event_palettes_clear_aa_against_on_event_ink(self):
        themes = json.loads(Path(BUILTIN).read_text())
        white = (255, 255, 255)
        for theme_id, theme in themes.items():
            for mode in ("variables", "dark_mode"):
                palette = theme[mode]
                for i in range(1, 9):
                    key = f"event-{i}"
                    assert key in palette, (theme_id, mode, key)
                    assert contrast_ratio(parse_colour(palette[key])[0], white) >= AA_RATIO

    def test_decorate_marks_invalid_themes_unselectable(self):
        broken = manifest()
        broken["variables"]["bg-0"] = "url(https://evil.example/x)"
        decorated = decorate_theme(broken)
        assert decorated["selectable"] is False
        assert decorated["validation_errors"]
        assert decorate_theme(manifest())["selectable"] is True
