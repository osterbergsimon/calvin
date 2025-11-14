"""Weather data caching service."""

from datetime import datetime, timedelta
from typing import Any


class WeatherCache:
    """Simple in-memory cache for weather data with TTL."""

    def __init__(self, ttl_minutes: int = 10):
        """
        Initialize weather cache.

        Args:
            ttl_minutes: Time to live in minutes (default: 10 minutes)
        """
        self._cache: dict[str, dict[str, Any]] = {}
        self._ttl = timedelta(minutes=ttl_minutes)

    def get(self, service_id: str) -> dict[str, Any] | None:
        """
        Get cached weather data for a service.

        Args:
            service_id: Service ID

        Returns:
            Cached weather data or None if not found/expired
        """
        if service_id not in self._cache:
            return None

        entry = self._cache[service_id]
        if datetime.now() > entry["expires_at"]:
            # Cache expired, remove it
            del self._cache[service_id]
            return None

        return entry["data"]

    def set(self, service_id: str, data: dict[str, Any]) -> None:
        """
        Cache weather data for a service.

        Args:
            service_id: Service ID
            data: Weather data to cache
        """
        self._cache[service_id] = {
            "data": data,
            "expires_at": datetime.now() + self._ttl,
        }

    def clear(self, service_id: str | None = None) -> None:
        """
        Clear cache for a specific service or all services.

        Args:
            service_id: Service ID to clear, or None to clear all
        """
        if service_id:
            self._cache.pop(service_id, None)
        else:
            self._cache.clear()


# Global weather cache instance (10 minute TTL)
weather_cache = WeatherCache(ttl_minutes=10)
