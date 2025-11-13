"""Plugin installation service for managing installed plugins."""

import json
import shutil
import zipfile
from pathlib import Path
from typing import Any

from app.config import settings


class PluginInstaller:
    """Service for installing, updating, and uninstalling plugins."""

    def __init__(self):
        """Initialize plugin installer."""
        # Plugin installation directory (from config)
        self.plugins_dir = settings.plugins_dir.resolve()
        self.plugins_dir.mkdir(parents=True, exist_ok=True)
        
        # Frontend plugins directory (relative to backend directory)
        # Backend is typically in backend/, frontend is in frontend/
        backend_dir = Path(__file__).parent.parent.parent
        frontend_dir = backend_dir.parent / "frontend"
        self.frontend_plugins_dir = frontend_dir / "src" / "components" / "plugins"
        self.frontend_plugins_dir.mkdir(parents=True, exist_ok=True)

    def get_plugin_path(self, plugin_id: str) -> Path:
        """
        Get the installation path for a plugin.

        Args:
            plugin_id: Plugin identifier

        Returns:
            Path to plugin directory
        """
        return self.plugins_dir / plugin_id

    def get_frontend_plugin_path(self, plugin_id: str) -> Path:
        """
        Get the frontend path for a plugin's components.

        Args:
            plugin_id: Plugin identifier

        Returns:
            Path to frontend plugin directory
        """
        return self.frontend_plugins_dir / plugin_id

    def validate_plugin_package(self, plugin_path: Path) -> dict[str, Any]:
        """
        Validate a plugin package structure.

        Args:
            plugin_path: Path to plugin directory or zip file

        Returns:
            Plugin manifest dictionary

        Raises:
            ValueError: If plugin package is invalid
        """
        # If it's a zip file, extract to temp location first
        if plugin_path.suffix == ".zip":
            import tempfile
            with tempfile.TemporaryDirectory() as temp_dir:
                with zipfile.ZipFile(plugin_path, "r") as zip_ref:
                    zip_ref.extractall(temp_dir)
                # Find plugin directory in extracted files
                extracted_path = Path(temp_dir)
                # Look for plugin.json in root or subdirectories
                plugin_json = None
                for path in extracted_path.rglob("plugin.json"):
                    plugin_json = path
                    break
                
                if not plugin_json:
                    raise ValueError("plugin.json not found in plugin package")
                
                plugin_dir = plugin_json.parent
                return self._validate_plugin_directory(plugin_dir)
        else:
            return self._validate_plugin_directory(plugin_path)

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
        # Check for plugin.json
        manifest_path = plugin_dir / "plugin.json"
        if not manifest_path.exists():
            raise ValueError(f"plugin.json not found in {plugin_dir}")

        # Load and validate manifest
        try:
            with open(manifest_path, "r", encoding="utf-8") as f:
                manifest = json.load(f)
        except json.JSONDecodeError as e:
            raise ValueError(f"Invalid JSON in plugin.json: {e}")

        # Required fields
        required_fields = ["id", "name", "version", "type"]
        for field in required_fields:
            if field not in manifest:
                raise ValueError(f"Missing required field in plugin.json: {field}")

        # Validate plugin type
        valid_types = ["calendar", "image", "service"]
        if manifest["type"] not in valid_types:
            raise ValueError(f"Invalid plugin type: {manifest['type']}. Must be one of {valid_types}")

        # Check for plugin.py
        plugin_py = plugin_dir / "plugin.py"
        if not plugin_py.exists():
            raise ValueError("plugin.py not found in plugin package")

        return manifest

    def install_plugin(self, source_path: Path, plugin_id: str | None = None) -> dict[str, Any]:
        """
        Install a plugin from a directory or zip file.

        Args:
            source_path: Path to plugin directory or zip file
            plugin_id: Optional plugin ID (if not provided, uses manifest ID)

        Returns:
            Plugin manifest dictionary

        Raises:
            ValueError: If plugin package is invalid or already installed
        """
        # Validate plugin package
        manifest = self.validate_plugin_package(source_path)
        
        # Use provided plugin_id or manifest ID
        install_id = plugin_id or manifest["id"]
        
        # Check if plugin already installed
        plugin_path = self.get_plugin_path(install_id)
        if plugin_path.exists():
            raise ValueError(f"Plugin {install_id} is already installed")

        # Create plugin directory
        plugin_path.mkdir(parents=True, exist_ok=True)

        try:
            # If source is a zip file, extract it
            if source_path.suffix == ".zip":
                with zipfile.ZipFile(source_path, "r") as zip_ref:
                    # Find plugin.json in the zip (could be in root or subdirectory)
                    plugin_json_path = None
                    for name in zip_ref.namelist():
                        if name.endswith("plugin.json"):
                            plugin_json_path = name
                            break
                    
                    if not plugin_json_path:
                        raise ValueError("plugin.json not found in plugin package")
                    
                    # Extract all files
                    zip_ref.extractall(plugin_path)
                    
                    # If files were extracted to a subdirectory, move them up
                    # (some zip files contain a root directory)
                    subdirs = [d for d in plugin_path.iterdir() if d.is_dir()]
                    if len(subdirs) == 1 and not (plugin_path / "plugin.json").exists():
                        # Files are in a subdirectory, move them up
                        subdir = subdirs[0]
                        for item in subdir.iterdir():
                            shutil.move(str(item), str(plugin_path / item.name))
                        subdir.rmdir()
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

            # Install frontend components if they exist
            frontend_source = plugin_path / "frontend"
            if frontend_source.exists():
                frontend_dest = self.get_frontend_plugin_path(install_id)
                if frontend_dest.exists():
                    shutil.rmtree(frontend_dest)
                shutil.copytree(frontend_source, frontend_dest)

            # Save manifest
            manifest_path = plugin_path / "plugin.json"
            with open(manifest_path, "w", encoding="utf-8") as f:
                json.dump(manifest, f, indent=2)

            return manifest

        except Exception as e:
            # Cleanup on error
            if plugin_path.exists():
                shutil.rmtree(plugin_path)
            frontend_path = self.get_frontend_plugin_path(install_id)
            if frontend_path.exists():
                shutil.rmtree(frontend_path)
            raise ValueError(f"Failed to install plugin: {e}") from e

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

        # Remove plugin directory
        shutil.rmtree(plugin_path)

        # Remove frontend components
        frontend_path = self.get_frontend_plugin_path(plugin_id)
        if frontend_path.exists():
            shutil.rmtree(frontend_path)

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
                with open(manifest_path, "r", encoding="utf-8") as f:
                    manifest = json.load(f)
                manifest["_installed_path"] = str(plugin_dir)
                plugins.append(manifest)
            except (json.JSONDecodeError, Exception) as e:
                print(f"Error reading plugin manifest for {plugin_dir.name}: {e}")
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
            with open(manifest_path, "r", encoding="utf-8") as f:
                return json.load(f)
        except (json.JSONDecodeError, Exception):
            return None


# Global plugin installer instance
plugin_installer = PluginInstaller()

