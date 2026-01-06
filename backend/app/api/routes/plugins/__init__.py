"""Plugin management API routes - aggregated from multiple modules."""

from fastapi import APIRouter

from .config import router as config_router
from .github import router as github_router
from .instances import router as instances_router
from .management import router as management_router
from .themes import sync_themes_to_db

# Create main router and include all sub-routers
router = APIRouter()

router.include_router(config_router)
router.include_router(github_router)
router.include_router(instances_router)
router.include_router(management_router)

# Export sync_themes_to_db for use in main.py
__all__ = ["router", "sync_themes_to_db"]
