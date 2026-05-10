"""Health check endpoints."""

from fastapi import APIRouter
from loguru import logger

router = APIRouter()


@router.get("/health")
async def health_check():
    """Basic health check endpoint."""
    try:
        logger.info("Health check endpoint called")
        return {"status": "healthy"}
    except Exception:
        logger.exception("Error in health check")
        raise


@router.get("/health/detailed")
async def detailed_health_check():
    """Detailed health check with system status."""
    return {
        "status": "healthy",
        "services": {
            "api": "running",
        },
    }


@router.get("/health/test-db")
async def test_db_health_check():
    """Test database connection and Ormar models."""
    try:
        from app.database import database
        from app.models.db_models import ConfigDB

        # Check if database is connected
        db_connected = database.is_connected

        # Try a simple query
        count = await ConfigDB.objects.count()

        return {
            "status": "healthy",
            "database_connected": db_connected,
            "config_items_count": count,
        }
    except Exception:
        import traceback

        logger.exception("Database health check failed\n{}", traceback.format_exc())
        raise
