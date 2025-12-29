"""Plugin management API endpoints."""

import zipfile
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Body, File, HTTPException, Query, UploadFile
from sqlalchemy import select

from app.database import AsyncSessionLocal
from app.models.db_models import PluginDB, PluginTypeDB
from app.plugins.base import PluginType
from app.plugins.loader import plugin_loader
from app.services.plugin_installer import plugin_installer
from app.services.theme_installer import theme_installer

router = APIRouter()


# Theme helper functions (moved from themes.py)
def _load_builtin_themes() -> dict[str, Any]:
    """Load built-in themes from JSON file."""
    import json
    from pathlib import Path

    # Path: backend/app/api/routes/plugins.py -> backend/data/themes/builtin.json
    backend_dir = Path(__file__).parent.parent.parent.parent
    themes_file = backend_dir / "data" / "themes" / "builtin.json"

    if not themes_file.exists():
        import logging

        logger = logging.getLogger(__name__)
        logger.warning(f"Built-in themes file not found at {themes_file}, using empty themes")
        return {}

    try:
        with open(themes_file, encoding="utf-8") as f:
            themes = json.load(f)
            # Ensure is_builtin is True for all loaded themes
            for theme_id, theme_data in themes.items():
                theme_data["is_builtin"] = True
            return themes
    except (json.JSONDecodeError, Exception) as e:
        import logging

        logger = logging.getLogger(__name__)
        logger.error(f"Failed to load built-in themes from {themes_file}: {e}")
        return {}


# Built-in themes (loaded from JSON file)
BUILTIN_THEMES = _load_builtin_themes()


async def _register_theme_in_db(manifest: dict[str, Any]) -> None:
    """
    Register a theme in PluginTypeDB (like other plugins).

    Args:
        manifest: Theme manifest dictionary
    """
    theme_id = manifest.get("id")
    if not theme_id:
        return

    async with AsyncSessionLocal() as session:
        result = await session.execute(select(PluginTypeDB).where(PluginTypeDB.type_id == theme_id))
        db_type = result.scalar_one_or_none()

        if not db_type:
            # Create new theme entry in database
            db_type = PluginTypeDB(
                type_id=theme_id,
                plugin_type=PluginType.THEME.value,
                name=manifest.get("name", theme_id),
                description=manifest.get("description"),
                version=manifest.get("version", "1.0.0"),
                common_config_schema={},  # Themes don't have config schemas
                enabled=True,  # Themes are enabled by default
                error_message=None,
            )
            session.add(db_type)
        else:
            # Update existing theme entry
            db_type.name = manifest.get("name", theme_id)
            db_type.description = manifest.get("description")
            db_type.version = manifest.get("version", "1.0.0")
            db_type.plugin_type = PluginType.THEME.value
            db_type.error_message = None

        await session.commit()


async def _unregister_theme_from_db(theme_id: str) -> None:
    """
    Remove a theme from PluginTypeDB.

    Args:
        theme_id: Theme identifier
    """
    async with AsyncSessionLocal() as session:
        result = await session.execute(select(PluginTypeDB).where(PluginTypeDB.type_id == theme_id))
        db_type = result.scalar_one_or_none()

        if db_type and db_type.plugin_type == PluginType.THEME.value:
            await session.delete(db_type)
            await session.commit()


async def sync_themes_to_db() -> None:
    """
    Sync all themes (built-in + installed) to PluginTypeDB.
    Should be called on startup to ensure themes are registered.
    """
    # Register built-in themes
    for theme_id, theme_data in BUILTIN_THEMES.items():
        await _register_theme_in_db(theme_data)

    # Register installed themes
    installed_themes = theme_installer.get_installed_themes()
    for theme in installed_themes:
        await _register_theme_in_db(theme)


# Sensitive fields that should be masked in logs and never sent to frontend
SENSITIVE_FIELDS = {
    "email_password",
    "password",
    "api_key",
    "api_token",
    "secret",
    "token",
    "access_token",
    "refresh_token",
}


def mask_sensitive_config(
    config: dict[str, Any], mask_for_frontend: bool = False
) -> dict[str, Any]:
    """
    Create a copy of config with sensitive fields masked for logging or frontend.

    Args:
        config: Configuration dictionary
        mask_for_frontend: If True, completely remove sensitive fields instead of masking

    Returns:
        Dictionary with sensitive fields masked or removed
    """
    masked = {}
    for key, value in config.items():
        is_sensitive = key.lower() in SENSITIVE_FIELDS or any(
            field in key.lower() for field in SENSITIVE_FIELDS
        )

        if is_sensitive:
            if mask_for_frontend:
                # Don't include sensitive fields at all when sending to frontend
                continue
            else:
                # Mask for logging
                if value:
                    # Mask the value, showing only first and last character if length > 2
                    if len(str(value)) > 2:
                        masked[key] = f"{str(value)[0]}***{str(value)[-1]}"
                    else:
                        masked[key] = "***"
                else:
                    masked[key] = ""
        else:
            if isinstance(value, dict):
                masked[key] = mask_sensitive_config(value, mask_for_frontend)
            else:
                masked[key] = value
    return masked


