"""Web services API endpoints."""

from typing import List
from fastapi import APIRouter, HTTPException
from app.models.web_service import (
    WebService,
    WebServiceCreate,
    WebServiceUpdate,
    WebServicesResponse,
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

