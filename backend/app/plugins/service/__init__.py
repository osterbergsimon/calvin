"""Service plugins."""

# Import all plugins to trigger their auto-registration
from app.plugins.service import (
    iframe,  # noqa: F401
    mealie,  # noqa: F401
    weather,  # noqa: F401
    yr_weather,  # noqa: F401
)
from app.plugins.service.iframe import IframeServicePlugin
from app.plugins.service.mealie import MealieServicePlugin
from app.plugins.service.weather import WeatherServicePlugin
from app.plugins.service.yr_weather import YrWeatherServicePlugin

__all__ = [
    "IframeServicePlugin",
    "MealieServicePlugin",
    "WeatherServicePlugin",
    "YrWeatherServicePlugin",
]
