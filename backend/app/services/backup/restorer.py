"""Validate, preview and apply a backup."""

import asyncio
import io
import json
import os
import shutil
import tempfile
import zipfile
from dataclasses import dataclass, field
from pathlib import Path, PurePosixPath
from typing import Any

from loguru import logger

from app.config import settings
from app.models.db_models import ConfigDB, KioskDB, PluginDB, PluginTypeDB
from app.utils.db_retry import retry_on_db_locked

from .exporter import (
    DOCUMENT_NAME,
    LOCAL_CONFIG_PREFIX,
    PLUGIN_PACKAGES,
    SIGNING_KEY_NAME,
    THEME_PACKAGES,
)
from .format import BackupDocument, BackupError, PluginInstanceRow, load_document
from .secrets import refill_secrets

MODES = ("replace", "merge")
MAX_UNCOMPRESSED_BYTES = 512 * 1024 * 1024

# One restore at a time; the scheduled backup job takes it too.
restore_lock = asyncio.Lock()


class BackupBusyError(RuntimeError):
    """Another restore (or backup job) is running."""


@dataclass
class LoadedBackup:
    """A validated backup, with its package files extracted to a temp dir."""

    document: BackupDocument
    workdir: Path | None = None
    signing_key: str | None = None

    def plugin_package(self, package_id: str) -> Path | None:
        path = self.workdir / PLUGIN_PACKAGES / package_id if self.workdir else None
        return path if path and (path / "plugin.json").is_file() else None

    def theme_package(self, theme_id: str) -> Path | None:
        path = self.workdir / THEME_PACKAGES / theme_id if self.workdir else None
        return path if path and (path / "theme.json").is_file() else None

    def cleanup(self) -> None:
        if self.workdir:
            shutil.rmtree(self.workdir, ignore_errors=True)
            self.workdir = None

    def __enter__(self) -> "LoadedBackup":
        return self

    def __exit__(self, *exc: object) -> None:
        self.cleanup()


def _safe_member(name: str) -> bool:
    path = PurePosixPath(name)
    return not path.is_absolute() and ".." not in path.parts and "\\" not in name


def read_backup(data: bytes) -> LoadedBackup:
    """Parse a backup zip or a bare backup.json. Raises BackupError."""
    buffer = io.BytesIO(data)
    if not zipfile.is_zipfile(buffer):
        try:
            raw = json.loads(data.decode("utf-8"))
        except (UnicodeDecodeError, ValueError) as exc:
            raise BackupError("Not a Calvin backup: expected a .zip or .json backup file.") from exc
        return LoadedBackup(document=load_document(raw))

    try:
        with zipfile.ZipFile(buffer) as zf:
            members = zf.infolist()
            if any(not _safe_member(m.filename) for m in members):
                raise BackupError("Backup file is unsafe: it contains paths outside the backup.")
            if sum(m.file_size for m in members) > MAX_UNCOMPRESSED_BYTES:
                raise BackupError("Backup file is too large to restore.")
            names = {m.filename for m in members}
            if DOCUMENT_NAME not in names:
                raise BackupError("Not a Calvin backup: backup.json is missing from the zip.")
            try:
                raw = json.loads(zf.read(DOCUMENT_NAME))
            except ValueError as exc:
                raise BackupError("Backup file is damaged: backup.json is not valid JSON.") from exc
            loaded = LoadedBackup(document=load_document(raw))
            if SIGNING_KEY_NAME in names:
                try:
                    key = zf.read(SIGNING_KEY_NAME).decode().strip()
                    if len(bytes.fromhex(key)) != 32:
                        raise ValueError
                except ValueError as exc:  # includes UnicodeDecodeError
                    raise BackupError("Backup file is damaged: invalid kiosk signing key.") from exc
                loaded.signing_key = key
            packages = [m for m in members if m.filename.startswith("packages/")]
            if packages:
                loaded.workdir = Path(tempfile.mkdtemp(prefix="calvin-restore-"))
                try:
                    for member in packages:
                        zf.extract(member, loaded.workdir)
                except (zipfile.BadZipFile, OSError) as exc:
                    loaded.cleanup()
                    raise BackupError(
                        f"Backup file is damaged: {member.filename} cannot be extracted."
                    ) from exc
    except zipfile.BadZipFile as exc:
        raise BackupError("Backup file is damaged: not a readable zip.") from exc

    for ref in loaded.document.packages.plugins:
        if not loaded.plugin_package(ref.id):
            loaded.cleanup()
            raise BackupError(f"Backup file is damaged: plugin package {ref.id} is incomplete.")
    return loaded


