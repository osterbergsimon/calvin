"""Yr.no weather service plugin using MET Weather API."""

from typing import Any

import httpx

from app.plugins.base import PluginType
from app.plugins.hooks import hookimpl
from app.plugins.protocols import ServicePlugin


class YrWeatherServicePlugin(ServicePlugin):
    """Yr.no weather service plugin for displaying current conditions and forecast."""

    @classmethod
    def get_plugin_metadata(cls) -> dict[str, Any]:
        """Get plugin metadata for registration."""
        return {
            "type_id": "yr_weather",
            "plugin_type": PluginType.SERVICE,
            "name": "Yr.no Weather",
            "description": "Display current weather conditions and forecast from Yr.no (Norwegian Meteorological Institute)",
            "version": "1.0.0",
            "common_config_schema": {
                "location": {
                    "type": "string",
                    "description": "Location name (city, address, etc.)",
                    "default": "",
                    "ui": {
                        "component": "input",
                        "placeholder": "Oslo, Norway or London, UK",
                        "help_text": "Enter a city name or address to automatically get coordinates. Or enter coordinates manually below.",
                    },
                },
                "latitude": {
                    "type": "number",
                    "description": "Latitude (decimal degrees, max 4 decimals)",
                    "default": 59.9139,
                    "ui": {
                        "component": "number",
                        "placeholder": "59.9139",
                        "help_text": "Latitude in decimal degrees. Will be auto-filled when using location search above.",
                        "validation": {
                            "required": True,
                            "min": -90,
                            "max": 90,
                        },
                    },
                },
                "longitude": {
                    "type": "number",
                    "description": "Longitude (decimal degrees, max 4 decimals)",
                    "default": 10.7522,
                    "ui": {
                        "component": "number",
                        "placeholder": "10.7522",
                        "help_text": "Longitude in decimal degrees. Will be auto-filled when using location search above.",
                        "validation": {
                            "required": True,
                            "min": -180,
                            "max": 180,
                        },
                    },
                },
                "altitude": {
                    "type": "integer",
                    "description": "Altitude in meters (optional, defaults to sea level)",
                    "default": 0,
                    "ui": {
                        "component": "number",
                        "placeholder": "0",
                        "help_text": "Altitude above sea level in meters (optional)",
                        "validation": {
                            "min": 0,
                        },
                    },
                },
                "forecast_days": {
                    "type": "integer",
                    "description": "Number of forecast days to show (1-9)",
                    "default": 5,
                    "ui": {
                        "component": "number",
                        "placeholder": "5",
                        "help_text": "Number of days to show in forecast (1-9 days, Yr.no provides up to 9 days)",
                        "validation": {
                            "min": 1,
                            "max": 9,
                        },
                    },
                },
            },
            "ui_actions": [
                {
                    "id": "geocode",
                    "type": "custom",
                    "label": "Get Coordinates",
                    "style": "secondary",
                    "endpoint": "/api/plugins/{plugin_id}/geocode",
                },
                {
                    "id": "save",
                    "type": "save",
                    "label": "Save Settings",
                    "style": "primary",
                },
                {
                    "id": "test",
                    "type": "test",
                    "label": "Test Connection",
                    "style": "secondary",
                },
            ],
            "display_schema": {
                "type": "api",
                "api_endpoint": "/api/web-services/{service_id}/weather",
                "method": "GET",
                "data_schema": {
                    "current": {
                        "type": "object",
                        "description": "Current weather conditions",
                        "properties": {
                            "temperature": {"type": "number"},
                            "feels_like": {"type": "number"},
                            "humidity": {"type": "number"},
                            "pressure": {"type": "number"},
                            "description": {"type": "string"},
                            "icon": {"type": "string"},
                            "wind_speed": {"type": "number"},
                            "wind_direction": {"type": "number"},
                        },
                    },
                    "forecast": {
                        "type": "array",
                        "description": "Weather forecast",
                        "item_schema": {
                            "date": {"type": "string", "format": "date"},
                            "temperature": {"type": "number"},
                            "temp_min": {"type": "number"},
                            "temp_max": {"type": "number"},
                            "description": {"type": "string"},
                            "icon": {"type": "string"},
                        },
                    },
                    "location": {"type": "string"},
                    "units": {"type": "string"},
                },
                "render_template": "weather",  # Reuse the same WeatherWidget component!
            },
            "plugin_class": cls,
        }

    def __init__(
        self,
        plugin_id: str,
        name: str,
        latitude: float,
        longitude: float,
        altitude: int = 0,
        forecast_days: int = 5,
        location: str | None = None,
        enabled: bool = True,
        display_order: int = 0,
        fullscreen: bool = False,
    ):
        """
        Initialize Yr.no weather service plugin.

        Args:
            plugin_id: Unique identifier for the plugin
            name: Human-readable name
            latitude: Latitude in decimal degrees (max 4 decimals)
            longitude: Longitude in decimal degrees (max 4 decimals)
            altitude: Altitude above sea level in meters
            forecast_days: Number of forecast days to show (1-9)
            enabled: Whether the plugin is enabled
            display_order: Display order for service rotation
            fullscreen: Whether to display in fullscreen mode
        """
        super().__init__(plugin_id, name, enabled)
        # Round to 4 decimals as per API requirements
        self.latitude = round(float(latitude), 4)
        self.longitude = round(float(longitude), 4)
        self.altitude = int(altitude) if altitude else 0
        self.forecast_days = min(max(forecast_days, 1), 9)  # Clamp between 1 and 9
        self.location = location  # Store location name for display
        self.display_order = display_order
        self.fullscreen = fullscreen
        self._client: httpx.AsyncClient | None = None

    async def initialize(self) -> None:
        """Initialize the plugin."""
        # Validate coordinates
        if not (-90 <= self.latitude <= 90):
            raise ValueError(f"Invalid latitude: {self.latitude} (must be between -90 and 90)")
        if not (-180 <= self.longitude <= 180):
            raise ValueError(f"Invalid longitude: {self.longitude} (must be between -180 and 180)")

        # Create HTTP client with required User-Agent header
        # Per Yr.no terms of service, we must identify ourselves
        headers = {
            "User-Agent": "Calvin-Dashboard/1.0 (https://github.com/osterbergsimon/calvin)",
        }
        self._client = httpx.AsyncClient(
            base_url="https://api.met.no/weatherapi/locationforecast/2.0",
            headers=headers,
            timeout=30.0,
        )

    async def cleanup(self) -> None:
        """Cleanup plugin resources."""
        if self._client:
            await self._client.aclose()
            self._client = None

    async def get_content(self) -> dict[str, Any]:
        """
        Get service content for display.

        Returns:
            Dictionary with content information
        """
        weather_api_url = f"/api/web-services/{self.plugin_id}/weather"
        
        return {
            "type": "weather",
            "url": weather_api_url,
            "data": {
                "latitude": self.latitude,
                "longitude": self.longitude,
                "altitude": self.altitude,
            },
            "config": {
                "allowFullscreen": True,
            },
        }
    
    def get_config(self) -> dict[str, Any]:
        """
        Get plugin configuration.

        Returns:
            Configuration dictionary
        """
        weather_api_url = f"/api/web-services/{self.plugin_id}/weather"
        return {
            "url": weather_api_url,
            "latitude": self.latitude,
            "longitude": self.longitude,
            "altitude": self.altitude,
            "forecast_days": self.forecast_days,
            "display_order": self.display_order,
            "fullscreen": self.fullscreen,
        }

    def _map_symbol_code_to_icon(self, symbol_code: str) -> str:
        """
        Map Yr.no symbol codes to OpenWeatherMap icon format.
        
        Yr.no uses symbol codes like 'clearsky_day', 'partlycloudy_night', etc.
        We map these to OpenWeatherMap icon IDs for compatibility with WeatherWidget.
        
        Args:
            symbol_code: Yr.no symbol code
            
        Returns:
            OpenWeatherMap icon ID (e.g., '01d', '02n')
        """
        # Mapping based on Yr.no symbol codes
        # See: https://api.met.no/weatherapi/weathericon/2.0/documentation
        symbol_mapping = {
            # Clear sky
            "clearsky_day": "01d",
            "clearsky_polartwilight": "01d",
            "clearsky_night": "01n",
            # Fair
            "fair_day": "02d",
            "fair_polartwilight": "02d",
            "fair_night": "02n",
            # Partly cloudy
            "partlycloudy_day": "02d",
            "partlycloudy_polartwilight": "02d",
            "partlycloudy_night": "02n",
            # Cloudy
            "cloudy": "03d",
            # Rain
            "rainshowers_day": "09d",
            "rainshowers_polartwilight": "09d",
            "rainshowers_night": "09n",
            "rain": "10d",
            "heavyrain": "09d",
            "heavyrainshowers_day": "09d",
            "heavyrainshowers_polartwilight": "09d",
            "heavyrainshowers_night": "09n",
            # Sleet
            "sleet": "13d",
            "sleetshowers_day": "13d",
            "sleetshowers_polartwilight": "13d",
            "sleetshowers_night": "13n",
            # Snow
            "snow": "13d",
            "snowshowers_day": "13d",
            "snowshowers_polartwilight": "13d",
            "snowshowers_night": "13n",
            "heavysnow": "13d",
            "heavysnowshowers_day": "13d",
            "heavysnowshowers_polartwilight": "13d",
            "heavysnowshowers_night": "13n",
            # Fog
            "fog": "50d",
            # Thunder
            "rainshowersandthunder_day": "11d",
            "rainshowersandthunder_polartwilight": "11d",
            "rainshowersandthunder_night": "11n",
            "thunder": "11d",
            "heavyrainshowersandthunder_day": "11d",
            "heavyrainshowersandthunder_polartwilight": "11d",
            "heavyrainshowersandthunder_night": "11n",
        }
        
        return symbol_mapping.get(symbol_code, "01d")  # Default to clear sky day

    def _get_description_from_symbol(self, symbol_code: str) -> str:
        """Convert symbol code to human-readable description."""
        # Remove time of day suffixes
        base_code = symbol_code.replace("_day", "").replace("_night", "").replace("_polartwilight", "")
        
        descriptions = {
            "clearsky": "clear sky",
            "fair": "fair",
            "partlycloudy": "partly cloudy",
            "cloudy": "cloudy",
            "rainshowers": "rain showers",
            "rain": "rain",
            "heavyrain": "heavy rain",
            "heavyrainshowers": "heavy rain showers",
            "sleet": "sleet",
            "sleetshowers": "sleet showers",
            "snow": "snow",
            "snowshowers": "snow showers",
            "heavysnow": "heavy snow",
            "heavysnowshowers": "heavy snow showers",
            "fog": "fog",
            "rainshowersandthunder": "rain showers and thunder",
            "thunder": "thunder",
            "heavyrainshowersandthunder": "heavy rain showers and thunder",
        }
        
        return descriptions.get(base_code, "unknown")

    async def _fetch_weather(self) -> dict[str, Any]:
        """
        Fetch weather data from Yr.no API.

        Returns:
            Dictionary with weather data in format compatible with WeatherWidget
        """
        if not self._client:
            await self.initialize()

        try:
            # Build request parameters
            params = {
                "lat": self.latitude,
                "lon": self.longitude,
            }
            if self.altitude > 0:
                params["altitude"] = self.altitude

            # Fetch forecast data
            response = await self._client.get("/compact", params=params)
            response.raise_for_status()
            data = response.json()

            # Parse Yr.no response format
            # Structure: { "properties": { "timeseries": [...] } }
            timeseries = data.get("properties", {}).get("timeseries", [])
            
            if not timeseries:
                return {
                    "error": "No weather data available",
                }

            # Get current weather (first entry in timeseries)
            current_entry = timeseries[0]
            instant = current_entry.get("data", {}).get("instant", {}).get("details", {})
            next_1h = current_entry.get("data", {}).get("next_1_hours", {})
            next_6h = current_entry.get("data", {}).get("next_6_hours", {})

            # Extract current weather
            symbol_code = next_1h.get("summary", {}).get("symbol_code") or next_6h.get("summary", {}).get("symbol_code") or "clearsky_day"
            
            current = {
                "temperature": instant.get("air_temperature", 0),
                "feels_like": instant.get("air_temperature", 0),  # Yr.no doesn't provide feels_like, use air temp
                "humidity": instant.get("relative_humidity", 0),
                "pressure": instant.get("air_pressure_at_sea_level", 0) / 100,  # Convert Pa to hPa
                "description": self._get_description_from_symbol(symbol_code),
                "icon": self._map_symbol_code_to_icon(symbol_code),
                "wind_speed": instant.get("wind_speed", 0),
                "wind_direction": instant.get("wind_from_direction", 0),
            }

            # Process forecast - group by day
            from datetime import datetime, timedelta
            from collections import defaultdict
            
            forecast_by_date = defaultdict(lambda: {"temps": [], "symbols": [], "descriptions": []})
            
            # Process timeseries to group by day
            today = datetime.now().date()
            for entry in timeseries:
                time_str = entry.get("time", "")
                if not time_str:
                    continue
                
                # Parse ISO 8601 timestamp
                entry_time = datetime.fromisoformat(time_str.replace("Z", "+00:00"))
                entry_date = entry_time.date()
                
                # Only include future dates up to forecast_days
                days_ahead = (entry_date - today).days
                if days_ahead < 1 or days_ahead > self.forecast_days:
                    continue
                
                # Get temperature and symbol from available time periods
                instant_data = entry.get("data", {}).get("instant", {}).get("details", {})
                temp = instant_data.get("air_temperature")
                
                # Try to get symbol from next_1_hours, next_6_hours, or next_12_hours
                next_1h = entry.get("data", {}).get("next_1_hours", {})
                next_6h = entry.get("data", {}).get("next_6_hours", {})
                next_12h = entry.get("data", {}).get("next_12_hours", {})
                
                symbol_code = (
                    next_1h.get("summary", {}).get("symbol_code") or
                    next_6h.get("summary", {}).get("symbol_code") or
                    next_12h.get("summary", {}).get("symbol_code") or
                    "clearsky_day"
                )
                
                if temp is not None:
                    date_str = entry_date.isoformat()
                    forecast_by_date[date_str]["temps"].append(temp)
                    forecast_by_date[date_str]["symbols"].append(symbol_code)
                    forecast_by_date[date_str]["descriptions"].append(self._get_description_from_symbol(symbol_code))

            # Build forecast list
            forecast = []
            for i in range(1, self.forecast_days + 1):
                forecast_date = today + timedelta(days=i)
                date_str = forecast_date.isoformat()
                
                if date_str in forecast_by_date:
                    day_data = forecast_by_date[date_str]
                    if day_data["temps"]:
                        forecast.append({
                            "date": date_str,
                            "temperature": sum(day_data["temps"]) / len(day_data["temps"]),
                            "temp_min": min(day_data["temps"]),
                            "temp_max": max(day_data["temps"]),
                            "description": day_data["descriptions"][0] if day_data["descriptions"] else "unknown",
                            "icon": self._map_symbol_code_to_icon(day_data["symbols"][0]) if day_data["symbols"] else "01d",
                        })

            # Create location string - use stored location name if available, otherwise show coordinates
            if self.location:
                location_name = self.location
            else:
                location_name = f"Lat {self.latitude}, Lon {self.longitude}"

            return {
                "current": current,
                "forecast": forecast,
                "location": location_name,
                "units": "metric",  # Yr.no always uses metric
            }

        except httpx.HTTPStatusError as e:
            print(f"[Yr.no Weather] HTTP error fetching weather: {e.response.status_code} - {e}")
            return {
                "error": f"HTTP error: {e.response.status_code}",
                "message": e.response.text if hasattr(e.response, 'text') else str(e),
            }
        except httpx.HTTPError as e:
            print(f"[Yr.no Weather] Error fetching weather: {e}")
            return {
                "error": str(e),
            }
        except Exception as e:
            print(f"[Yr.no Weather] Unexpected error fetching weather: {e}")
            import traceback
            traceback.print_exc()
            return {
                "error": str(e),
            }

    async def validate_config(self, config: dict[str, Any]) -> bool:
        """
        Validate plugin configuration.

        Args:
            config: Configuration dictionary

        Returns:
            True if configuration is valid
        """
        required_fields = ["latitude", "longitude"]
        for field in required_fields:
            if field not in config:
                return False

        try:
            lat = float(config["latitude"])
            lon = float(config["longitude"])
            if not (-90 <= lat <= 90) or not (-180 <= lon <= 180):
                return False
        except (ValueError, TypeError):
            return False

        return True

    async def configure(self, config: dict[str, Any]) -> None:
        """
        Configure the plugin with new settings.

        Args:
            config: Configuration dictionary
        """
        await super().configure(config)

        # Close existing client if any
        if self._client:
            await self._client.aclose()

        if "latitude" in config:
            lat_value = config["latitude"]
            if isinstance(lat_value, dict):
                lat_value = lat_value.get("value") or lat_value.get("default") or 59.9139
            self.latitude = round(float(lat_value), 4) if lat_value else 59.9139
        if "longitude" in config:
            lon_value = config["longitude"]
            if isinstance(lon_value, dict):
                lon_value = lon_value.get("value") or lon_value.get("default") or 10.7522
            self.longitude = round(float(lon_value), 4) if lon_value else 10.7522
        if "altitude" in config:
            alt_value = config["altitude"]
            if isinstance(alt_value, dict):
                alt_value = alt_value.get("value") or alt_value.get("default") or 0
            try:
                self.altitude = int(alt_value) if alt_value else 0
            except (ValueError, TypeError):
                self.altitude = 0
        if "forecast_days" in config:
            forecast_days_value = config["forecast_days"]
            if isinstance(forecast_days_value, dict):
                forecast_days_value = forecast_days_value.get("value") or forecast_days_value.get("default") or 5
            try:
                self.forecast_days = min(max(int(forecast_days_value), 1), 9) if forecast_days_value else 5
            except (ValueError, TypeError):
                self.forecast_days = 5
        if "location" in config:
            location_value = config["location"]
            if isinstance(location_value, dict):
                location_value = location_value.get("value") or location_value.get("default") or ""
            self.location = str(location_value).strip() if location_value else None
        if "display_order" in config:
            self.display_order = int(config.get("display_order", 0))
        if "fullscreen" in config:
            self.fullscreen = bool(config.get("fullscreen", False))

        # Reinitialize with new config
        await self.initialize()


