"""Health check endpoints."""

from fastapi import APIRouter
from fastapi.responses import JSONResponse
from loguru import logger

router = APIRouter()


async def _database_is_reachable() -> bool:
    """Run the cheapest possible query against the app database."""
    from app.database import database

    try:
        await database.fetch_val("SELECT 1")
        return True
    except Exception as exc:
        # Keep the response body generic; the detail belongs in the log (audit S9).
        logger.warning("Health check database probe failed: {}", exc)
        return False


@router.get("/health")
async def health_check():
    """Basic health check endpoint.

    Contains a cheap database query so a container health check (and the kiosk
    boot wait) sees a broken database instead of a constant "healthy" (audit D14).
    """
    logger.debug("Health check endpoint called")
    if not await _database_is_reachable():
        return JSONResponse(
            status_code=503,
            content={"status": "unhealthy", "database": "error"},
        )
    return {"status": "healthy", "database": "ok"}


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
