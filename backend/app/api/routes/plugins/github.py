"""GitHub and local plugin installation endpoints."""

import re
import shutil
import tempfile
import zipfile
from pathlib import Path
from typing import Any

import httpx
from fastapi import APIRouter, Body, HTTPException
from loguru import logger

from app.api.routes.plugins.management import _validate_just_installed_plugin
from app.api.routes.plugins.themes import _register_theme_in_db
from app.config import settings
from app.plugins.loader import plugin_loader
from app.plugins.registry.loader import load_plugin_types_for_single
from app.services.plugin_installer import plugin_installer
from app.services.theme_installer import theme_installer

router = APIRouter()


@router.post("/plugins/github/enumerate")
async def enumerate_plugins_from_github(
    request: dict[str, Any] = Body(...),
):
    """
    Enumerate available plugins from a GitHub repository.

    Args:
        request: Request body containing:
            - repo_url: GitHub repository URL (e.g., https://github.com/user/repo)
            - branch: Optional branch name (defaults to main/master)

    Returns:
        Dictionary with manifest info and list of available plugins
    """
    try:
        if not isinstance(request, dict):
            raise HTTPException(status_code=400, detail="Request body must be a JSON object")
    except Exception as e:
        if isinstance(e, HTTPException):
            raise
        raise HTTPException(status_code=400, detail=f"Invalid request body: {str(e)}")

    repo_url = request.get("repo_url")
    branch = request.get("branch")

    if not repo_url or not repo_url.strip():
        raise HTTPException(status_code=400, detail="repo_url is required")

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
            logger.warning(f"Failed to enumerate plugins from repo: {e}")

        # Enumerate themes (don't fail if this errors - just return empty themes)
        themes_result = {"has_manifest": False, "themes": []}
        try:
            themes_result = theme_installer.enumerate_themes_from_repo(repo_root)
        except Exception as e:
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
        logger.exception("Failed to enumerate plugins from GitHub")
        error_detail = str(e) if str(e) else "Unknown error occurred"
        raise HTTPException(status_code=500, detail=f"Failed to enumerate plugins: {error_detail}")
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


@router.post("/plugins/github/install")
async def install_plugin_from_github(request: dict[str, Any] = Body(...)):
    """
    Install a specific plugin from a GitHub repository.

    Args:
        request: Request body containing:
            - repo_url: GitHub repository URL
            - plugin_path: Relative path to plugin directory within repo
            - branch: Optional branch name (defaults to main/master)
            - plugin_id: Optional plugin ID override
            - force: Optional boolean to force reinstall even if already installed

    Returns:
        Installation result with manifest
    """
    repo_url = request.get("repo_url")
    plugin_path = request.get("plugin_path")
    branch = request.get("branch")
    plugin_id = request.get("plugin_id")
    force = request.get("force", False)

    if not repo_url:
        raise HTTPException(status_code=400, detail="repo_url is required")
    if not plugin_path:
        raise HTTPException(status_code=400, detail="plugin_path is required")

    # Reject path traversal attempts before doing any network I/O
    if ".." in Path(plugin_path).parts or Path(plugin_path).is_absolute():
        raise HTTPException(
            status_code=400,
            detail=f"Invalid plugin_path '{plugin_path}': path traversal is not allowed",
        )

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
        original_branch = request.get("branch")
        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.get(zip_url, follow_redirects=True)
            if response.status_code == 404:
                # Try master branch if main doesn't exist (only if user didn't specify branch)
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

        # Find plugin directory
        plugin_dir = repo_root / plugin_path
        if not plugin_dir.exists() or not plugin_dir.is_dir():
            raise HTTPException(
                status_code=404,
                detail=f"Plugin directory '{plugin_path}' not found in repository",
            )

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
                    repo_root, plugin_path, plugin_id, force=force
                )

                # Reload plugins to include the newly installed one
                # Wrap in try-except to handle loading errors gracefully
                try:
                    plugin_loader.load_installed_plugins()
                except Exception:
                    logger.opt(exception=True).warning(
                        "Plugin {} installed but failed to load. "
                        "It will be available after server restart.",
                        manifest["id"],
                    )
                    # Don't fail the installation - the plugin files are installed correctly
                    # It just needs a restart to be loaded

                # Surface metadata validation failures immediately. See
                # _validate_just_installed_plugin for details.
                installed_id = manifest["id"]
                validation_errors = _validate_just_installed_plugin(installed_id)
                if validation_errors:
                    try:
                        plugin_installer.uninstall_plugin(installed_id)
                    except Exception as cleanup_exc:  # noqa: BLE001
                        logger.warning(
                            f"Failed to roll back invalid plugin {installed_id} "
                            f"after validation errors: {cleanup_exc}"
                        )
                    detail = f"Plugin {installed_id} failed validation:\n  - " + "\n  - ".join(
                        validation_errors
                    )
                    raise HTTPException(status_code=400, detail=detail)

                actual_branch = "master" if branch_switched else branch
                # Register the plugin type now so it appears without a restart.
                await load_plugin_types_for_single(manifest["id"])
                return {
                    "success": True,
                    "message": f"Plugin {manifest['id']} installed successfully from {repo_url}",
                    "manifest": manifest,
                    "branch": actual_branch,
                    "branch_switched": branch_switched,
                    "requires_restart": manifest.get("requirements", {}).get("restart_required", False),
                    "frontend_rebuild_in_progress": False,
                }
            else:
                raise HTTPException(
                    status_code=400,
                    detail=f"Neither plugin.json nor theme.json found in {plugin_path}",
                )
        except HTTPException:
            raise
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to install: {str(e)}")
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Failed to install plugin from GitHub")
        raise HTTPException(status_code=500, detail=f"Failed to install plugin: {str(e)}")
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


