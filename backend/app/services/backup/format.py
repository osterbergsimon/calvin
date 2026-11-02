"""The backup document: shape, version check and migrations."""

from collections.abc import Callable
from typing import Any

from pydantic import BaseModel, ConfigDict, ValidationError

FORMAT_NAME = "calvin-backup"
FORMAT_VERSION = 1

# MIGRATIONS[n] upgrades a raw version-n document to version n+1.
MIGRATIONS: dict[int, Callable[[dict[str, Any]], dict[str, Any]]] = {}


class BackupError(ValueError):
    """The file is not a backup this Calvin can restore."""


class _Lenient(BaseModel):
    # Unknown keys (from a newer DB schema) are ignored, not rejected.
    model_config = ConfigDict(extra="ignore")


class ConfigRow(_Lenient):
    key: str
    value: str | None = None
    value_type: str = "string"


class KeyboardMapping(_Lenient):
    key_code: str
    action: str


class PluginTypeRow(_Lenient):
    type_id: str
    plugin_type: str = "unknown"
    enabled: bool = False
    common_config_schema: dict[str, Any] | None = None


class PluginInstanceRow(_Lenient):
    id: str
    type_id: str
    plugin_type: str = "unknown"
    name: str
    enabled: bool = True
    config: dict[str, Any] = {}
    display_order: int = 0


class KioskRow(_Lenient):
    id: str
    hostname: str | None = None
    overrides: dict[str, Any] | None = None


class StrippedSecret(_Lenient):
    scope: str  # "instance" | "type_config"
    id: str
    field: str


class PackageRef(_Lenient):
    id: str
    version: str | None = None


class Packages(_Lenient):
    plugins: list[PackageRef] = []
    themes: list[PackageRef] = []


class BackupData(_Lenient):
    config: list[ConfigRow] = []
    keyboard_mappings: list[KeyboardMapping] = []
    plugin_types: list[PluginTypeRow] = []
    plugin_instances: list[PluginInstanceRow] = []
    kiosks: list[KioskRow] = []


class BackupDocument(_Lenient):
    format: str
    format_version: int
    created_at: str | None = None
    calvin_version: str | None = None
    schema_revision: str | None = None
    source: dict[str, Any] = {}
    options: dict[str, Any] = {}
    stripped_secrets: list[StrippedSecret] = []
    packages: Packages = Packages()
    data: BackupData = BackupData()


def load_document(raw: Any) -> BackupDocument:
    """Validate a raw backup document, migrating it to the current version.

    Raises BackupError with a message fit for the user.
    """
    if not isinstance(raw, dict) or raw.get("format") != FORMAT_NAME:
        raise BackupError("Not a Calvin backup: the file has no calvin-backup header.")
    version = raw.get("format_version")
    if not isinstance(version, int) or isinstance(version, bool):
        raise BackupError("Not a Calvin backup: format_version is missing or invalid.")
    if version > FORMAT_VERSION:
        raise BackupError(
            f"This backup was made by a newer Calvin (backup format {version}, this Calvin "
            f"reads up to {FORMAT_VERSION}). Upgrade Calvin, then restore."
        )
    while version < FORMAT_VERSION:
        migrate = MIGRATIONS.get(version)
        if migrate is None:
            raise BackupError(
                f"Backup format {version} is too old: no migration to format {version + 1}."
            )
        raw = migrate(dict(raw))
        version += 1
        raw["format_version"] = version
    try:
        return BackupDocument.model_validate(raw)
    except ValidationError as exc:
        first = exc.errors()[0]
        where = ".".join(str(p) for p in first["loc"])
        raise BackupError(f"Backup file is damaged: {where}: {first['msg']}") from exc
