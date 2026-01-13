"""Web service data models."""

from pydantic import BaseModel, Field


class WebService(BaseModel):
    """Web service model."""

    id: str
    name: str
    url: str
    enabled: bool = True
    display_order: int = 0  # Order for display/switching
    fullscreen: bool = False  # Prefer fullscreen mode
    type_id: str | None = None  # Plugin type ID (e.g., 'iframe', 'mealie')
    display_schema: dict | None = None  # Display configuration from plugin metadata


class WebServiceCreate(BaseModel):
    """Model for creating a web service."""

    name: str
    url: str
    enabled: bool = True
    display_order: int = 0
    fullscreen: bool = False


class WebServiceUpdate(BaseModel):
    """Model for updating a web service."""

    name: str | None = None
    url: str | None = None
    enabled: bool | None = None
    display_order: int | None = None
    fullscreen: bool | None = None


class WebServicesResponse(BaseModel):
    """Response model for web services."""

    services: list[WebService] = Field(default_factory=list)
    total: int = 0