@router.get("/plugins")
async def get_plugins(
    plugin_type: str | None = Query(None, description="Optional plugin type filter"),
):
    """
    Get all plugin types, optionally filtered by type.

    Args:
        plugin_type: Optional plugin type filter ('calendar', 'image', 'service', 'theme')

    Returns:
        List of plugin types with their common configuration
    """
    # Normalize plugin_type: treat empty string as None
    if plugin_type == "":
        plugin_type = None

    # Parse plugin type if provided
    pt = None
    include_themes = False
    only_themes = False
    if plugin_type:
        plugin_type_lower = plugin_type.lower()
        try:
            pt = PluginType(plugin_type_lower)
            if pt == PluginType.THEME:
                only_themes = True
                include_themes = True
        except ValueError:
            valid_types = "calendar, image, service, theme"
            raise HTTPException(
                status_code=400,
                detail=f"Invalid plugin type: {plugin_type}. Valid types: {valid_types}",
            )

    # Get plugin types from pluggy hooks
    plugin_types = plugin_loader.get_plugin_types()

    # Filter out test plugins
    plugin_types = [t for t in plugin_types if not t.get("type_id", "").startswith("test_")]

    # Filter by plugin type if specified
    if pt:
        plugin_types = [t for t in plugin_types if t.get("plugin_type") == pt]

    # Load enabled status and error messages from database
    async with AsyncSessionLocal() as session:
        result = await session.execute(select(PluginTypeDB))
        db_types = {db_type.type_id: db_type for db_type in result.scalars().all()}

    # Convert to response format
    result = []
    # Only add regular plugins if not filtering for themes only
    if not only_themes:
        for type_info in plugin_types:
            type_id = type_info.get("type_id")
            plugin_type_enum = type_info.get("plugin_type")

            # Get plugin type info from database (including error messages)
            db_type = db_types.get(type_id)
            enabled = db_type.enabled if db_type else True  # Default to enabled
            error_message = db_type.error_message if db_type else None

            plugin_info: dict[str, Any] = {
                "id": type_id,
                "name": type_info.get("name", ""),
                "type": plugin_type_enum.value
                if hasattr(plugin_type_enum, "value")
                else str(plugin_type_enum),
                "description": type_info.get("description", ""),
                "config_schema": type_info.get("common_config_schema", {}),
                "instance_config_schema": type_info.get("instance_config_schema", {}),
                "enabled": enabled,
                "ui_actions": type_info.get("ui_actions", []),  # Plugin-specific actions (buttons)
                # Plugin-specific sections (upload, manage, etc.)
                "ui_sections": type_info.get("ui_sections", []),
                # Whether plugin supports multiple instances
                # (defaults to True for backward compatibility)
                "supports_multiple_instances": type_info.get("supports_multiple_instances", True),
            }

            # Include error message if plugin is broken
            if error_message:
                plugin_info["error_message"] = error_message

            result.append(plugin_info)

    # Add themes from database - they're just another plugin type, stored in PluginTypeDB
    # Include themes when:
    # 1. Explicitly requested (plugin_type == "theme")
    # 2. No filter specified (plugin_type is None) - show all types including themes
    if include_themes or plugin_type is None:
        try:
            import logging

            logger = logging.getLogger(__name__)

            # Get themes from database (same as other plugins)
            theme_db_types = {
                tid: db_type
                for tid, db_type in db_types.items()
                if db_type.plugin_type == PluginType.THEME.value
            }

            for theme_id, db_type in theme_db_types.items():
                # Get theme manifest for additional metadata (is_builtin, variables, etc.)
                # This is still needed for theme-specific features,
                # but DB is source of truth for listing
                theme_manifest = None
                try:
                    if db_type.type_id in BUILTIN_THEMES:
                        # Built-in theme - get from BUILTIN_THEMES
                        theme_manifest = BUILTIN_THEMES.get(db_type.type_id)
                    else:
                        # Installed theme - get from disk (for now, could cache in DB later)
                        theme_manifest = theme_installer.get_theme_manifest(db_type.type_id)
                except Exception as e:
                    logger.warning(
                        f"[get_plugins] Error loading theme manifest for {theme_id}: {e}"
                    )
                    # Use DB data if manifest unavailable

                # Determine if built-in
                is_builtin = theme_manifest.get("is_builtin", False) if theme_manifest else False

                theme_entry = {
                    "id": db_type.type_id,
                    "name": db_type.name,
                    "type": PluginType.THEME.value,
                    "description": db_type.description or "",
                    "config_schema": {},
                    "instance_config_schema": {},
                    "enabled": db_type.enabled,
                    "ui_actions": [],
                    "ui_sections": [],
                    "supports_multiple_instances": False,
                    "is_builtin": is_builtin,
                    "version": db_type.version or "1.0.0",
                }
                result.append(theme_entry)
        except Exception as e:
            import logging

            logger = logging.getLogger(__name__)
            logger.error(f"[get_plugins] Error including themes: {e}", exc_info=True)

    return {"plugins": result, "total": len(result)}


# Instance routes must come before generic plugin routes to avoid path conflicts
@router.post("/plugins/instances/{instance_id}/start")
async def start_plugin_instance(instance_id: str):
    """
    Start a plugin instance (if enabled).

    Args:
        instance_id: Plugin instance ID

    Returns:
        Success status and message
    """
    from app.plugins.manager import plugin_manager

    # Check if instance exists in database first
    async with AsyncSessionLocal() as session:
        result = await session.execute(select(PluginDB).where(PluginDB.id == instance_id))
        db_plugin = result.scalar_one_or_none()

        if not db_plugin:
            raise HTTPException(
                status_code=404, detail=f"Plugin instance {instance_id} not found in database"
            )

        if not db_plugin.enabled:
            raise HTTPException(
                status_code=400,
                detail=f"Cannot start disabled plugin {instance_id}. Enable it first.",
            )

    # Try to get plugin from manager
    plugin = plugin_manager.get_plugin(instance_id)

    # If plugin doesn't exist in manager, create it (shouldn't happen if enabled, but handle it)
    if not plugin:
        # Create and register the plugin instance
        plugin = plugin_loader.create_plugin_instance(
            plugin_id=instance_id,
            type_id=db_plugin.type_id,
            name=db_plugin.name,
            config=db_plugin.config or {},
        )
        if plugin:
            await plugin.configure(db_plugin.config or {})
            plugin.enabled = db_plugin.enabled
            plugin_manager.register(plugin)
        else:
            raise HTTPException(
                status_code=500,
                detail=(
                    f"Failed to create plugin instance {instance_id}. "
                    f"Plugin type {db_plugin.type_id} may not be available."
                ),
            )

    if plugin.is_running():
        return {
            "success": True,
            "message": f"Plugin {instance_id} is already running",
            "running": True,
        }

    success = await plugin_manager.start_plugin(instance_id)
    if success:
        return {
            "success": True,
            "message": f"Plugin {instance_id} started successfully",
            "running": plugin.is_running(),
        }
    else:
        raise HTTPException(status_code=500, detail=f"Failed to start plugin {instance_id}")


