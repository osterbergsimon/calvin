"""Theme installation service for managing installed themes (file operations only)."""

import json
import shutil
import zipfile
from pathlib import Path
from typing import Any

from loguru import logger

from app.config import settings
from app.services.theme_contract import (
    check_theme,
    decorate_theme,
    install_error,
    log_ignored_keys,
)
from app.services.validation import (
    resolve_child_dir,
    validate_directory_structure,
    validate_manifest_required_fields,
    validate_plugin_id,
    validate_theme_variables,
    validate_zip_structure,
)

# Constants
REQUIRED_THEME_FIELDS = ["id", "name", "version", "variables"]


class ThemeInstaller:
    """Service for installing, updating, and uninstalling themes."""

    def __init__(self):
        """Initialize theme installer."""
        self.themes_dir = settings.themes_dir
        self.themes_dir.mkdir(parents=True, exist_ok=True)

    def get_theme_path(self, theme_id: str) -> Path:
        """
        Get the installation path for a theme.

        Args:
            theme_id: Theme identifier

        Returns:
            Path to theme directory

        Raises:
            ValueError: If the id is invalid or would escape the themes dir
        """
        return resolve_child_dir(self.themes_dir, theme_id)

    def _is_safe_path(self, path: str, base_path: Path) -> bool:
        """
        Check if a path is safe (no path traversal).

        Args:
            path: Relative path to check
            base_path: Base directory to resolve against

        Returns:
            True if path is safe, False otherwise
        """
        # Check for obvious path traversal attempts
        if ".." in path or path.startswith("/"):
            return False

        # Resolve the path and check it's within base_path
        try:
            resolved = (base_path / path).resolve()
            base_resolved = base_path.resolve()
            # Check that resolved path is within base path
            # Use try/except for is_relative_to in case of different drives on Windows
            try:
                return resolved.is_relative_to(base_resolved)
            except ValueError:
                # Different drives or other path issues
                return False
        except (ValueError, OSError):
            # Path resolution failed, not safe
            return False

    def _validate_manifest(
        self, manifest: dict[str, Any], check_contract: bool = True
    ) -> dict[str, Any]:
        """
        Validate a theme manifest structure and (optionally) the theme_api 2
        palette contract.

        The contract check normalises the palettes: non-colour keys are dropped,
        and missing ``-ink``/``-text`` pairs are derived and stored, so a theme
        installed once is self-contained afterwards.

        Args:
            manifest: Theme manifest dictionary
            check_contract: Enforce palette rules (install); False when merely
                listing a repository, so a broken theme can still be shown and
                rejected with a useful message at install time.

        Returns:
            The manifest to persist (normalised when the contract was checked)

        Raises:
            ValueError: If manifest is invalid
        """
        # Validate required fields
        validate_manifest_required_fields(manifest, REQUIRED_THEME_FIELDS, "theme.json")
        validate_plugin_id(manifest["id"])

        # Validate variables structure
        validate_theme_variables(manifest["variables"])

        if not check_contract:
            return manifest

        check = check_theme(manifest)
        log_ignored_keys(manifest, check)
        if not check.ok:
            raise ValueError(install_error(manifest, check))

        normalised = dict(manifest)
        normalised["variables"] = check.variables
        normalised["dark_mode"] = check.dark_mode
        normalised["theme_api"] = manifest.get("theme_api", 2)
        return normalised

    def validate_theme_package(self, theme_path: Path) -> dict[str, Any]:
        """
        Validate a theme package structure.

        For zip files, ensures exactly one theme is present.
        For directories, validates the single theme.

        Args:
            theme_path: Path to theme directory or zip file

        Returns:
            Theme manifest dictionary

        Raises:
            ValueError: If theme package is invalid
        """
        # For directories, validate directly
        if not theme_path.suffix == ".zip":
            return self._validate_theme_directory(theme_path)

        # For zip files, use shared validation
        manifest = validate_zip_structure(
            zip_path=theme_path,
            manifest_filename="theme.json",
        )

        # Validate theme-specific fields
        return self._validate_manifest(manifest)

    def _validate_theme_directory(
        self, theme_dir: Path, check_contract: bool = True
    ) -> dict[str, Any]:
        """
        Validate a theme directory structure.

        Args:
            theme_dir: Path to theme directory
            check_contract: Enforce the palette contract (False when listing a
                repository so an invalid theme can still be shown)

        Returns:
            Theme manifest dictionary

        Raises:
            ValueError: If theme directory is invalid
        """
        # Use shared validation for directory structure
        manifest = validate_directory_structure(
            directory=theme_dir,
            manifest_filename="theme.json",
        )

        # Validate theme-specific fields
        return self._validate_manifest(manifest, check_contract=check_contract)

    def install_theme(
        self,
        source_path: Path,
        theme_id: str | None = None,
        check_version: bool = True,
        force: bool = False,
    ) -> dict[str, Any]:
        """
        Install a theme from a directory or zip file.

        Args:
            source_path: Path to theme directory or zip file
            theme_id: Optional theme ID (if not provided, uses manifest ID)
            check_version: If True, checks for existing version and raises if older
            force: If True, uninstalls existing theme before installing

        Returns:
            Theme manifest dictionary

        Raises:
            ValueError: If theme package is invalid or already installed
        """
        # Validate theme package
        manifest = self.validate_theme_package(source_path)

        # Use provided theme_id or manifest ID
        install_id = theme_id or manifest["id"]

        # Check if theme already installed
        theme_path = self.get_theme_path(install_id)
        if theme_path.exists():
            if force:
                # Uninstall existing theme
                logger.info(f"Force installing theme {install_id}, removing existing installation")
                self.uninstall_theme(install_id)
            else:
                # Check version if requested
                if check_version:
                    existing_manifest = self.get_theme_manifest(install_id)
                    if existing_manifest:
                        existing_version = existing_manifest.get("version", "0.0.0")
                        new_version = manifest.get("version", "0.0.0")
                        # Simple version comparison (assumes semantic versioning)
                        try:
                            from packaging import version

                            if version.parse(new_version) < version.parse(existing_version):
                                raise ValueError(
                                    f"Theme {install_id} version {new_version} is older than "
                                    f"installed version {existing_version}. "
                                    "Uninstall the existing theme first or use "
                                    "force=True to override."
                                )
                        except ImportError:
                            # packaging not available, skip version check
                            logger.warning(
                                "packaging library not available, skipping version comparison"
                            )
                        except ValueError:
                            # Re-raise version comparison errors
                            raise
                        except Exception as e:
                            # If version parsing fails, log warning but allow install
                            logger.warning(
                                f"Failed to parse version for theme {install_id}: {e}. "
                                "Proceeding with installation."
                            )

                raise ValueError(
                    f"Theme {install_id} is already installed. "
                    "Uninstall the existing theme first or use force=True to override."
                )

        # Create theme directory
        theme_path.mkdir(parents=True, exist_ok=True)

        try:
            # If source is a zip file, extract it
            if source_path.suffix == ".zip":
                with zipfile.ZipFile(source_path, "r") as zip_ref:
                    # Find theme.json to determine theme directory structure
                    theme_json_path = None
                    for name in zip_ref.namelist():
                        if name.endswith("theme.json"):
                            theme_json_path = name
                            break

                    if not theme_json_path:
                        raise ValueError("theme.json not found in theme package")

                    # Determine theme root directory in zip
                    theme_dir_in_zip = "/".join(theme_json_path.split("/")[:-1])
                    if not theme_dir_in_zip:
                        # theme.json is at root, extract all
                        zip_ref.extractall(theme_path)
                    else:
                        # theme.json is in a subdirectory
                        # Extract only files from that directory and below
                        theme_dir_prefix = theme_dir_in_zip + "/"
                        for member in zip_ref.namelist():
                            if member.startswith(theme_dir_prefix) or member == theme_json_path:
                                # Extract to root of theme_path, removing the subdirectory prefix
                                target_path = (
                                    member[len(theme_dir_prefix) :]
                                    if member.startswith(theme_dir_prefix)
                                    else member
                                )
                                if target_path:
                                    # Guard against zip path traversal — a member like
                                    # 'x/../../evil' resolves outside theme_path (calvin-8cv).
                                    if not self._is_safe_path(target_path, theme_path):
                                        raise ValueError(
                                            f"Unsafe path in theme package (path traversal): {member!r}"
                                        )
                                    target = theme_path / target_path
                                    if member.endswith("/"):
                                        target.mkdir(parents=True, exist_ok=True)
                                    else:
                                        target.parent.mkdir(parents=True, exist_ok=True)
                                        with zip_ref.open(member) as source:
                                            with open(target, "wb") as f:
                                                f.write(source.read())
            else:
                # Copy directory
                if source_path.is_dir():
                    # Copy all files except __pycache__ and .pyc files
                    for item in source_path.iterdir():
                        if item.name in ["__pycache__", ".git", ".gitignore"]:
                            continue
                        if item.is_dir():
                            shutil.copytree(item, theme_path / item.name, dirs_exist_ok=True)
                        else:
                            shutil.copy2(item, theme_path / item.name)
                else:
                    raise ValueError(f"Invalid source path: {source_path}")

            # Save manifest
            manifest_path = theme_path / "theme.json"
            with open(manifest_path, "w", encoding="utf-8") as f:
                json.dump(manifest, f, indent=2)

            return manifest

        except Exception as e:
            # Cleanup on error
            if theme_path.exists():
                shutil.rmtree(theme_path)
            raise ValueError(f"Failed to install theme: {e}") from e

    def uninstall_theme(self, theme_id: str) -> None:
        """
        Uninstall a theme (file operations only).

        Args:
            theme_id: Theme identifier

        Raises:
            ValueError: If theme is not installed
        """
        theme_path = self.get_theme_path(theme_id)
        if not theme_path.exists():
            raise ValueError(f"Theme {theme_id} is not installed")
        # Only ever delete a dir Calvin installed (it always writes theme.json).
        if not (theme_path / "theme.json").is_file():
            raise ValueError(
                f"Theme directory for {theme_id} has no theme.json and was not installed "
                "by Calvin; remove it by hand"
            )

        # Remove theme directory
        shutil.rmtree(theme_path)

    def get_installed_themes(self) -> list[dict[str, Any]]:
        """
        Get list of installed themes.

        Returns:
            List of theme manifests
        """
        themes = []
        if not self.themes_dir.exists():
            return themes

        for theme_dir in self.themes_dir.iterdir():
            if not theme_dir.is_dir():
                continue

            manifest_path = theme_dir / "theme.json"
            if not manifest_path.exists():
                continue

            try:
                with open(manifest_path, encoding="utf-8") as f:
                    manifest = json.load(f)
                manifest["_installed_path"] = str(theme_dir)
                themes.append(decorate_theme(manifest))
            except json.JSONDecodeError as e:
                logger.warning(f"Invalid JSON in theme manifest for {theme_dir.name}: {e}")
                continue
            except Exception as e:
                logger.warning(f"Error reading theme manifest for {theme_dir.name}: {e}")
                continue

        return themes

    def get_theme_manifest(self, theme_id: str) -> dict[str, Any] | None:
        """
        Get manifest for an installed theme.

        Args:
            theme_id: Theme identifier

        Returns:
            Theme manifest dictionary or None if not found
        """
        try:
            theme_path = self.get_theme_path(theme_id)
        except ValueError:
            return None
        manifest_path = theme_path / "theme.json"

        if not manifest_path.exists():
            return None

        try:
            with open(manifest_path, encoding="utf-8") as f:
                return decorate_theme(json.load(f))
        except (json.JSONDecodeError, Exception):
            return None

    def enumerate_themes_from_repo(self, repo_path: Path) -> dict[str, Any]:
        """
        Enumerate themes from a repository directory.

        First checks for plugins.json manifest file. If not found,
        auto-discovers themes by scanning for directories containing theme.json.

        Args:
            repo_path: Path to repository root directory

        Returns:
            Dictionary with 'has_manifest' flag and 'themes' list
        """
        result: dict[str, Any] = {
            "has_manifest": False,
            "themes": [],
        }

        # Check for plugins.json manifest (unified manifest for plugins and themes)
        manifest_path = repo_path / "plugins.json"
        if manifest_path.exists():
            try:
                with open(manifest_path, encoding="utf-8") as f:
                    manifest_data = json.load(f)
                result["has_manifest"] = True
                result["manifest"] = manifest_data

                # Validate and enumerate themes from manifest
                if "themes" in manifest_data:
                    themes_list = []
                    for theme_info in manifest_data["themes"]:
                        # Validate required fields
                        if "id" not in theme_info or "path" not in theme_info:
                            continue

                        theme_path_rel = theme_info["path"]
                        # Security: prevent path traversal
                        if not self._is_safe_path(theme_path_rel, repo_path):
                            continue

                        theme_dir = repo_path / theme_path_rel
                        if not theme_dir.exists() or not theme_dir.is_dir():
                            continue

                        # Validate theme directory
                        try:
                            manifest = self._validate_theme_directory(
                                theme_dir, check_contract=False
                            )
                            # Add metadata from manifest file
                            theme_entry = {
                                "id": manifest["id"],
                                "name": theme_info.get("name", manifest.get("name", "")),
                                "path": theme_path_rel,
                                "description": theme_info.get(
                                    "description", manifest.get("description", "")
                                ),
                                "version": theme_info.get("version", manifest.get("version", "")),
                                "manifest": manifest,
                            }
                            themes_list.append(theme_entry)
                        except ValueError:
                            # Invalid theme, skip it
                            continue

                result["themes"] = themes_list
                # Note: plugins in the manifest are handled by plugin_installer
                return result
            except (json.JSONDecodeError, ValueError):
                # Invalid manifest, fall back to auto-discovery
                pass

        # Auto-discovery: scan for theme directories
        themes_list = []
        for item in repo_path.iterdir():
            if not item.is_dir():
                continue

            # Skip common non-theme directories
            if item.name in [".git", "__pycache__", "node_modules", ".venv"]:
                continue

            # Check if directory contains theme.json
            theme_json = item / "theme.json"

            if theme_json.exists():
                try:
                    manifest = self._validate_theme_directory(item, check_contract=False)
                    theme_entry = {
                        "id": manifest["id"],
                        "name": manifest.get("name", ""),
                        "path": item.name,
                        "description": manifest.get("description", ""),
                        "version": manifest.get("version", ""),
                        "manifest": manifest,
                    }
                    themes_list.append(theme_entry)
                except ValueError:
                    # Invalid theme, skip it
                    continue

        result["themes"] = themes_list
        return result

    def install_theme_from_repo(
        self,
        repo_path: Path,
        theme_path: str,
        theme_id: str | None = None,
        check_version: bool = True,
        force: bool = False,
    ) -> dict[str, Any]:
        """
        Install a specific theme from a repository.

        Args:
            repo_path: Path to repository root directory
            theme_path: Relative path to theme directory within repo
            theme_id: Optional theme ID override
            check_version: If True, refuse a downgrade over an installed version
            force: If True, overwrite an already-installed theme (upgrade in place)

        Returns:
            Theme manifest dictionary

        Raises:
            ValueError: If theme path is invalid or theme is invalid
        """
        # Security: prevent path traversal
        if not self._is_safe_path(theme_path, repo_path):
            raise ValueError("Invalid theme path: path traversal not allowed")

        theme_dir = repo_path / theme_path
        if not theme_dir.exists() or not theme_dir.is_dir():
            raise ValueError(f"Theme directory not found: {theme_path}")

        # Validate, then delegate the already-installed / version / force handling
        # to install_theme (parity with install_plugin_from_repo) so `force` can
        # upgrade a theme in place instead of always erroring (calvin-3eu).
        manifest = self._validate_theme_directory(theme_dir)
        install_id = theme_id or manifest["id"]
        return self.install_theme(theme_dir, install_id, check_version=check_version, force=force)


# Global theme installer instance
theme_installer = ThemeInstaller()
