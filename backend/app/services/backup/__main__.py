"""Headless backup CLI.

    uv run python -m app.services.backup export [--out FILE] [--no-packages]
        [--no-secrets] [--include-signing-key]
    uv run python -m app.services.backup restore FILE [--mode replace|merge]
        [--dry-run] [--restore-signing-key]

Export is safe while the server runs. Restore changes the DB and plugin files
directly: stop the server first, or use the API (/api/backup/restore) or
CALVIN_RESTORE_FROM instead. Exit codes: 0 ok, 1 restore finished with
errors, 2 the file was rejected.
"""

import argparse
import asyncio
import json
import sys
from pathlib import Path

from .exporter import ExportOptions, backup_filename, export_backup
from .format import BackupError
from .restorer import apply_restore, plan_restore, read_backup


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="python -m app.services.backup")
    sub = parser.add_subparsers(dest="command", required=True)

    export = sub.add_parser("export", help="write a backup zip")
    export.add_argument("--out", type=Path, help="file to write (default: ./<generated name>)")
    export.add_argument("--no-packages", action="store_true", help="leave out plugin/theme files")
    export.add_argument("--no-secrets", action="store_true", help="blank passwords and API keys")
    export.add_argument(
        "--include-signing-key", action="store_true", help="include the kiosk signing key"
    )

    restore = sub.add_parser("restore", help="restore a backup (.zip or .json)")
    restore.add_argument("file", type=Path)
    restore.add_argument("--mode", choices=("replace", "merge"), default="replace")
    restore.add_argument("--dry-run", action="store_true", help="print the plan, change nothing")
    restore.add_argument(
        "--restore-signing-key", action="store_true", help="also restore the kiosk signing key"
    )
    return parser


async def _boot() -> None:
    """Open the DB and load plugins the way the server's startup does."""
    from app.database import connect_db
    from app.main import _initialize_database, _initialize_plugins

    await connect_db()
    await _initialize_database()
    await _initialize_plugins()


async def _shutdown() -> None:
    from app.database import disconnect_db
    from app.plugins.manager import plugin_manager

    await plugin_manager.cleanup_all()
    await disconnect_db()


async def _run(args: argparse.Namespace) -> int:
    await _boot()
    try:
        if args.command == "export":
            data = await export_backup(
                ExportOptions(
                    include_packages=not args.no_packages,
                    include_secrets=not args.no_secrets,
                    include_signing_key=args.include_signing_key,
                )
            )
            out = args.out or Path(backup_filename())
            out.write_bytes(data)
            out.chmod(0o600)
            print(out)
            return 0

        try:
            with read_backup(args.file.read_bytes()) as loaded:
                if args.dry_run:
                    result = await plan_restore(loaded, args.mode)
                else:
                    result = await apply_restore(
                        loaded, args.mode, restore_signing_key=args.restore_signing_key
                    )
        except BackupError as exc:
            print(f"error: {exc}", file=sys.stderr)
            return 2
        print(json.dumps(result, indent=2))
        return 1 if result.get("errors") else 0
    finally:
        await _shutdown()


def main(argv: list[str] | None = None) -> int:
    return asyncio.run(_run(_parser().parse_args(argv)))


if __name__ == "__main__":
    sys.exit(main())
