"""Persistent disk cache for plugin image scan results.

Allows image plugins to survive restarts without re-hitting remote APIs.
Usage in a plugin's initialize() and scan_images():

    from app.plugins.utils.scan_cache import load_scan_cache, save_scan_cache

    # In initialize():
    self._images, self._last_scan = load_scan_cache(self.plugin_id)

    # At the end of scan_images() after a successful fetch:
    save_scan_cache(self.plugin_id, self._images)
"""

import json
import re
from datetime import datetime
from pathlib import Path
from typing import Any

from loguru import logger

from app.config import settings

# Instance ids become a directory name under plugins_dir: no separators,
# no "..", nothing that could step outside it. (calvin-u7l)
_SAFE_ID_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_.-]*$")


def _cache_path(plugin_id: str) -> Path | None:
    if not _SAFE_ID_RE.match(plugin_id) or ".." in plugin_id:
        logger.warning("Refusing scan cache for unsafe plugin id {!r}", plugin_id)
        return None
    return settings.plugins_dir / plugin_id / "scan_cache.json"


def load_scan_cache(plugin_id: str) -> tuple[list[dict[str, Any]], datetime | None]:
    """Load persisted scan results. Returns (images, last_scan_time) or ([], None)."""
    path = _cache_path(plugin_id)
    if path is None or not path.exists():
        return [], None
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        last_scan = datetime.fromisoformat(data["last_scan"])
        images = data["images"]
        logger.debug("Loaded {} scan cache entries for {}", len(images), plugin_id)
        return images, last_scan
    except Exception as e:
        logger.warning("Failed to load scan cache for {}: {}", plugin_id, e)
        return [], None


def save_scan_cache(plugin_id: str, images: list[dict[str, Any]]) -> None:
    """Persist scan results to disk for a plugin."""
    path = _cache_path(plugin_id)
    if path is None:
        return
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(
            json.dumps({"last_scan": datetime.now().isoformat(), "images": images}),
            encoding="utf-8",
        )
        logger.debug("Saved {} scan cache entries for {}", len(images), plugin_id)
    except Exception as e:
        logger.warning("Failed to save scan cache for {}: {}", plugin_id, e)
