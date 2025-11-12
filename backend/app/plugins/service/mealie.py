"""Mealie meal planning service plugin."""

from datetime import datetime, timedelta
from typing import Any

import httpx

from app.plugins.base import PluginType
from app.plugins.hooks import hookimpl, plugin_manager
from app.plugins.protocols import ServicePlugin


class MealieServicePlugin(ServicePlugin):
    """Mealie service plugin for displaying meal plans."""

    @classmethod
    def get_plugin_metadata(cls) -> dict[str, Any]:
        """Get plugin metadata for registration."""
        return {
            "type_id": "mealie",
            "plugin_type": PluginType.SERVICE,
            "name": "Mealie Meal Plan",
            "description": "Display weekly meal plan from Mealie recipe manager",
            "version": "1.0.0",
            "common_config_schema": {
                "mealie_url": {
                    "type": "string",
                    "description": "Mealie instance URL (e.g., http://mealie.local:9000)",
                    "default": "",
                    "ui": {
                        "component": "input",
                        "placeholder": "http://mealie.local:9000",
                        "validation": {
                            "required": True,
                            "type": "url",
                        },
                    },
                },
                "api_token": {
                    "type": "password",
                    "description": "Mealie API token (create at /user/profile/api-tokens)",
                    "default": "",
                    "ui": {
                        "component": "password",
                        "placeholder": "Enter your Mealie API token",
                        "help_text": "Create an API token in Mealie at /user/profile/api-tokens",
                        "validation": {
                            "required": True,
                        },
                    },
                },
                "group_id": {
                    "type": "string",
                    "description": "Group ID (optional, defaults to user's default group)",
                    "default": "",
                    "ui": {
                        "component": "input",
                        "placeholder": "Leave empty for default group",
                    },
                },
                "days_ahead": {
                    "type": "integer",
                    "description": "Number of days ahead to show meal plan (default: 7)",
                    "default": 7,
                    "ui": {
                        "component": "number",
                        "placeholder": "7",
                        "help_text": "Number of days from today to display meals (e.g., 7 for a week)",
                        "validation": {
                            "min": 1,
                            "max": 30,
                        },
                    },
                },
            },
            "ui_actions": [
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
                "api_endpoint": "/api/web-services/{service_id}/mealplan",
                "method": "GET",
                "component": "mealie/MealPlanViewer.vue",  # Plugin-provided frontend component
                "data_schema": {
                    "items": {
                        "type": "array",
                        "description": "List of meal plan items",
                        "item_schema": {
                            "date": {
                                "type": "string",
                                "format": "date",
                                "description": "Date of the meal plan item",
                            },
                            "meals": {
                                "type": "array",
                                "description": "List of meals for this date",
                                "item_schema": {
                                    "type": {
                                        "type": "string",
                                        "description": "Meal type (breakfast, lunch, dinner, etc.)",
                                    },
                                    "recipe": {
                                        "type": "object",
                                        "description": "Recipe information",
                                        "properties": {
                                            "name": {
                                                "type": "string",
                                                "description": "Recipe name",
                                            },
                                        },
                                    },
                                    "name": {
                                        "type": "string",
                                        "description": "Meal name (fallback if no recipe)",
                                    },
                                },
                            },
                        },
                    },
                    "start_date": {
                        "type": "string",
                        "format": "date",
                        "description": "Start date of the meal plan",
                    },
                    "end_date": {
                        "type": "string",
                        "format": "date",
                        "description": "End date of the meal plan",
                    },
                },
                "render_template": "meal_plan",  # Legacy: kept for backward compatibility
            },
            "plugin_class": cls,
        }

    def __init__(
        self,
        plugin_id: str,
        name: str,
        mealie_url: str,
        api_token: str,
        group_id: str | None = None,
        days_ahead: int = 7,
        enabled: bool = True,
        display_order: int = 0,
        fullscreen: bool = False,
    ):
        """
        Initialize Mealie service plugin.

        Args:
            plugin_id: Unique identifier for the plugin
            name: Human-readable name
            mealie_url: Mealie instance URL
            api_token: Mealie API token
            group_id: Optional group ID (defaults to user's default group)
            days_ahead: Number of days ahead to show meal plan (default: 7)
            enabled: Whether the plugin is enabled
            display_order: Display order for service rotation
            fullscreen: Whether to display in fullscreen mode
        """
        super().__init__(plugin_id, name, enabled)
        self.mealie_url = mealie_url.rstrip("/")
        self.api_token = api_token
        self.group_id = group_id
        self.days_ahead = days_ahead
        self.display_order = display_order
        self.fullscreen = fullscreen
        self._client: httpx.AsyncClient | None = None

    async def initialize(self) -> None:
        """Initialize the plugin."""
        # Validate URL
        if not self.mealie_url or not (
            self.mealie_url.startswith("http://") or self.mealie_url.startswith("https://")
        ):
            raise ValueError(f"Invalid Mealie URL: {self.mealie_url}")

        # Create HTTP client with authentication
        headers = {"Authorization": f"Bearer {self.api_token}"}
        self._client = httpx.AsyncClient(
            base_url=self.mealie_url,
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
        # Return a special URL that points to our backend endpoint
        # The frontend will detect "mealie" type and fetch data from our API
        # This avoids CORS issues and handles authentication properly
        meal_plan_api_url = f"/api/web-services/{self.plugin_id}/mealplan"
        
        return {
            "type": "mealie",
            "url": meal_plan_api_url,  # Points to our backend endpoint
            "data": {
                "mealie_url": self.mealie_url,
                "api_token": self.api_token,  # Not sent to frontend, used by backend
                "group_id": self.group_id,
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
        # Store the meal plan API URL in config so web_service_service can read it
        # This points to our backend endpoint that proxies Mealie API calls
        meal_plan_api_url = f"/api/web-services/{self.plugin_id}/mealplan"
        return {
            "url": meal_plan_api_url,
            "mealie_url": self.mealie_url,
            "api_token": self.api_token,
            "group_id": self.group_id,
            "days_ahead": self.days_ahead,
            "display_order": self.display_order,
            "fullscreen": self.fullscreen,
        }

    async def _fetch_meal_plan(self) -> dict[str, Any]:
        """
        Fetch meal plan data from Mealie API.

        Returns:
            Dictionary with meal plan data
        """
        if not self._client:
            await self.initialize()

        try:
            # Calculate date range for the week (today to 7 days from now)
            today = datetime.now().date()
            week_end = today + timedelta(days=7)

            # Mealie API endpoint for meal plans
            # Based on typical REST API patterns, this might be /api/meal-plans or /api/mealplan
            # We'll try the most common pattern first
            params = {
                "start_date": today.isoformat(),
                "end_date": week_end.isoformat(),
            }
            if self.group_id:
                params["group_id"] = self.group_id

            # Mealie API endpoints - based on the errors, it seems to use /api/households/mealplans
            endpoints_to_try = [
                "/api/households/mealplans",
                "/api/meal-plans",
                "/api/mealplan",
                "/api/meal-plans/group",
                "/api/groups/meal-plans",
            ]

            for endpoint in endpoints_to_try:
                try:
                    response = await self._client.get(endpoint, params=params)
                    if response.status_code == 200:
                        return response.json()
                    elif response.status_code == 404:
                        # Try next endpoint
                        continue
                    else:
                        response.raise_for_status()
                except httpx.HTTPStatusError as e:
                    if e.response.status_code == 404:
                        continue
                    raise

            # If all endpoints failed, return empty meal plan
            print(f"[Mealie] Could not find meal plan endpoint. Tried: {endpoints_to_try}")
            return {
                "items": [],
                "start_date": today.isoformat(),
                "end_date": week_end.isoformat(),
                "error": "Could not find meal plan endpoint. Please check Mealie API documentation.",
            }

        except httpx.HTTPStatusError as e:
            print(f"[Mealie] HTTP error fetching meal plan: {e.response.status_code} - {e}")
            return {
                "items": [],
                "error": f"HTTP error: {e.response.status_code}",
            }
        except httpx.HTTPError as e:
            print(f"[Mealie] Error fetching meal plan: {e}")
            return {
                "items": [],
                "error": str(e),
            }
        except Exception as e:
            print(f"[Mealie] Unexpected error fetching meal plan: {e}")
            import traceback

            traceback.print_exc()
            return {
                "items": [],
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
        required_fields = ["mealie_url", "api_token"]
        for field in required_fields:
            if field not in config or not config[field]:
                return False

        url = config["mealie_url"]
        if not isinstance(url, str) or not url.strip():
            return False

        return url.startswith("http://") or url.startswith("https://")

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

        if "mealie_url" in config:
            mealie_url_value = config["mealie_url"]
            # Handle schema objects
            if isinstance(mealie_url_value, dict):
                mealie_url_value = mealie_url_value.get("value") or mealie_url_value.get("default") or ""
            self.mealie_url = str(mealie_url_value).rstrip("/") if mealie_url_value else ""
        if "api_token" in config:
            api_token_value = config["api_token"]
            # Handle schema objects
            if isinstance(api_token_value, dict):
                api_token_value = api_token_value.get("value") or api_token_value.get("default") or ""
            self.api_token = str(api_token_value).strip() if api_token_value else ""
        if "group_id" in config:
            group_id_value = config["group_id"]
            # Handle schema objects
            if isinstance(group_id_value, dict):
                group_id_value = group_id_value.get("value") or group_id_value.get("default") or ""
            self.group_id = str(group_id_value).strip() if group_id_value else None
        if "days_ahead" in config:
            days_ahead_value = config["days_ahead"]
            # Handle schema objects
            if isinstance(days_ahead_value, dict):
                days_ahead_value = days_ahead_value.get("value") or days_ahead_value.get("default") or 7
            try:
                self.days_ahead = int(days_ahead_value) if days_ahead_value else 7
            except (ValueError, TypeError):
                self.days_ahead = 7
        if "display_order" in config:
            self.display_order = int(config.get("display_order", 0))
        if "fullscreen" in config:
            self.fullscreen = bool(config.get("fullscreen", False))

        # Reinitialize with new config
        await self.initialize()


# Register this plugin with pluggy
@hookimpl
def register_plugin_types() -> list[dict[str, Any]]:
    """Register MealieServicePlugin type."""
    return [MealieServicePlugin.get_plugin_metadata()]


@hookimpl
def create_plugin_instance(
    plugin_id: str,
    type_id: str,
    name: str,
    config: dict[str, Any],
) -> MealieServicePlugin | None:
    """Create a MealieServicePlugin instance."""
    if type_id != "mealie":
        return None

    enabled = config.get("enabled", False)  # Default to disabled
    display_order = config.get("display_order", 0)
    fullscreen = config.get("fullscreen", False)

    # Extract config values
    mealie_url = config.get("mealie_url", "")
    api_token = config.get("api_token", "")
    group_id = config.get("group_id")
    days_ahead = config.get("days_ahead", 7)

    # Handle schema objects
    if isinstance(mealie_url, dict):
        mealie_url = mealie_url.get("value") or mealie_url.get("default") or ""
    mealie_url = str(mealie_url).strip() if mealie_url else ""

    if isinstance(api_token, dict):
        api_token = api_token.get("value") or api_token.get("default") or ""
    api_token = str(api_token).strip() if api_token else ""

    if isinstance(group_id, dict):
        group_id = group_id.get("value") or group_id.get("default") or ""
    group_id = str(group_id).strip() if group_id else None

    # Handle days_ahead
    if isinstance(days_ahead, dict):
        days_ahead = days_ahead.get("value") or days_ahead.get("default") or 7
    try:
        days_ahead = int(days_ahead) if days_ahead else 7
    except (ValueError, TypeError):
        days_ahead = 7

    return MealieServicePlugin(
        plugin_id=plugin_id,
        name=name,
        mealie_url=mealie_url,
        api_token=api_token,
        group_id=group_id,
        days_ahead=days_ahead,
        enabled=enabled,
        display_order=display_order,
        fullscreen=fullscreen,
    )

