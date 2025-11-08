"""Health check endpoints."""

from fastapi import APIRouter

router = APIRouter()


@router.get("/health")
async def health_check():
    """Basic health check endpoint."""
    return {"status": "healthy"}


@router.get("/health/detailed")
async def detailed_health_check():
    """Detailed health check with system status."""
    return {
        "status": "healthy",
        "services": {
            "api": "running",
        },
    }
