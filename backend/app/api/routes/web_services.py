"""Web services API endpoints."""

from datetime import datetime, timedelta
from typing import Any

import httpx
from fastapi import APIRouter, HTTPException, Query

from app.models.web_service import (
    WebService,
    WebServiceCreate,
    WebServicesResponse,
    WebServiceUpdate,
)
from app.services.web_service_service import web_service_service

router = APIRouter()


@router.get("/web-services", response_model=WebServicesResponse)
async def get_web_services():
    """Get all web services."""
    services = await web_service_service.get_services()
    return WebServicesResponse(services=services, total=len(services))


@router.get("/web-services/{service_id}", response_model=WebService)
async def get_web_service(service_id: str):
    """Get a web service by ID."""
    service = await web_service_service.get_service(service_id)
    if not service:
        raise HTTPException(status_code=404, detail="Web service not found")
    return service


@router.post("/web-services", response_model=WebService)
async def add_web_service(service: WebServiceCreate):
    """
    Add a new web service.

    Note: Some websites block embedding in iframes due to CORS/X-Frame-Options.
    If a service cannot be embedded, you'll see an error message in the viewer.
    You can still open the service in a new window using the provided link.
    """
    return await web_service_service.add_service(service)


@router.put("/web-services/{service_id}", response_model=WebService)
async def update_web_service(service_id: str, updates: WebServiceUpdate):
    """Update a web service."""
    service = await web_service_service.update_service(service_id, updates)
    if not service:
        raise HTTPException(status_code=404, detail="Web service not found")
    return service


@router.delete("/web-services/{service_id}")
async def remove_web_service(service_id: str):
    """Remove a web service."""
    removed = await web_service_service.remove_service(service_id)
    if not removed:
        raise HTTPException(status_code=404, detail="Web service not found")
    return {"message": "Web service removed", "service_id": service_id}


@router.get("/web-services/{service_id}/weather")
async def get_weather_data(service_id: str):
    """
    Get weather data from Weather service (supports multiple providers).
    
    This endpoint proxies requests to weather APIs (OpenWeatherMap, Yr.no, etc.)
    to avoid CORS issues and handle authentication properly.
    Uses caching to reduce API calls (10 minute TTL).
    
    Args:
        service_id: Service ID (Weather plugin instance ID - weather or yr_weather)
    
    Returns:
        Weather data in format compatible with WeatherWidget component
    """
    from app.plugins.manager import plugin_manager
    from app.plugins.protocols import ServicePlugin
    from app.database import AsyncSessionLocal
    from app.models.db_models import PluginDB
    from app.services.weather_cache import weather_cache
    from sqlalchemy import select
    
    # Check cache first
    cached_data = weather_cache.get(service_id)
    if cached_data is not None:
        print(f"[Weather API] Returning cached data for {service_id}")
        return cached_data
    
    # Get the Weather plugin instance (supports both "weather" and "yr_weather" type_ids)
    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(PluginDB).where(
                PluginDB.id == service_id,
                PluginDB.type_id.in_(["weather", "yr_weather"])
            )
        )
        db_plugin = result.scalar_one_or_none()
        
        if not db_plugin:
            raise HTTPException(status_code=404, detail="Weather service not found")
        
        # Get plugin instance from manager
        plugin_instance = plugin_manager.get_plugin(service_id)
        if not plugin_instance or not isinstance(plugin_instance, ServicePlugin):
            raise HTTPException(status_code=404, detail="Weather plugin instance not found")
        
        # Ensure plugin is initialized and running
        if not plugin_instance.is_running():
            try:
                await plugin_instance.initialize()
                plugin_instance.start()
            except Exception as e:
                print(f"[Weather API] Error initializing plugin {service_id}: {e}")
                raise HTTPException(status_code=500, detail=f"Failed to initialize weather plugin: {str(e)}")
        
        # Call the plugin's fetch_service_data method (protocol-defined)
        try:
            weather_data = await plugin_instance.fetch_service_data()
            if weather_data is None:
                raise HTTPException(status_code=501, detail="Weather plugin does not support data fetching")
            # Cache the result
            weather_cache.set(service_id, weather_data)
            print(f"[Weather API] Fetched and cached weather data for {service_id}")
            return weather_data
        except HTTPException:
            raise
        except Exception as e:
            print(f"[Weather API] Error fetching weather data from {service_id}: {e}")
            import traceback
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=f"Failed to fetch weather data: {str(e)}")


@router.get("/web-services/{service_id}/data")
async def get_service_data(
    service_id: str,
    start_date: str | None = Query(None, description="Start date (YYYY-MM-DD)"),
    end_date: str | None = Query(None, description="End date (YYYY-MM-DD)"),
):
    """
    Get service data from a service plugin.
    
    This is a generic endpoint that proxies requests to service plugin APIs
    to avoid CORS issues and handle authentication properly.
    
    The endpoint path is determined by the plugin's get_content() method,
    which returns a URL like "/api/web-services/{service_id}/data".
    
    Args:
        service_id: Service ID (plugin instance ID)
        start_date: Optional start date (plugin-specific)
        end_date: Optional end date (plugin-specific)
    
    Returns:
        Service data from the plugin
    """
    from app.plugins.manager import plugin_manager
    from app.plugins.protocols import ServicePlugin
    from app.database import AsyncSessionLocal
    from app.models.db_models import PluginDB
    from sqlalchemy import select
    
    # Get the plugin instance
    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(PluginDB).where(PluginDB.id == service_id)
        )
        db_plugin = result.scalar_one_or_none()
        
        if not db_plugin:
            raise HTTPException(status_code=404, detail="Service not found")
        
        # Get plugin instance from manager
        plugin_instance = plugin_manager.get_plugin(service_id)
        if not plugin_instance or not isinstance(plugin_instance, ServicePlugin):
            raise HTTPException(status_code=404, detail="Service plugin instance not found")
        
        # Ensure plugin is initialized and running
        if not plugin_instance.is_running():
            try:
                await plugin_instance.initialize()
                plugin_instance.start()
            except Exception as e:
                print(f"[Service API] Error initializing plugin {service_id}: {e}")
                raise HTTPException(status_code=500, detail=f"Failed to initialize service plugin: {str(e)}")
        
        # Use protocol-defined method (plugins CAN implement this if they support data fetching)
        try:
            data = await plugin_instance.fetch_service_data(start_date=start_date, end_date=end_date)
            if data is not None:
                return data
        except Exception as e:
            print(f"[Service API] Error calling fetch_service_data for {service_id}: {e}")
            import traceback
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=f"Failed to fetch service data: {str(e)}")
        
        # If plugin returned None, it doesn't support data fetching
        raise HTTPException(
            status_code=501,
            detail="This service plugin does not support data fetching via this endpoint",
        )