@router.post("/plugins/instances/{instance_id}/stop")
async def stop_plugin_instance(instance_id: str):
    """
    Stop a plugin instance.

    Args:
        instance_id: Plugin instance ID

    Returns:
        Success status and message
    """
    from app.plugins.manager import plugin_manager

    # Check if instance exists in database first
    async with AsyncSessionLocal() as session:
        result = await session.execute(select(PluginDB).where(PluginDB.id == instance_id))
        db_plugin = result.scalar_one_or_none()

        if not db_plugin:
            raise HTTPException(
                status_code=404, detail=f"Plugin instance {instance_id} not found in database"
            )

    # Try to get plugin from manager
    plugin = plugin_manager.get_plugin(instance_id)

    # If plugin doesn't exist in manager, it's already stopped
    if not plugin:
        return {
            "success": True,
            "message": f"Plugin {instance_id} is already stopped (not loaded)",
            "running": False,
        }

    if not plugin.is_running():
        return {
            "success": True,
            "message": f"Plugin {instance_id} is already stopped",
            "running": False,
        }

    success = await plugin_manager.stop_plugin(instance_id)
    if success:
        return {
            "success": True,
            "message": f"Plugin {instance_id} stopped successfully",
            "running": False,
        }
    else:
        raise HTTPException(status_code=500, detail=f"Failed to stop plugin {instance_id}")


# Specific routes must come before parameterized routes to avoid path conflicts
@router.get("/plugins/installed")
async def get_installed_plugins():
    """
    Get list of installed plugins and themes.

    Returns:
        List of installed plugin and theme manifests
    """
    try:
        plugins = plugin_installer.get_installed_plugins()
        # Remove internal path from response
        for plugin in plugins:
            plugin.pop("_installed_path", None)

        # Also include installed themes
        themes = theme_installer.get_installed_themes()
        # Remove internal path from response
        for theme in themes:
            theme.pop("_installed_path", None)
            # Add type field to distinguish from plugins
            theme["type"] = PluginType.THEME.value

        return {"plugins": plugins + themes}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get installed plugins: {str(e)}")


@router.post("/plugins/install")
async def install_plugin(
    file: UploadFile = File(...),
    plugin_id: str | None = None,
):
    """
    Install a plugin from a zip file or directory.

    Args:
        file: Plugin package zip file
        plugin_id: Optional plugin ID override

    Returns:
        Plugin manifest
    """
    import shutil
    import tempfile

    if not file.filename:
        raise HTTPException(status_code=400, detail="No file provided")

    # Save uploaded file to temporary location
    temp_path = None
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=".zip") as temp_file:
            # Write uploaded file to temp file
            shutil.copyfileobj(file.file, temp_file)
            temp_path = Path(temp_file.name)

        # Install plugin
        try:
            manifest = plugin_installer.install_plugin(temp_path, plugin_id)

            # Reload plugins to include the newly installed one
            plugin_loader.load_installed_plugins()

            return {
                "success": True,
                "message": f"Plugin {manifest['id']} installed successfully",
                "manifest": manifest,
                "requires_restart": True,
            }
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to install plugin: {str(e)}")
    finally:
        # Clean up temp file
        if temp_path and temp_path.exists():
            try:
                temp_path.unlink()
            except (PermissionError, OSError):
                # File might be locked on Windows, ignore
                pass


@router.get("/plugins/enumerate-from-github")
async def enumerate_plugins_from_github(
    repo_url: str,
    branch: str | None = None,
):
    """
    Enumerate available plugins from a GitHub repository.

    Args:
        repo_url: GitHub repository URL (e.g., https://github.com/user/repo)
        branch: Optional branch name (defaults to main/master)

    Returns:
        Dictionary with manifest info and list of available plugins
    """
    import re
    import shutil
    import tempfile

    import httpx

    # Parse GitHub URL
    github_pattern = r"github\.com[/:]([^/]+)/([^/]+?)(?:\.git)?/?$"
    match = re.search(github_pattern, repo_url)
    if not match:
        raise HTTPException(
            status_code=400,
            detail="Invalid GitHub repository URL. Expected format: https://github.com/user/repo",
        )

    owner, repo = match.groups()
    branch = branch or "main"

    # Download zip from GitHub
    zip_url = f"https://github.com/{owner}/{repo}/archive/refs/heads/{branch}.zip"
    temp_path = None
    temp_dir = None

    try:
        # Download the zip file
        branch_switched = False
        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.get(zip_url, follow_redirects=True)
            if response.status_code == 404:
                # Try master branch if main doesn't exist
                # (only if user didn't explicitly specify branch)
                # Note: branch defaults to "main" if not provided
                if branch == "main":
                    zip_url = f"https://github.com/{owner}/{repo}/archive/refs/heads/master.zip"
                    response = await client.get(zip_url, follow_redirects=True)
                    if response.status_code != 404:
                        branch_switched = True
                if response.status_code == 404:
                    raise HTTPException(
                        status_code=404,
                        detail=(
                            f"Repository or branch '{branch}' not found. "
                            "Make sure the repository exists and is public."
                        ),
                    )
            response.raise_for_status()

            # Save to temporary file
            with tempfile.NamedTemporaryFile(delete=False, suffix=".zip") as temp_file:
                temp_file.write(response.content)
                temp_path = Path(temp_file.name)

        # Extract to temporary directory
        temp_dir = tempfile.mkdtemp()
        with zipfile.ZipFile(temp_path, "r") as zip_ref:
            zip_ref.extractall(temp_dir)

        # Find the root directory (GitHub zips contain repo-name-branch/)
        extracted_path = Path(temp_dir)
        subdirs = [d for d in extracted_path.iterdir() if d.is_dir()]
        if len(subdirs) == 1:
            repo_root = subdirs[0]
        else:
            repo_root = extracted_path

        # Enumerate plugins and themes
        plugins_result = {"has_manifest": False, "plugins": []}
        try:
            plugins_result = plugin_installer.enumerate_plugins_from_repo(repo_root)
        except Exception as e:
            import logging

            logger = logging.getLogger(__name__)
            logger.warning(f"Failed to enumerate plugins from repo: {e}")

        # Enumerate themes (don't fail if this errors - just return empty themes)
        themes_result = {"has_manifest": False, "themes": []}
        try:
            themes_result = theme_installer.enumerate_themes_from_repo(repo_root)
        except Exception as e:
            import logging

            logger = logging.getLogger(__name__)
            logger.warning(f"Failed to enumerate themes from repo: {e}")

        actual_branch = "master" if branch_switched else branch
        return {
            "success": True,
            "repo_url": repo_url,
            "branch": actual_branch,
            "branch_switched": branch_switched,
            "has_manifest": plugins_result.get("has_manifest", False)
            or themes_result.get("has_manifest", False),
            "plugins": plugins_result.get("plugins", []),
            "themes": themes_result.get("themes", []),
        }
    except HTTPException:
        raise
    except Exception as e:
        import logging

        logger = logging.getLogger(__name__)
        logger.error(f"Failed to enumerate plugins from GitHub: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to enumerate plugins: {str(e)}")
    finally:
        # Clean up temp files
        if temp_path and temp_path.exists():
            try:
                temp_path.unlink()
            except (PermissionError, OSError):
                pass
        if temp_dir and Path(temp_dir).exists():
            try:
                shutil.rmtree(temp_dir)
            except (PermissionError, OSError):
                pass