def _installed_versions() -> tuple[dict[str, str | None], dict[str, str | None]]:
    from app.services.plugin_installer import plugin_installer
    from app.services.theme_installer import theme_installer

    plugins = {m["id"]: m.get("version") for m in plugin_installer.get_installed_plugins()}
    themes = {m["id"]: m.get("version") for m in theme_installer.get_installed_themes()}
    return plugins, themes


async def plan_restore(loaded: LoadedBackup, mode: str = "replace") -> dict[str, Any]:
    """Describe what a restore would do. Writes nothing."""
    from app.plugins.loader import plugin_loader

    if mode not in MODES:
        raise BackupError(f"Unknown restore mode {mode!r}; use replace or merge.")
    doc = loaded.document
    data = doc.data
    warnings: list[str] = []

    installed_plugins, installed_themes = _installed_versions()
    install, version_mismatch = [], []
    for ref in doc.packages.plugins:
        if ref.id not in installed_plugins:
            install.append(ref.id)
        elif installed_plugins[ref.id] != ref.version:
            version_mismatch.append(
                {"id": ref.id, "backup": ref.version, "installed": installed_plugins[ref.id]}
            )
    themes_install = [t.id for t in doc.packages.themes if t.id not in installed_themes]
    for item in version_mismatch:
        warnings.append(
            f"Plugin {item['id']} is installed at version {item['installed']}; the backup has "
            f"{item['backup']}. The installed version is kept."
        )

    existing = {row.id: row for row in await PluginDB.objects.all()}
    backup_ids = {i.id for i in data.plugin_instances}
    create, update, skip = [], [], []
    for inst in data.plugin_instances:
        loadable = (
            plugin_loader.get_plugin_class(inst.type_id) is not None or inst.type_id in install
        )
        if not loadable:
            skip.append(
                {
                    "id": inst.id,
                    "type_id": inst.type_id,
                    "reason": f"plugin {inst.type_id} is not installed and not in the backup",
                }
            )
        elif inst.id in existing:
            update.append(inst.id)
        else:
            create.append(inst.id)
    for skipped in skip:
        warnings.append(f"Instance {skipped['id']} will be kept switched off: {skipped['reason']}.")
    remove = sorted(set(existing) - backup_ids) if mode == "replace" else []

    current_config = {
        row.key: row.value
        for row in await ConfigDB.objects.all()
        if not row.key.startswith(LOCAL_CONFIG_PREFIX)
    }
    backup_config = {c.key: c.value for c in data.config}
    config_summary = {
        "added": sum(1 for k in backup_config if k not in current_config),
        "changed": sum(
            1 for k, v in backup_config.items() if k in current_config and current_config[k] != v
        ),
        "removed": (
            sum(1 for k in current_config if k not in backup_config) if mode == "replace" else 0
        ),
    }

    if doc.stripped_secrets:
        warnings.append(
            "This backup was made without passwords and API keys; instances that need them "
            "are restored disabled until you fill them in."
        )

    return {
        "mode": mode,
        "format_version": doc.format_version,
        "created_at": doc.created_at,
        "calvin_version": doc.calvin_version,
        "schema_revision": doc.schema_revision,
        "source": doc.source,
        "counts": {
            "config": len(data.config),
            "keyboard_mappings": len(data.keyboard_mappings),
            "plugin_types": len(data.plugin_types),
            "plugin_instances": len(data.plugin_instances),
            "kiosks": len(data.kiosks),
        },
        "packages": {
            "install": install,
            "themes_install": themes_install,
            "version_mismatch": version_mismatch,
        },
        "instances": {"create": create, "update": update, "remove": remove, "skip": skip},
        "config": config_summary,
        "kiosks": [k.id for k in data.kiosks],
        "stripped_secrets": [s.model_dump() for s in doc.stripped_secrets],
        "signing_key": loaded.signing_key is not None,
        "warnings": warnings,
    }


# --------------------------------------------------------------------------
# Apply
# --------------------------------------------------------------------------


@dataclass
class _Outcome:
    installed: list[str] = field(default_factory=list)
    created: list[str] = field(default_factory=list)
    updated: list[str] = field(default_factory=list)
    removed: list[str] = field(default_factory=list)
    skipped: list[str] = field(default_factory=list)
    needs_credentials: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
    errors: list[str] = field(default_factory=list)


