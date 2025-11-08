"""Web service data models."""

from typing import Optional
from pydantic import BaseModel, Field, HttpUrl


class WebService(BaseModel):
    """Web service model."""

    id: str
    name: str
    url: str
    enabled: bool = True
    display_order: int = 0  # Order for display/switching
    fullscreen: bool = False  # Prefer fullscreen mode


class WebServiceCreate(BaseModel):
    """Model for creating a web service."""

    name: str
    url: str
    enabled: bool = True
    display_order: int = 0
    fullscreen: bool = False


class WebServiceUpdate(BaseModel):
    """Model for updating a web service."""

    name: Optional[str] = None
    url: Optional[str] = None
    enabled: Optional[bool] = None
    display_order: Optional[int] = None
    fullscreen: Optional[bool] = None


class WebServicesResponse(BaseModel):
    """Response model for web services."""

    services: list[WebService] = Field(default_factory=list)
    total: int = 0