@router.post("/plugins/install-from-github")
async def install_plugin_from_github(request: dict[str, Any] = Body(...)):
    """
    Install a specific plugin from a GitHub repository.

    Args:
        request: Request body containing:
            - repo_url: GitHub repository URL
            - plugin_path: Relative path to plugin directory within repo
            - branch: Optional branch name (defaults to main/master)
            - plugin_id: Optional plugin ID override

    Returns:
        Plugin manifest
    """
    import re
    import shutil
    import tempfile

    import httpx

    repo_url = request.get("repo_url")
    plugin_path = request.get("plugin_path")
    if not repo_url:
        raise HTTPException(status_code=400, detail="repo_url is required")
    if not plugin_path:
        raise HTTPException(status_code=400, detail="plugin_path is required")

    branch = request.get("branch") or "main"
    plugin_id = request.get("plugin_id")

    # Parse GitHub URL
    github_pattern = r"github\.com[/:]([^/]+)/([^/]+?)(?:\.git)?/?$"
    match = re.search(github_pattern, repo_url)
    if not match:
        raise HTTPException(
            status_code=400,
            detail="Invalid GitHub repository URL. Expected format: https://github.com/user/repo",
        )

    owner, repo = match.groups()

    # Download zip from GitHub
    zip_url = f"https://github.com/{owner}/{repo}/archive/refs/heads/{branch}.zip"
    temp_path = None
    temp_dir = None

    try:
        # Download the zip file
        branch_switched = False
        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.get(zip_url, follow_redirects=True)
            if response.status_code == 404:
                # Try master branch if main doesn't exist (only if user didn't specify branch)
                original_branch = request.get("branch")
                if branch == "main" and not original_branch:
                    zip_url = f"https://github.com/{owner}/{repo}/archive/refs/heads/master.zip"
                    response = await client.get(zip_url, follow_redirects=True)
                    if response.status_code != 404:
                        branch_switched = True
                if response.status_code == 404:
                    raise HTTPException(
                        status_code=404,
                        detail=(
                            f"Repository or branch '{branch}' not found. "
                            "Make sure the repository exists and is public."
                        ),
                    )
            response.raise_for_status()

            # Save to temporary file
            with tempfile.NamedTemporaryFile(delete=False, suffix=".zip") as temp_file:
                temp_file.write(response.content)
                temp_path = Path(temp_file.name)

        # Extract to temporary directory
        temp_dir = tempfile.mkdtemp()
        with zipfile.ZipFile(temp_path, "r") as zip_ref:
            zip_ref.extractall(temp_dir)

        # Find the root directory (GitHub zips contain repo-name-branch/)
        extracted_path = Path(temp_dir)
        subdirs = [d for d in extracted_path.iterdir() if d.is_dir()]
        if len(subdirs) == 1:
            repo_root = subdirs[0]
        else:
            repo_root = extracted_path

        # Detect if it's a theme or plugin by checking for theme.json or plugin.json
        theme_path = repo_root / plugin_path / "theme.json"
        plugin_path_check = repo_root / plugin_path / "plugin.json"

        try:
            if theme_path.exists():
                # Install theme
                manifest = theme_installer.install_theme_from_repo(
                    repo_root, plugin_path, plugin_id
                )
                # Register theme in database
                await _register_theme_in_db(manifest)
                actual_branch = "master" if branch_switched else branch
                return {
                    "success": True,
                    "message": f"Theme {manifest['id']} installed successfully from {repo_url}",
                    "manifest": manifest,
                    "branch": actual_branch,
                    "branch_switched": branch_switched,
                    "requires_restart": False,  # Themes don't require restart
                }
            elif plugin_path_check.exists():
                # Install plugin
                manifest = plugin_installer.install_plugin_from_repo(
                    repo_root, plugin_path, plugin_id
                )

                # Reload plugins to include the newly installed one
                plugin_loader.load_installed_plugins()

                actual_branch = "master" if branch_switched else branch
                return {
                    "success": True,
                    "message": f"Plugin {manifest['id']} installed successfully from {repo_url}",
                    "manifest": manifest,
                    "branch": actual_branch,
                    "branch_switched": branch_switched,
                    "requires_restart": True,
                }
            else:
                raise HTTPException(
                    status_code=400,
                    detail=f"Neither plugin.json nor theme.json found in {plugin_path}",
                )
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to install: {str(e)}")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Failed to install plugin from GitHub: {str(e)}"
        )
    finally:
        # Clean up temp files
        if temp_path and temp_path.exists():
            try:
                temp_path.unlink()
            except (PermissionError, OSError):
                pass
        if temp_dir and Path(temp_dir).exists():
            try:
                shutil.rmtree(temp_dir)
            except (PermissionError, OSError):
                pass