async def _install_packages(loaded: LoadedBackup, plan: dict[str, Any], out: _Outcome) -> None:
    from app.api.routes.plugins.themes import _register_theme_in_db
    from app.plugins.loader import plugin_loader
    from app.plugins.registry.loader import load_plugin_types_for_single
    from app.services.plugin_installer import plugin_installer
    from app.services.theme_installer import theme_installer

    for package_id in plan["packages"]["install"]:
        source = loaded.plugin_package(package_id)
        if source is None:
            out.errors.append(f"Plugin {package_id} is listed but its files are missing.")
            continue
        try:
            # Sync and may run pip: keep it off the event loop.
            await asyncio.to_thread(plugin_installer.install_plugin, source, package_id)
        except Exception as exc:
            out.errors.append(f"Plugin {package_id} could not be installed: {exc}")
            continue
        plugin_loader.load_installed_plugins()
        load_error = plugin_loader.get_load_error(package_id)
        if load_error:
            out.errors.append(f"Plugin {package_id} installed but failed to load: {load_error}")
            continue
        for type_id in plugin_loader.installed_plugin_type_ids(package_id) or {package_id}:
            await load_plugin_types_for_single(type_id)
        out.installed.append(package_id)

    for theme_id in plan["packages"]["themes_install"]:
        source = loaded.theme_package(theme_id)
        if source is None:
            out.warnings.append(f"Theme {theme_id} is listed but its files are missing.")
            continue
        try:
            manifest = await asyncio.to_thread(theme_installer.install_theme, source, theme_id)
            await _register_theme_in_db(manifest)
            out.installed.append(theme_id)
        except Exception as exc:
            out.errors.append(f"Theme {theme_id} could not be installed: {exc}")


@retry_on_db_locked(max_retries=5)
async def _restore_config(doc: BackupDocument, mode: str) -> None:
    rows = {c.key: c for c in doc.data.config if not c.key.startswith(LOCAL_CONFIG_PREFIX)}
    stripped: dict[str, set[str]] = {}
    for secret in doc.stripped_secrets:
        if secret.scope == "type_config":
            stripped.setdefault(f"plugin_{secret.id}_config", set()).add(secret.field)
    for existing in await ConfigDB.objects.all():
        wanted = rows.pop(existing.key, None)
        if wanted is None:
            if mode == "replace" and not existing.key.startswith(LOCAL_CONFIG_PREFIX):
                await existing.delete()
            continue
        value = wanted.value
        if existing.key in stripped and value and existing.value:
            # A secret left out of the backup never blanks the one already here.
            try:
                refilled, _ = refill_secrets(
                    json.loads(value), json.loads(existing.value), stripped[existing.key]
                )
                value = json.dumps(refilled)
            except (TypeError, ValueError, AttributeError):
                pass
        existing.value = value
        existing.value_type = wanted.value_type
        await existing.update()
    for row in rows.values():
        await ConfigDB.objects.create(key=row.key, value=row.value, value_type=row.value_type)


@retry_on_db_locked(max_retries=5)
async def _restore_keyboard(doc: BackupDocument, mode: str) -> None:
    from app.services.keyboard_mapping_service import keyboard_mapping_service

    mappings = {m.key_code: m.action for m in doc.data.keyboard_mappings}
    if mode == "replace":
        await keyboard_mapping_service.set_mappings(mappings)
    else:
        for key_code, action in mappings.items():
            await keyboard_mapping_service.set_mapping(key_code, action)


@retry_on_db_locked(max_retries=5)
async def _restore_plugin_types(doc: BackupDocument, out: _Outcome) -> None:
    from app.plugins.registry.loader import load_plugin_types_for_single

    for row in doc.data.plugin_types:
        db_type = await PluginTypeDB.objects.get_or_none(type_id=row.type_id)
        if db_type is None:
            await load_plugin_types_for_single(row.type_id)
            db_type = await PluginTypeDB.objects.get_or_none(type_id=row.type_id)
        if db_type is None:
            out.warnings.append(
                f"Plugin type {row.type_id} is not available; its settings were skipped."
            )
            continue
        db_type.enabled = row.enabled
        db_type.common_config_schema = {
            **(db_type.common_config_schema or {}),
            **(row.common_config_schema or {}),
        }
        await db_type.save_with_timestamp()


