"""Web service management service."""

from sqlalchemy import select

from app.database import AsyncSessionLocal
from app.models.db_models import WebServiceDB
from app.models.web_service import WebService, WebServiceCreate, WebServiceUpdate


class WebServiceService:
    """Service for managing web services."""

    def __init__(self):
        """Initialize web service service."""
        self._services: list[WebService] = []

    async def get_services(self) -> list[WebService]:
        """
        Get all web services, ordered by display_order.

        Returns:
            List of web services
        """
        async with AsyncSessionLocal() as session:
            result = await session.execute(
                select(WebServiceDB).order_by(WebServiceDB.display_order, WebServiceDB.name)
            )
            db_services = result.scalars().all()

            services = []
            for db_service in db_services:
                services.append(
                    WebService(
                        id=db_service.id,
                        name=db_service.name,
                        url=db_service.url,
                        enabled=db_service.enabled,
                        display_order=db_service.display_order,
                        fullscreen=db_service.fullscreen,
                    )
                )

            self._services = services
            return services

    async def get_service(self, service_id: str) -> WebService | None:
        """
        Get a web service by ID.

        Args:
            service_id: Service ID

        Returns:
            Web service or None if not found
        """
        async with AsyncSessionLocal() as session:
            result = await session.execute(
                select(WebServiceDB).where(WebServiceDB.id == service_id)
            )
            db_service = result.scalar_one_or_none()

            if db_service:
                return WebService(
                    id=db_service.id,
                    name=db_service.name,
                    url=db_service.url,
                    enabled=db_service.enabled,
                    display_order=db_service.display_order,
                    fullscreen=db_service.fullscreen,
                )
            return None

    async def add_service(self, service: WebServiceCreate) -> WebService:
        """
        Add a new web service.

        Args:
            service: Web service to add

        Returns:
            Created web service
        """
        # Generate ID if not provided
        service_id = f"web-service-{len(self._services) + 1}-{hash(service.url) % 10000}"

        async with AsyncSessionLocal() as session:
            db_service = WebServiceDB(
                id=service_id,
                name=service.name,
                url=service.url,
                enabled=service.enabled,
                display_order=service.display_order,
                fullscreen=service.fullscreen,
            )
            session.add(db_service)
            await session.commit()
            await session.refresh(db_service)

            return WebService(
                id=db_service.id,
                name=db_service.name,
                url=db_service.url,
                enabled=db_service.enabled,
                display_order=db_service.display_order,
                fullscreen=db_service.fullscreen,
            )

    async def update_service(self, service_id: str, updates: WebServiceUpdate) -> WebService | None:
        """
        Update a web service.

        Args:
            service_id: Service ID
            updates: Updates to apply

        Returns:
            Updated web service or None if not found
        """
        async with AsyncSessionLocal() as session:
            result = await session.execute(
                select(WebServiceDB).where(WebServiceDB.id == service_id)
            )
            db_service = result.scalar_one_or_none()

            if not db_service:
                return None

            # Update fields if provided
            if updates.name is not None:
                db_service.name = updates.name
            if updates.url is not None:
                db_service.url = updates.url
            if updates.enabled is not None:
                db_service.enabled = updates.enabled
            if updates.display_order is not None:
                db_service.display_order = updates.display_order
            if updates.fullscreen is not None:
                db_service.fullscreen = updates.fullscreen

            await session.commit()
            await session.refresh(db_service)

            return WebService(
                id=db_service.id,
                name=db_service.name,
                url=db_service.url,
                enabled=db_service.enabled,
                display_order=db_service.display_order,
                fullscreen=db_service.fullscreen,
            )

    async def remove_service(self, service_id: str) -> bool:
        """
        Remove a web service.

        Args:
            service_id: Service ID

        Returns:
            True if removed, False if not found
        """
        async with AsyncSessionLocal() as session:
            result = await session.execute(
                select(WebServiceDB).where(WebServiceDB.id == service_id)
            )
            db_service = result.scalar_one_or_none()

            if not db_service:
                return False

            await session.delete(db_service)
            await session.commit()
            return True

    async def get_enabled_services(self) -> list[WebService]:
        """
        Get all enabled web services, ordered by display_order.

        Returns:
            List of enabled web services
        """
        all_services = await self.get_services()
        return [s for s in all_services if s.enabled]


# Global web service instance
web_service_service = WebServiceService()