@router.get("/plugins/{plugin_id}")
async def get_plugin(plugin_id: str):
    """Get a specific plugin type or theme by ID."""
    # Check if it's a theme first (check built-in, then database, then installed)
    theme_manifest = None

    # Check built-in themes first
    if plugin_id in BUILTIN_THEMES:
        theme_manifest = BUILTIN_THEMES.get(plugin_id)
    else:
        # Check database
        async with AsyncSessionLocal() as session:
            result = await session.execute(
                select(PluginTypeDB).where(PluginTypeDB.type_id == plugin_id)
            )
            db_type = result.scalar_one_or_none()

            if db_type and db_type.plugin_type == PluginType.THEME.value:
                # It's a theme in database - try to get manifest
                try:
                    theme_manifest = theme_installer.get_theme_manifest(plugin_id)
                except Exception:
                    pass

    # If still not found, try installed themes (might not be in DB yet)
    if not theme_manifest:
        try:
            theme_manifest = theme_installer.get_theme_manifest(plugin_id)
        except Exception:
            pass

    if theme_manifest:
        # Remove internal path if present
        theme_manifest.pop("_installed_path", None)
        return theme_manifest

    # Not a theme - get plugin type from pluggy hooks
    plugin_types = plugin_loader.get_plugin_types()
    type_info = next((t for t in plugin_types if t.get("type_id") == plugin_id), None)

    if not type_info:
        raise HTTPException(status_code=404, detail="Plugin type not found")

    # Get enabled status and error message from database
    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(PluginTypeDB).where(PluginTypeDB.type_id == plugin_id)
        )
        db_type = result.scalar_one_or_none()

    enabled = db_type.enabled if db_type else True
    error_message = db_type.error_message if db_type else None

    plugin_info: dict[str, Any] = {
        "id": type_info.get("type_id"),
        "name": type_info.get("name", ""),
        "type": type_info.get("plugin_type").value
        if hasattr(type_info.get("plugin_type"), "value")
        else str(type_info.get("plugin_type")),
        "description": type_info.get("description", ""),
        "config_schema": type_info.get("common_config_schema", {}),
        "enabled": enabled,
    }

    # Include error message if plugin is broken
    if error_message:
        plugin_info["error_message"] = error_message

    return plugin_info


@router.get("/plugins/{plugin_id}/instances")
async def get_plugin_instances(plugin_id: str):
    """
    Get all plugin instances for a plugin type, including running status.

    Args:
        plugin_id: Plugin type ID

    Returns:
        List of plugin instances with their running status
    """
    from app.plugins.manager import plugin_manager

    # Get instances from database, sorted by display_order
    async with AsyncSessionLocal() as session:
        from sqlalchemy import asc

        result = await session.execute(
            select(PluginDB)
            .where(PluginDB.type_id == plugin_id)
            .order_by(asc(PluginDB.display_order), asc(PluginDB.name))
        )
        db_plugins = result.scalars().all()

    instances = []
    for db_plugin in db_plugins:
        # Try to get plugin instance if it exists (only enabled plugins have instances)
        plugin = plugin_manager.get_plugin(db_plugin.id)
        running = plugin.is_running() if plugin else False

        # Serialize config, converting Path objects and other non-serializable types to strings
        def serialize_value(val):
            """Recursively serialize values to JSON-serializable types."""
            if val is None:
                return None
            elif isinstance(val, str | int | float | bool):
                return val
            elif isinstance(val, Path):
                return str(val)
            elif isinstance(val, dict):
                return {k: serialize_value(v) for k, v in val.items()}
            elif isinstance(val, list):
                return [serialize_value(item) for item in val]
            else:
                # For any other type (including Path-like objects), convert to string
                try:
                    # Try to get string representation
                    if hasattr(val, "__str__"):
                        return str(val)
                    elif hasattr(val, "path"):
                        return str(val.path)
                    else:
                        return str(val)
                except Exception:
                    return "[Unable to serialize]"

        config = db_plugin.config or {}
        serialized_config = serialize_value(config)

        instances.append(
            {
                "id": db_plugin.id,
                "name": db_plugin.name,
                "enabled": db_plugin.enabled,
                "running": running,
                "config": mask_sensitive_config(serialized_config, mask_for_frontend=True),
                "display_order": db_plugin.display_order or 0,
            }
        )

    return {"instances": instances, "total": len(instances)}


@router.put("/plugins/{plugin_id}/instances/order")
async def update_plugin_instances_order(
    plugin_id: str, instance_orders: dict[str, int] = Body(...)
):
    """
    Update display order for plugin instances.

    Args:
        plugin_id: Plugin type ID
        instance_orders: Dictionary mapping instance IDs to their new display_order values

    Returns:
        Success status and message
    """
    async with AsyncSessionLocal() as session:
        # Get all instances for this plugin type
        result = await session.execute(select(PluginDB).where(PluginDB.type_id == plugin_id))
        db_plugins = result.scalars().all()

        # Update display_order for each instance
        updated_count = 0
        for db_plugin in db_plugins:
            if db_plugin.id in instance_orders:
                db_plugin.display_order = instance_orders[db_plugin.id]
                updated_count += 1

        if updated_count > 0:
            await session.commit()
            return {
                "success": True,
                "message": f"Updated display order for {updated_count} instance(s)",
                "updated": updated_count,
            }
        else:
            return {"success": False, "message": "No instances were updated", "updated": 0}


