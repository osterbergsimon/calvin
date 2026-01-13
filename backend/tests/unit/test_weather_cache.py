"""Tests for weather cache service."""

from datetime import datetime, timedelta

import pytest

from app.services.weather_cache import WeatherCache


@pytest.mark.unit
def test_cache_get_nonexistent():
    """Test getting a non-existent cache entry."""
    cache = WeatherCache(ttl_minutes=10)
    result = cache.get("nonexistent_service")
    assert result is None


@pytest.mark.unit
def test_cache_set_and_get():
    """Test setting and getting cache entries."""
    cache = WeatherCache(ttl_minutes=10)

    # Set cache entry
    test_data = {"temperature": 20, "condition": "sunny"}
    cache.set("service1", test_data)

    # Get cache entry
    result = cache.get("service1")
    assert result == test_data


@pytest.mark.unit
def test_cache_expiration():
    """Test that cache entries expire after TTL."""
    cache = WeatherCache(ttl_minutes=1)

    # Set cache entry
    test_data = {"temperature": 20}
    cache.set("service1", test_data)

    # Manually expire the entry by manipulating the cache
    cache._cache["service1"]["expires_at"] = datetime.now() - timedelta(minutes=1)

    # Get should return None (expired)
    result = cache.get("service1")
    assert result is None

    # Entry should be removed from cache
    assert "service1" not in cache._cache


@pytest.mark.unit
def test_cache_clear_specific_service():
    """Test clearing cache for a specific service."""
    cache = WeatherCache(ttl_minutes=10)

    # Set multiple cache entries
    cache.set("service1", {"temp": 20})
    cache.set("service2", {"temp": 25})

    # Clear one service
    cache.clear("service1")

    # Verify only that service was cleared
    assert cache.get("service1") is None
    assert cache.get("service2") == {"temp": 25}


@pytest.mark.unit
def test_cache_clear_all():
    """Test clearing all cache entries."""
    cache = WeatherCache(ttl_minutes=10)

    # Set multiple cache entries
    cache.set("service1", {"temp": 20})
    cache.set("service2", {"temp": 25})
    cache.set("service3", {"temp": 30})

    # Clear all
    cache.clear()

    # Verify all are cleared
    assert cache.get("service1") is None
    assert cache.get("service2") is None
    assert cache.get("service3") is None
    assert len(cache._cache) == 0


@pytest.mark.unit
def test_cache_clear_nonexistent():
    """Test clearing a non-existent cache entry."""
    cache = WeatherCache(ttl_minutes=10)

    # Should not raise an error
    cache.clear("nonexistent_service")
    assert len(cache._cache) == 0


@pytest.mark.unit
def test_cache_multiple_services():
    """Test caching multiple services independently."""
    cache = WeatherCache(ttl_minutes=10)

    # Set different data for different services
    cache.set("service1", {"temp": 20, "city": "New York"})
    cache.set("service2", {"temp": 25, "city": "London"})
    cache.set("service3", {"temp": 30, "city": "Tokyo"})

    # Verify each service has its own data
    assert cache.get("service1") == {"temp": 20, "city": "New York"}
    assert cache.get("service2") == {"temp": 25, "city": "London"}
    assert cache.get("service3") == {"temp": 30, "city": "Tokyo"}


@pytest.mark.unit
def test_cache_overwrite_existing():
    """Test that setting cache overwrites existing entry."""
    cache = WeatherCache(ttl_minutes=10)

    # Set initial data
    cache.set("service1", {"temp": 20})

    # Overwrite with new data
    cache.set("service1", {"temp": 25, "updated": True})

    # Verify new data is returned
    result = cache.get("service1")
    assert result == {"temp": 25, "updated": True}
    assert "temp" in result
    assert result["temp"] == 25


@pytest.mark.unit
def test_cache_ttl_custom():
    """Test cache with custom TTL."""
    cache = WeatherCache(ttl_minutes=5)

    # Verify TTL is set correctly
    assert cache._ttl == timedelta(minutes=5)

    # Set cache entry
    cache.set("service1", {"temp": 20})

    # Verify entry expires at correct time
    entry = cache._cache["service1"]
    expected_expiry = datetime.now() + timedelta(minutes=5)
    # Allow 1 second tolerance
    assert abs((entry["expires_at"] - expected_expiry).total_seconds()) < 1


@pytest.mark.unit
def test_cache_complex_data():
    """Test caching complex nested data structures."""
    cache = WeatherCache(ttl_minutes=10)

    # Set complex nested data
    complex_data = {
        "current": {"temp": 20, "condition": "sunny"},
        "forecast": [
            {"day": "Monday", "temp": 22},
            {"day": "Tuesday", "temp": 24},
        ],
        "metadata": {"source": "api", "timestamp": "2024-01-01"},
    }
    cache.set("service1", complex_data)

    # Get and verify
    result = cache.get("service1")
    assert result == complex_data
    assert isinstance(result["forecast"], list)
    assert len(result["forecast"]) == 2
    assert result["metadata"]["source"] == "api"


@pytest.mark.unit
def test_cache_empty_data():
    """Test caching empty data structures."""
    cache = WeatherCache(ttl_minutes=10)

    # Set empty dict
    cache.set("service1", {})
    result = cache.get("service1")
    assert result == {}

    # Set empty list
    cache.set("service2", [])
    result = cache.get("service2")
    assert result == []


@pytest.mark.unit
def test_cache_expiration_removes_entry():
    """Test that expired entries are removed from cache."""
    cache = WeatherCache(ttl_minutes=1)

    # Set cache entry
    cache.set("service1", {"temp": 20})

    # Verify entry exists
    assert "service1" in cache._cache

    # Manually expire it
    cache._cache["service1"]["expires_at"] = datetime.now() - timedelta(minutes=1)

    # Get should remove expired entry
    cache.get("service1")

    # Verify entry was removed
    assert "service1" not in cache._cache