@router.get("/plugins/local/suggest")
async def suggest_local_plugin_paths():
    """
    Suggest local plugin repository paths by scanning sibling directories (dev mode only).
    Returns paths to directories containing plugins.json.
    """
    if not settings.is_dev_mode:
        raise HTTPException(
            status_code=403, detail="Local path install is only available in dev mode"
        )

    suggestions = []
    seen = set()

    # Derive repo root from this file's location, then check the parent directory
    file_repo_root = Path(__file__).resolve().parent.parent.parent.parent.parent.parent
    parent_dirs = {file_repo_root.parent}
    if settings.repo_dir and settings.repo_dir.exists():
        parent_dirs.add(settings.repo_dir.parent)

    for parent in parent_dirs:
        try:
            if not parent.is_dir():
                continue
            for sibling in sorted(parent.iterdir()):
                if not sibling.is_dir():
                    continue
                if (sibling / "plugins.json").exists():
                    path_str = str(sibling)
                    if path_str not in seen:
                        seen.add(path_str)
                        suggestions.append(path_str)
        except Exception as e:
            logger.warning(f"Failed to scan {parent} for plugin repo suggestions: {e}")

    return {"suggestions": suggestions}


@router.post("/plugins/local/enumerate")
async def enumerate_plugins_from_local(request: dict[str, Any] = Body(...)):
    """
    Enumerate available plugins from a local directory (dev mode only).

    Args:
        request: Request body containing:
            - local_path: Absolute path to the local plugin repository
    """
    if not settings.is_dev_mode:
        raise HTTPException(
            status_code=403, detail="Local path install is only available in dev mode"
        )

    local_path = request.get("local_path")
    if not local_path or not local_path.strip():
        raise HTTPException(status_code=400, detail="local_path is required")

    repo_path = Path(local_path)
    if not repo_path.exists() or not repo_path.is_dir():
        raise HTTPException(
            status_code=400, detail=f"Path not found or not a directory: {local_path}"
        )

    try:
        plugins_result = plugin_installer.enumerate_plugins_from_repo(repo_path)
    except Exception as e:
        logger.warning(f"Failed to enumerate plugins from local path: {e}")
        plugins_result = {"has_manifest": False, "plugins": []}

    try:
        themes_result = theme_installer.enumerate_themes_from_repo(repo_path)
    except Exception as e:
        logger.warning(f"Failed to enumerate themes from local path: {e}")
        themes_result = {"has_manifest": False, "themes": []}

    return {
        "success": True,
        "local_path": local_path,
        "plugins": plugins_result.get("plugins", []),
        "themes": themes_result.get("themes", []),
    }


@router.post("/plugins/local/install")
async def install_plugin_from_local(request: dict[str, Any] = Body(...)):
    """
    Install a specific plugin from a local directory (dev mode only).

    Args:
        request: Request body containing:
            - local_path: Absolute path to the local plugin repository
            - plugin_path: Relative path to plugin directory within repo
            - plugin_id: Optional plugin ID override
            - force: Optional boolean to force reinstall
    """
    if not settings.is_dev_mode:
        raise HTTPException(
            status_code=403, detail="Local path install is only available in dev mode"
        )

    local_path = request.get("local_path")
    plugin_path = request.get("plugin_path")
    plugin_id = request.get("plugin_id")
    force = request.get("force", False)

    if not local_path:
        raise HTTPException(status_code=400, detail="local_path is required")
    if not plugin_path:
        raise HTTPException(status_code=400, detail="plugin_path is required")

    repo_path = Path(local_path)
    if not repo_path.exists() or not repo_path.is_dir():
        raise HTTPException(
            status_code=400, detail=f"Path not found or not a directory: {local_path}"
        )

    theme_json = repo_path / plugin_path / "theme.json"
    plugin_json_path = repo_path / plugin_path / "plugin.json"

    try:
        if theme_json.exists():
            manifest = theme_installer.install_theme_from_repo(repo_path, plugin_path, plugin_id)
            await _register_theme_in_db(manifest)
            return {
                "success": True,
                "message": f"Theme {manifest['id']} installed successfully",
                "manifest": manifest,
                "requires_restart": False,
            }
        elif plugin_json_path.exists():
            manifest = plugin_installer.install_plugin_from_repo(
                repo_path, plugin_path, plugin_id, force=force
            )
            try:
                plugin_loader.load_installed_plugins()
            except Exception as load_error:
                logger.warning(
                    f"Plugin {manifest['id']} installed but failed to load: {load_error}. "
                    "It will be available after server restart."
                )

            installed_id = manifest["id"]
            validation_errors = _validate_just_installed_plugin(installed_id)
            if validation_errors:
                try:
                    plugin_installer.uninstall_plugin(installed_id)
                except Exception as cleanup_exc:  # noqa: BLE001
                    logger.warning(
                        f"Failed to roll back invalid plugin {installed_id} "
                        f"after validation errors: {cleanup_exc}"
                    )
                detail = f"Plugin {installed_id} failed validation:\n  - " + "\n  - ".join(
                    validation_errors
                )
                raise HTTPException(status_code=400, detail=detail)

            await load_plugin_types_for_single(manifest["id"])
            return {
                "success": True,
                "message": f"Plugin {manifest['id']} installed successfully",
                "manifest": manifest,
                "requires_restart": manifest.get("requirements", {}).get("restart_required", False),
                "frontend_rebuild_in_progress": False,
            }
        else:
            raise HTTPException(
                status_code=400,
                detail=f"Neither plugin.json nor theme.json found in {plugin_path}",
            )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Failed to install plugin from local path")
        raise HTTPException(status_code=500, detail=f"Failed to install: {str(e)}")
