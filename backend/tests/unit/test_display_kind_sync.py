"""Kind-sync test: backend kind sets == frontend rendererRegistry.js.

The backend rejects unknown display kinds at plugin load; the frontend
dispatches kinds to Vue renderers. These two lists used to be hand-synced.
This test parses rendererRegistry.js so they can never drift again — if you
add/remove a renderer, both sides must change together or this fails.
"""

import re
from pathlib import Path

from app.plugins.definitions import SUPPORTED_DISPLAY_KINDS, SUPPORTED_STATUSBAR_KINDS

REGISTRY_PATH = (
    Path(__file__).resolve().parents[3]
    / "frontend"
    / "src"
    / "components"
    / "plugins"
    / "rendererRegistry.js"
)


def _js_object_keys(source: str, declaration: str) -> set[str]:
    """Extract the top-level keys of `export const <declaration> = { ... }`."""
    match = re.search(rf"export const {declaration}\s*=\s*\{{(.*?)\n\}};", source, re.DOTALL)
    assert match, f"could not find `export const {declaration}` in rendererRegistry.js"
    body = match.group(1)
    keys = set()
    for line in body.splitlines():
        key_match = re.match(r'\s*(?:"([^"]+)"|([A-Za-z_$][\w$]*))\s*:', line)
        if key_match:
            keys.add(key_match.group(1) or key_match.group(2))
    return keys


def _js_string_array(source: str, declaration: str) -> set[str]:
    """Extract string entries of `export const <declaration> = Object.freeze([...])`."""
    match = re.search(rf"export const {declaration}\s*=\s*Object\.freeze\(\[(.*?)\]\)", source, re.DOTALL)
    assert match, f"could not find `export const {declaration}` in rendererRegistry.js"
    return set(re.findall(r'"([^"]+)"', match.group(1)))


def test_registry_file_exists():
    assert REGISTRY_PATH.exists(), f"rendererRegistry.js not found at {REGISTRY_PATH}"


def test_panel_kinds_in_sync():
    source = REGISTRY_PATH.read_text(encoding="utf-8")
    frontend_kinds = _js_object_keys(source, "renderers")
    assert frontend_kinds == SUPPORTED_DISPLAY_KINDS, (
        "Panel kind lists have drifted.\n"
        f"  backend-only:  {sorted(SUPPORTED_DISPLAY_KINDS - frontend_kinds)}\n"
        f"  frontend-only: {sorted(frontend_kinds - SUPPORTED_DISPLAY_KINDS)}"
    )


def test_statusbar_kinds_in_sync():
    source = REGISTRY_PATH.read_text(encoding="utf-8")
    frontend_kinds = _js_string_array(source, "SUPPORTED_STATUSBAR_KINDS")
    assert frontend_kinds == SUPPORTED_STATUSBAR_KINDS, (
        "Statusbar kind lists have drifted.\n"
        f"  backend-only:  {sorted(SUPPORTED_STATUSBAR_KINDS - frontend_kinds)}\n"
        f"  frontend-only: {sorted(frontend_kinds - SUPPORTED_STATUSBAR_KINDS)}"
    )


def test_statusbar_kinds_subset_of_registry():
    """Every statusbar kind must have a renderer registered."""
    source = REGISTRY_PATH.read_text(encoding="utf-8")
    frontend_kinds = _js_object_keys(source, "renderers")
    assert SUPPORTED_STATUSBAR_KINDS <= frontend_kinds
