"""Plugin management API routes - aggregated from multiple modules."""

from fastapi import APIRouter

from .config import router as config_router
from .github import router as github_router
from .instances import router as instances_router
from .management import router as management_router
from .static_assets import router as static_assets_router

# Create main router and include all sub-routers
router = APIRouter()

router.include_router(config_router)
router.include_router(github_router)
router.include_router(instances_router)
router.include_router(management_router)
router.include_router(static_assets_router)

__all__ = ["router"]
