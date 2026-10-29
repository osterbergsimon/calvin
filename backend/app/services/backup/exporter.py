"""Build a backup zip from the running install."""

import io
import json
import socket
import zipfile
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from loguru import logger

from app import __version__
from app.config import settings
from app.models.db_models import ConfigDB, KeyboardMappingDB, KioskDB, PluginDB, PluginTypeDB

from .format import FORMAT_NAME, FORMAT_VERSION
from .secrets import strip_secrets

DOCUMENT_NAME = "backup.json"
SIGNING_KEY_NAME = "signing-key"
PLUGIN_PACKAGES = "packages/plugins"
THEME_PACKAGES = "packages/themes"

# Config keys that belong to this install (seed marker, backup schedule), not
# to the setup being backed up: never exported, and kept on a replace restore.
LOCAL_CONFIG_PREFIX = "backup_"

_SKIP_NAMES = {"__pycache__", ".git", ".DS_Store"}


@dataclass
class ExportOptions:
    include_packages: bool = True
    include_secrets: bool = True
    include_signing_key: bool = False


def _deploy_mode() -> str:
    if Path("/.dockerenv").exists():
        return "docker"
    return "dev" if settings.is_dev_mode else "host"


async def _schema_revision() -> str | None:
    import app.database as db_module

    try:
        row = await db_module.database.fetch_one("SELECT version_num FROM alembic_version")
        return row[0] if row else None
    except Exception:
        return None


def _class_schema(type_id: str, attr: str) -> dict[str, Any]:
    from app.plugins.loader import plugin_loader

    cls = plugin_loader.get_plugin_class(type_id)
    metadata = getattr(cls, "metadata", None) if cls else None
    return (getattr(metadata, attr, None) or {}) if metadata else {}


async def collect_document(options: ExportOptions) -> dict[str, Any]:
    """Read the setup from the DB into a backup document (no package files)."""
    stripped: list[dict[str, str]] = []

    config_rows = []
    for row in await ConfigDB.objects.all():
        if row.key.startswith(LOCAL_CONFIG_PREFIX):
            continue
        value = row.value
        if not options.include_secrets and row.key.startswith("plugin_") and value:
            type_id = row.key[len("plugin_") : -len("_config")]
            try:
                parsed = json.loads(value)
            except (TypeError, ValueError):
                parsed = None
            if row.key.endswith("_config") and isinstance(parsed, dict):
                clean, fields = strip_secrets(
                    parsed, _class_schema(type_id, "common_config_schema")
                )
                value = json.dumps(clean)
                stripped += [{"scope": "type_config", "id": type_id, "field": f} for f in fields]
        config_rows.append({"key": row.key, "value": value, "value_type": row.value_type})

    instances = []
    for inst in await PluginDB.objects.order_by("id").all():
        config = dict(inst.config or {})
        if not options.include_secrets:
            config, fields = strip_secrets(
                config, _class_schema(inst.type_id, "instance_config_schema")
            )
            stripped += [{"scope": "instance", "id": inst.id, "field": f} for f in fields]
        instances.append(
            {
                "id": inst.id,
                "type_id": inst.type_id,
                "plugin_type": inst.plugin_type,
                "name": inst.name,
                "enabled": inst.enabled,
                "config": config,
                "display_order": inst.display_order or 0,
            }
        )

    return {
        "format": FORMAT_NAME,
        "format_version": FORMAT_VERSION,
        "created_at": datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "calvin_version": __version__,
        "schema_revision": await _schema_revision(),
        "source": {"hostname": socket.gethostname(), "deploy": _deploy_mode()},
        "options": {
            "include_packages": options.include_packages,
            "include_secrets": options.include_secrets,
            "include_signing_key": options.include_signing_key,
        },
        "stripped_secrets": stripped,
        "packages": {"plugins": [], "themes": []},
        "data": {
            "config": config_rows,
            "keyboard_mappings": [
                {"key_code": r.key_code, "action": r.action}
                for r in await KeyboardMappingDB.objects.order_by("key_code").all()
            ],
            "plugin_types": [
                {
                    "type_id": r.type_id,
                    "plugin_type": r.plugin_type,
                    "enabled": r.enabled,
                    "common_config_schema": r.common_config_schema or {},
                }
                for r in await PluginTypeDB.objects.order_by("type_id").all()
            ],
            "plugin_instances": instances,
            "kiosks": [
                {"id": r.id, "hostname": r.hostname, "overrides": r.overrides or {}}
                for r in await KioskDB.objects.order_by("id").all()
            ],
        },
    }


def _installed_packages() -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    from app.services.plugin_installer import plugin_installer
    from app.services.theme_installer import theme_installer

    return plugin_installer.get_installed_plugins(), theme_installer.get_installed_themes()


def _add_tree(zf: zipfile.ZipFile, root: Path, prefix: str) -> None:
    for path in sorted(root.rglob("*")):
        rel = path.relative_to(root)
        if any(part in _SKIP_NAMES for part in rel.parts) or path.suffix == ".pyc":
            continue
        if path.is_file() and not path.is_symlink():
            zf.write(path, f"{prefix}/{rel.as_posix()}")


async def export_backup(options: ExportOptions | None = None) -> bytes:
    """Return a complete backup zip as bytes."""
    options = options or ExportOptions()
    document = await collect_document(options)

    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as zf:
        if options.include_packages:
            plugins, themes = _installed_packages()
            for manifest, prefix, key in (
                *((m, PLUGIN_PACKAGES, "plugins") for m in plugins),
                *((m, THEME_PACKAGES, "themes") for m in themes),
            ):
                package_id = manifest.get("id")
                path = Path(manifest.get("_installed_path", ""))
                if not package_id or not path.is_dir():
                    continue
                _add_tree(zf, path, f"{prefix}/{package_id}")
                document["packages"][key].append(
                    {"id": package_id, "version": manifest.get("version")}
                )
        if options.include_signing_key:
            key_path = Path(settings.kiosk_signing_key_path)
            if key_path.is_file():
                zf.writestr(SIGNING_KEY_NAME, key_path.read_text().strip() + "\n")
            else:
                logger.warning(f"No kiosk signing key at {key_path}; backup has none")
                document["options"]["include_signing_key"] = False
        zf.writestr(DOCUMENT_NAME, json.dumps(document, indent=2, sort_keys=True))
    return buffer.getvalue()


def backup_filename(kind: str = "calvin-backup") -> str:
    """``<kind>-<host>-<UTC timestamp>.zip``"""
    host = "".join(c if c.isalnum() or c in "-_" else "-" for c in socket.gethostname())
    stamp = datetime.now(UTC).strftime("%Y%m%d-%H%M%S-%f")
    return f"{kind}-{host or 'calvin'}-{stamp}.zip"
