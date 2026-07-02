"""Plugin installation service for managing installed plugins."""

import json
import shutil
import subprocess
import sys
import zipfile
from pathlib import Path
from typing import Any

from loguru import logger

from app.config import settings
from app.plugins.definitions import CURRENT_PLUGIN_API_VERSION
from app.services.validation import (
    validate_directory_structure,
    validate_manifest_api_version,
    validate_manifest_required_fields,
    validate_plugin_optional_fields,
    validate_plugin_type,
    validate_zip_structure,
)


class PluginInstaller:
    """Service for installing, updating, and uninstalling plugins."""

    def __init__(self):
        """Initialize plugin installer."""
        # Plugin installation directory (from config)
        self.plugins_dir = settings.plugins_dir.resolve()
        self.plugins_dir.mkdir(parents=True, exist_ok=True)

    def get_plugin_path(self, plugin_id: str) -> Path:
        """
        Get the installation path for a plugin.

        Args:
            plugin_id: Plugin identifier

        Returns:
            Path to plugin directory
        """
        return self.plugins_dir / plugin_id

    def validate_plugin_package(self, plugin_path: Path) -> dict[str, Any]:
        """
        Validate a plugin package structure.

        For zip files, ensures exactly one plugin is present.
        For directories, validates the single plugin.

        Args:
            plugin_path: Path to plugin directory or zip file

        Returns:
            Plugin manifest dictionary

        Raises:
            ValueError: If plugin package is invalid
        """
        # For directories, validate directly
        if not plugin_path.suffix == ".zip":
            return self._validate_plugin_directory(plugin_path)

        # For zip files, use shared validation
        manifest = validate_zip_structure(
            zip_path=plugin_path,
            manifest_filename="plugin.json",
            required_file="plugin.py",
        )

        # Validate plugin-specific fields
        required_fields = ["id", "name", "version", "type"]
        validate_manifest_required_fields(manifest, required_fields, "plugin.json")
        validate_plugin_type(manifest["type"])
        validate_manifest_api_version(
            manifest, CURRENT_PLUGIN_API_VERSION, manifest_type="plugin.json"
        )
        validate_plugin_optional_fields(manifest)

        return manifest

    def _validate_plugin_directory(self, plugin_dir: Path) -> dict[str, Any]:
        """
        Validate a plugin directory structure.

        Args:
            plugin_dir: Path to plugin directory

        Returns:
            Plugin manifest dictionary

        Raises:
            ValueError: If plugin directory is invalid
        """
        # Use shared validation for directory structure
        manifest = validate_directory_structure(
            directory=plugin_dir,
            manifest_filename="plugin.json",
            required_file="plugin.py",
        )

        # Validate plugin-specific fields
        required_fields = ["id", "name", "version", "type"]
        validate_manifest_required_fields(manifest, required_fields, "plugin.json")
        validate_plugin_type(manifest["type"])
        validate_manifest_api_version(
            manifest, CURRENT_PLUGIN_API_VERSION, manifest_type="plugin.json"
        )
        validate_plugin_optional_fields(manifest)

        return manifest

    def install_plugin(
        self,
        source_path: Path,
        plugin_id: str | None = None,
        check_version: bool = True,
        force: bool = False,
    ) -> dict[str, Any]:
        """
        Install a plugin from a directory or zip file.

        Args:
            source_path: Path to plugin directory or zip file
            plugin_id: Optional plugin ID (if not provided, uses manifest ID)
            check_version: If True, checks for existing version and raises if older
            force: If True, uninstalls existing plugin before installing

        Returns:
            Plugin manifest dictionary

        Raises:
            ValueError: If plugin package is invalid or already installed
        """
        # Validate plugin package (for zip, this validates without extracting)
        manifest = self.validate_plugin_package(source_path)

        # Use provided plugin_id or manifest ID
        install_id = plugin_id or manifest["id"]

        # Check if plugin already installed
        plugin_path = self.get_plugin_path(install_id)
        if plugin_path.exists():
            if force:
                # Force reinstall: uninstall existing plugin first
                logger.info(f"Force installing plugin {install_id}, removing existing installation")
                self.uninstall_plugin(install_id)
            else:
                # Check version if requested
                if check_version:
                    existing_manifest = self.get_plugin_manifest(install_id)
                    if existing_manifest:
                        existing_version = existing_manifest.get("version", "0.0.0")
                        new_version = manifest.get("version", "0.0.0")
                        # Simple version comparison (assumes semantic versioning)
                        try:
                            from packaging import version

                            if version.parse(new_version) < version.parse(existing_version):
                                raise ValueError(
                                    f"Plugin {install_id} version {new_version} is older than "
                                    f"installed version {existing_version}. "
                                    "Uninstall the existing plugin first."
                                )
                        except ImportError:
                            logger.warning(
                                f"`packaging` library not available; skipping version check "
                                f"for plugin {install_id} (existing={existing_version}, "
                                f"new={new_version})"
                            )
                        except Exception as e:
                            logger.warning(
                                f"Version comparison failed for plugin {install_id} "
                                f"(existing={existing_version}, new={new_version}): {e}. "
                                "Proceeding with install."
                            )

                raise ValueError(
                    f"Plugin {install_id} is already installed. "
                    "Uninstall the existing plugin first or use force=True to override."
                )

        # Create plugin directory
        plugin_path.mkdir(parents=True, exist_ok=True)

        try:
            # If source is a zip file, extract it
            if source_path.suffix == ".zip":
                with zipfile.ZipFile(source_path, "r") as zip_ref:
                    # Find plugin.json to determine plugin directory structure
                    plugin_json_path = None
                    for name in zip_ref.namelist():
                        if name.endswith("plugin.json"):
                            plugin_json_path = name
                            break

                    if not plugin_json_path:
                        raise ValueError("plugin.json not found in plugin package")

                    # Determine plugin root directory in zip
                    plugin_dir_in_zip = "/".join(plugin_json_path.split("/")[:-1])
                    if not plugin_dir_in_zip:
                        # plugin.json is at root, extract all
                        zip_ref.extractall(plugin_path)
                    else:
                        # plugin.json is in a subdirectory
                        # Extract only files from that directory and below
                        plugin_dir_prefix = plugin_dir_in_zip + "/"
                        for member in zip_ref.namelist():
                            if member.startswith(plugin_dir_prefix) or member == plugin_json_path:
                                # Extract to root of plugin_path, removing the subdirectory prefix
                                target_path = (
                                    member[len(plugin_dir_prefix) :]
                                    if member.startswith(plugin_dir_prefix)
                                    else member
                                )
                                if target_path:
                                    target = plugin_path / target_path
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
                            shutil.copytree(item, plugin_path / item.name, dirs_exist_ok=True)
                        else:
                            shutil.copy2(item, plugin_path / item.name)
                else:
                    raise ValueError(f"Invalid source path: {source_path}")

            # Frontend assets stay inside the plugin's data directory; the
            # host serves them through /api/plugins/{id}/static/* and either
            # picks them up via display_schema (kind=...) or imports a
            # built ESM module (kind=web-component). No copy into the host
            # source tree, no rebuild required.

            # Install plugin-specific Python packages
            installed_packages = self._install_pip_requirements(manifest)
            if installed_packages:
                manifest["_installed_packages"] = installed_packages

            # Save manifest
            manifest_path = plugin_path / "plugin.json"
            with open(manifest_path, "w", encoding="utf-8") as f:
                json.dump(manifest, f, indent=2)

            return manifest

        except Exception as e:
            # Cleanup on error — use ignore_errors so a locked file on Windows
            # doesn't mask the real install error.
            if plugin_path.exists():
                shutil.rmtree(plugin_path, ignore_errors=True)
            raise ValueError(f"Failed to install plugin: {e}") from e

    def _install_pip_requirements(self, manifest: dict[str, Any]) -> list[str]:
        """Install Python packages declared in plugin.json under dependencies.packages.

        Uses the running interpreter so the packages land in the correct venv.
        Raises ValueError if any package fails to install so the caller can roll back.
        """
        requirements: list[str] = (manifest.get("dependencies") or {}).get("packages", [])
        if not requirements:
            return []

        pip_cmd = self._resolve_pip()
        logger.info(
            f"Installing pip packages for plugin {manifest.get('id')} "
            f"using {pip_cmd}: {requirements}"
        )
        installed: list[str] = []
        for req in requirements:
            cmd = [*pip_cmd, req]
            logger.info(f"Running: {' '.join(str(c) for c in cmd)}")
            try:
                result = subprocess.run(
                    cmd,
                    capture_output=True,
                    text=True,
                    timeout=120,
                )
                logger.debug(f"pip stdout: {result.stdout!r}")
                logger.debug(f"pip stderr: {result.stderr!r}")
                logger.debug(f"pip returncode: {result.returncode}")
                if result.returncode == 0:
                    logger.info(f"Installed: {req}")
                    installed.append(req)
                else:
                    error_output = (result.stderr or result.stdout or "(no output)").strip()
                    raise ValueError(
                        f"pip install failed for '{req}' (exit {result.returncode}):\n{error_output}"
                    )
            except subprocess.TimeoutExpired:
                raise ValueError(f"Timed out installing package '{req}' (120s limit)")
            except OSError as e:
                raise ValueError(f"Failed to launch pip for '{req}': {e}")

        return installed

    @staticmethod
    def _resolve_pip() -> list[str]:
        """Return the best pip invocation prefix for the running venv.

        Resolution order:
        1. uv pip install --python <exe>   — UV-managed venvs (no pip binary installed)
        2. bin/pip install / bin/pip3 install — conventional venvs with a pip binary
        3. python -m pip install           — last resort

        The returned list already includes "install"; append only the package name.
        """
        # 1. Prefer uv when available — works even when pip is absent from the venv.
        # On Windows, uv.exe must be launched via cmd /c (same pattern as npm) to avoid
        # STATUS_FATAL_APP_EXIT when spawning from within a running Python process.
        uv = shutil.which("uv")
        if uv:
            cmd = [uv, "pip", "install", "--python", sys.executable]
            if sys.platform == "win32":
                return ["cmd", "/c"] + cmd
            return cmd

        # 2. pip/pip3 binary sitting next to the interpreter
        bin_dir = Path(sys.executable).parent
        for candidate in ("pip", "pip3"):
            pip_bin = bin_dir / candidate
            if pip_bin.exists():
                return [str(pip_bin), "install"]

        # 3. Last resort
        return [sys.executable, "-m", "pip", "install"]

    def uninstall_plugin(self, plugin_id: str) -> None:
        """
        Uninstall a plugin.

        Args:
            plugin_id: Plugin identifier

        Raises:
            ValueError: If plugin is not installed
        """
        plugin_path = self.get_plugin_path(plugin_id)
        if not plugin_path.exists():
            raise ValueError(f"Plugin {plugin_id} is not installed")

        # Remove plugin directory (frontend assets live inside it, so they go too)
        shutil.rmtree(plugin_path)

    def get_installed_plugins(self) -> list[dict[str, Any]]:
        """
        Get list of installed plugins.

        Returns:
            List of plugin manifests
        """
        plugins = []
        if not self.plugins_dir.exists():
            return plugins

        for plugin_dir in self.plugins_dir.iterdir():
            if not plugin_dir.is_dir():
                continue

            manifest_path = plugin_dir / "plugin.json"
            if not manifest_path.exists():
                continue

            try:
                with open(manifest_path, encoding="utf-8") as f:
                    manifest = json.load(f)
                manifest["_installed_path"] = str(plugin_dir)
                plugins.append(manifest)
            except (json.JSONDecodeError, OSError, ValueError) as e:
                logger.warning(f"Error reading plugin manifest for {plugin_dir.name}: {e}")
                continue

        return plugins

    def get_plugin_manifest(self, plugin_id: str) -> dict[str, Any] | None:
        """
        Get manifest for an installed plugin.

        Args:
            plugin_id: Plugin identifier

        Returns:
            Plugin manifest dictionary or None if not found
        """
        plugin_path = self.get_plugin_path(plugin_id)
        manifest_path = plugin_path / "plugin.json"

        if not manifest_path.exists():
            return None

        try:
            with open(manifest_path, encoding="utf-8") as f:
                return json.load(f)
        except (json.JSONDecodeError, Exception):
            return None

    def enumerate_plugins_from_repo(self, repo_path: Path) -> dict[str, Any]:
        """
        Enumerate plugins from a repository directory.

        First checks for plugins.json manifest file. If not found,
        auto-discovers plugins by scanning for directories containing
        plugin.json and plugin.py.

        Args:
            repo_path: Path to repository root directory

        Returns:
            Dictionary with 'manifest' (if found) and 'plugins' list
        """
        result: dict[str, Any] = {
            "has_manifest": False,
            "plugins": [],
        }

        # Check for plugins.json manifest
        manifest_path = repo_path / "plugins.json"
        if manifest_path.exists():
            try:
                with open(manifest_path, encoding="utf-8") as f:
                    manifest_data = json.load(f)
                result["has_manifest"] = True
                result["manifest"] = manifest_data

                # Validate and enumerate plugins from manifest
                # Support both old format (just "plugins") and new format ("plugins" and "themes")
                plugins_list = []
                if "plugins" in manifest_data:
                    for plugin_info in manifest_data["plugins"]:
                        # Validate required fields
                        if "id" not in plugin_info or "path" not in plugin_info:
                            continue

                        plugin_path_rel = plugin_info["path"]
                        # Security: prevent path traversal
                        if ".." in plugin_path_rel or plugin_path_rel.startswith("/"):
                            continue

                        plugin_dir = repo_path / plugin_path_rel
                        if not plugin_dir.exists() or not plugin_dir.is_dir():
                            continue

                        # Validate plugin directory
                        try:
                            manifest = self._validate_plugin_directory(plugin_dir)
                            # Add metadata from manifest file
                            plugin_entry = {
                                "id": manifest["id"],
                                "name": plugin_info.get("name", manifest.get("name", "")),
                                "path": plugin_path_rel,
                                "description": plugin_info.get(
                                    "description", manifest.get("description", "")
                                ),
                                "version": plugin_info.get("version", manifest.get("version", "")),
                                "type": plugin_info.get("type", manifest.get("type", "")),
                                "manifest": manifest,
                            }
                            plugins_list.append(plugin_entry)
                        except ValueError:
                            # Invalid plugin, skip it
                            continue

                result["plugins"] = plugins_list
                return result
            except (json.JSONDecodeError, ValueError):
                # Invalid manifest, fall back to auto-discovery
                pass

        # Auto-discovery: scan for plugin directories
        plugins_list = []
        for item in repo_path.iterdir():
            if not item.is_dir():
                continue

            # Skip common non-plugin directories
            if item.name in [".git", "__pycache__", "node_modules", ".venv"]:
                continue

            # Check if directory contains plugin.json and plugin.py
            plugin_json = item / "plugin.json"
            plugin_py = item / "plugin.py"

            if plugin_json.exists() and plugin_py.exists():
                try:
                    manifest = self._validate_plugin_directory(item)
                    plugin_entry = {
                        "id": manifest["id"],
                        "name": manifest.get("name", ""),
                        "path": item.name,
                        "description": manifest.get("description", ""),
                        "version": manifest.get("version", ""),
                        "type": manifest.get("type", ""),
                        "manifest": manifest,
                    }
                    plugins_list.append(plugin_entry)
                except ValueError:
                    # Invalid plugin, skip it
                    continue

        result["plugins"] = plugins_list
        return result

    def install_plugin_from_repo(
        self, repo_path: Path, plugin_path: str, plugin_id: str | None = None, force: bool = False
    ) -> dict[str, Any]:
        """
        Install a specific plugin from a repository.

        Args:
            repo_path: Path to repository root directory
            plugin_path: Relative path to plugin directory within repo
            plugin_id: Optional plugin ID override
            force: If True, uninstalls existing plugin before installing

        Returns:
            Plugin manifest dictionary

        Raises:
            ValueError: If plugin path is invalid or plugin is invalid
        """
        # Security: prevent path traversal
        if ".." in plugin_path or plugin_path.startswith("/"):
            raise ValueError("Invalid plugin path: path traversal not allowed")

        plugin_dir = repo_path / plugin_path
        if not plugin_dir.exists() or not plugin_dir.is_dir():
            raise ValueError(f"Plugin directory not found: {plugin_path}")

        # Validate and install
        manifest = self._validate_plugin_directory(plugin_dir)
        install_id = plugin_id or manifest["id"]

        # Check if plugin already installed
        plugin_path = self.get_plugin_path(install_id)
        if plugin_path.exists():
            # Verify it's actually a valid installed plugin (not just a leftover directory)
            existing_manifest = self.get_plugin_manifest(install_id)
            if existing_manifest:
                # Plugin is actually installed and valid
                if force:
                    # Force reinstall: uninstall existing plugin first
                    logger.info(
                        f"Force installing plugin {install_id}, removing existing installation"
                    )
                    self.uninstall_plugin(install_id)
                else:
                    raise ValueError(f"Plugin {install_id} is already installed")
            else:
                # Plugin directory exists but is invalid/corrupted (no manifest)
                # Remove it and allow reinstallation
                logger.warning(
                    f"Found corrupted/invalid plugin directory for {install_id}, "
                    "removing and allowing reinstallation"
                )
                shutil.rmtree(plugin_path)

        # Install from directory
        return self.install_plugin(plugin_dir, install_id, check_version=True, force=False)


# Global plugin installer instance
plugin_installer = PluginInstaller()
