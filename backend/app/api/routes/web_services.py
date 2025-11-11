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


@router.get("/web-services/{service_id}/mealplan")
async def get_mealie_mealplan(
    service_id: str,
    start_date: str | None = Query(None, description="Start date (YYYY-MM-DD)"),
    end_date: str | None = Query(None, description="End date (YYYY-MM-DD)"),
):
    """
    Get meal plan data from Mealie service.
    
    This endpoint proxies requests to Mealie API to avoid CORS issues
    and handle authentication properly.
    
    Args:
        service_id: Service ID (Mealie plugin instance ID)
        start_date: Optional start date (defaults to today)
        end_date: Optional end date (defaults to 7 days from today)
    
    Returns:
        Meal plan data from Mealie API
    """
    from app.plugins.manager import plugin_manager
    from app.plugins.protocols import ServicePlugin
    from app.database import AsyncSessionLocal
    from app.models.db_models import PluginDB
    from sqlalchemy import select
    
    # Get the Mealie plugin instance
    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(PluginDB).where(PluginDB.id == service_id, PluginDB.type_id == "mealie")
        )
        db_plugin = result.scalar_one_or_none()
        
        if not db_plugin:
            raise HTTPException(status_code=404, detail="Mealie service not found")
        
        config = db_plugin.config or {}
        mealie_url = config.get("mealie_url", "").rstrip("/")
        api_token = config.get("api_token", "")
        days_ahead = config.get("days_ahead", 7)
        
        if not mealie_url or not api_token:
            raise HTTPException(
                status_code=400,
                detail="Mealie URL and API token are required",
            )
        
        # Convert days_ahead to int if it's a string
        try:
            days_ahead = int(days_ahead) if days_ahead else 7
        except (ValueError, TypeError):
            days_ahead = 7
    
    # Calculate date range
    if not start_date:
        start_date = datetime.now().date().isoformat()
    if not end_date:
        # Use days_ahead from config, default to 7
        end_date = (datetime.now().date() + timedelta(days=days_ahead)).isoformat()
    
    # Fetch meal plan from Mealie API
    try:
        headers = {"Authorization": f"Bearer {api_token}"}
        params = {
            "start_date": start_date,
            "end_date": end_date,
            "page": 1,
            "perPage": -1,
        }
        
        async with httpx.AsyncClient(timeout=30.0) as client:
            # Try the correct Mealie API endpoint
            response = await client.get(
                f"{mealie_url}/api/households/mealplans",
                headers=headers,
                params=params,
            )
            
            if response.status_code == 200:
                data = response.json()
                # Log the response structure for debugging
                print(f"[Mealie API] Response structure: {type(data)}")
                if isinstance(data, dict):
                    print(f"[Mealie API] Response keys: {list(data.keys())}")
                    if "items" in data:
                        print(f"[Mealie API] Items count: {len(data.get('items', []))}")
                        if data.get('items'):
                            print(f"[Mealie API] First item structure: {list(data['items'][0].keys()) if isinstance(data['items'][0], dict) else type(data['items'][0])}")
                            # Log recipe structure if available
                            if isinstance(data['items'][0], dict) and 'recipe' in data['items'][0]:
                                recipe = data['items'][0]['recipe']
                                if isinstance(recipe, dict):
                                    print(f"[Mealie API] Recipe structure: {list(recipe.keys())}")
                elif isinstance(data, list):
                    print(f"[Mealie API] Response is a list with {len(data)} items")
                    if data:
                        print(f"[Mealie API] First item structure: {list(data[0].keys()) if isinstance(data[0], dict) else type(data[0])}")
                
                # Add mealie_url to response metadata so frontend can construct recipe URLs
                if isinstance(data, dict):
                    data["_metadata"] = {
                        "mealie_url": mealie_url
                    }
                elif isinstance(data, list):
                    # Wrap list response in dict to add metadata
                    data = {
                        "items": data,
                        "_metadata": {
                            "mealie_url": mealie_url
                        }
                    }
                
                return data
            elif response.status_code == 401:
                raise HTTPException(
                    status_code=401,
                    detail="Mealie API authentication failed. Please check your API token.",
                )
            else:
                response.raise_for_status()
                
    except httpx.ConnectError:
        raise HTTPException(
            status_code=503,
            detail=f"Could not connect to Mealie at {mealie_url}",
        )
    except httpx.TimeoutException:
        raise HTTPException(
            status_code=504,
            detail=f"Connection to Mealie timed out",
        )
    except httpx.HTTPStatusError as e:
        raise HTTPException(
            status_code=e.response.status_code,
            detail=f"Mealie API error: {e.response.text}",
        )
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error fetching meal plan: {str(e)}",
        )