@router.put("/plugins/{plugin_id}")
async def update_plugin(plugin_id: str, config: dict[str, Any]):
    """
    Update plugin type common configuration and enabled status.

    Args:
        plugin_id: Plugin type ID (e.g., 'google', 'ical', 'local', 'light', 'midnight')
        config: Configuration dictionary with common settings and/or enabled status
    """
    print(f"[Plugin Update] Received update for plugin {plugin_id}")
    print(f"[Plugin Update] Config keys: {list(config.keys())}")

    # Check if it's a theme first
    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(PluginTypeDB).where(PluginTypeDB.type_id == plugin_id)
        )
        db_type = result.scalar_one_or_none()

        if db_type and db_type.plugin_type == PluginType.THEME.value:
            # It's a theme - handle enabled status only (themes don't have config)
            if "enabled" in config:
                enabled = config["enabled"]
                db_type.enabled = enabled
                await session.commit()
                return {"success": True, "enabled": enabled}
            else:
                # No enabled status to update
                return {"success": True}

    # Not a theme - get plugin type from pluggy hooks
    plugin_types = plugin_loader.get_plugin_types()
    type_info = next((t for t in plugin_types if t.get("type_id") == plugin_id), None)

    if not type_info:
        print(f"[Plugin Update] Plugin type {plugin_id} not found")
        raise HTTPException(status_code=404, detail="Plugin type not found")

    print(f"[Plugin Update] Found plugin type: {type_info.get('name')}")

    # Store common configuration in database
    from pathlib import Path

    from app.plugins.manager import plugin_manager

    # Handle enabled status separately
    enabled = None
    if "enabled" in config:
        enabled = config["enabled"]
        # Remove enabled from config dict to avoid storing it in config
        config = {k: v for k, v in config.items() if k != "enabled"}

    # Mask sensitive fields for logging
    masked_config = mask_sensitive_config(config)
    print(f"[Plugin Update] Updating plugin {plugin_id} with config: {masked_config}")

    # Clean config values - ensure all values are strings, not objects
    cleaned_config = {}
    print("[Plugin Update] Cleaning config values...")
    for key, value in config.items():
        # Mask sensitive values in logs
        if key.lower() in SENSITIVE_FIELDS or any(
            field in key.lower() for field in SENSITIVE_FIELDS
        ):
            masked_value = (
                f"{str(value)[0]}***{str(value)[-1]}"
                if len(str(value)) > 2
                else "***"
                if value
                else ""
            )
            print(
                f"[Plugin Update] Processing config key '{key}': "
                f"type={type(value)}, value={masked_value}"
            )
        else:
            print(
                f"[Plugin Update] Processing config key '{key}': type={type(value)}, value={value}"
            )
        if isinstance(value, dict):
            # If it's a schema object, extract the actual value or default
            cleaned_value = value.get("value") or value.get("default") or ""
            print(f"[Plugin Update] Extracted value from dict: {cleaned_value}")
            cleaned_config[key] = cleaned_value
        elif isinstance(value, Path):
            # Handle Path objects - convert to string
            cleaned_config[key] = str(value)
            print(f"[Plugin Update] Converted Path to string: {cleaned_config[key]}")
        elif value is None:
            cleaned_config[key] = ""
            print("[Plugin Update] Set to empty string (was None)")
        else:
            cleaned_config[key] = str(value)
        # Mask sensitive values in logs
        if key.lower() in SENSITIVE_FIELDS or any(
            field in key.lower() for field in SENSITIVE_FIELDS
        ):
            masked_value = (
                f"{str(cleaned_config[key])[0]}***{str(cleaned_config[key])[-1]}"
                if len(str(cleaned_config[key])) > 2
                else "***"
                if cleaned_config[key]
                else ""
            )
            print(
                f"[Plugin Update] Final value for '{key}': {masked_value} "
                f"(type: {type(cleaned_config[key])})"
            )
        else:
            print(
                f"[Plugin Update] Final value for '{key}': {cleaned_config[key]} "
                f"(type: {type(cleaned_config[key])})"
            )

    config = cleaned_config
    masked_cleaned_config = mask_sensitive_config(config)
    print(f"[Plugin Update] Final cleaned config: {masked_cleaned_config}")

    # Update plugin type in database
    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(PluginTypeDB).where(PluginTypeDB.type_id == plugin_id)
        )
        db_type = result.scalar_one_or_none()

        if not db_type:
            # Create new plugin type in database
            plugin_type = type_info.get("plugin_type")
            db_type = PluginTypeDB(
                type_id=plugin_id,
                plugin_type=plugin_type.value
                if hasattr(plugin_type, "value")
                else str(plugin_type),
                name=type_info.get("name", ""),
                description=type_info.get("description", ""),
                version=type_info.get("version"),
                common_config_schema=type_info.get("common_config_schema", {}),
                enabled=enabled if enabled is not None else True,
            )
            session.add(db_type)
        else:
            # Update existing plugin type
            if enabled is not None:
                db_type.enabled = enabled
            if config:
                # Update common config schema if provided
                # Note: common_config_schema stores both schema AND values
                current_schema = db_type.common_config_schema or {}
                current_schema.update(config)
                db_type.common_config_schema = current_schema

                # Log API token status (if present) for verification
                if "api_token" in config:
                    token_value = config.get("api_token", "")
                    token_status = "present" if token_value else "missing"
                    token_length = len(str(token_value)) if token_value else 0
                    print(
                        f"[Plugin Update] Saving API token to PluginTypeDB.common_config_schema - "
                        f"{token_status} (length: {token_length})"
                    )

        await session.commit()
        await session.refresh(db_type)

        # Verify API token was saved to common_config_schema
        if config and "api_token" in config:
            saved_schema = db_type.common_config_schema or {}
            saved_token = saved_schema.get("api_token", "")
            input_token = config.get("api_token", "")
            if saved_token != input_token:
                print(
                    f"[Plugin Update] WARNING: API token mismatch in common_config_schema! "
                    f"Input length: {len(str(input_token))}, Saved length: {len(str(saved_token))}"
                )
            else:
                print(
                    f"[Plugin Update] API token verified in PluginTypeDB.common_config_schema "
                    f"(length: {len(str(saved_token))})"
                )

        # Sync plugin type and instance enabled states - they should always be the same
        # From user's perspective, plugin type IS the plugin instance
        if enabled is not None and db_type:
            # Update plugin type enabled state
            db_type.enabled = enabled
            await session.commit()

            # Find all instances of this plugin type and sync them
            result = await session.execute(select(PluginDB).where(PluginDB.type_id == plugin_id))
            instances = result.scalars().all()

            for instance in instances:
                instance.enabled = enabled
                # Also update the plugin instance in memory
                plugin = plugin_manager.get_plugin(instance.id)
                if plugin:
                    if enabled:
                        plugin.enable()
                        # Start the plugin if it's not running
                        if not plugin.is_running():
                            try:
                                await plugin.initialize()
                                plugin.start()
                            except Exception as e:
                                import logging

                                logger = logging.getLogger(__name__)
                                logger.error(
                                    f"Error starting plugin {instance.id}: {e}", exc_info=True
                                )
                    else:
                        plugin.disable()
                        # Stop the plugin if it's running
                        if plugin.is_running():
                            try:
                                plugin.stop()
                                await plugin.cleanup()
                            except Exception as e:
                                import logging

                                logger = logging.getLogger(__name__)
                                logger.warning(
                                    f"Error stopping plugin {instance.id}: {e}", exc_info=True
                                )

            if instances:
                await session.commit()
                print(
                    f"[Plugin Update] Synced plugin type and {len(instances)} "
                    f"instance(s) enabled state to {enabled} for {plugin_id}"
                )

        # Save common config to config service for backward compatibility
        if config:
            from app.services.config_service import config_service

            config_key = f"plugin_{plugin_id}_config"
            import json

            # Ensure all values in config are JSON-serializable (strings, not Path objects)
            serializable_config = {}
            for key, value in config.items():
                if isinstance(value, Path):
                    serializable_config[key] = str(value)
                elif isinstance(value, dict):
                    # Skip dict objects that might be schema objects
                    serializable_config[key] = value.get("value") or value.get("default") or ""
                else:
                    serializable_config[key] = value
            config_json = json.dumps(serializable_config)
            # Mask sensitive fields before logging
            masked_serializable = mask_sensitive_config(serializable_config)
            masked_json = json.dumps(masked_serializable)
            print(f"[Plugin Update] Saving config to service: {masked_json}")
            await config_service.set_value(config_key, config_json)

        # Call plugin-specific config update handlers (if any)
        # This allows plugins to handle their own instance creation/update logic
        # Plugins are self-contained and should implement handle_plugin_config_update hook
        import asyncio

        from app.plugins.hooks import plugin_manager as hook_manager

        # Pluggy returns a list of coroutines for async hooks, we need to await them
        update_coroutines = hook_manager.hook.handle_plugin_config_update(
            type_id=plugin_id,
            config=cleaned_config,
            enabled=enabled,
            db_type=db_type,
            session=session,
        )

        # Await all hook implementations
        update_results = await asyncio.gather(*update_coroutines, return_exceptions=True)

        # Check if any plugin handled the update
        handled = False
        for result in update_results:
            # Skip exceptions (they're wrapped in the result)
            if isinstance(result, Exception):
                continue
            if result is not None:
                handled = True
                print(f"[Plugin Update] Plugin {plugin_id} handled config update: {result}")
                break

        if not handled and cleaned_config:
            # If no plugin handled it and we have config, log a warning
            print(
                f"[Plugin Update] No plugin handler found for {plugin_id}, "
                f"config saved but no instance management performed"
            )

    return {"message": "Plugin type configuration updated", "plugin_id": plugin_id}


