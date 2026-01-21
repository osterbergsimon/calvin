"""Health check endpoints."""

import logging

from fastapi import APIRouter

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get("/health")
async def health_check():
    """Basic health check endpoint."""
    try:
        logger.info("Health check endpoint called")
        return {"status": "healthy"}
    except Exception as e:
        logger.exception(f"Error in health check: {e}")
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
    except Exception as e:
        import traceback

        logger.exception(f"Database health check failed: {e}\n{traceback.format_exc()}")
        raise
