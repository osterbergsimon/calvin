"""Backup and restore of a Calvin setup (calvin-8gx).

See docs/configuration/BACKUP_RESTORE.md for what a backup contains and how
restore behaves. Modules:

- ``format``: the backup document, its version and migrations
- ``secrets``: finding and stripping secret config values
- ``exporter``: building a backup zip from the running install
- ``restorer``: validating, previewing and applying a backup
- ``store``: backup files in the backup dir, retention, scheduled backups
- ``seed``: restore on first start (``CALVIN_RESTORE_FROM``)
"""