@router.get("/plugins/{plugin_id}/config")
async def get_plugin_config(plugin_id: str):
    """Get plugin type common configuration."""
    print(f"[Plugin Config] Getting config for plugin {plugin_id}")

    # Get plugin types from pluggy hooks
    plugin_types = plugin_loader.get_plugin_types()
    type_info = next((t for t in plugin_types if t.get("type_id") == plugin_id), None)

    if not type_info:
        raise HTTPException(status_code=404, detail="Plugin type not found")

    # Load actual config values from config service (not schema)
    from app.services.config_service import config_service

    config_key = f"plugin_{plugin_id}_config"
    config_json = await config_service.get_value(config_key)

    # Mask sensitive fields in raw config before logging
    if config_json:
        import json

        try:
            temp_config = json.loads(config_json)
            masked_temp = mask_sensitive_config(temp_config)
            print(f"[Plugin Config] Raw config from service: {json.dumps(masked_temp)}")
        except Exception:
            pass

    if config_json:
        import json

        try:
            config = json.loads(config_json)
            masked_parsed = mask_sensitive_config(config)
            print(f"[Plugin Config] Parsed config: {masked_parsed}")
        except json.JSONDecodeError as e:
            print(f"[Plugin Config] ERROR: Failed to parse JSON: {e}")
            config = {}
    else:
        config = {}

    # Mask sensitive fields before returning
    return mask_sensitive_config(config, mask_for_frontend=True)


@router.post("/plugins/{plugin_id}/fetch")
async def fetch_plugin(plugin_id: str):
    """
    Manually trigger plugin fetch/check operation.

    Uses plugin hooks to allow plugins to implement their own fetch logic.

    Args:
        plugin_id: Plugin type ID (e.g., 'imap')

    Returns:
        Fetch result with success status, message, and details
    """
    # Get plugin types from pluggy hooks
    plugin_types = plugin_loader.get_plugin_types()
    type_info = next((t for t in plugin_types if t.get("type_id") == plugin_id), None)

    if not type_info:
        raise HTTPException(status_code=404, detail="Plugin type not found")

    # Call plugin-specific fetch handlers via hooks
    import asyncio

    from app.plugins.hooks import plugin_manager as hook_manager

    # Pluggy returns a list of coroutines for async hooks, we need to await them
    fetch_coroutines = hook_manager.hook.fetch_plugin_data(
        type_id=plugin_id,
        instance_id=None,
    )
    fetch_results = await asyncio.gather(*fetch_coroutines, return_exceptions=True)

    # Check if any plugin handled the fetch
    for result in fetch_results:
        # Skip exceptions (they're wrapped in the result)
        if isinstance(result, Exception):
            continue
        if result is not None:
            return result

    # Default: plugin doesn't support fetching
    return {
        "success": False,
        "message": "This plugin type does not support manual fetch",
        "images_downloaded": False,
        "image_count": 0,
    }