@retry_on_db_locked(max_retries=5)
async def _restore_kiosks(doc: BackupDocument) -> None:
    # Always merged: kiosks re-register on their next poll anyway.
    for row in doc.data.kiosks:
        existing = await KioskDB.objects.get_or_none(id=row.id)
        if existing is None:
            await KioskDB.objects.create(id=row.id, hostname=row.hostname, overrides=row.overrides)
        else:
            existing.hostname = row.hostname or existing.hostname
            existing.overrides = row.overrides
            await existing.update()


async def _migrate_room_name(out: _Outcome) -> None:
    """Move a restored global room name onto the screens (calvin-al91).

    A backup taken before CLV-111 still carries the global ``displayName``;
    without this it would sit there until the next restart or new screen.
    Runs after config and kiosks are restored. Best effort: the restore has
    already been applied, so a failure is a warning, and startup retries it.
    """
    from app.services.kiosk_registry import migrate_global_room_name

    try:
        await migrate_global_room_name()
    except Exception as exc:  # noqa: BLE001 - the restore itself succeeded
        logger.warning(f"Could not move the restored room name onto the screens: {exc}")
        out.warnings.append(
            "The backup's room name could not be copied to the screens; "
            "it will be retried at the next restart."
        )


async def _migrate_screen_controls(out: _Outcome) -> None:
    """Copy a restored global show-UI setting onto the screens (calvin-hi6w).

    A backup taken before the controls became per-screen only carries the
    household-wide keys. A screen with an own value keeps it; the others adopt
    the restored global one now instead of waiting for a restart or a new
    registration. Runs after config and kiosks are restored. Best effort: the
    restore has already been applied, so a failure is a warning and startup
    retries it.
    """
    from app.services.kiosk_registry import migrate_global_screen_controls

    try:
        await migrate_global_screen_controls()
    except Exception as exc:  # noqa: BLE001 - the restore itself succeeded
        logger.warning(f"Could not copy the restored screen controls onto the screens: {exc}")
        out.warnings.append(
            "The backup's screen controls could not be copied to the screens; "
            "it will be retried at the next restart."
        )


async def _stop_and_unregister(instance_id: str) -> None:
    from app.plugins.manager import plugin_manager
    from app.plugins.protocols import BackendPlugin
    from app.services.backend_scheduler import backend_plugin_scheduler

    plugin = plugin_manager.get_plugin(instance_id)
    if not plugin:
        return
    try:
        if plugin.is_running():
            plugin.stop()
            if isinstance(plugin, BackendPlugin):
                await backend_plugin_scheduler.unregister_plugin_tasks(instance_id)
            await plugin.cleanup()
    except Exception as exc:
        logger.warning(f"Error stopping instance {instance_id} during restore: {exc}")
    await plugin_manager.unregister(instance_id)


@retry_on_db_locked(max_retries=5)
async def _delete_instance_row(instance_id: str) -> None:
    row = await PluginDB.objects.get_or_none(id=instance_id)
    if row:
        await row.delete()


@retry_on_db_locked(max_retries=5)
async def _write_disabled_row(inst: PluginInstanceRow, config: dict[str, Any]) -> None:
    row = await PluginDB.objects.get_or_none(id=inst.id)
    if row is None:
        await PluginDB.objects.create(
            id=inst.id,
            type_id=inst.type_id,
            plugin_type=inst.plugin_type,
            name=inst.name,
            enabled=False,
            config=config,
            display_order=inst.display_order,
        )
        return
    row.type_id = inst.type_id
    row.name = inst.name
    row.enabled = False
    row.config = config
    row.display_order = inst.display_order
    await row.save_with_timestamp()


@retry_on_db_locked(max_retries=5)
async def _set_display_order(instance_id: str, display_order: int) -> None:
    row = await PluginDB.objects.get_or_none(id=instance_id)
    if row and row.display_order != display_order:
        row.display_order = display_order
        await row.save_with_timestamp()


