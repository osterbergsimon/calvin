"""Folder names inside Local photos (calvin-mwqo).

A folder is one path segment under the image dir: no separators, not hidden,
and never the plugin's own ``thumbnails`` directory.
"""

import re

MAX_FOLDER_LEN = 40
_FOLDER_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9 _-]*$")
# Local photos keeps its thumbnails in this subfolder of the image dir.
RESERVED_FOLDERS = frozenset({"thumbnails"})


class InvalidFolder(ValueError):  # noqa: N818 - mirrors DuplicateKeyName naming
    """The folder name is empty, too long, hidden, reserved or has separators."""


def normalize_folder(raw: str) -> str:
    """Return a safe single-segment folder name inside Local photos, or raise."""
    name = (raw or "").strip()
    if (
        not name
        or len(name) > MAX_FOLDER_LEN
        or not _FOLDER_RE.match(name)
        or name.casefold() in RESERVED_FOLDERS
    ):
        raise InvalidFolder(raw)
    return name