@router.post("/plugins/{plugin_id}/geocode")
async def geocode_location(plugin_id: str, request: dict[str, Any] = Body(...)):
    """
    Geocode a location name to coordinates using OpenStreetMap Nominatim API.

    This endpoint is used by plugins (e.g., Yr.no weather) to convert location
    names to latitude/longitude coordinates.

    Args:
        plugin_id: Plugin instance ID
        request: Request body with "location" field

    Returns:
        Dictionary with latitude, longitude, and display_name
    """
    import httpx
    from sqlalchemy import select

    from app.database import AsyncSessionLocal
    from app.models.db_models import PluginDB

    location = request.get("location", "").strip()
    if not location:
        raise HTTPException(status_code=400, detail="Location is required")

    # Verify plugin type (optional - allow geocoding even if plugin instance doesn't exist yet)
    # This allows users to geocode before saving the plugin configuration
    async with AsyncSessionLocal() as session:
        # Check if plugin exists and is yr_weather type
        result = await session.execute(select(PluginDB).where(PluginDB.id == plugin_id))
        db_plugin = result.scalar_one_or_none()

        # If plugin exists, verify it's the right type
        if db_plugin and db_plugin.type_id != "yr_weather":
            raise HTTPException(
                status_code=400, detail="Geocoding is only available for Yr.no weather plugins"
            )

        # If plugin doesn't exist, check if the plugin_id matches the expected pattern
        # This allows geocoding for new plugin instances before they're saved
        # We'll allow it if the plugin_id looks like it could be a yr_weather plugin
        # (starts with 'yr_weather' or is just 'yr_weather')
        if not db_plugin:
            # Allow geocoding for new instances - we'll validate the location instead
            pass

    try:
        # Use OpenStreetMap Nominatim API (free, no API key required)
        # Per usage policy: https://operations.osmfoundation.org/policies/nominatim/
        # We must include a User-Agent header
        headers = {
            "User-Agent": "Calvin-Dashboard/1.0 (https://github.com/osterbergsimon/calvin)",
        }

        params = {
            "q": location,
            "format": "json",
            "limit": 5,  # Get more results to find the best match
            "addressdetails": 1,
        }

        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(
                "https://nominatim.openstreetmap.org/search",
                params=params,
                headers=headers,
            )
            response.raise_for_status()
            results = response.json()

            if not results:
                return {
                    "success": False,
                    "message": (
                        f"Location '{location}' not found. Please try a more specific location."
                    ),
                }

            # Try to find the best match
            # Prefer results that match the input location name more closely
            best_result = None
            best_score = -1
            location_lower = location.lower()
            # Extract the main location name (before comma if present)
            main_location = location_lower.split(",")[0].strip()

            for result in results:
                display_name = result.get("display_name", "").lower()
                place_type = result.get("type", "")
                importance = result.get("importance", 0)
                score = 0

                # Score based on how well it matches
                # 1. If the main location name appears at the start of display_name, high score
                if display_name.startswith(main_location):
                    score += 100
                # 2. If main location name appears early in display_name
                elif main_location in display_name[: len(main_location) + 30]:
                    score += 50
                # 3. If main location name appears anywhere
                elif main_location in display_name:
                    score += 25

                # Prefer actual places over administrative boundaries
                if place_type in ("city", "town", "village", "municipality", "island"):
                    score += 30
                elif place_type in ("administrative", "boundary"):
                    score -= 20  # Penalize administrative boundaries

                # Boost by importance
                score += importance * 10

                # Prefer results where the input location name is the primary name
                # (check if it's in the name field, not just display_name)
                name = result.get("name", "").lower()
                if main_location in name:
                    score += 40

                if score > best_score:
                    best_score = score
                    best_result = result

            # Fallback to first result if no better match found
            if best_result is None:
                best_result = results[0]

            result = best_result
            lat = float(result["lat"])
            lon = float(result["lon"])

            # Round to 4 decimals as per Yr.no API requirements
            lat = round(lat, 4)
            lon = round(lon, 4)

            # Get display name
            display_name = result.get("display_name", location)

            return {
                "success": True,
                "latitude": lat,
                "longitude": lon,
                "display_name": display_name,
                "message": f"Found coordinates for '{display_name}'",
            }

    except httpx.HTTPStatusError as e:
        return {
            "success": False,
            "message": f"Geocoding service error: {e.response.status_code}",
        }
    except httpx.HTTPError as e:
        return {
            "success": False,
            "message": f"Network error: {str(e)}",
        }
    except Exception as e:
        return {
            "success": False,
            "message": f"Error: {str(e)}",
        }


@router.post("/plugins/{plugin_id}/test")
async def test_plugin(plugin_id: str, test_config: dict[str, Any] | None = Body(default=None)):
    """
    Test plugin connection/configuration.

    Uses plugin hooks to allow plugins to implement their own connection testing logic.

    Args:
        plugin_id: Plugin type ID (e.g., 'imap', 'mealie')
        test_config: Optional config to use for testing (if not provided, uses saved config)

    Returns:
        Test result with success status and message
    """
    # Get plugin types from pluggy hooks
    plugin_types = plugin_loader.get_plugin_types()
    type_info = next((t for t in plugin_types if t.get("type_id") == plugin_id), None)

    if not type_info:
        raise HTTPException(status_code=404, detail="Plugin type not found")

    # Use provided test_config if available, otherwise get saved config
    if test_config:
        config = test_config
    else:
        # Get plugin config
        from app.services.config_service import config_service

        config_key = f"plugin_{plugin_id}_config"
        config_json = await config_service.get_value(config_key)

        if config_json:
            import json

            try:
                config = json.loads(config_json)
            except json.JSONDecodeError:
                config = {}
        else:
            config = {}

    # Call plugin-specific test handlers via hooks
    import asyncio

    from app.plugins.hooks import plugin_manager as hook_manager

    # Pluggy returns a list of coroutines for async hooks, we need to await them
    test_coroutines = hook_manager.hook.test_plugin_connection(
        type_id=plugin_id,
        config=config,
    )
    test_results = await asyncio.gather(*test_coroutines, return_exceptions=True)

    # Check if any plugin handled the test
    for result in test_results:
        # Skip exceptions (they're wrapped in the result)
        if isinstance(result, Exception):
            continue
        if result is not None:
            return result

    # Default: plugin doesn't support testing
    return {
        "success": False,
        "message": "This plugin type does not support connection testing",
    }


@router.delete("/plugins/installed/{plugin_id}")
async def uninstall_plugin(plugin_id: str):
    """
    Uninstall a plugin or theme.

    Args:
        plugin_id: Plugin/theme identifier

    Returns:
        Success message
    """
    try:
        # Check if it's a theme by checking database
        async with AsyncSessionLocal() as session:
            result = await session.execute(
                select(PluginTypeDB).where(PluginTypeDB.type_id == plugin_id)
            )
            db_type = result.scalar_one_or_none()

            if db_type and db_type.plugin_type == PluginType.THEME.value:
                # Uninstall theme
                theme_installer.uninstall_theme(plugin_id)
                # Remove theme from database
                await _unregister_theme_from_db(plugin_id)
                return {
                    "success": True,
                    "message": f"Theme {plugin_id} uninstalled successfully",
                }
            else:
                # Uninstall regular plugin
                plugin_installer.uninstall_plugin(plugin_id)

                # Reload plugins to remove the uninstalled one
                # Note: We can't easily unload a module from Python,
                # but it won't be loaded on next restart
                plugin_loader._loaded_modules = {
                    m
                    for m in plugin_loader._loaded_modules
                    if not m.startswith(f"installed_plugin_{plugin_id}")
                }

                return {
                    "success": True,
                    "message": f"Plugin {plugin_id} uninstalled successfully",
                }
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to uninstall plugin: {str(e)}")


@router.get("/plugins/installed/{plugin_id}")
async def get_installed_plugin(plugin_id: str):
    """
    Get manifest for an installed plugin.

    Args:
        plugin_id: Plugin identifier

    Returns:
        Plugin manifest
    """
    manifest = plugin_installer.get_plugin_manifest(plugin_id)
    if not manifest:
        raise HTTPException(status_code=404, detail=f"Plugin {plugin_id} not found")
    return manifest
