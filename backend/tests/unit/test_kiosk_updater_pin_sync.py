"""Pin-sync test: BUNDLE_FILES == the files update-kiosk.sh agrees to install.

The kiosk updater only installs the bundle files it knows, each at its own path
and mode, and only restarts known units (audit K7). That table lives in bash, in
``pinned_entry()``/``KNOWN_UNITS`` of deploy/kiosk-agent/update-kiosk.sh. This
test parses it so the two sides cannot drift: add a bundle file and the updater
must learn it in the same change.
"""

import re
from pathlib import Path

from app.services.kiosk_bundle import BUNDLE_FILES

UPDATER_PATH = Path(__file__).resolve().parents[3] / "deploy" / "kiosk-agent" / "update-kiosk.sh"
DIRS = {
    "$BIN_DIR": "/usr/local/bin",
    "$SYSTEMD_DIR": "/etc/systemd/system",
    "$LABWC_DIR": "/home/calvin/.config/labwc",
}


def _pinned_table() -> dict[str, tuple[str, str]]:
    """name -> (target dir, mode) from the updater's pinned_entry() case."""
    source = UPDATER_PATH.read_text()
    body = re.search(r"pinned_entry\(\) \{.*?\n  case \"\$1\" in\n(.*?)\n  esac", source, re.DOTALL)
    assert body, "could not find pinned_entry() in update-kiosk.sh"
    table: dict[str, tuple[str, str]] = {}
    for names, target_dir, mode in re.findall(
        r"^\s*([\w.|-]+)\) echo \"(\$\w+) (\d{4})\" ;;", body.group(1), re.MULTILINE
    ):
        for name in names.split("|"):
            table[name] = (DIRS[target_dir], mode)
    return table


def _known_units() -> set[str]:
    match = re.search(r'^KNOWN_UNITS=" (.*) "$', UPDATER_PATH.read_text(), re.MULTILINE)
    assert match, "could not find KNOWN_UNITS in update-kiosk.sh"
    return set(match.group(1).split())


def test_every_bundle_file_is_pinned_at_its_path_and_mode() -> None:
    table = _pinned_table()
    assert set(table) == {bf.name for bf in BUNDLE_FILES}
    for bf in BUNDLE_FILES:
        target_dir, mode = table[bf.name]
        assert bf.target_path == f"{target_dir}/{bf.name}", bf.name
        assert bf.mode == mode, bf.name


def test_restart_and_enable_units_are_known_to_the_updater() -> None:
    units = _known_units()
    for bf in BUNDLE_FILES:
        if bf.restart_unit:
            assert bf.restart_unit in units, bf.name
        if bf.enable:
            assert bf.name in units, bf.name