# Register this plugin with pluggy
@hookimpl
def register_plugin_types() -> list[dict[str, Any]]:
    """Register YrWeatherServicePlugin type."""
    return [YrWeatherServicePlugin.get_plugin_metadata()]


@hookimpl
def create_plugin_instance(
    plugin_id: str,
    type_id: str,
    name: str,
    config: dict[str, Any],
) -> YrWeatherServicePlugin | None:
    """Create a YrWeatherServicePlugin instance."""
    if type_id != "yr_weather":
        return None

    enabled = config.get("enabled", False)  # Default to disabled
    display_order = config.get("display_order", 0)
    fullscreen = config.get("fullscreen", False)

    # Extract config values
    latitude = config.get("latitude", 59.9139)
    longitude = config.get("longitude", 10.7522)
    altitude = config.get("altitude", 0)
    forecast_days = config.get("forecast_days", 5)
    location = config.get("location")

    # Handle schema objects
    if isinstance(latitude, dict):
        latitude = latitude.get("value") or latitude.get("default") or 59.9139
    latitude = round(float(latitude), 4) if latitude else 59.9139

    if isinstance(longitude, dict):
        longitude = longitude.get("value") or longitude.get("default") or 10.7522
    longitude = round(float(longitude), 4) if longitude else 10.7522

    if isinstance(altitude, dict):
        altitude = altitude.get("value") or altitude.get("default") or 0
    try:
        altitude = int(altitude) if altitude else 0
    except (ValueError, TypeError):
        altitude = 0

    # Handle forecast_days
    if isinstance(forecast_days, dict):
        forecast_days = forecast_days.get("value") or forecast_days.get("default") or 5
    try:
        forecast_days = min(max(int(forecast_days), 1), 9) if forecast_days else 5
    except (ValueError, TypeError):
        forecast_days = 5

    # Handle location
    if isinstance(location, dict):
        location = location.get("value") or location.get("default")
    location = str(location).strip() if location else None

    return YrWeatherServicePlugin(
        plugin_id=plugin_id,
        name=name,
        latitude=latitude,
        longitude=longitude,
        altitude=altitude,
        forecast_days=forecast_days,
        location=location,
        enabled=enabled,
        display_order=display_order,
        fullscreen=fullscreen,
    )

