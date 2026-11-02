"""Tests for plugin protocol adherence (contract 1.0).

The family protocols keep their domain verbs (fetch_events, get_images, ...).
Instance-level lifecycle (initialize/cleanup) and validate_config are no
longer abstract — a concrete plugin only implements its family's MUST verbs.
"""

import inspect

import pytest

from app.plugins.base import BasePlugin, PluginType
from app.plugins.protocols import (
    BackendPlugin,
    CalendarPlugin,
    ImagePlugin,
    ServicePlugin,
)


@pytest.mark.unit
class TestProtocolAdherence:
    """Test that plugins adhere to protocol interfaces."""

    def test_base_plugin_abstract_surface(self):
        """BasePlugin is abstract on plugin_type only; lifecycle is optional."""
        assert inspect.isabstract(BasePlugin)
        assert getattr(BasePlugin.plugin_type, "__isabstractmethod__", False)

        # Lifecycle defaults are no-ops, not abstract
        assert not getattr(BasePlugin.initialize, "__isabstractmethod__", False)
        assert not getattr(BasePlugin.cleanup, "__isabstractmethod__", False)
        # validate_config is a (non-abstract) async classmethod
        assert not getattr(BasePlugin.validate_config, "__isabstractmethod__", False)
        assert isinstance(inspect.getattr_static(BasePlugin, "validate_config"), classmethod)

        # The retired metadata classmethod is gone
        assert not hasattr(BasePlugin, "get_plugin_metadata")

    def test_calendar_plugin_protocol(self):
        """Test CalendarPlugin protocol definition."""
        assert inspect.isabstract(CalendarPlugin)

        # MUST: the domain verb
        assert getattr(CalendarPlugin.fetch_events, "__isabstractmethod__", False)
        # validate_config is no longer abstract (schema-driven classmethod default)
        assert not getattr(CalendarPlugin.validate_config, "__isabstractmethod__", False)

        class MockCalendarPlugin(CalendarPlugin):
            async def fetch_events(self, start_date, end_date):
                return []

        plugin = MockCalendarPlugin("test-id", "Test")
        assert isinstance(plugin, CalendarPlugin)
        assert plugin.plugin_type == PluginType.CALENDAR

    def test_image_plugin_protocol(self):
        """Test ImagePlugin protocol definition."""
        assert inspect.isabstract(ImagePlugin)

        # Check MUST methods are marked as abstract
        assert getattr(ImagePlugin.get_images, "__isabstractmethod__", False)
        assert getattr(ImagePlugin.get_image, "__isabstractmethod__", False)
        assert getattr(ImagePlugin.get_image_data, "__isabstractmethod__", False)
        assert getattr(ImagePlugin.scan_images, "__isabstractmethod__", False)

        # Check CAN methods have default implementations (not abstract)
        assert not getattr(ImagePlugin.upload_image, "__isabstractmethod__", False)
        assert not getattr(ImagePlugin.delete_image, "__isabstractmethod__", False)
        assert not getattr(ImagePlugin.get_thumbnail_path, "__isabstractmethod__", False)

        class MockImagePlugin(ImagePlugin):
            async def get_images(self):
                return []

            async def get_image(self, image_id):
                return None

            async def get_image_data(self, image_id):
                return None

            async def scan_images(self):
                return []

        plugin = MockImagePlugin("test-id", "Test")
        assert isinstance(plugin, ImagePlugin)
        assert plugin.plugin_type == PluginType.IMAGE

        # Optional methods exist and are callable
        assert callable(plugin.upload_image)
        assert callable(plugin.delete_image)
        assert callable(plugin.get_thumbnail_path)

    def test_service_plugin_protocol(self):
        """Test ServicePlugin protocol definition."""
        # ServicePlugin has no abstract MUST methods — fetch() is a SHOULD with
        # a None default, so the protocol itself is concrete.
        assert not inspect.isabstract(ServicePlugin)
        assert not getattr(ServicePlugin.fetch, "__isabstractmethod__", False)

        class MockServicePlugin(ServicePlugin):
            pass

        plugin = MockServicePlugin("test-id", "Test")
        assert isinstance(plugin, ServicePlugin)
        assert plugin.plugin_type == PluginType.SERVICE
        assert callable(plugin.fetch)

    def test_backend_plugin_protocol(self):
        """Test BackendPlugin protocol definition."""
        # All BackendPlugin capabilities are optional
        assert not inspect.isabstract(BackendPlugin)

        # Check CAN methods have default implementations (not abstract)
        for method in (
            "fetch",
            "get_schedule_config",
            "run_scheduled_task",
            "start_worker",
            "stop_worker",
            "provide_service",
            "get_provided_services",
            "handle_event",
            "get_subscribed_events",
        ):
            assert not getattr(getattr(BackendPlugin, method), "__isabstractmethod__", False)

        class MockBackendPlugin(BackendPlugin):
            pass

        plugin = MockBackendPlugin("test-id", "Test")
        assert isinstance(plugin, BackendPlugin)
        assert plugin.plugin_type == PluginType.BACKEND

    def test_retired_protocol_surface_is_gone(self):
        """fetch_service_data / get_content / webhook / api_request are deleted."""
        for cls in (ServicePlugin, BackendPlugin, CalendarPlugin, ImagePlugin):
            for retired in (
                "fetch_service_data",
                "get_content",
                "handle_webhook",
                "handle_api_request",
                "fetch_type_data",
                "get_plugin_metadata",
            ):
                assert not hasattr(cls, retired), f"{cls.__name__}.{retired}"