async def _restore_instances(
    doc: BackupDocument, plan: dict[str, Any], mode: str, out: _Outcome
) -> None:
    from app.plugins.loader import plugin_loader
    from app.plugins.utils.instance_manager import apply_plugin_config_update

    for instance_id in plan["instances"]["remove"]:
        await _stop_and_unregister(instance_id)
        await _delete_instance_row(instance_id)
        out.removed.append(instance_id)

    stripped: dict[str, set[str]] = {}
    for secret in doc.stripped_secrets:
        if secret.scope == "instance":
            stripped.setdefault(secret.id, set()).add(secret.field)

    for inst in doc.data.plugin_instances:
        existing = await PluginDB.objects.get_or_none(id=inst.id)
        if existing and existing.type_id != inst.type_id:
            await _stop_and_unregister(inst.id)
            await _delete_instance_row(inst.id)
            existing = None

        # A secret left out of the backup never blanks the one already here;
        # one we cannot fill keeps the instance off until it is entered.
        config, missing = refill_secrets(
            inst.config, existing.config if existing else None, stripped.get(inst.id, set())
        )
        if missing:
            out.needs_credentials.append(inst.id)

        if plugin_loader.get_plugin_class(inst.type_id) is None:
            # Keep it, off, so installing the plugin later brings it back.
            await _write_disabled_row(inst, config)
            out.skipped.append(inst.id)
            out.warnings.append(
                f"Instance {inst.id} was kept switched off: plugin {inst.type_id} is not available."
            )
            continue

        db_type = await PluginTypeDB.objects.get_or_none(type_id=inst.type_id)
        try:
            result = await apply_plugin_config_update(
                inst.type_id,
                {
                    **config,
                    "_instance_id": inst.id,
                    "_instance_name": inst.name,
                    "_instance_enabled": inst.enabled and not missing,
                },
                None,
                db_type,
            )
        except Exception as exc:
            logger.exception("Restoring instance {} failed", inst.id)
            result = {"error": str(exc)}

        restored_id = (result or {}).get("instance_id")
        if restored_id and not (result or {}).get("error"):
            if restored_id != inst.id:
                out.warnings.append(
                    f"Instance {inst.id} was restored as {restored_id} (single-instance plugin); "
                    "screens that referenced the old id need to be pointed at it."
                )
            await _set_display_order(restored_id, inst.display_order)
            (out.updated if existing else out.created).append(restored_id)
            continue

        # Config rejected by the plugin or the instance failed to start: keep
        # it, disabled, under the same id so the layout still points at it.
        await _stop_and_unregister(inst.id)
        await _write_disabled_row(inst, config)
        (out.updated if existing else out.created).append(inst.id)
        if not missing:
            reason = (result or {}).get("error") or "its settings did not pass validation"
            out.warnings.append(f"Instance {inst.id} was restored disabled: {reason}.")


def _write_signing_key(key: str) -> None:
    path = Path(settings.kiosk_signing_key_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(path.name + ".restore")
    fd = os.open(tmp, os.O_CREAT | os.O_TRUNC | os.O_WRONLY, 0o600)
    try:
        os.write(fd, key.encode())
    finally:
        os.close(fd)
    os.replace(tmp, path)


async def apply_restore(
    loaded: LoadedBackup,
    mode: str = "replace",
    restore_signing_key: bool = False,
    safety_backup: bool = True,
) -> dict[str, Any]:
    """Restore a validated backup. Raises BackupBusyError if one is already running."""
    if restore_lock.locked():
        raise BackupBusyError("A restore or backup is already running.")
    async with restore_lock:
        plan = await plan_restore(loaded, mode)
        doc = loaded.document
        out = _Outcome()

        safety_name = None
        if safety_backup:
            from .store import write_backup_unlocked

            safety_name = (await write_backup_unlocked(kind="pre-restore")).name

        await _install_packages(loaded, plan, out)
        await _restore_config(doc, mode)
        await _restore_keyboard(doc, mode)
        await _restore_instances(doc, plan, mode, out)
        # After instances: updating a running instance through the instance
        # manager also writes its type's enabled flag.
        await _restore_plugin_types(doc, out)
        await _restore_kiosks(doc)
        await _migrate_room_name(out)
        await _migrate_screen_controls(out)

        if loaded.signing_key and restore_signing_key:
            _write_signing_key(loaded.signing_key)
        elif loaded.signing_key:
            out.warnings.append("The backup has a kiosk signing key; it was not restored.")

        logger.info(
            f"Restore ({mode}) applied: {len(out.created)} created, {len(out.updated)} updated, "
            f"{len(out.removed)} removed, {len(out.skipped)} skipped, {len(out.errors)} errors"
        )
        return {
            "applied": True,
            "plan": plan,
            "safety_backup": safety_name,
            "installed": out.installed,
            "instances": {
                "created": out.created,
                "updated": out.updated,
                "removed": out.removed,
                "skipped": out.skipped,
            },
            "needs_credentials": out.needs_credentials,
            "signing_key_restored": bool(loaded.signing_key and restore_signing_key),
            "warnings": plan["warnings"] + out.warnings,
            "errors": out.errors,
        }