@pytest.mark.unit
class TestProtocolUsage:
    """Test that core code uses protocols correctly."""

    async def test_core_should_use_isinstance_for_service_data(self):
        """Test that core code uses the service protocol for dashboard data."""

        class MockServicePlugin(ServicePlugin):
            async def fetch(self, start_date=None, end_date=None):
                return {"url": "http://example.com"}

        plugin = MockServicePlugin("test-id", "Test")

        if isinstance(plugin, ServicePlugin):
            content = await plugin.fetch()
            assert content == {"url": "http://example.com"}

    async def test_optional_methods_return_none(self):
        """Test that optional protocol methods return None when not implemented."""

        class MockServicePlugin(ServicePlugin):
            pass

        plugin = MockServicePlugin("test-id", "Test")

        # fetch is optional and returns None by default
        assert await plugin.fetch() is None
        # Class-level operations signal "unsupported" with None
        assert await MockServicePlugin.test_connection({}) is None
        assert await MockServicePlugin.scan_options("field") is None

    async def test_protocol_methods_are_callable(self):
        """Test that all protocol methods are callable."""

        class MockServicePlugin(ServicePlugin):
            pass

        plugin = MockServicePlugin("test-id", "Test")

        assert callable(plugin.fetch)
        assert callable(plugin.configure)
        assert callable(MockServicePlugin.validate_config)
        # Default validate_config (no metadata schema) accepts any config
        assert await MockServicePlugin.validate_config({}) is True


@pytest.mark.unit
class TestProtocolViolations:
    """Test detection of protocol violations in core code."""

    async def test_no_private_method_access(self):
        """Test that core code should not access private methods (starting with _)."""

        # This test documents that core code should not call methods starting with _
        class MockServicePlugin(ServicePlugin):
            async def fetch(self, start_date=None, end_date=None):
                return {"url": "http://example.com"}

            async def _private_method(self):
                """This should never be called by core code."""
                return "private"

        plugin = MockServicePlugin("test-id", "Test")

        # Use the public protocol method.
        content = await plugin.fetch()
        assert content is not None

        # ❌ WRONG: Don't call private methods
        # result = await plugin._private_method()  # Core should never do this

    async def test_no_direct_attribute_access(self):
        """Test that core code should not access plugin attributes directly."""

        class MockServicePlugin(ServicePlugin):
            def __init__(self, plugin_id, name, enabled=True):
                super().__init__(plugin_id, name, enabled)
                self._url = "http://example.com"  # Private attribute

            async def fetch(self, start_date=None, end_date=None):
                return {"url": self._url}

        plugin = MockServicePlugin("test-id", "Test")

        # Use the public protocol method.
        content = await plugin.fetch()
        url = content.get("url")
        assert url == "http://example.com"

        # ❌ WRONG: Don't access attributes directly
        # url = getattr(plugin, "_url", "")  # Core should never do this
        # url = plugin._url  # Core should never do this

    async def test_backend_plugin_optional_methods_return_defaults(self):
        """Test that optional BackendPlugin methods return defaults when not implemented."""

        class MockBackendPlugin(BackendPlugin):
            pass

        plugin = MockBackendPlugin("test-id", "Test")

        # Optional methods should return defaults
        assert await plugin.get_schedule_config() is None
        assert await plugin.get_provided_services() == []
        assert await plugin.provide_service("test") is None
        assert await plugin.fetch() is None
        assert await plugin.handle_event("event", {}) is None
        assert await plugin.get_subscribed_events() == []

        # run_scheduled_task should raise NotImplementedError by default
        with pytest.raises(NotImplementedError):
            await plugin.run_scheduled_task()

    async def test_backend_plugin_with_scheduled_tasks(self):
        """Test BackendPlugin with scheduled tasks implementation."""

        class MockScheduledBackendPlugin(BackendPlugin):
            def __init__(self, plugin_id: str, name: str, enabled: bool = True):
                super().__init__(plugin_id, name, enabled)
                self.task_run_count = 0

            async def get_schedule_config(self):
                return {
                    "interval": 300,
                    "enabled": True,
                    "max_concurrent": 1,
                }

            async def run_scheduled_task(self):
                self.task_run_count += 1
                return {
                    "success": True,
                    "message": f"Task executed {self.task_run_count} time(s)",
                    "data": {"count": self.task_run_count},
                }

        plugin = MockScheduledBackendPlugin("test-id", "Test")

        # Test schedule config
        schedule_config = await plugin.get_schedule_config()
        assert schedule_config is not None
        assert schedule_config["interval"] == 300
        assert schedule_config["enabled"] is True

        # Test running scheduled task
        result = await plugin.run_scheduled_task()
        assert result["success"] is True
        assert plugin.task_run_count == 1

        # Run again
        result = await plugin.run_scheduled_task()
        assert plugin.task_run_count == 2
